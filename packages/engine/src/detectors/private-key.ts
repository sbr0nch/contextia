import type { Detector, RawMatch } from '../types.js'

// PEM private-key blocks: an optional algorithm word (RSA, EC, DSA, OPENSSH,
// ENCRYPTED, ...) then BEGIN/END PRIVATE KEY armor. The body is bounded by the
// END marker, so the lazy match cannot backtrack catastrophically.
const BLOCK =
  /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )?PRIVATE KEY-----/g

export const privateKey: Detector = {
  id: 'private_key',
  label: 'Private key block',
  severity: 'critical',
  defaultEnabled: true,
  rationale: 'A PEM private key authenticates as you — anyone who reads it can impersonate the key holder.',
  scan(text: string): RawMatch[] {
    const out: RawMatch[] = []
    for (const m of text.matchAll(BLOCK)) {
      const start = m.index!
      out.push({ start, end: start + m[0].length, match: m[0] })
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
