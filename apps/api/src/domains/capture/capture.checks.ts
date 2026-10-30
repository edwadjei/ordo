/**
 * Deterministic repairs applied to a validated AI reply, whatever the model
 * did with the instructions. Each works on the capture's own text, so it can
 * only restore what the capture says, never invent anything.
 */

const months = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
/**
 * "nov", "Nov.", "November" → 0-based month, or -1. "may" counts only as
 * "May": lower case it is far more often the verb ("the 14th may slip").
 */
function monthIndex(word: string) {
  if (word === 'may') return -1;
  const name = word.toLowerCase().replace(/\.$/, '');
  if (name.length < 3) return -1;
  return months.findIndex((month) => month.startsWith(name));
}

const monthWord =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const ordinal = '(\\d{1,2})(?:st|nd|rd|th)?';

const pad = (value: number) => String(value).padStart(2, '0');
const isoDate = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;
const daysIn = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * The first explicit day of the month in `text` ("the 14th", "14 November",
 * "Nov 14", "November 14th"), as the next such date on or after `today`
 * (`YYYY-MM-DD`): this month or year if it has not passed, else the next one
 * that has that day. Null when the text names none.
 */
export function statedDayOfMonth(text: string, today: string) {
  const [year, month, day] = today.split('-').map(Number);
  const todayMonth = month - 1;
  const withMonth =
    new RegExp(`\\b${ordinal}\\s+(?:of\\s+)?${monthWord}(?![a-z])`, 'i').exec(
      text,
    ) ?? null;
  const monthFirst = withMonth
    ? null
    : new RegExp(`\\b${monthWord}\\s+${ordinal}\\b`, 'i').exec(text);
  if (withMonth || monthFirst) {
    const [dayText, monthText] = withMonth
      ? [withMonth[1], withMonth[2]]
      : [monthFirst![2], monthFirst![1]];
    const target = Number(dayText);
    const targetMonth = monthIndex(monthText);
    if (targetMonth < 0 || target < 1 || target > 31) return null;
    for (const candidateYear of [
      year,
      year + 1,
      year + 2,
      year + 3,
      year + 4,
    ]) {
      if (target > daysIn(candidateYear, targetMonth)) continue;
      const candidate = isoDate(candidateYear, targetMonth, target);
      if (candidate >= today) return candidate;
    }
    return null;
  }
  const bare = /\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/i.exec(text);
  if (!bare) return null;
  const target = Number(bare[1]);
  if (target < 1 || target > 31) return null;
  // This month if the day is still ahead, else the next month that has it.
  for (let step = 0; step < 13; step++) {
    const candidateMonth = (todayMonth + step) % 12;
    const candidateYear = year + Math.floor((todayMonth + step) / 12);
    if (target > daysIn(candidateYear, candidateMonth)) continue;
    if (step === 0 && target < day) continue;
    return isoDate(candidateYear, candidateMonth, target);
  }
  return null;
}

const stopWords = new Set([
  'about',
  'after',
  'again',
  'also',
  'before',
  'from',
  'have',
  'into',
  'that',
  'their',
  'them',
  'then',
  'there',
  'they',
  'this',
  'will',
  'with',
  'your',
]);
const words = (text: string) =>
  new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (word) => word.length >= 4 && !stopWords.has(word),
    ),
  );

/**
 * The sentence (or line) of the capture an item came from: the one sharing
 * the most words of four letters or more with its title, if it shares at
 * least two. Null when none clearly does.
 */
export function sourceSentence(title: string, body: string) {
  const wanted = words(title);
  if (wanted.size === 0) return null;
  let best: { sentence: string; score: number } | null = null;
  for (const sentence of body.split(/(?<=[.!?])\s+|\n+/)) {
    let score = 0;
    for (const word of words(sentence)) if (wanted.has(word)) score++;
    if (score >= 2 && (!best || score > best.score)) best = { sentence, score };
  }
  return best?.sentence ?? null;
}

/**
 * A greeting may name a person ("Hi Kofi,"), never an organisation or an
 * article: "Hi the design agency," and "Dear our suppliers," become "Hello,".
 */
export function cleanGreeting(body: string) {
  return body.replace(
    /^(?:hi|hello|hey|dear)\s+(?:the|our|your|a|an)\b[^,\n]*(,?)/i,
    'Hello,',
  );
}
