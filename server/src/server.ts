import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import {
  CodeAction,
  CodeActionParams,
  Diagnostic,
  DiagnosticSeverity,
  DocumentSymbol,
  Hover,
  HoverParams,
  InitializeParams,
  InitializeResult,
  MarkupKind,
  PrepareRenameParams,
  Position,
  ProposedFeatures,
  RenameParams,
  SemanticTokens,
  SignatureHelp,
  TextDocumentSyncKind,
  TextDocuments,
  WorkspaceSymbol,
  createConnection,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  ALL_LANGUAGE_ITEMS,
} from "../../shared/src/languageData";
import {
  extractMissingImportPackage,
  WorkspaceIndex,
  getSemanticTokenLegend,
  getWordAtPositionFromText,
  uriToFsPath,
} from "./workspaceIndex";

interface SkepaSettings {
  cliPath: string;
  cliArgs: string[];
  sourceRepoPath: string;
}

interface CommandSpec {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  label: string;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const workspaceIndex = new WorkspaceIndex();
let workspaceFolders: string[] = [];
const COMPLETION_TRIGGER_CHARACTERS = [
  ".",
  ":",
  "_",
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
];

connection.onInitialize((params: InitializeParams): InitializeResult => {
  workspaceFolders = (params.workspaceFolders ?? [])
    .map((folder) => uriToFsPath(folder.uri))
    .filter((folder): folder is string => Boolean(folder));

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: COMPLETION_TRIGGER_CHARACTERS,
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentHighlightProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      codeActionProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
      signatureHelpProvider: {
        triggerCharacters: ["(", ","],
        retriggerCharacters: [","],
      },
      semanticTokensProvider: {
        legend: getSemanticTokenLegend(),
        full: true,
      },
    },
  };
});

connection.onInitialized(() => {
  connection.console.info("Skepa language server initialized.");
  void workspaceIndex.initialize(workspaceFolders, documents.all());
});

documents.onDidOpen((event) => {
  workspaceIndex.upsertDocument(event.document);
  void validateTextDocument(event.document);
});

documents.onDidChangeContent((event) => {
  workspaceIndex.upsertDocument(event.document);
});

documents.onDidSave((event) => {
  workspaceIndex.upsertDocument(event.document);
  void validateTextDocument(event.document);
});

