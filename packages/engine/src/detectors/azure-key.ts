import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// Azure Storage account key inside a connection string: a long base64 value after
// the AccountKey= marker. The marker keeps this precise.
const RE = /AccountKey=[A-Za-z0-9+/]{60,}/g

export const azureKey: Detector = {
  id: 'azure_key',
  label: 'Azure storage account key',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'AccountKey=' + 'a'.repeat(88),
      'DefaultEndpointsProtocol=https;AccountName=x;AccountKey=' + 'Zm9vYmFy'.repeat(11),
      'conn AccountKey=' + 'AbCd1234'.repeat(9),
    ],
    negatives: [
      'AccountKey=tooShort==',
      'AccountName=mystorageaccount',
      'no azure connection string here',
    ],
  },
}
