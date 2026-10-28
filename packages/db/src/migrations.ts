/**
 * Folder holding the numbered SQL migrations, for Node tooling and tests only
 * (the Worker never reads or runs migrations).
 */
export const migrationsDirectory = new URL('../migrations/', import.meta.url);
