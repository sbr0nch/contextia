/** A safe preview of a matched value — never the whole secret in clear UI. */
export function mask(value: string): string {
  if (value.length <= 10) return '•'.repeat(Math.max(4, value.length))
  return `${value.slice(0, 4)}…${value.slice(-4)} · ${value.length} chars`
}
