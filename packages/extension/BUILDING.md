# Building the extension from source

For reviewers (AMO asks for this because the add-on is bundled by esbuild).

Requirements: Node 22 or later, npm 10 or later, a Unix-like shell or Windows.

```
npm ci                                         # at the repository root
npm run build:engine                           # the extension imports the engine
cd packages/extension
node build.mjs --firefox                       # writes dist-firefox/ (use no flag for Chrome: dist/)
node pack.mjs dist-firefox                     # writes contextia-firefox.zip
```

`build.mjs` bundles `src/` with esbuild and copies `public/` and a manifest derived from
`manifest.json`. The result is the content of the uploaded zip, apart from `version_name`, which
carries a build number and a timestamp.
