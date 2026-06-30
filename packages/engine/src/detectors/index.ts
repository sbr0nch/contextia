import type { Detector } from '../types.js'
import { awsAccessKeyId } from './aws-access-key-id.js'
import { awsSecretAccessKey } from './aws-secret-access-key.js'
import { gcpKey } from './gcp-key.js'
import { azureKey } from './azure-key.js'
import { githubToken } from './github-token.js'
import { anthropicKey } from './anthropic-key.js'
import { openaiKey } from './openai-key.js'
import { slackToken } from './slack-token.js'
import { stripeLiveKey } from './stripe-live-key.js'
import { privateKey } from './private-key.js'
import { envSecret } from './env-secret.js'
import { dbConnectionString } from './db-connection-string.js'
import { jwt } from './jwt.js'
import { genericHighEntropy } from './generic-high-entropy.js'
import { internalHostname } from './internal-hostname.js'
import { privateIp } from './private-ip.js'
import { email } from './email.js'
import { gitlabPat } from './gitlab-pat.js'
import { npmToken } from './npm-token.js'
import { sendgridKey } from './sendgrid-key.js'
import { twilioKey } from './twilio-key.js'
import { googleOauthSecret } from './google-oauth-secret.js'
import { shopifyToken } from './shopify-token.js'

/** The active detector registry. Add new detectors here. */
export const detectors: Detector[] = [
  awsAccessKeyId,
  awsSecretAccessKey,
  gcpKey,
  azureKey,
  githubToken,
  anthropicKey,
  openaiKey,
  slackToken,
  stripeLiveKey,
  privateKey,
  envSecret,
  dbConnectionString,
  gitlabPat,
  npmToken,
  sendgridKey,
  twilioKey,
  googleOauthSecret,
  shopifyToken,
  jwt,
  genericHighEntropy,
  internalHostname,
  privateIp,
  email,
]

/** Lookup by id. */
export const detectorsById: ReadonlyMap<string, Detector> = new Map(
  detectors.map((d) => [d.id, d]),
)
