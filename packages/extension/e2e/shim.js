// Minimal chrome.* shim so the built extension code runs inside a plain page for
// screenshotting. Backing store can be pre-seeded via globalThis.__cxStore.
(() => {
  const store = (globalThis.__cxStore ??= {})
  const listeners = []
  globalThis.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          if (keys == null) return { ...store }
          const list = Array.isArray(keys) ? keys : [keys]
          const out = {}
          for (const k of list) if (k in store) out[k] = store[k]
          return out
        },
        set: async (obj) => {
          const changes = {}
          for (const k of Object.keys(obj)) {
            changes[k] = { oldValue: store[k], newValue: obj[k] }
            store[k] = obj[k]
          }
          for (const fn of listeners) fn(changes, 'local')
        },
        remove: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys]
          for (const k of list) delete store[k]
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    runtime: { openOptionsPage: () => {}, onInstalled: { addListener: () => {} } },
  }
})()
