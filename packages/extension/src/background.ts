import { api } from './api.js'

// Minimal service worker / background. Settings defaults are applied lazily by
// getSettings, so there is nothing to do on install beyond existing.
api.runtime.onInstalled.addListener(() => {})
