import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Хранилище за абстракцией (инвариант CLAUDE.md): сейчас локальный диск (dev),
// S3-адаптер (Yandex Object Storage) добавится реализацией этого же интерфейса.
export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
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

  publicUrl(key: string): string {
    return `/files/${key}`;
  }
}

// STORAGE_DRIVER=s3 добавится в S0-инфраструктуре (ключи от оператора)
export const storage: ObjectStorage = new LocalDiskStorage();
