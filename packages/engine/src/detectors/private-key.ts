import type { Detector, RawMatch } from '../types.js'

// PEM private-key blocks: an optional algorithm word (RSA, EC, DSA, OPENSSH,
// ENCRYPTED, ...) then BEGIN/END PRIVATE KEY armor.
//
// BEGIN and END are found separately. A single lazy `BEGIN[\s\S]*?END` is
// quadratic on a text with many BEGINs and no END: each one scans to the end of
// the input (11.8 s on 1 MB). Once one BEGIN finds no END after it, no later
// BEGIN can either, so the scan stops there.
const BEGIN = /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/g
const END = /-----END (?:[A-Z0-9]+ )?PRIVATE KEY-----/g

export const privateKey: Detector = {
  id: 'private_key',
  label: 'Private key block',
  severity: 'critical',
  defaultEnabled: true,
  rationale: 'A PEM private key authenticates as you; anyone who reads it can impersonate the key holder.',
  scan(text: string): RawMatch[] {
    const out: RawMatch[] = []
    BEGIN.lastIndex = 0
    for (let b = BEGIN.exec(text); b !== null; b = BEGIN.exec(text)) {
      END.lastIndex = b.index + b[0].length
      const e = END.exec(text)
      if (e === null) break
      const end = e.index + e[0].length
      out.push({ start: b.index, end, match: text.slice(b.index, end) })
      BEGIN.lastIndex = end
    }
    return out
  },
  fixtures: {
    positives: [
      '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN PRIVATE KEY-----\nMIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAw\n-----END PRIVATE KEY-----',
      '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAA\n-----END OPENSSH PRIVATE KEY-----',
    ],
    negatives: [
      '-----BEGIN CERTIFICATE-----\nMIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG\n-----END CERTIFICATE-----',
      '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----',
      'load the private key from the keystore before signing the request',
    ],
  },
}
