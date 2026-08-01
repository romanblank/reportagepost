import { mkdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// Хранилище за абстракцией (инвариант CLAUDE.md): сейчас локальный диск (dev),
// S3-адаптер (Yandex Object Storage) добавится реализацией этого же интерфейса.
/** Поток объекта + метаданные для отдачи по HTTP (в т.ч. частичной). */
export interface ObjectStream {
  body: ReadableStream<Uint8Array>;
  /** Длина ИМЕННО отдаваемого куска. */
  length: number;
  /** Полный размер объекта (для Content-Range). */
  total: number;
}

export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /**
   * Потоковая ЗАПИСЬ (аудит 2026-08-01, P2). Симметрична getStream: видео до
   * 200 МБ нельзя собирать в Buffer — единственный контейнер этого не переживёт
   * (тот же класс отказа, что уже чинили у раздатчика). Длина обязательна:
   * S3 без ContentLength сам буферизует поток, чтобы её вычислить, и весь
   * смысл теряется.
   */
  putStream(key: string, body: Readable, contentType: string, contentLength: number): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  /**
   * Потоковое чтение (опционально — диапазон байт). Введено аудитом 2026-07-31
   * (P1 OOM): раздатчик грузил объект целиком в heap, поэтому несколько
   * перемоток 200-МБ видео роняли единственный контейнер. Диапазон уходит
   * в сам S3 (Range в GetObjectCommand) — в память приложения попадает только
   * запрошенный кусок, а не весь файл.
   */
  getStream(key: string, range?: { start: number; end: number }): Promise<ObjectStream | null>;
  /** Размер объекта без чтения тела (нужен для Range-арифметики). */
  size(key: string): Promise<number | null>;
  /** Удаление объекта (ПнД: чистка фото/аватара при удалении аккаунта). */
  delete(key: string): Promise<void>;
  /** Публичный URL объекта (dev: наш роут-раздатчик; prod: CDN). */
  publicUrl(key: string): string;
}

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '.uploads';

// Ключи вида photos/<uuid>/web.jpg — только [a-z0-9/._-], защита от traversal.
function safePath(key: string): string {
  if (!/^[a-z0-9/][a-z0-9/._-]*$/i.test(key) || key.includes('..')) {
    throw new Error(`Недопустимый ключ хранилища: ${key}`);
  }
  return path.join(UPLOADS_DIR, key);
}

class LocalDiskStorage implements ObjectStorage {
  async put(key: string, data: Buffer): Promise<void> {
    const filePath = safePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  // Тип и длина локальному диску не нужны — они часть общего контракта ради S3
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async putStream(key: string, body: Readable, _contentType: string, _contentLength: number): Promise<void> {
    const filePath = safePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await pipeline(body, createWriteStream(filePath));
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(safePath(key));
    } catch {
      return null;
    }
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(safePath(key))).size;
    } catch {
      return null;
    }
  }

  async getStream(key: string, range?: { start: number; end: number }): Promise<ObjectStream | null> {
    const total = await this.size(key);
    if (total === null) return null;
    const start = range?.start ?? 0;
    const end = range?.end ?? total - 1;
    const nodeStream = createReadStream(safePath(key), { start, end });
    return {
      body: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
      length: end - start + 1,
      total,
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(safePath(key));
    } catch {
      // нет файла — идемпотентно
    }
  }

  publicUrl(key: string): string {
    return `/files/${key}`;
  }
}

// Yandex Object Storage (S3-совместимый). На проде фото ДОЛЖНЫ жить здесь, а не
// на диске контейнера — иначе исчезают при редеплое (аудит P0 2026-07-14).
class S3Storage implements ObjectStorage {
  private client: S3Client;
  private bucket: string;

  constructor(endpoint: string, bucket: string, accessKeyId: string, secretAccessKey: string) {
    this.bucket = bucket;
    this.client = new S3Client({
      endpoint,
      region: 'ru-central1',
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: false,
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    safePath(key); // валидация ключа (traversal-guard)
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }),
    );
  }

  async putStream(key: string, body: Readable, contentType: string, contentLength: number): Promise<void> {
    safePath(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Без ContentLength SDK читает поток целиком в память ради подсчёта
        ContentLength: contentLength,
      }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    safePath(key);
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  async size(key: string): Promise<number | null> {
    safePath(key);
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  async getStream(key: string, range?: { start: number; end: number }): Promise<ObjectStream | null> {
    safePath(key);
    try {
      // Range уходит В САМ S3 — приложение получает только нужный кусок,
      // а не весь объект (иначе перемотка видео = OOM, аудит P0/P1).
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
        }),
      );
      if (!res.Body) return null;
      // ContentRange вида "bytes 0-99/12345" — берём полный размер из хвоста
      const total = res.ContentRange
        ? Number(res.ContentRange.split('/')[1])
        : (res.ContentLength ?? 0);
      return {
        body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
        length: res.ContentLength ?? 0,
        total: Number.isFinite(total) && total > 0 ? total : (res.ContentLength ?? 0),
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    safePath(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch {
      // best-effort: не роняем удаление аккаунта из-за одного объекта
    }
  }

  publicUrl(key: string): string {
    return `/files/${key}`; // раздаём через свой роут (бакет приватный)
  }
}

function createStorage(): ObjectStorage {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY) {
    return new S3Storage(S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY);
  }
  return new LocalDiskStorage(); // dev-фолбэк без S3-ключей
}

export const storage: ObjectStorage = createStorage();
