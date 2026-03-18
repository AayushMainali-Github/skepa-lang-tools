from __future__ import annotations

import json
import sys
import zipfile


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python scripts/verify_vsix.py <path-to-vsix>", file=sys.stderr)
        return 2

    vsix_path = sys.argv[1]

    with zipfile.ZipFile(vsix_path) as archive:
        package = json.loads(read_text(archive, "extension/package.json"))
        server_js = read_text(archive, "extension/out/server/server/src/server.js")
        workspace_js = read_text(archive, "extension/out/server/server/src/workspaceIndex.js")

    defaults = package.get("contributes", {}).get("configurationDefaults", {}).get("[skepa]", {})
    expect(defaults.get("editor.wordBasedSuggestions") == "off", "Skepa word-based suggestions should be off in packaged extension")
    expect(defaults.get("editor.semanticHighlighting.enabled") is True, "Skepa semantic highlighting should be enabled in packaged extension")

    expect("COMPLETION_TRIGGER_CHARACTERS" in server_js, "Packaged server should include completion trigger configuration")
    expect("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" in server_js, "Packaged server should include letter-based completion triggers")

    expect("buildImportCompletionItems" in workspace_js, "Packaged workspace index should include import-aware completions")
    expect("getImportContext" in workspace_js, "Packaged workspace index should include import context detection")
    expect("collectWorkspaceModulePaths" in workspace_js, "Packaged workspace index should include workspace module import completion support")

    print(f"VSIX verification passed: {vsix_path}")
    return 0


def read_text(archive: zipfile.ZipFile, name: str) -> str:
    with archive.open(name) as handle:
        return handle.read().decode("utf-8")


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


if __name__ == "__main__":
    raise SystemExit(main())
