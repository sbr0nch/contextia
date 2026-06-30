import { beforeEach, vi } from 'vitest'

// Minimal in-memory chrome.* so storage logic runs under Node.
let store: Record<string, unknown> = {}

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: async (keys?: string | string[] | null) => {
        if (keys == null) return { ...store }
        const list = Array.isArray(keys) ? keys : [keys]
        const out: Record<string, unknown> = {}
        for (const k of list) if (k in store) out[k] = store[k]
        return out
      },
      set: async (obj: Record<string, unknown>) => {
        Object.assign(store, obj)
      },
      remove: async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys]
        for (const k of list) delete store[k]
      },
    },
    onChanged: { addListener: () => {} },
  },
  runtime: { openOptionsPage: () => {}, onInstalled: { addListener: () => {} } },
})

beforeEach(() => {
  store = {}
})
