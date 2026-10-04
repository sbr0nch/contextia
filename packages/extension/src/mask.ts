/**
 * A safe preview of a matched value, never the whole secret in clear UI. It
 * shows at most a fifth of the value: nothing up to 10 characters, 2 up to 19,
 * 4 up to 39, then 8. (It used to show 8 characters of anything over 10, which is
 * two thirds of a 12-character password.)
 */
export function mask(value: string): string {
  if (value.length <= 10) return '•'.repeat(Math.max(4, value.length))
  const shown = value.length < 20 ? 2 : value.length < 40 ? 4 : 8
  const head = Math.ceil(shown / 2)
  return `${value.slice(0, head)}…${value.slice(value.length - (shown - head))} · ${value.length} chars`
}
