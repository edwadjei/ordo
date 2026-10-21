import {
  DatabaseAdapter,
  eq,
  tables,
  type TransactionContext,
} from '../../adapters/database/database.adapter.js';
const { audioSettings } = tables;
export class AudioSettingsRepository {
  constructor(private readonly database: DatabaseAdapter) {}
  async find(owner: string, transaction?: TransactionContext) {
    const [row] = await this.database
      .use(transaction)
      .select()
      .from(audioSettings)
      .where(eq(audioSettings.ownerUserId, owner));
    return row;
  }
  forOwner<T>(
    owner: string,
    run: (transaction: TransactionContext) => Promise<T>,
  ) {
    return this.database.forOwner(owner, run);
  }
  async save(
    owner: string,
    provider: 'local_whisper' | 'openai',
    encryptedApiKey: string | null,
    transaction: TransactionContext,
  ) {
    await this.database
      .use(transaction)
      .insert(audioSettings)
      .values({ ownerUserId: owner, provider, encryptedApiKey })
      .onConflictDoUpdate({
        target: audioSettings.ownerUserId,
        set: { provider, encryptedApiKey, updatedAt: new Date().toISOString() },
      });
  }
}
