# Releasing

1. Change the version in the five places at once and add a `## vX.Y.Z` section to `CHANGELOG.md`:
   the three `package.json` (engine, cli, extension), `plugins/contextia/.claude-plugin/plugin.json`
   and `.claude-plugin/marketplace.json`, then `npm install --package-lock-only`.
   `npm run check:versions` fails if they disagree.
2. Merge. Wait for CI (Linux, Windows, macOS; Node 20 and 22; Chromium and Firefox) to be green.
3. Tag the merge commit and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
   The `Release` workflow checks the tag against the five versions, runs the full suite, publishes
   the two npm packages (engine, then cli) and creates the GitHub release with every package attached.
   Run it from the Actions tab (`workflow_dispatch`) first to get the packages without publishing.
4. Stores, by hand, from the files attached to the release:
   * Chrome Web Store: upload `contextia-chrome-X.Y.Z.zip` as a new version of the item.
   * Firefox AMO: upload `contextia-firefox-X.Y.Z.zip`; when asked for the source, upload
     `contextia-source-X.Y.Z.zip` and the build steps in `packages/extension/BUILDING.md`
     (the add-on is bundled by esbuild, which AMO treats as minified code).
5. The Claude Code plugin (`plugins/contextia`) is distributed from this repository's marketplace
   entry: a merged change with the new version is the release; its `vendor/engine.js` is checked
   fresh by `npm run test:pack`.

One-time npm setup: for both `@sbr0nch/contextia` and `@sbr0nch/contextia-engine`, npmjs.com,
Settings, Trusted Publisher, GitHub Actions: repository `sbr0nch/contextia`, workflow `release.yml`.
No token is stored. A repository secret `NPM_TOKEN` is used instead if one exists.

Not covered by anything automated: the stores (a store upload is public), and installing from the
stores after publishing.