documents.onDidClose((event) => {
  workspaceIndex.refreshFromDisk(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onDidChangeConfiguration(() => {
  for (const document of documents.all()) {
    void validateTextDocument(document);
  }
});

connection.onCompletion((params) => workspaceIndex.buildCompletionItems(params));

connection.onHover((params: HoverParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const builtinItem = workspaceIndex.findBuiltinItem(params.textDocument.uri, params.position);
  if (builtinItem) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${builtinItem.label}**\n\n${builtinItem.detail}\n\n${builtinItem.documentation}`,
      },
    };
  }

  const word = getWordAtPositionFromText(document.getText(), params.position);
  if (!word) {
    return null;
  }

  const item = ALL_LANGUAGE_ITEMS.find((entry) => entry.label === word);
  if (!item) {
    const symbol = workspaceIndex.findSymbolForHover(params.textDocument.uri, params.position);
    if (!symbol) {
      return null;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${symbol.name}**\n\n${symbol.detail}${
          symbol.containerName ? `\n\nContainer: \`${symbol.containerName}\`` : ""
        }`,
      },
    };
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `**${item.label}**\n\n${item.detail}\n\n${item.documentation}`,
    },
  };
});

connection.onDefinition((params) => workspaceIndex.findDefinition(params));
connection.onReferences((params) => workspaceIndex.findReferences(params));
connection.onDocumentHighlight((params) => workspaceIndex.findDocumentHighlights(params));
connection.onDocumentSymbol((params): DocumentSymbol[] => workspaceIndex.getDocumentSymbols(params.textDocument.uri));
connection.onWorkspaceSymbol((params): WorkspaceSymbol[] => workspaceIndex.searchWorkspaceSymbols(params.query));
connection.onPrepareRename((params: PrepareRenameParams) => workspaceIndex.prepareRename(params));
connection.onRenameRequest((params: RenameParams) => workspaceIndex.renameSymbol(params));
connection.onSignatureHelp((params): SignatureHelp | null => {
  return workspaceIndex.buildSignatureHelp(params.textDocument.uri, params.position);
});
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  return workspaceIndex.buildCodeActions(params.textDocument.uri, params.context.diagnostics);
});
connection.languages.semanticTokens.on((params): SemanticTokens => {
  return workspaceIndex.buildSemanticTokens(params.textDocument.uri);
});

async function validateTextDocument(document: TextDocument): Promise<void> {
  if (document.languageId !== "skepa" || document.uri.startsWith("untitled:")) {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    return;
  }

  const filePath = uriToFsPath(document.uri);
  if (!filePath) {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    return;
  }

  const settings = await loadSettings();
  const commands = resolveCommands(settings, filePath);

  if (commands.length === 0) {
    connection.sendDiagnostics({
      uri: document.uri,
      diagnostics: [
        {
          severity: DiagnosticSeverity.Error,
          source: "skepa-tools",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          message:
            "Unable to locate `skepac`. Set `skepa.cli.path` or `skepa.sourceRepoPath`.",
        },
      ],
    });
    return;
  }

  let result: CommandResult | null = null;
  let attemptedLabel = "";

  for (const command of commands) {
    attemptedLabel = command.label;
    result = await runCommand(command);
    if (!(result.error && result.error.code === "ENOENT")) {
      break;
    }
  }

  if (!result) {
    connection.sendDiagnostics({
      uri: document.uri,
      diagnostics: [
        {
          severity: DiagnosticSeverity.Error,
          source: "skepa-tools",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          message: "Unable to start Skepa diagnostics.",
        },
      ],
    });
    return;
  }

  if (result.error && result.error.code === "ENOENT") {
    connection.sendDiagnostics({
      uri: document.uri,
      diagnostics: [
        {
          severity: DiagnosticSeverity.Error,
          source: "skepa-tools",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          message: `Failed to launch ${attemptedLabel}. ${result.error.message}`,
        },
      ],
    });
    return;
  }

  const combinedOutput = [result.stderr, result.stdout].filter(Boolean).join("\n");
  const diagnostics = parseDiagnostics(combinedOutput, document);
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

async function loadSettings(): Promise<SkepaSettings> {
  const config = await connection.workspace.getConfiguration("skepa");
  const cliPath = asNonEmptyString(config?.cli?.path) ?? "skepac";
  const cliArgs = Array.isArray(config?.cli?.args)
    ? config.cli.args.filter((value: unknown): value is string => typeof value === "string")
    : [];
  const sourceRepoPath = asNonEmptyString(config?.sourceRepoPath) ?? "";

  return {
    cliPath,
    cliArgs,
    sourceRepoPath,
  };
}

function resolveCommands(settings: SkepaSettings, filePath: string): CommandSpec[] {
  const commands: CommandSpec[] = [];
  const cliPath = settings.cliPath.trim();

  if (cliPath) {
    if (!path.isAbsolute(cliPath) || fs.existsSync(cliPath)) {
      commands.push({
        command: cliPath,
        args: [...settings.cliArgs, "check", filePath],
        cwd: pickWorkingDirectory(filePath),
        label: cliPath,
      });
    }
  }

  const manifestPath = resolveCargoManifest(settings.sourceRepoPath, filePath);
  if (manifestPath) {
    commands.push({
      command: "cargo",
      args: ["run", "--quiet", "--manifest-path", manifestPath, "--", "check", filePath],
      cwd: pickWorkingDirectory(filePath),
      env: {
        ...process.env,
        CARGO_TARGET_DIR: path.join(os.tmpdir(), "skepa-tools-cargo-target"),
      },
      label: "cargo run skepac",
    });
  }

  return commands;
}

function resolveCargoManifest(sourceRepoPath: string, filePath?: string): string | null {
  const candidates = new Set<string>();

  if (sourceRepoPath) {
    candidates.add(
      sourceRepoPath.endsWith("Cargo.toml")
        ? sourceRepoPath
        : path.join(sourceRepoPath, "skepac", "Cargo.toml"),
    );
  }

  for (const folder of workspaceFolders) {
    candidates.add(path.join(folder, "..", "skepa-lang", "skepac", "Cargo.toml"));
    candidates.add(path.join(folder, "skepa-lang", "skepac", "Cargo.toml"));
  }

  if (filePath) {
    let current = path.dirname(filePath);
    const { root } = path.parse(current);

    while (true) {
      candidates.add(path.join(current, "skepac", "Cargo.toml"));
      candidates.add(path.join(current, "..", "skepac", "Cargo.toml"));
      candidates.add(path.join(current, "skepa-lang", "skepac", "Cargo.toml"));
      candidates.add(path.join(current, "..", "skepa-lang", "skepac", "Cargo.toml"));

      if (current === root) {
        break;
      }

      current = path.dirname(current);
    }
  }

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (fs.existsSync(normalized)) {
      return normalized;
    }
  }

  return null;
}

function pickWorkingDirectory(filePath: string): string {
  if (workspaceFolders.length > 0) {
    return workspaceFolders[0];
  }
  return path.dirname(filePath);
}

function runCommand(command: CommandSpec): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        code: null,
        stdout,
        stderr,
        error,
      });
    });

    child.once("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        code,
        stdout,
        stderr,
      });
    });
  });
}

function parseDiagnostics(output: string, document: TextDocument): Diagnostic[] {
  if (!output.trim() || output.includes(`ok: ${uriToFsPath(document.uri)}`)) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const currentPath = uriToFsPath(document.uri);

  for (const line of lines) {
    const offsetMatch = line.match(
      /^\[(?<code>[^\]]+)\]\[(?<phase>[^\]]+)\] (?<level>\w+) at (?<line>\d+):(?<col>\d+) \((?<start>\d+)\.\.(?<end>\d+)\): (?<message>.+)$/,
    );

    if (offsetMatch?.groups) {
      const startOffset = Number(offsetMatch.groups.start);
      const endOffset = Number(offsetMatch.groups.end);
      const normalizedMessage = stripDiagnosticPathPrefix(offsetMatch.groups.message, currentPath);

      const missingImportPackage = extractMissingImportPackage(normalizedMessage);
      if (startOffset === 0 && endOffset === 0 && missingImportPackage) {
        const usageRanges = findPackageUsageRanges(document, missingImportPackage);
        if (usageRanges.length > 0) {
          for (const range of usageRanges) {
            pushUniqueDiagnostic(
              diagnostics,
              seen,
              {
                severity: DiagnosticSeverity.Error,
                source: `skepa-${offsetMatch.groups.phase}`,
                code: offsetMatch.groups.code,
                range,
                message: normalizedMessage,
              },
            );
          }
        } else {
          pushUniqueDiagnostic(
            diagnostics,
            seen,
            {
              severity: DiagnosticSeverity.Error,
              source: `skepa-${offsetMatch.groups.phase}`,
              code: offsetMatch.groups.code,
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
              message: normalizedMessage,
            },
          );
        }
        continue;
      }

      if (startOffset === 0 && endOffset === 0) {
        const usageRanges = findZeroSpanDiagnosticRanges(document, normalizedMessage);
        if (usageRanges.length > 0) {
          for (const range of usageRanges) {
            pushUniqueDiagnostic(
              diagnostics,
              seen,
              {
                severity: DiagnosticSeverity.Error,
                source: `skepa-${offsetMatch.groups.phase}`,
                code: offsetMatch.groups.code,
                range,
                message: normalizedMessage,
              },
            );
          }
          continue;
        }
      }

      const start = safePositionAt(document, startOffset);
      const end = safePositionAt(document, Math.max(startOffset + 1, endOffset));

      pushUniqueDiagnostic(
        diagnostics,
        seen,
        {
          severity: DiagnosticSeverity.Error,
          source: `skepa-${offsetMatch.groups.phase}`,
          code: offsetMatch.groups.code,
          range: { start, end },
          message: normalizedMessage,
        },
      );
      continue;
    }

    const pathMatch = line.match(
      /^\[(?<code>[^\]]+)\]\[(?<phase>[^\]]+)\] (?<file>.+):(?<line>\d+):(?<col>\d+): (?<message>.+)$/,
    );

    if (pathMatch?.groups) {
      const targetPath = path.normalize(pathMatch.groups.file);
      if (currentPath && targetPath !== currentPath) {
        continue;
      }

      const lineIndex = Math.max(0, Number(pathMatch.groups.line) - 1);
      const charIndex = Math.max(0, Number(pathMatch.groups.col) - 1);
      pushUniqueDiagnostic(
        diagnostics,
        seen,
        {
          severity: DiagnosticSeverity.Error,
          source: `skepa-${pathMatch.groups.phase}`,
          code: pathMatch.groups.code,
          range: {
            start: { line: lineIndex, character: charIndex },
            end: { line: lineIndex, character: charIndex + 1 },
          },
          message: stripDiagnosticPathPrefix(pathMatch.groups.message, currentPath),
        },
      );
      continue;
    }
  }

  if (diagnostics.length > 0) {
    return diagnostics;
  }

  return [
    {
      severity: DiagnosticSeverity.Error,
      source: "skepa-tools",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      message: output.trim(),
    },
  ];
}

function pushUniqueDiagnostic(
  diagnostics: Diagnostic[],
  seen: Set<string>,
  diagnostic: Diagnostic,
): void {
  const key = [
    diagnostic.code ?? "",
    diagnostic.message,
    diagnostic.range.start.line,
    diagnostic.range.start.character,
    diagnostic.range.end.line,
    diagnostic.range.end.character,
  ].join(":");

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  diagnostics.push(diagnostic);
}

function safePositionAt(document: TextDocument, offset: number): Position {
  const safeOffset = Math.max(0, Math.min(offset, document.getText().length));
  return document.positionAt(safeOffset);
}

function findPackageUsageRanges(document: TextDocument, packageName: string) {
  const source = document.getText();
  const lines = source.split(/\r?\n/);
  const matcher = new RegExp(`\\b${escapeRegExp(packageName)}(?=\\s*\\.)`, "g");
  const ranges: { start: Position; end: Position }[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    matcher.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(line)) !== null) {
      ranges.push({
        start: { line: lineIndex, character: match.index },
        end: { line: lineIndex, character: match.index + packageName.length },
      });
    }
  }

  return ranges;
}

function findIdentifierRanges(document: TextDocument, identifier: string) {
  const source = document.getText();
  const lines = source.split(/\r?\n/);
  const matcher = new RegExp(`\\b${escapeRegExp(identifier)}\\b`, "g");
  const ranges: { start: Position; end: Position }[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    matcher.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(line)) !== null) {
      ranges.push({
        start: { line: lineIndex, character: match.index },
        end: { line: lineIndex, character: match.index + identifier.length },
      });
    }
  }

  return ranges;
}

function findZeroSpanDiagnosticRanges(document: TextDocument, message: string) {
  const builtinMatch = message.match(/^Unknown builtin `([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)`$/);
  if (builtinMatch) {
    return findQualifiedMemberRanges(document, builtinMatch[1], builtinMatch[2]);
  }

  const methodMatch = message.match(/^Unknown method `([A-Za-z_][A-Za-z0-9_]*)` on struct `([A-Za-z_][A-Za-z0-9_]*)`$/);
  if (methodMatch) {
    return findMemberCallRanges(document, methodMatch[1]);
  }

  const fieldAccessMatch = message.match(
    /^Unknown field `([A-Za-z_][A-Za-z0-9_]*)` on struct `([A-Za-z_][A-Za-z0-9_]*)`$/,
  );
  if (fieldAccessMatch) {
    return findMemberAccessRanges(document, fieldAccessMatch[1]);
  }

  const fieldLiteralMatch = message.match(
    /^Unknown field `([A-Za-z_][A-Za-z0-9_]*)` in struct `([A-Za-z_][A-Za-z0-9_]*)` literal$/,
  );
  if (fieldLiteralMatch) {
    return findStructLiteralFieldRanges(document, fieldLiteralMatch[1]);
  }

  const functionMatch = message.match(/^Unknown function `([A-Za-z_][A-Za-z0-9_]*)`$/);
  if (functionMatch) {
    return findCallableIdentifierRanges(document, functionMatch[1]);
  }

  const structMatch = message.match(/^Unknown struct `([A-Za-z_][A-Za-z0-9_]*)`$/);
  if (structMatch) {
    return findStructConstructorRanges(document, structMatch[1]);
  }

  const pathMatch = message.match(/^Unknown path `([A-Za-z_][A-Za-z0-9_.]*)`$/);
  if (pathMatch) {
    return findQualifiedPathRanges(document, pathMatch[1]);
  }

  const implTargetMatch = message.match(/^Unknown impl target struct `([A-Za-z_][A-Za-z0-9_]*)`$/);
  if (implTargetMatch) {
    return findImplTargetRanges(document, implTargetMatch[1]);
  }

  const functionParamTypeMatch = message.match(
    /^Unknown type in function `([A-Za-z_][A-Za-z0-9_]*)` parameter `([A-Za-z_][A-Za-z0-9_]*)`: `([^`]+)`$/,
  );
  if (functionParamTypeMatch) {
    return findFunctionParameterTypeRanges(
      document,
      functionParamTypeMatch[1],
      functionParamTypeMatch[2],
      functionParamTypeMatch[3],
    );
  }

  const methodParamTypeMatch = message.match(
    /^Unknown type in method `([A-Za-z_][A-Za-z0-9_]*)` parameter `([A-Za-z_][A-Za-z0-9_]*)`: `([^`]+)`$/,
  );
  if (methodParamTypeMatch) {
    return findFunctionParameterTypeRanges(
      document,
      methodParamTypeMatch[1],
      methodParamTypeMatch[2],
      methodParamTypeMatch[3],
    );
  }

  const globalTypeMatch = message.match(/^Unknown type in global variable `([A-Za-z_][A-Za-z0-9_]*)`: `([^`]+)`$/);
  if (globalTypeMatch) {
    return findGlobalTypeAnnotationRanges(document, globalTypeMatch[1], globalTypeMatch[2]);
  }

  const structFieldTypeMatch = message.match(
    /^Unknown type in struct `([A-Za-z_][A-Za-z0-9_]*)` field `([A-Za-z_][A-Za-z0-9_]*)`: `([^`]+)`$/,
  );
  if (structFieldTypeMatch) {
    return findStructFieldTypeRanges(
      document,
      structFieldTypeMatch[1],
      structFieldTypeMatch[2],
      structFieldTypeMatch[3],
    );
  }

  const functionReturnTypeMatch = message.match(
    /^Unknown return type in function `([A-Za-z_][A-Za-z0-9_]*)`: `([^`]+)`$/,
  );
  if (functionReturnTypeMatch) {
    return findFunctionReturnTypeRanges(document, functionReturnTypeMatch[1], functionReturnTypeMatch[2]);
  }

  const methodReturnTypeMatch = message.match(
    /^Unknown return type in method `([A-Za-z_][A-Za-z0-9_]*)`: `([^`]+)`$/,
  );
  if (methodReturnTypeMatch) {
    return findFunctionReturnTypeRanges(document, methodReturnTypeMatch[1], methodReturnTypeMatch[2]);
  }

  const fnLiteralParamTypeMatch = message.match(
    /^Unknown type in function literal parameter `([A-Za-z_][A-Za-z0-9_]*)`: `([^`]+)`$/,
  );
  if (fnLiteralParamTypeMatch) {
    return findParameterTypeRanges(document, fnLiteralParamTypeMatch[1], fnLiteralParamTypeMatch[2]);
  }

  const fnLiteralReturnTypeMatch = message.match(/^Unknown function literal return type: `([^`]+)`$/);
  if (fnLiteralReturnTypeMatch) {
    return findIdentifierRanges(document, fnLiteralReturnTypeMatch[1]);
  }

  const unresolvedIdentifier = extractUnknownIdentifier(message);
  if (unresolvedIdentifier) {
    return findIdentifierRanges(document, unresolvedIdentifier);
  }

  return [];
}

function findCallableIdentifierRanges(document: TextDocument, identifier: string) {
  return findPatternRanges(document, new RegExp(`\\b(${escapeRegExp(identifier)})\\b(?=\\s*\\()`, "g"));
}

function findMemberCallRanges(document: TextDocument, identifier: string) {
  return findPatternRanges(document, new RegExp(`\\.\\s*(${escapeRegExp(identifier)})\\b(?=\\s*\\()`, "g"));
}

function findMemberAccessRanges(document: TextDocument, identifier: string) {
  return findPatternRanges(document, new RegExp(`\\.\\s*(${escapeRegExp(identifier)})\\b`, "g"));
}

function findStructLiteralFieldRanges(document: TextDocument, identifier: string) {
  return findPatternRanges(document, new RegExp(`\\b(${escapeRegExp(identifier)})\\b(?=\\s*:)`, "g"));
}

function findQualifiedMemberRanges(document: TextDocument, packageName: string, memberName: string) {
  return findPatternRanges(
    document,
    new RegExp(`\\b${escapeRegExp(packageName)}\\b\\s*\\.\\s*(${escapeRegExp(memberName)})\\b`, "g"),
  );
}

function findQualifiedPathRanges(document: TextDocument, pathValue: string) {
  const source = document.getText();
  const ranges: { start: Position; end: Position }[] = [];
  const lines = source.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    let start = line.indexOf(pathValue);
    while (start >= 0) {
      ranges.push({
        start: { line: lineIndex, character: start },
        end: { line: lineIndex, character: start + pathValue.length },
      });
      start = line.indexOf(pathValue, start + pathValue.length);
    }
  }

  return ranges;
}

function findStructConstructorRanges(document: TextDocument, identifier: string) {
  return findPatternRanges(document, new RegExp(`\\b(${escapeRegExp(identifier)})\\b(?=\\s*(\\{|\\())`, "g"));
}

function findImplTargetRanges(document: TextDocument, identifier: string) {
  return findPatternRanges(document, new RegExp(`\\bimpl\\s+(${escapeRegExp(identifier)})\\b`, "g"));
}

function findFunctionParameterTypeRanges(
  document: TextDocument,
  functionName: string,
  parameterName: string,
  typeName: string,
) {
  const lines = document.getText().split(/\r?\n/);
  const functionMatcher = new RegExp(`^\\s*fn\\s+${escapeRegExp(functionName)}\\s*\\(([^)]*)\\)`);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const match = line.match(functionMatcher);
    if (!match) {
      continue;
    }

    const parameterMatcher = new RegExp(
      `\\b${escapeRegExp(parameterName)}\\b\\s*:\\s*(${escapeRegExp(typeName)})\\b`,
    );
    const parameterMatch = line.match(parameterMatcher);
    if (!parameterMatch) {
      continue;
    }

    const start = line.indexOf(parameterMatch[1]);
    if (start >= 0) {
      return [
        {
          start: { line: lineIndex, character: start },
          end: { line: lineIndex, character: start + typeName.length },
        },
      ];
    }
  }

  return findParameterTypeRanges(document, parameterName, typeName);
}

function findParameterTypeRanges(document: TextDocument, parameterName: string, typeName: string) {
  return findPatternRanges(
    document,
    new RegExp(`\\b${escapeRegExp(parameterName)}\\b\\s*:\\s*(${escapeRegExp(typeName)})\\b`, "g"),
  );
}

function findGlobalTypeAnnotationRanges(document: TextDocument, variableName: string, typeName: string) {
  return findPatternRanges(
    document,
    new RegExp(`\\blet\\s+${escapeRegExp(variableName)}\\b\\s*:\\s*(${escapeRegExp(typeName)})\\b`, "g"),
  );
}

function findStructFieldTypeRanges(
  document: TextDocument,
  structName: string,
  fieldName: string,
  typeName: string,
) {
  const lines = document.getText().split(/\r?\n/);
  let insideStruct = false;
  let braceDepth = 0;
  const structMatcher = new RegExp(`^\\s*struct\\s+${escapeRegExp(structName)}\\b`);
  const fieldMatcher = new RegExp(`\\b${escapeRegExp(fieldName)}\\b\\s*:\\s*(${escapeRegExp(typeName)})\\b`);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!insideStruct && structMatcher.test(line)) {
      insideStruct = true;
    }

    if (insideStruct) {
      const fieldMatch = line.match(fieldMatcher);
      if (fieldMatch) {
        const start = line.indexOf(fieldMatch[1]);
        if (start >= 0) {
          return [
            {
              start: { line: lineIndex, character: start },
              end: { line: lineIndex, character: start + typeName.length },
            },
          ];
        }
      }
    }

    braceDepth += (line.match(/\{/g) ?? []).length;
    braceDepth -= (line.match(/\}/g) ?? []).length;
    if (insideStruct && braceDepth <= 0) {
      insideStruct = false;
    }
  }

  return findPatternRanges(document, new RegExp(`\\b(${escapeRegExp(typeName)})\\b`, "g"));
}

function findFunctionReturnTypeRanges(document: TextDocument, functionName: string, typeName: string) {
  return findPatternRanges(
    document,
    new RegExp(`\\bfn\\s+${escapeRegExp(functionName)}\\b[^\\n]*->\\s*(${escapeRegExp(typeName)})\\b`, "g"),
  );
}

function findPatternRanges(document: TextDocument, matcher: RegExp) {
  const lines = document.getText().split(/\r?\n/);
  const ranges: { start: Position; end: Position }[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    matcher.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(line)) !== null) {
      const label = match[1];
      const start = match.index + match[0].lastIndexOf(label);
      ranges.push({
        start: { line: lineIndex, character: start },
        end: { line: lineIndex, character: start + label.length },
      });
    }
  }

  return ranges;
}

function stripDiagnosticPathPrefix(message: string, currentPath: string | null): string {
  if (currentPath) {
    const normalizedCurrent = currentPath.toLowerCase();
    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage.startsWith(`${normalizedCurrent}: `)) {
      return message.slice(currentPath.length + 2);
    }
  }

  const embeddedPathMatch = message.match(/^[A-Za-z]:\\[^:]+:\s*(.+)$/);
  return embeddedPathMatch?.[1] ?? message;
}

function extractUnknownIdentifier(message: string): string | null {
  const directMatch = message.match(
    /(?:Unknown|Undefined)\s+(?:variable|identifier|symbol|name|function|method|field|type)\s+`([A-Za-z_][A-Za-z0-9_]*)`/i,
  );
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  const captureMatch = message.match(/Function literals cannot capture outer variable `([A-Za-z_][A-Za-z0-9_]*)`/i);
  return captureMatch?.[1] ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

documents.listen(connection);
connection.listen();
