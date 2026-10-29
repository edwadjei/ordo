import type { AudioProvider } from '@ordo/core';
import { isoNow } from '../../platform/time/iso-now.js';
import {
  DatabaseAdapter,
  eq,
  sql,
  tables,
} from '../../adapters/database/database.adapter.js';
const { audioSettings } = tables;
export class AudioSettingsRepository {
  constructor(private readonly database: DatabaseAdapter) {}
  async find(owner: string) {
    const [row] = await this.database
      .use()
      .select()
      .from(audioSettings)
      .where(eq(audioSettings.ownerUserId, owner));
    return row;
  }
  /** Sets or removes (`null`) the OpenAI key, keeping the chosen provider. */
  async saveKey(owner: string, encryptedApiKey: string | null) {
    await this.database
      .use()
      .insert(audioSettings)
      .values({ ownerUserId: owner, encryptedApiKey })
      .onConflictDoUpdate({
        target: audioSettings.ownerUserId,
        set: { encryptedApiKey, updatedAt: isoNow() },
      });
  }
  /**
   * One upsert. `encryptedApiKey: undefined` keeps whatever key is stored at
   * the moment of the write; `null` removes it.
   */
  async save(
    owner: string,
    provider: AudioProvider,
    encryptedApiKey: string | null | undefined,
  ) {
    await this.database
      .use()
      .insert(audioSettings)
      .values({
        ownerUserId: owner,
        provider,
        encryptedApiKey: encryptedApiKey ?? null,
      })
      .onConflictDoUpdate({
        target: audioSettings.ownerUserId,
        set: {
          provider,
          updatedAt: isoNow(),
          ...(encryptedApiKey === undefined
            ? {}
            : { encryptedApiKey: sql`excluded.encrypted_api_key` }),
        },
      });
  }
}
