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
- Update the `publisher` field in [`package.json`](./package.json) before publishing to the Marketplace.

## Architecture Direction

The current language server is now stateful: it indexes Skepa files in the workspace and serves navigation/search features from that index.

For a truly production-grade implementation, the next major step is to move semantic indexing and navigation onto the real Skepa compiler/parser in `skepa-lang`, so editor features reuse the same source of truth as the language implementation.
