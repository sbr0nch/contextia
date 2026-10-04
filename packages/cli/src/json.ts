// Positions of the strings in a JSON text, so a redaction can be applied to the text
// itself and everything else stays byte for byte.
//
// The proxy used to parse a request, redact the strings in the object, and serialise
// it again. That is not a faithful copy: integers past 2^53 change (9007199254740993
// became 9007199254740992), 1.10 became 1.1, a duplicate key was dropped, and a secret
// in an object key was never looked at. Here the text is read once, every string value
// and key is recorded with where it starts and ends, and a redaction replaces just those
// ranges.
//
// The reader accepts exactly what JSON.parse accepts (checked against it on random and
// on mutated documents in json.test.ts), so the two never disagree about whether a body
// is JSON. A document nested deeper than MAX_DEPTH is refused: JSON.parse is no more
// willing, and the reader is recursive.

export interface StringToken {
  /** Offset of the opening quote. */
  start: number
  /** Offset just past the closing quote. */
  end: number
}

export interface KeyToken extends StringToken {
  /** The key, decoded. */
  key: string
}

export interface JsonIndex {
  /** String values, by path (see `childPath`). */
  strings: Map<string, StringToken>
  /** Every object key, in document order. */
  keys: KeyToken[]
  /** True when some object has the same key twice: JSON.parse keeps the last, others the first. */
  duplicateKeys: boolean
}

export const MAX_DEPTH = 512
const WORDS = ['true', 'false', 'null']
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y

/** The path of a child, as the proxy's walk builds it. A NUL in a key is escaped so paths cannot collide. */
export function childPath(parent: string, key: string | number): string {
  if (typeof key === 'number') return parent + '\u0000' + key
  return parent + '\u0000' + (key.includes('\u0000') ? key.replace(/\u0000/g, '\u0000\u0001') : key)
}

class Reader {
  pos = 0
  readonly strings = new Map<string, StringToken>()
  readonly keys: KeyToken[] = []
  duplicateKeys = false

  constructor(readonly text: string) {}

  fail(): never {
    throw new SyntaxError(`not JSON at ${this.pos}`)
  }

  ws(): void {
    const t = this.text
    for (;;) {
      const c = t.charCodeAt(this.pos)
      if (c === 32 || c === 10 || c === 13 || c === 9) this.pos++
      else return
    }
  }

  value(path: string, depth: number): void {
    if (depth > MAX_DEPTH) this.fail()
    const c = this.text.charCodeAt(this.pos)
    if (c === 123) return this.object(path, depth)
    if (c === 91) return this.array(path, depth)
    if (c === 34) {
      const tok = this.string()
      this.strings.set(path, tok)
      return
    }
    if (c === 45 || (c >= 48 && c <= 57)) return this.number()
    for (const word of WORDS) {
      if (this.text.startsWith(word, this.pos)) {
        this.pos += word.length
        return
      }
    }
    this.fail()
  }

  object(path: string, depth: number): void {
    this.pos++ // {
    this.ws()
    if (this.text.charCodeAt(this.pos) === 125) {
      this.pos++
      return
    }
    const seen = new Set<string>()
    for (;;) {
      this.ws()
      if (this.text.charCodeAt(this.pos) !== 34) this.fail()
      const tok = this.string()
      const key = this.decode(tok)
      if (seen.has(key)) this.duplicateKeys = true
      seen.add(key)
      this.keys.push({ ...tok, key })
      this.ws()
      if (this.text.charCodeAt(this.pos) !== 58) this.fail()
      this.pos++
      this.ws()
      this.value(childPath(path, key), depth + 1)
      this.ws()
      const c = this.text.charCodeAt(this.pos)
      this.pos++
      if (c === 125) return
      if (c !== 44) this.fail()
    }
  }

  array(path: string, depth: number): void {
    this.pos++ // [
    this.ws()
    if (this.text.charCodeAt(this.pos) === 93) {
      this.pos++
      return
    }
    for (let i = 0; ; i++) {
      this.ws()
      this.value(childPath(path, i), depth + 1)
      this.ws()
      const c = this.text.charCodeAt(this.pos)
      this.pos++
      if (c === 93) return
      if (c !== 44) this.fail()
    }
  }

  /** A string literal, validated, from its opening quote. */
  string(): StringToken {
    const t = this.text
    const start = this.pos
    this.pos++
    for (;;) {
      const c = t.charCodeAt(this.pos)
      if (c !== c) this.fail() // end of text: NaN
      if (c === 34) {
        this.pos++
        return { start, end: this.pos }
      }
      if (c < 32) this.fail() // a raw control character
      if (c === 92) {
        const e = t.charCodeAt(this.pos + 1)
        if (e === 117) {
          for (let k = 2; k < 6; k++) {
            const h = t.charCodeAt(this.pos + k)
            if (!((h >= 48 && h <= 57) || (h >= 65 && h <= 70) || (h >= 97 && h <= 102))) this.fail()
          }
          this.pos += 6
        } else if (e === 34 || e === 92 || e === 47 || e === 98 || e === 102 || e === 110 || e === 114 || e === 116) {
          this.pos += 2
        } else this.fail()
      } else this.pos++
    }
  }

  decode(tok: StringToken): string {
    const raw = this.text.slice(tok.start, tok.end)
    return raw.includes('\\') ? (JSON.parse(raw) as string) : raw.slice(1, -1)
  }

  number(): void {
    NUMBER.lastIndex = this.pos
    const r = NUMBER.exec(this.text)
    if (!r) this.fail()
    this.pos += r[0].length
  }
}

/** Index a JSON text, or return null when it is not valid JSON (or nested past MAX_DEPTH). */
export function indexJson(text: string): JsonIndex | null {
  const r = new Reader(text)
  try {
    r.ws()
    r.value('', 0)
    r.ws()
    if (r.pos !== text.length) return null
  } catch (e) {
    if (e instanceof SyntaxError) return null
    throw e
  }
  return { strings: r.strings, keys: r.keys, duplicateKeys: r.duplicateKeys }
}

/**
 * The text with some strings replaced. `values` maps a string value's path to its new
 * content; `keys` maps the offset of an object key to its new content. Everything not
 * named is copied as it was.
 */
export function patchJson(text: string, index: JsonIndex, values: ReadonlyMap<string, string>, keys: ReadonlyMap<number, string> = new Map()): string {
  const edits: Array<[number, number, string]> = []
  for (const [path, value] of values) {
    const tok = index.strings.get(path)
    if (tok) edits.push([tok.start, tok.end, JSON.stringify(value)])
  }
  for (const [start, value] of keys) {
    const tok = index.keys.find((k) => k.start === start)
    if (tok) edits.push([tok.start, tok.end, JSON.stringify(value)])
  }
  edits.sort((a, b) => a[0] - b[0])
  let out = ''
  let at = 0
  for (const [s, e, replacement] of edits) {
    out += text.slice(at, s) + replacement
    at = e
  }
  return out + text.slice(at)
}
