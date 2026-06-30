# Browser support

Contextia is a single codebase. The extension API is accessed through a thin
cross-browser shim (`src/api.ts`) that prefers Firefox's `browser` namespace and
falls back to Chromium's `chrome`, so the same content/popup/options code runs on
all targets.

## Chrome / Edge / Brave / other Chromium

Use the default build — these are all Chromium and load the same output.

```bash
npm run build --workspace @contextia/extension     # -> dist/
npm run package --workspace @contextia/extension   # -> contextia.zip
```

Load unpacked: `chrome://extensions` (or `edge://extensions`) → Developer mode →
Load unpacked → select `packages/extension/dist`.

## Firefox

Firefox needs an event-page background and an add-on id, so it gets its own
manifest via a build flag (the JavaScript is identical).

```bash
npm run build:firefox --workspace @contextia/extension     # -> dist-firefox/
npm run package:firefox --workspace @contextia/extension   # -> contextia-firefox.zip
```

Load temporarily: `about:debugging#/runtime/this-firefox` → Load Temporary
Add-on → pick `packages/extension/dist-firefox/manifest.json`.

> The Firefox target is generated and structurally valid, but has not yet been
> verified running on a real Firefox profile — please confirm composer detection
> and the popup/options there before publishing to AMO. Requires Firefox 121+.
