import {
  mkdir,
  readFile,
  readdir,
  writeFile,
  rename,
  rm,
} from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  CaptureStore,
  type CaptureRecord,
} from '../../capabilities/capture-store.contract.js';
const identifier =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class LocalCaptureStore extends CaptureStore {
  constructor(private readonly directory: string) {
    super();
  }
  private path(owner: string, id?: string) {
    if (!identifier.test(owner) || (id !== undefined && !identifier.test(id)))
      throw new Error('Invalid capture identifier');
    return id ? join(this.directory, owner, id) : join(this.directory, owner);
  }
  async list(owner: string) {
    let entries: string[];
    try {
      entries = await readdir(this.path(owner));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const rows = await Promise.all(
      entries
        .filter((name) => identifier.test(name))
        .map((name) => this.get(owner, name)),
    );
    return rows
      .filter((row): row is CaptureRecord => row !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async get(owner: string, id: string) {
    try {
      return JSON.parse(
        await readFile(join(this.path(owner, id), 'metadata.json'), 'utf8'),
      ) as CaptureRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async create(owner: string, record: CaptureRecord, audio: Uint8Array) {
    const directory = this.path(owner, record.id);
    await mkdir(this.path(owner), { recursive: true, mode: 0o700 });
    await mkdir(directory, { mode: 0o700 });
    try {
      await writeFile(join(directory, 'audio'), audio, {
        mode: 0o600,
        flag: 'wx',
      });
      await this.update(owner, record);
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
  async update(owner: string, record: CaptureRecord) {
    const directory = this.path(owner, record.id),
      temporary = join(directory, `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(record), {
        mode: 0o600,
        flag: 'wx',
      });
      await rename(temporary, join(directory, 'metadata.json'));
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async audio(owner: string, id: string) {
    try {
      return await readFile(join(this.path(owner, id), 'audio'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
