import { describe, it, expect } from 'vitest'
import { detectorsById } from '../src/detectors/index.js'

// A token alphabet that includes "-" (base64url) can end in "-", about one token in
// 64. A trailing \b after a "-" needs a word character next, so such a token was not
// matched whole: not at all where the length is exact, and only up to the last
// letter where it is not. Found by planting random tokens in five contexts and
// comparing with a second tool: one Discord token in 30 was missed, and the same
// ending was shared by 14 detectors. (?!\w) means the same as \b after a letter or a
// digit and also holds after "-" and ".".
const a = (n: number, c = 'a') => c.repeat(n)
const ENDING_IN_NON_WORD: Array<[string, string]> = [
  ['discord_bot_token', `M${a(23)}.${a(6)}.${a(26)}-`],
  ['telegram_bot_token', `123456789:${a(34)}-`],
  ['gitlab_pat', `glpat-${a(19)}-`],
  ['sendgrid_key', `SG.${a(22)}.${a(42)}-`],
  ['square_token', `sq0atp-${a(21)}-`],
  ['openai_key', `sk-proj-${a(19)}-`],
  ['pypi_token', `pypi-AgEI${a(49)}-`],
  ['planetscale_token', `pscale_tkn_${a(31)}-`],
  ['figma_token', `figd_${a(39)}-`],
  ['figma_token', `figd_${a(39)}.`],
  ['airtable_pat', `pat${a(14)}.${a(39)}-`],
  ['terraform_cloud_token', `${a(14)}.atlasv1.${a(59)}-`],
  ['flutterwave_secret', `FLWSECK-${a(19)}-`],
  ['hashicorp_vault_token', `hvs.${a(89)}-`],
]

describe('a token that ends in "-" or "." is matched whole', () => {
  for (const [id, token] of ENDING_IN_NON_WORD) {
    it(`${id}: ...${token.slice(-6)}`, () => {
      const d = detectorsById.get(id)!
      for (const text of [`key ${token} done`, `${token}`, `"${token}"`, `${token}\n`]) {
        expect(d.scan(text).map((m) => m.match), JSON.stringify(text)).toEqual([token])
      }
    })
  }

  it('still stops before a word character that follows', () => {
    expect(detectorsById.get('gitlab_pat')!.scan(`glpat-${a(20)}x`)).toEqual([])
    expect(detectorsById.get('discord_bot_token')!.scan(`M${a(23)}.${a(6)}.${a(26)}-x`).map((m) => m.match.length)).toEqual([60])
  })
})
