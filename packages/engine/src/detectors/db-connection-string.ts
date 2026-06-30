import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// scheme://[user]:password@host — a connection string carrying inline credentials.
const RE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]*:[^\s:@/]+@[^\s/]+/gi

export const dbConnectionString: Detector = {
  id: 'db_connection_string',
  label: 'Connection string with credentials',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'postgres://admin:s3cret@db.example.com:5432/app',
      'mongodb://user:pass@cluster0.mongodb.net',
      'redis://:password@10.0.0.1:6379',
    ],
    negatives: [
      'https://example.com/path', // no inline credentials
      'postgres://localhost:5432/db', // host:port, no user:pass@
      'just a sentence, not a url',
    ],
  },
}
