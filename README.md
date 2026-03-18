# Skepa Tools

VS Code tooling for the Skepa language.

This repo contains:

- a VS Code extension client
- a language server
- shared language metadata used for completions and hover text

## Features

- `.sk` file recognition
- syntax highlighting
- bracket/comment configuration
- starter snippets
- keyword, type, builtin package, and workspace symbol completions
- hover help for core language items
- go to definition
- find references
- document highlights
- document symbols
- workspace symbols
- diagnostics powered by `skepac check`

## Local Development

Install dependencies:

```powershell
npm install
```

Compile:

```powershell
npm run compile
```

Run the extension in VS Code:

1. Open this repo in VS Code.
2. Press `F5`.
3. Open a `.sk` file in the Extension Development Host.

## Install For Users

The easiest way to share the extension right now is as a `.vsix` package.

Users can install it in VS Code like this:

1. Download the `.vsix` file from the latest GitHub release.
2. Open VS Code.
3. Go to `Extensions`.
4. Open the `...` menu.
5. Choose `Install from VSIX...`.
6. Select the downloaded file.

After install, users may also need either:

- `skepac` available on `PATH`, or
- the `skepa.sourceRepoPath` setting pointing at a local `skepa-lang` repo

Example:

```json
{
  "skepa.sourceRepoPath": "D:/Skepa/skepa-lang"
}
```

## Package A VSIX

Build a distributable extension package locally:

```powershell
npm run package:vsix
```

Or create a stable local filename:

```powershell
npm run package:vsix:file
```

That produces a `.vsix` you can hand to users directly.

## GitHub Releases

This repo includes a GitHub Actions workflow at [.github/workflows/release-vsix.yml](./.github/workflows/release-vsix.yml).

To publish a downloadable `.vsix` on GitHub:

1. Bump the version in [`package.json`](./package.json).
2. Commit the version change.
3. Create and push a tag like `v0.0.2`.

Example:

```powershell
git tag v0.0.2
git push origin v0.0.2
```

That workflow will:

- install dependencies
- compile the extension
- package a `.vsix`
- upload it as a workflow artifact
- attach it to the GitHub release for that tag

## Marketplace Publishing

When you want one-click install from the Visual Studio Marketplace later:

1. Update the `publisher` field in [`package.json`](./package.json).
2. Create a Marketplace publisher and personal access token.
3. Run:

```powershell
npm run publish:marketplace
```

## CLI Resolution

The language server tries these options in order:

1. `skepa.cli.path`
2. `skepac` from `PATH`
3. `cargo run --manifest-path <skepa-lang>/skepac/Cargo.toml -- check ...`

For your current layout, setting this is the cleanest option:

```json
{
  "skepa.sourceRepoPath": "D:/Skepa/skepa-lang"
}
```

With your current folders, the extension should also auto-detect the sibling repo at `../skepa-lang`.

## Notes

- Diagnostics currently run from the saved file on disk via `skepac check`.
- Cargo fallback uses its own `CARGO_TARGET_DIR` so it does not depend on the `skepa-lang/target` folder being writable.
- If `skepac` is not installed globally yet, the cargo fallback is enough for local development.
- The packaged extension is for desktop VS Code, not web-only environments.

## Architecture Direction

The current language server is now stateful: it indexes Skepa files in the workspace and serves navigation/search features from that index.

For a truly production-grade implementation, the next major step is to move semantic indexing and navigation onto the real Skepa compiler/parser in `skepa-lang`, so editor features reuse the same source of truth as the language implementation.
