// Minimal service worker. Settings defaults are applied lazily by getSettings,
// so there is nothing to do on install beyond existing for the manifest.
chrome.runtime.onInstalled.addListener(() => {})
