import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// RFC1918 ranges + loopback.
const RE =
  /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g

export const privateIp: Detector = {
  id: 'private_ip',
  label: 'Private IP address',
  severity: 'warning',
  defaultEnabled: false,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: ['10.0.0.5', '192.168.1.1', '172.31.255.254'],
    negatives: [
      '8.8.8.8', // public
      '172.32.0.1', // outside the private 172.16–31 range
      'no ip address in this sentence',
    ],
  },
}
