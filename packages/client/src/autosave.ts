/** Persist a changing draft serially, including edits made while a request is in flight.
 * A rejected write stops the drain; the caller retains the latest draft for explicit retry.
 */
export async function saveLatest<T>(
  read: () => T,
  write: (value: T) => Promise<void>,
  equals: (a: T, b: T) => boolean,
  active: () => boolean = () => true,
): Promise<void> {
  let saved: T;
  do {
    saved = read();
    await write(saved);
  } while (active() && !equals(saved, read()));
}
