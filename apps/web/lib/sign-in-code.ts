export const signInCodeLength = 6;

const digitZeros = [
  0xff10, // full-width
  0x0660, // Arabic-Indic
  0x06f0, // Eastern Arabic-Indic
];

function asciiDigit(char: string): string {
  const point = char.codePointAt(0) ?? 0;
  for (const zero of digitZeros)
    if (point >= zero && point <= zero + 9) return String(point - zero);
  return char;
}

/**
 * Keeps only the digits of a typed, pasted or autofilled sign-in code, so
 * "658 659", "658-659", " 658659\n" or a code carrying zero-width or
 * non-breaking spaces all become "658659". Full-width and Arabic-Indic digits
 * are read as 0-9. Anything after the sixth digit is dropped, so pasting a
 * whole message line ("658659 expires in 10 minutes") still gives the code.
 */
export function normalizeSignInCode(value: string): string {
  return Array.from(value, asciiDigit)
    .join('')
    .replace(/[^0-9]/g, '')
    .slice(0, signInCodeLength);
}

/**
 * A plain-English problem with a normalised code, or '' when it is ready to
 * send.
 */
export function signInCodeProblem(code: string): string {
  if (!code) return 'Enter the six-digit code from your message.';
  if (code.length < signInCodeLength)
    return `That code has ${code.length} digit${code.length === 1 ? '' : 's'}. Enter all six.`;
  return '';
}
