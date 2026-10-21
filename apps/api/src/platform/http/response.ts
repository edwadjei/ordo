export function publicRecord<T extends { ownerUserId: string }>(record: T) {
  const { ownerUserId: _owner, ...result } = record;
  return result;
}
