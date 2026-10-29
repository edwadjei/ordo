// One formatter per timezone for the life of the isolate: building an
// Intl.DateTimeFormat loads timezone data and costs far more CPU than using
// one, so a capture must not build one per request.
interface Formatter {
  format: Intl.DateTimeFormat;
  timezone: string;
}
const formatters = new Map<string, Formatter>();

function formatter(timezone: string): Formatter {
  let entry = formatters.get(timezone);
  if (!entry) {
    try {
      entry = {
        format: new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          weekday: 'long',
        }),
        timezone,
      };
    } catch {
      // An unknown timezone falls back to UTC.
      entry = formatter('UTC');
    }
    formatters.set(timezone, entry);
  }
  return entry!;
}

/** Today's date (`YYYY-MM-DD`) and weekday in an IANA timezone; UTC if it is unknown. */
export function localToday(timezone: string, now = new Date()) {
  const { format, timezone: zone } = formatter(timezone);
  const parts = Object.fromEntries(
    format.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    timezone: zone,
  };
}
