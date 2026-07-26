# Releasing

Contextia ships to six places from one repository. They drift the moment they
carry different numbers, so they do not: **every surface ships the same version,
every time**, even the ones that did not change. Republishing an unchanged
package costs nothing. Guessing which of six numbers is current costs an evening.

Run `npm run preflight` before anything else. It refuses to pass on a version
mismatch, on `innerHTML` in a built bundle (store validators reject it), or on
an em dash anywhere in tracked files, and it prints the checklist below filled
in with the version it found.

## The six channels

| Channel | Version lives in | Published by |
|---|---|---|
| npm `@sbr0nch/contextia-engine` | `packages/engine/package.json` | `npm publish` |
| npm `@sbr0nch/contextia` | `packages/cli/package.json` | `npm publish` |
| Chrome Web Store | `packages/extension/package.json` | upload `contextia.zip` |
| Firefox AMO | `packages/extension/package.json` | upload `contextia-firefox.zip` + source |
| Claude Code plugin | `plugins/contextia/.claude-plugin/plugin.json` **and** `.claude-plugin/marketplace.json` | pushing to `main` |
| GitHub release | the git tag | tag + release page |

The plugin needs **both** files bumped. Claude Code only offers an update when
the marketplace entry changes, so bumping only the plugin manifest ships nothing.

The extension manifest has no version of its own: the build injects it from
`packages/extension/package.json`.

## Order

Numbers first, then artifacts, then the irreversible steps. npm and the stores
cannot be un-published, so nothing goes out before the tag exists.

1. **Bump every file in the table to the same number.** Add the section to
   `CHANGELOG.md`.
2. `npm install` so the lockfile picks up the new versions, then `npm run verify`.
   It must be green: typecheck, tests, acceptance gate, build.
3. `npm run preflight`. Fix whatever it fails on. Do not continue on a FAIL.
4. Commit, push `main`.
5. Tag. Lightweight, never annotated, so no name or email is written into the
   object:
   ```
   git tag v<version>
   git push origin v<version>
   ```
6. **npm**, engine before CLI:
   ```
   npm publish --workspace @sbr0nch/contextia-engine
   npm publish --workspace @sbr0nch/contextia
   ```
   Verify with `npm view @sbr0nch/contextia version`, then prove the published
   artifact runs: `npx --yes @sbr0nch/contextia@<version> version`.
7. **Build the store packages and the source archive:**
   ```
   npm run package --workspace @sbr0nch/contextia-extension
   npm run package:firefox --workspace @sbr0nch/contextia-extension
   git archive --format=zip --prefix=contextia-<version>/ v<version> -o contextia-source-<version>.zip
   ```
8. **GitHub release** against the tag, with both zips attached.
9. **Chrome Web Store**: upload `contextia.zip`.
10. **Firefox AMO**: upload `contextia-firefox.zip`, answer yes to the
    machine-generated code question, and upload the source archive. In the notes
    to reviewer give the Node version, `npm ci`, the
    `npm run build:firefox --workspace @sbr0nch/contextia-extension` command, and
    point at `test/no-network.test.ts`, which fails the build if any network
    primitive appears in the source. Reviewers look for exactly that.

## Security fixes

If a released version was vulnerable, publish a GitHub Security Advisory as well
as the release. `Security > Advisories > New draft security advisory`, ecosystem
npm, with the affected range and the patched version. Users on the old version
get alerted and `npm audit` starts reporting it. A changelog entry does not do
either of those things.

## Things that have bitten us

- `server.listen(port)` with no host binds every interface. Pass the host.
- A body the scanner cannot read is unknown, not clean. Fail closed.
- Store validators flag every `innerHTML` write, even a constant one. Build
  nodes with `svgNode()` from `packages/extension/src/brand.ts`.
- Annotated tags embed the tagger's name, email and message. Use lightweight.
- Deleting a tag does not delete its GitHub release, and a release whose tag is
  gone becomes a draft that is easy to miss on the releases page.
