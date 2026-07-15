import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// Хранилище за абстракцией (инвариант CLAUDE.md): сейчас локальный диск (dev),
// S3-адаптер (Yandex Object Storage) добавится реализацией этого же интерфейса.
export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
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

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(safePath(key));
    } catch {
      return null;
    }
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
