# Skepa Tools

Skepa Tools is the VS Code extension for the Skepa language.

It adds editor support for `.sk` files, including syntax highlighting, completions, hover info, go to definition, references, rename, signature help, symbols, and compiler-backed diagnostics.

## Features

- `.sk` file support
- syntax highlighting
- snippets
- completions for keywords, types, builtins, and workspace symbols
- hover information
- go to definition
- find references
- rename symbol
- signature help
- document highlights
- document symbols
- workspace symbols
- diagnostics powered by `skepac check`

## Install

Install the latest `.vsix` from the GitHub `latest` release:

1. Download `skepa-tools-latest.vsix`
2. Open VS Code
3. Open `Extensions`
4. Open the `...` menu
5. Choose `Install from VSIX...`
6. Select the downloaded file

## Diagnostics Setup

Diagnostics work when one of these is available:

- `skepac` on your `PATH`
- `skepa.sourceRepoPath` pointing to a local `skepa-lang` repo

Example:

```json
{
  "skepa.sourceRepoPath": "D:/Skepa/skepa-lang"
}
```

If neither is available, the extension still provides editor features like highlighting, hover, completions, symbols, and navigation, but compiler diagnostics will not run.

## Local Development

```powershell
npm install
npm run compile
```

To run the extension locally in VS Code:

1. Open this repo in VS Code
2. Press `F5`
3. Open a `.sk` file in the Extension Development Host

## Releases

- Every push to `main` updates the rolling `latest` VSIX release
- Version tags like `v0.0.2` build a separate tagged release

## Notes

- The extension is for desktop VS Code
- Diagnostics run on saved files from disk
- The extension can auto-detect a sibling `skepa-lang` repo in common local layouts
