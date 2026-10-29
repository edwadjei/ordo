import type { TextProvider } from '@ordo/core';
import { isoNow } from '../../platform/time/iso-now.js';
import {
  DatabaseAdapter,
  eq,
  tables,
} from '../../adapters/database/database.adapter.js';
const { aiSettings } = tables;
export interface AiSettingsChanges {
  textProvider?: TextProvider;
  /** `undefined` keeps the stored key; `null` removes it. */
  encryptedAnthropicKey?: string | null;
}
export class AiSettingsRepository {
  constructor(private readonly database: DatabaseAdapter) {}
  async find(owner: string) {
    const [row] = await this.database
      .use()
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.ownerUserId, owner));
    return row;
  }
  /** One upsert; only the given fields change. */
  async save(owner: string, changes: AiSettingsChanges) {
    await this.database
      .use()
      .insert(aiSettings)
      .values({ ownerUserId: owner, ...changes })
      .onConflictDoUpdate({
        target: aiSettings.ownerUserId,
        set: { ...changes, updatedAt: isoNow() },
      });
  }
}
