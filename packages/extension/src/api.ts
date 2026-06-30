// Cross-browser WebExtension API. Firefox exposes `browser` (promise-based);
// Chromium (Chrome/Edge) exposes `chrome` (promise-based in MV3). Prefer
// whichever exists so the same code runs on all of them.
type Api = typeof chrome
const g = globalThis as unknown as { browser?: Api; chrome?: Api }

export const api: Api = (g.browser ?? g.chrome) as Api
