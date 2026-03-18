import * as fs from "fs";
import * as path from "path";
import {
  CodeAction,
  CodeActionKind,
  CompletionItem,
  CompletionItemKind,
  Definition,
  DocumentHighlight,
  DocumentHighlightKind,
  DocumentSymbol,
  Diagnostic,
  Location,
  ParameterInformation,
  Position,
  PrepareRenameParams,
  Range,
  ReferenceParams,
  RenameParams,
  SemanticTokens,
  SemanticTokensBuilder,
  SignatureHelp,
  SignatureInformation,
  SymbolKind,
  TextDocumentPositionParams,
  TextEdit,
  WorkspaceEdit,
  WorkspaceSymbol,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
  BUILTIN_PACKAGES,
  BUILTIN_MEMBERS,
  KEYWORDS,
  TYPES,
  getBuiltinMember,
  getBuiltinMembers,
  getBuiltinPackage,
} from "../../shared/src/languageData";

const SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "out",
  "dist",
  "target",
  "cargo-target",
  "cargo-target-frontend-verify",
  "verify_target_tmp",
]);

const WORD_PATTERN = /[A-Za-z0-9_]/;
const BUILTIN_DOCS_PATH = path.resolve(__dirname, "../../../../docs/skepa-builtins.md");
const TOKEN_TYPES = [
  "namespace",
  "type",
  "class",
  "function",
  "method",
  "property",
  "variable",
  "parameter",
  "keyword",
] as const;

const TOKEN_TYPE_INDEX: Record<(typeof TOKEN_TYPES)[number], number> = {
  namespace: 0,
  type: 1,
  class: 2,
  function: 3,
  method: 4,
  property: 5,
  variable: 6,
  parameter: 7,
  keyword: 8,
};

export interface ParsedSymbol {
  name: string;
  uri: string;
  kind: SymbolKind;
  detail: string;
  typeName?: string;
  range: Range;
  selectionRange: Range;
  containerName?: string;
  scopeId?: string;
  topLevel: boolean;
}

export interface ParsedDocument {
  uri: string;
  filePath: string;
  source: string;
  symbols: ParsedSymbol[];
  documentSymbols: DocumentSymbol[];
  scopeRanges: Map<string, Range>;
}

interface ActiveContainer {
  id: string;
  name: string;
  targetName?: string;
  kind: SymbolKind;
  activeDepth: number;
  scopeId: string;
  documentSymbol: DocumentSymbol;
}

export class WorkspaceIndex {
  private readonly documents = new Map<string, ParsedDocument>();

  public async initialize(workspaceFolders: string[], openDocuments: Iterable<TextDocument>): Promise<void> {
    const openByUri = new Map<string, TextDocument>();
    for (const document of openDocuments) {
      openByUri.set(document.uri, document);
    }

    for (const folder of workspaceFolders) {
      for (const filePath of walkSkepaFiles(folder)) {
        const uri = fsPathToUri(filePath);
        const openDocument = openByUri.get(uri);
        const source = openDocument ? openDocument.getText() : fs.readFileSync(filePath, "utf8");
        this.documents.set(uri, parseSkepaDocument(uri, filePath, source));
      }
    }

    for (const document of openByUri.values()) {
      if (document.languageId === "skepa") {
        this.upsertDocument(document);
      }
    }
  }

  public upsertDocument(document: TextDocument): void {
    const filePath = uriToFsPath(document.uri);
    if (!filePath) {
      return;
    }
    this.documents.set(document.uri, parseSkepaDocument(document.uri, filePath, document.getText()));
  }

  public refreshFromDisk(uri: string): void {
    const filePath = uriToFsPath(uri);
    if (!filePath || !fs.existsSync(filePath)) {
      this.documents.delete(uri);
      return;
    }

    const source = fs.readFileSync(filePath, "utf8");
    this.documents.set(uri, parseSkepaDocument(uri, filePath, source));
  }

  public getParsedDocument(uri: string): ParsedDocument | undefined {
    return this.documents.get(uri);
  }

  public buildCompletionItems(params: TextDocumentPositionParams): CompletionItem[] {
    const parsed = this.documents.get(params.textDocument.uri);
    if (parsed) {
      const importContext = getImportContext(parsed.source, params.position);
      if (importContext) {
        return this.buildImportCompletionItems(parsed, importContext);
      }

      const builtinAccess = getBuiltinAccessContext(parsed.source, params.position);
      if (builtinAccess) {
        const builtinMembers = getBuiltinMembers(builtinAccess.packageName);
        return builtinMembers
          .filter(
            (member) =>
              !builtinAccess.memberPrefix ||
              member.label.toLowerCase().startsWith(builtinAccess.memberPrefix.toLowerCase()),
          )
          .map((member) => ({
            label: member.label,
            kind: CompletionItemKind.Function,
            detail: member.signature,
            documentation: member.documentation,
          }));
      }

      const memberAccess = getMemberAccessContext(parsed.source, params.position);
      if (memberAccess) {
        const memberItems = this.buildMemberCompletionItems(
          params.textDocument.uri,
          params.position,
          memberAccess.receiverName,
          memberAccess.memberPrefix,
        );
        if (memberItems.length > 0) {
          return memberItems;
        }
      }
    }

    const items = new Map<string, CompletionItem>();

    for (const keyword of KEYWORDS) {
      items.set(keyword.label, {
        label: keyword.label,
        kind: CompletionItemKind.Keyword,
        detail: keyword.detail,
        documentation: keyword.documentation,
      });
    }

    for (const type of TYPES) {
      items.set(type.label, {
        label: type.label,
        kind: CompletionItemKind.TypeParameter,
        detail: type.detail,
        documentation: type.documentation,
      });
    }

    for (const builtin of BUILTIN_PACKAGES) {
      items.set(builtin.label, {
        label: builtin.label,
        kind: CompletionItemKind.Module,
        detail: builtin.detail,
        documentation: builtin.documentation,
      });
    }

    if (parsed) {
      for (const symbol of parsed.symbols) {
        if (isVisibleAtPosition(symbol, params.position, parsed)) {
          items.set(symbol.name, {
            label: symbol.name,
            kind: completionKindFromSymbol(symbol.kind),
            detail: symbol.detail,
          });
        }
      }
    }

    for (const symbol of this.getWorkspaceSymbolsFlat()) {
      if (symbol.topLevel) {
        items.set(symbol.name, {
          label: symbol.name,
          kind: completionKindFromSymbol(symbol.kind),
          detail: symbol.detail,
        });
      }
    }

    return [...items.values()];
  }

  public buildSemanticTokens(uri: string): SemanticTokens {
    const parsed = this.documents.get(uri);
    if (!parsed) {
      return new SemanticTokensBuilder().build();
    }

    const entries = new Map<string, { range: Range; tokenType: number }>();

    for (const keyword of KEYWORDS) {
      for (const range of findWordOccurrences(parsed.source, keyword.label)) {
        recordSemanticToken(entries, range, TOKEN_TYPE_INDEX.keyword);
      }
    }

    for (const primitiveType of TYPES) {
      for (const range of findWordOccurrences(parsed.source, primitiveType.label)) {
        recordSemanticToken(entries, range, TOKEN_TYPE_INDEX.type);
      }
    }

    for (const builtinPackage of BUILTIN_PACKAGES) {
      for (const range of findPackageRanges(parsed.source, builtinPackage.label)) {
        recordSemanticToken(entries, range, TOKEN_TYPE_INDEX.namespace);
      }
    }

    for (const builtinMember of BUILTIN_MEMBERS) {
      for (const range of findBuiltinMemberRanges(parsed.source, builtinMember.packageName, builtinMember.label)) {
        recordSemanticToken(entries, range, TOKEN_TYPE_INDEX.function);
      }
    }

    for (const member of parsed.symbols) {
      const tokenType = tokenTypeForSymbol(member.kind, member.detail);
      recordSemanticToken(entries, member.selectionRange, tokenType);
    }

    for (const symbol of parsed.symbols) {
      const tokenType = tokenTypeForSymbol(symbol.kind, symbol.detail);
      const occurrences =
        symbol.kind === SymbolKind.Field
          ? findFieldAccessOccurrences(parsed.source, symbol.name)
          : findWordOccurrences(parsed.source, symbol.name);

      for (const occurrence of occurrences) {
        if (symbol.kind !== SymbolKind.Field && !rangeIsWithinScope(occurrence, symbol, parsed)) {
          continue;
        }
        recordSemanticToken(entries, occurrence, tokenType);
      }
    }

    const callRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b(?=\s*\()/g;
    const methodRegex = /\.\s*([A-Za-z_][A-Za-z0-9_]*)\b(?=\s*\()/g;
    const lines = parsed.source.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      callRegex.lastIndex = 0;
      let callMatch: RegExpExecArray | null;
      while ((callMatch = callRegex.exec(line)) !== null) {
        const label = callMatch[1];
        if (KEYWORDS.some((keyword) => keyword.label === label)) {
          continue;
        }
        recordSemanticToken(
          entries,
          {
            start: { line: lineIndex, character: callMatch.index },
            end: { line: lineIndex, character: callMatch.index + label.length },
          },
          TOKEN_TYPE_INDEX.function,
        );
      }

      methodRegex.lastIndex = 0;
      let methodMatch: RegExpExecArray | null;
      while ((methodMatch = methodRegex.exec(line)) !== null) {
        const full = methodMatch[0];
        const label = methodMatch[1];
        const start = methodMatch.index + full.lastIndexOf(label);
        recordSemanticToken(
          entries,
          {
            start: { line: lineIndex, character: start },
            end: { line: lineIndex, character: start + label.length },
          },
          TOKEN_TYPE_INDEX.method,
        );
      }
    }

    const builder = new SemanticTokensBuilder();
    const orderedEntries = [...entries.values()].sort(compareSemanticEntries);
    for (const entry of orderedEntries) {
      builder.push(
        entry.range.start.line,
        entry.range.start.character,
        entry.range.end.character - entry.range.start.character,
        entry.tokenType,
        0,
      );
    }

    return builder.build();
  }

  public findDefinition(params: TextDocumentPositionParams): Definition | null {
    const parsed = this.documents.get(params.textDocument.uri);
    if (!parsed) {
      return null;
    }

    const builtinDefinition = this.findBuiltinDefinition(parsed.source, params.position);
    if (builtinDefinition) {
      return [builtinDefinition];
    }

    const word = getWordAtPositionFromText(parsed.source, params.position);
    if (!word) {
      return null;
    }

    const candidates = this.findDefinitionCandidates(word, params.textDocument.uri, params.position);
    if (candidates.length === 0) {
      return null;
    }

    return candidates.map((candidate) => ({
      uri: candidate.uri,
      range: candidate.selectionRange,
    }));
  }

  public findReferences(params: ReferenceParams): Location[] {
    const parsed = this.documents.get(params.textDocument.uri);
    if (!parsed) {
      return [];
    }

    const word = getWordAtPositionFromText(parsed.source, params.position);
    if (!word) {
      return [];
    }

    const definitionCandidates = this.findDefinitionCandidates(
      word,
      params.textDocument.uri,
      params.position,
    );

    if (definitionCandidates.length === 0) {
      return [];
    }

    const chosen = definitionCandidates[0];
    const includeWorkspace = chosen.topLevel && this.countTopLevelDefinitions(word) === 1;
    const uris = includeWorkspace ? [...this.documents.keys()] : [chosen.uri];
    const locations: Location[] = [];

    for (const uri of uris) {
      const candidateDocument = this.documents.get(uri);
      if (!candidateDocument) {
        continue;
      }

      for (const range of this.findReferenceRangesForSymbol(candidateDocument, chosen)) {
        if (!params.context.includeDeclaration && uri === chosen.uri && rangesEqual(range, chosen.selectionRange)) {
          continue;
        }
        locations.push({ uri, range });
      }
    }

    return locations;
  }

  public findDocumentHighlights(params: TextDocumentPositionParams): DocumentHighlight[] {
    const parsed = this.documents.get(params.textDocument.uri);
    if (!parsed) {
      return [];
    }

    const word = getWordAtPositionFromText(parsed.source, params.position);
    if (!word) {
      return [];
    }

    const definitionCandidates = this.findDefinitionCandidates(word, params.textDocument.uri, params.position);
    const chosen = definitionCandidates[0];
    if (!chosen) {
      return [];
    }

    return this.findReferenceRangesForSymbol(parsed, chosen).map((range) => ({
      range,
      kind: DocumentHighlightKind.Text,
    }));
  }

  public getDocumentSymbols(uri: string): DocumentSymbol[] {
    return this.documents.get(uri)?.documentSymbols ?? [];
  }

  public searchWorkspaceSymbols(query: string): WorkspaceSymbol[] {
    const normalized = query.trim().toLowerCase();
    return this.getWorkspaceSymbolsFlat()
      .filter((symbol) => !normalized || symbol.name.toLowerCase().includes(normalized))
      .map((symbol) => ({
        name: symbol.name,
        kind: symbol.kind,
        location: {
          uri: symbol.uri,
          range: symbol.selectionRange,
        },
        containerName: symbol.containerName,
      }));
  }

  public findSymbolForHover(
    uri: string,
    position: Position,
  ): ParsedSymbol | undefined {
    const parsed = this.documents.get(uri);
    if (!parsed) {
      return undefined;
    }

    const word = getWordAtPositionFromText(parsed.source, position);
    if (!word) {
      return undefined;
    }

    return this.findDefinitionCandidates(word, uri, position)[0];
  }

  public findBuiltinItem(
    uri: string,
    position: Position,
  ): { label: string; detail: string; documentation: string } | undefined {
    const parsed = this.documents.get(uri);
    if (!parsed) {
      return undefined;
    }

    const access = getBuiltinAccessContext(parsed.source, position, true);
    if (access?.memberName) {
      const member = getBuiltinMember(access.packageName, access.memberName);
      if (member) {
        return {
          label: `${member.packageName}.${member.label}`,
          detail: member.signature,
          documentation: member.documentation,
        };
      }
    }

    const word = getWordAtPositionFromText(parsed.source, position);
    if (!word) {
      return undefined;
    }

    const builtinPackage = getBuiltinPackage(word);
    if (builtinPackage) {
      return builtinPackage;
    }

    return undefined;
  }

  public buildCodeActions(uri: string, diagnostics: Diagnostic[]): CodeAction[] {
    const parsed = this.documents.get(uri);
    if (!parsed) {
      return [];
    }

    const actions: CodeAction[] = [];
    const seenPackages = new Set<string>();

    for (const diagnostic of diagnostics) {
      const packageName = extractMissingImportPackage(diagnostic.message);
      if (!packageName || seenPackages.has(packageName)) {
        continue;
      }
      seenPackages.add(packageName);

      if (new RegExp(`^\\s*import\\s+${escapeRegExp(packageName)}\\s*;`, "m").test(parsed.source)) {
        continue;
      }

      const edit = createImportEdit(parsed.source, packageName);
      actions.push({
        title: `Add import ${packageName};`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [uri]: [edit],
          },
        },
      });
    }

    return actions;
  }

  public prepareRename(params: PrepareRenameParams): Range | null {
    const parsed = this.documents.get(params.textDocument.uri);
    if (!parsed) {
      return null;
    }

    const word = getWordAtPositionFromText(parsed.source, params.position);
    if (!word || KEYWORDS.some((keyword) => keyword.label === word) || getBuiltinPackage(word)) {
      return null;
    }

    const symbol = this.findDefinitionCandidates(word, params.textDocument.uri, params.position)[0];
    if (!symbol || !isRenameSafe(symbol)) {
      return null;
    }

    return symbol.selectionRange;
  }

  public renameSymbol(params: RenameParams): WorkspaceEdit | null {
    const parsed = this.documents.get(params.textDocument.uri);
    if (!parsed) {
      return null;
    }

    const word = getWordAtPositionFromText(parsed.source, params.position);
    if (!word || !isValidIdentifier(params.newName)) {
      return null;
    }

    const symbol = this.findDefinitionCandidates(word, params.textDocument.uri, params.position)[0];
    if (!symbol || !isRenameSafe(symbol)) {
      return null;
    }

    const includeWorkspace = symbol.topLevel && this.countTopLevelDefinitions(symbol.name) === 1;
    const uris = includeWorkspace ? [...this.documents.keys()] : [symbol.uri];
    const changes: Record<string, TextEdit[]> = {};

    for (const uri of uris) {
      const candidateDocument = this.documents.get(uri);
      if (!candidateDocument) {
        continue;
      }

      const ranges = this.findReferenceRangesForSymbol(candidateDocument, symbol);
      if (ranges.length === 0) {
        continue;
      }

      changes[uri] = ranges.map((range) => ({
        range,
        newText: params.newName,
      }));
    }

    return Object.keys(changes).length > 0 ? { changes } : null;
  }

  public buildSignatureHelp(uri: string, position: Position): SignatureHelp | null {
    const parsed = this.documents.get(uri);
    if (!parsed) {
      return null;
    }

    const callContext = getCallContext(parsed.source, position);
    if (!callContext) {
      return null;
    }

    const signatures = this.findSignatureCandidates(parsed, callContext);
    if (signatures.length === 0) {
      return null;
    }

    const activeSignature = 0;
    const activeSignatureInfo = signatures[activeSignature];
    const signatureParameters = activeSignatureInfo.parameters ?? [];
    const activeParameter = Math.min(
      signatureParameters.length > 0
        ? signatureParameters.length - 1
        : 0,
      callContext.argumentIndex,
    );

    return {
      signatures,
      activeSignature,
      activeParameter,
    };
  }

  private findDefinitionCandidates(name: string, uri: string, position: Position): ParsedSymbol[] {
    const parsed = this.documents.get(uri);
    if (!parsed) {
      return [];
    }

    const sameDocument = parsed.symbols.filter((symbol) => symbol.name === name);
    const localMatches = sameDocument.filter((symbol) => {
      if (!symbol.scopeId) {
        return false;
      }
      return isVisibleAtPosition(symbol, position, parsed);
    });
    if (localMatches.length > 0) {
      return localMatches;
    }

    const topLevelSameDocument = sameDocument.filter((symbol) => symbol.topLevel);
    if (topLevelSameDocument.length > 0) {
      return topLevelSameDocument;
    }

    if (sameDocument.length === 1) {
      return sameDocument;
    }

    const memberMatches = sameDocument.filter(
      (symbol) => symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Field,
    );
    if (memberMatches.length > 0) {
      return memberMatches;
    }

    return this.getWorkspaceSymbolsFlat().filter(
      (symbol) => symbol.name === name && symbol.topLevel,
    );
  }

  private getWorkspaceSymbolsFlat(): ParsedSymbol[] {
    return [...this.documents.values()].flatMap((parsed) => parsed.symbols);
  }

  private countTopLevelDefinitions(name: string): number {
    return this.getWorkspaceSymbolsFlat().filter((symbol) => symbol.name === name && symbol.topLevel)
      .length;
  }

  private findBuiltinDefinition(source: string, position: Position): Location | null {
    const access = getBuiltinAccessContext(source, position, true);
    if (access?.memberName) {
      return findBuiltinDocLocation(`### ${access.packageName}.${access.memberName}`);
    }

    const word = getWordAtPositionFromText(source, position);
    if (!word) {
      return null;
    }

    if (getBuiltinPackage(word)) {
      return findBuiltinDocLocation(`## ${word}`);
    }

    return null;
  }

  private buildMemberCompletionItems(
    uri: string,
    position: Position,
    receiverName: string,
    memberPrefix: string,
  ): CompletionItem[] {
    const parsed = this.documents.get(uri);
    if (!parsed) {
      return [];
    }

    const receiverType = this.resolveReceiverType(parsed, position, receiverName);
    if (!receiverType) {
      return [];
    }

    const items = new Map<string, CompletionItem>();
    for (const symbol of this.findMembersForType(receiverType)) {
      if (memberPrefix && !symbol.name.toLowerCase().startsWith(memberPrefix.toLowerCase())) {
        continue;
      }

      items.set(symbol.name, {
        label: symbol.name,
        kind: completionKindFromSymbol(symbol.kind),
        detail: symbol.detail,
      });
    }

    return [...items.values()];
  }

  private buildImportCompletionItems(
    parsed: ParsedDocument,
    importContext: { prefix: string; range: Range },
  ): CompletionItem[] {
    const items = new Map<string, CompletionItem>();
    const prefix = importContext.prefix.toLowerCase();

    for (const builtin of BUILTIN_PACKAGES) {
      if (prefix && !builtin.label.toLowerCase().startsWith(prefix)) {
        continue;
      }

      items.set(builtin.label, {
        label: builtin.label,
        kind: CompletionItemKind.Module,
        detail: builtin.detail,
        documentation: builtin.documentation,
        sortText: `0-${builtin.label}`,
        filterText: builtin.label,
        textEdit: {
          range: importContext.range,
          newText: builtin.label,
        },
      });
    }

    for (const modulePath of this.collectWorkspaceModulePaths(parsed.uri)) {
      if (prefix && !modulePath.toLowerCase().startsWith(prefix)) {
        continue;
      }

      items.set(modulePath, {
        label: modulePath,
        kind: CompletionItemKind.Module,
        detail: "Workspace module",
        sortText: `1-${modulePath}`,
        filterText: modulePath,
        textEdit: {
          range: importContext.range,
          newText: modulePath,
        },
      });
    }

    return [...items.values()];
  }

  private findSignatureCandidates(
    parsed: ParsedDocument,
    callContext: { calleeText: string; calleePosition: Position; argumentIndex: number },
  ): SignatureInformation[] {
    const dotIndex = callContext.calleeText.indexOf(".");
    if (dotIndex >= 0) {
      const receiverName = callContext.calleeText.slice(0, dotIndex);
      const memberName = callContext.calleeText.slice(dotIndex + 1);

      const builtinMember = getBuiltinMember(receiverName, memberName);
      if (builtinMember) {
        return [createSignatureInformation(builtinMember.signature)];
      }

      const receiverType = this.resolveReceiverType(parsed, callContext.calleePosition, receiverName);
      if (!receiverType) {
        return [];
      }

      return this.findMembersForType(receiverType)
        .filter((symbol) => symbol.name === memberName && symbol.kind === SymbolKind.Method)
        .map((symbol) => createSignatureInformation(signatureLabelForSymbol(symbol), true));
    }

    return this.findDefinitionCandidates(callContext.calleeText, parsed.uri, callContext.calleePosition)
      .filter((symbol) => symbol.kind === SymbolKind.Function)
      .map((symbol) => createSignatureInformation(signatureLabelForSymbol(symbol)));
  }

  private resolveReceiverType(parsed: ParsedDocument, position: Position, receiverName: string): string | null {
    if (getBuiltinPackage(receiverName)) {
      return receiverName;
    }

    const receiverRange = findReceiverRangeAtPosition(parsed.source, position, receiverName);
    const receiverPosition = receiverRange?.start ?? position;
    const receiverSymbol = this.findDefinitionCandidates(receiverName, parsed.uri, receiverPosition)[0];
    return receiverSymbol?.typeName ?? null;
  }

  private findMembersForType(typeName: string): ParsedSymbol[] {
    return this.getWorkspaceSymbolsFlat().filter((symbol) => {
      if (symbol.kind !== SymbolKind.Field && symbol.kind !== SymbolKind.Method) {
        return false;
      }

      return symbol.containerName === typeName;
    });
  }

  private collectWorkspaceModulePaths(currentUri: string): string[] {
    const paths = new Set<string>();

    for (const parsed of this.documents.values()) {
      if (parsed.uri === currentUri) {
        continue;
      }

      const modulePath = modulePathFromFilePath(parsed.filePath);
      if (modulePath) {
        paths.add(modulePath);
      }
    }

    return [...paths].sort((a, b) => a.localeCompare(b));
  }

  private findReferenceRangesForSymbol(parsed: ParsedDocument, symbol: ParsedSymbol): Range[] {
    const occurrences =
      symbol.kind === SymbolKind.Field
        ? findFieldAccessOccurrences(parsed.source, symbol.name)
        : findWordOccurrences(parsed.source, symbol.name);

    return occurrences.filter((range) => this.isReferenceRangeForSymbol(range, symbol, parsed));
  }

  private isReferenceRangeForSymbol(range: Range, symbol: ParsedSymbol, parsed: ParsedDocument): boolean {
    if (symbol.kind === SymbolKind.Field) {
      return true;
    }

    if (!symbol.scopeId) {
      return true;
    }

    return rangeIsWithinScope(range, symbol, parsed);
  }
}

export function getWordAtPositionFromText(source: string, position: Position): string | null {
  const lines = source.split(/\r?\n/);
  const line = lines[position.line] ?? "";
  let start = position.character;
  let end = position.character;

  while (start > 0 && WORD_PATTERN.test(line[start - 1] ?? "")) {
    start -= 1;
  }

  while (WORD_PATTERN.test(line[end] ?? "")) {
    end += 1;
  }

  if (start === end) {
    return null;
  }

  return line.slice(start, end);
}

export function uriToFsPath(uri: string): string | null {
  if (!uri.startsWith("file://")) {
    return null;
  }

  const decoded = decodeURIComponent(uri.replace("file:///", "").replace(/\//g, path.sep));
  return path.normalize(decoded);
}

export function fsPathToUri(filePath: string): string {
  const normalized = path.resolve(filePath).replace(/\\/g, "/");
  return `file:///${encodeURI(normalized)}`;
}

export function getBuiltinAccessContext(
  source: string,
  position: Position,
  includeCurrentWord = false,
): { packageName: string; memberPrefix: string; memberName?: string } | null {
  const lines = source.split(/\r?\n/);
  const line = lines[position.line] ?? "";
  if (includeCurrentWord) {
    const word = getWordAtPositionFromText(source, position);
    if (word) {
      let wordStart = position.character;
      while (wordStart > 0 && WORD_PATTERN.test(line[wordStart - 1] ?? "")) {
        wordStart -= 1;
      }
      const receiverPrefix = line.slice(0, wordStart);
      const receiverMatch = receiverPrefix.match(/([A-Za-z_][A-Za-z0-9_]*)\.$/);
      if (receiverMatch && getBuiltinPackage(receiverMatch[1])) {
        return {
          packageName: receiverMatch[1],
          memberPrefix: word,
          memberName: word,
        };
      }
    }
  }

  const prefix = line.slice(0, position.character);
  const match = prefix.match(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)?$/);

  if (!match) {
    return null;
  }

  const packageName = match[1];
  if (!getBuiltinPackage(packageName)) {
    return null;
  }

  const memberPrefix = match[2] ?? "";
  return {
    packageName,
    memberPrefix,
    memberName: memberPrefix || undefined,
  };
}

function parseSkepaDocument(uri: string, filePath: string, source: string): ParsedDocument {
  const lines = source.split(/\r?\n/);
  const symbols: ParsedSymbol[] = [];
  const documentSymbols: DocumentSymbol[] = [];
  const scopeRanges = new Map<string, Range>();
  const containers: ActiveContainer[] = [];
  let braceDepth = 0;
  let containerCounter = 0;

  const finalizeContainersToDepth = (nextDepth: number, lineIndex: number, lineLength: number) => {
    while (containers.length > 0 && containers[containers.length - 1].activeDepth > nextDepth) {
      const container = containers.pop();
      if (!container) {
        break;
      }
      container.documentSymbol.range.end = {
        line: lineIndex,
        character: lineLength,
      };
      scopeRanges.set(container.scopeId, container.documentSymbol.range);
    }
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = stripLineComments(rawLine);
    const currentStruct = [...containers].reverse().find((container) => container.kind === SymbolKind.Class);
    const currentImpl = [...containers]
      .reverse()
      .find((container) => container.kind === SymbolKind.Namespace);
    const currentFunction = [...containers]
      .reverse()
      .find((container) => container.kind === SymbolKind.Function || container.kind === SymbolKind.Method);

    if (braceDepth === 0) {
      const structMatch = line.match(/^\s*struct\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (structMatch) {
        const name = structMatch[1];
        const selectionRange = captureRange(rawLine, lineIndex, name);
        const container = createContainer(
          `struct:${containerCounter++}:${name}`,
          name,
          SymbolKind.Class,
          "struct",
          selectionRange,
          braceDepth,
          countBraces(line),
          name,
        );
        symbols.push(makeSymbol(name, uri, SymbolKind.Class, "struct", selectionRange, undefined, true, undefined, name));
        documentSymbols.push(container.documentSymbol);
        if (container.activeDepth > braceDepth) {
          containers.push(container);
        }
      }

      const implMatch = line.match(/^\s*impl\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (implMatch) {
        const name = implMatch[1];
        const selectionRange = captureRange(rawLine, lineIndex, name);
        const container = createContainer(
          `impl:${containerCounter++}:${name}`,
          `impl ${name}`,
          SymbolKind.Namespace,
          `impl ${name}`,
          selectionRange,
          braceDepth,
          countBraces(line),
          name,
        );
        documentSymbols.push(container.documentSymbol);
        if (container.activeDepth > braceDepth) {
          containers.push(container);
        }
      }

      const fnMatch = line.match(
        /^\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*([A-Za-z_][A-Za-z0-9_\[\]; .,]*))?/,
      );
      if (fnMatch) {
        const name = fnMatch[1];
        const params = fnMatch[2] ?? "";
        const returnType = fnMatch[3]?.trim();
        const selectionRange = captureRange(rawLine, lineIndex, name);
        const detail = returnType ? `fn(${params}) -> ${returnType}` : `fn(${params})`;
        const container = createContainer(
          `fn:${containerCounter++}:${name}`,
          name,
          SymbolKind.Function,
          detail,
          selectionRange,
          braceDepth,
          countBraces(line),
          returnType,
        );
        symbols.push(makeSymbol(name, uri, SymbolKind.Function, detail, selectionRange, undefined, true, undefined, returnType));
        documentSymbols.push(container.documentSymbol);
        if (container.activeDepth > braceDepth) {
          containers.push(container);
        }
        addParameterSymbols(symbols, uri, rawLine, lineIndex, params, container.scopeId, name);
      }

      const letMatch = line.match(/^\s*let\s+([A-Za-z_][A-Za-z0-9_]*)\b(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?/);
      if (letMatch) {
        const name = letMatch[1];
        const declaredType = letMatch[2];
        const selectionRange = captureRange(rawLine, lineIndex, name);
        const inferredType = declaredType ?? inferVariableType(line, symbols, rawLine, lineIndex);
        symbols.push(makeSymbol(name, uri, SymbolKind.Variable, "global", selectionRange, undefined, true, undefined, inferredType));
      }
    } else {
      if (currentStruct && currentStruct.activeDepth === braceDepth) {
        const fieldMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)(?:,)?\s*$/);
        if (fieldMatch) {
          const name = fieldMatch[1];
          const type = fieldMatch[2].trim();
          const selectionRange = captureRange(rawLine, lineIndex, name);
          const fieldSymbol = makeSymbol(
            name,
            uri,
            SymbolKind.Field,
            type,
            selectionRange,
            currentStruct.name,
            false,
            currentStruct.scopeId,
            normalizeTypeName(type),
          );
          symbols.push(fieldSymbol);
          currentStruct.documentSymbol.children?.push({
            name,
            kind: SymbolKind.Field,
            detail: type,
            range: selectionRange,
            selectionRange,
          });
        }
      }

      if (currentImpl && currentImpl.activeDepth === braceDepth) {
        const methodMatch = line.match(
          /^\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*([A-Za-z_][A-Za-z0-9_\[\]; .,]*))?/,
        );
        if (methodMatch) {
          const name = methodMatch[1];
          const params = methodMatch[2] ?? "";
          const returnType = methodMatch[3]?.trim();
          const selectionRange = captureRange(rawLine, lineIndex, name);
          const detail = returnType ? `method(${params}) -> ${returnType}` : `method(${params})`;
          const container = createContainer(
            `method:${containerCounter++}:${currentImpl.targetName ?? currentImpl.name}:${name}`,
            name,
            SymbolKind.Method,
            detail,
            selectionRange,
            braceDepth,
            countBraces(line),
            returnType,
          );
          symbols.push(
            makeSymbol(
              name,
              uri,
              SymbolKind.Method,
              detail,
              selectionRange,
              currentImpl.targetName ?? currentImpl.name,
              false,
              container.scopeId,
              returnType,
            ),
          );
          currentImpl.documentSymbol.children?.push(container.documentSymbol);
          if (container.activeDepth > braceDepth) {
            containers.push(container);
          }
          addParameterSymbols(
            symbols,
            uri,
            rawLine,
            lineIndex,
            params,
            container.scopeId,
            name,
            currentImpl.targetName,
          );
        }
      }

      if (currentFunction) {
        const letMatch = line.match(/^\s*let\s+([A-Za-z_][A-Za-z0-9_]*)\b(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?/);
        if (letMatch) {
          const name = letMatch[1];
          const declaredType = letMatch[2];
          const selectionRange = captureRange(rawLine, lineIndex, name);
          const inferredType =
            declaredType ?? inferVariableType(line, symbols, rawLine, lineIndex);
          symbols.push(
            makeSymbol(
              name,
              uri,
              SymbolKind.Variable,
              "local",
              selectionRange,
              currentFunction.name,
              false,
              currentFunction.scopeId,
              inferredType,
            ),
          );
        }
      }
    }

    const delta = countBraces(line);
    const nextDepth = Math.max(0, braceDepth + delta);
    finalizeContainersToDepth(nextDepth, lineIndex, rawLine.length);
    braceDepth = nextDepth;
  }

  if (lines.length > 0) {
    finalizeContainersToDepth(0, lines.length - 1, lines[lines.length - 1].length);
  }

  return {
    uri,
    filePath,
    source,
    symbols,
    documentSymbols,
    scopeRanges,
  };
}

function createContainer(
  id: string,
  name: string,
  kind: SymbolKind,
  detail: string,
  selectionRange: Range,
  braceDepth: number,
  braceDelta: number,
  targetName?: string,
): ActiveContainer {
  return {
    id,
    name,
    targetName,
    kind,
    scopeId: id,
    activeDepth: Math.max(braceDepth + braceDelta, braceDepth),
    documentSymbol: {
      name,
      kind,
      detail,
      range: {
        start: selectionRange.start,
        end: selectionRange.end,
      },
      selectionRange,
      children: [],
    },
  };
}

function addParameterSymbols(
  symbols: ParsedSymbol[],
  uri: string,
  rawLine: string,
  lineIndex: number,
  paramText: string,
  scopeId: string,
  containerName: string,
  selfTypeName?: string,
): void {
  if (/\bself\b/.test(paramText)) {
    const selfStart = rawLine.indexOf("self");
    if (selfStart >= 0) {
      const selectionRange = {
        start: { line: lineIndex, character: selfStart },
        end: { line: lineIndex, character: selfStart + 4 },
      };
      symbols.push(
        makeSymbol(
          "self",
          uri,
          SymbolKind.Variable,
          "parameter",
          selectionRange,
          containerName,
          false,
          scopeId,
          selfTypeName,
        ),
      );
    }
  }

  const matches = [...paramText.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/g)];
  for (const match of matches) {
    const name = match[1];
    const typeName = match[2];
    if (name === "self") {
      continue;
    }
    const startChar = rawLine.indexOf(name);
    if (startChar < 0) {
      continue;
    }
    const selectionRange = {
      start: { line: lineIndex, character: startChar },
      end: { line: lineIndex, character: startChar + name.length },
    };
    symbols.push(
      makeSymbol(
        name,
        uri,
        SymbolKind.Variable,
        "parameter",
        selectionRange,
        containerName,
        false,
        scopeId,
        normalizeTypeName(typeName),
      ),
    );
  }
}

function makeSymbol(
  name: string,
  uri: string,
  kind: SymbolKind,
  detail: string,
  selectionRange: Range,
  containerName?: string,
  topLevel = false,
  scopeId?: string,
  typeName?: string,
): ParsedSymbol {
  return {
    name,
    uri,
    kind,
    detail,
    typeName,
    range: selectionRange,
    selectionRange,
    containerName,
    scopeId,
    topLevel,
  };
}

function completionKindFromSymbol(kind: SymbolKind): CompletionItemKind {
  switch (kind) {
    case SymbolKind.Class:
      return CompletionItemKind.Class;
    case SymbolKind.Method:
      return CompletionItemKind.Method;
    case SymbolKind.Field:
      return CompletionItemKind.Field;
    case SymbolKind.Variable:
      return CompletionItemKind.Variable;
    case SymbolKind.Namespace:
      return CompletionItemKind.Module;
    default:
      return CompletionItemKind.Function;
  }
}

function isVisibleAtPosition(symbol: ParsedSymbol, position: Position, parsed: ParsedDocument): boolean {
  if (!symbol.scopeId) {
    return true;
  }

  const scope = parsed.scopeRanges.get(symbol.scopeId);
  if (!scope) {
    return true;
  }

  if (position.line < scope.start.line || position.line > scope.end.line) {
    return false;
  }

  if (position.line === symbol.selectionRange.start.line) {
    return position.character >= symbol.selectionRange.start.character;
  }

  return true;
}

function findWordOccurrences(source: string, word: string): Range[] {
  const ranges: Range[] = [];
  const lines = source.split(/\r?\n/);
  const matcher = new RegExp(`\\b${escapeRegExp(word)}\\b`, "g");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    matcher.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(line)) !== null) {
      ranges.push({
        start: { line: lineIndex, character: match.index },
        end: { line: lineIndex, character: match.index + word.length },
      });
    }
  }

  return ranges;
}

function captureRange(line: string, lineIndex: number, value: string): Range {
  const start = line.indexOf(value);
  return {
    start: { line: lineIndex, character: Math.max(0, start) },
    end: { line: lineIndex, character: Math.max(0, start) + value.length },
  };
}

function stripLineComments(line: string): string {
  const commentIndex = line.indexOf("//");
  return commentIndex >= 0 ? line.slice(0, commentIndex) : line;
}

function countBraces(line: string): number {
  let delta = 0;
  let inString = false;
  let escaping = false;

  for (const char of line) {
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      delta += 1;
    } else if (char === "}") {
      delta -= 1;
    }
  }

  return delta;
}

function walkSkepaFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const results: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }
      if (entry.isFile() && fullPath.endsWith(".sk")) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function rangesEqual(a: Range, b: Range): boolean {
  return (
    a.start.line === b.start.line &&
    a.start.character === b.start.character &&
    a.end.line === b.end.line &&
    a.end.character === b.end.character
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getSemanticTokenLegend() {
  return {
    tokenTypes: [...TOKEN_TYPES],
    tokenModifiers: [],
  };
}

export function extractMissingImportPackage(message: string): string | null {
  const match = message.match(/`([A-Za-z_][A-Za-z0-9_]*)\.\*` used without `import \1;`/);
  return match?.[1] ?? null;
}

function isRenameSafe(symbol: ParsedSymbol): boolean {
  if (symbol.kind === SymbolKind.Field || symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Namespace) {
    return false;
  }

  return symbol.kind === SymbolKind.Function
    || symbol.kind === SymbolKind.Class
    || symbol.kind === SymbolKind.Variable;
}

function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
    && !KEYWORDS.some((keyword) => keyword.label === value);
}

function signatureLabelForSymbol(symbol: ParsedSymbol): string {
  const match = symbol.detail.match(/^(?:fn|method)\((.*)\)(?:\s*->\s*(.+))?$/);
  if (!match) {
    return symbol.name;
  }

  const parameters = splitParameterList(match[1] ?? "")
    .filter((parameter) => parameter.trim() !== "self");
  const returnType = match[2]?.trim();
  const prefix = symbol.kind === SymbolKind.Method && symbol.containerName
    ? `${symbol.containerName}.${symbol.name}`
    : symbol.name;

  return `${prefix}(${parameters.join(", ")})${returnType ? ` -> ${returnType}` : ""}`;
}

function createSignatureInformation(
  label: string,
  dropSelf = false,
): SignatureInformation {
  const parameters = extractParameterLabelsFromSignature(label, dropSelf).map((parameter) =>
    ParameterInformation.create(parameter),
  );

  return SignatureInformation.create(label, undefined, ...parameters);
}

function extractParameterLabelsFromSignature(label: string, dropSelf = false): string[] {
  const openParen = label.indexOf("(");
  const closeParen = label.lastIndexOf(")");
  if (openParen < 0 || closeParen < openParen) {
    return [];
  }

  const raw = label.slice(openParen + 1, closeParen);
  const parameters = splitParameterList(raw).map((parameter) => parameter.trim()).filter(Boolean);
  if (!dropSelf) {
    return parameters;
  }

  return parameters.filter((parameter) => parameter !== "self");
}

function splitParameterList(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let escaping = false;

  for (const char of value) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escaping = true;
      continue;
    }

    if (char === "\"") {
      current += char;
      inString = !inString;
      continue;
    }

    if (inString) {
      current += char;
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      current += char;
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      current += char;
      continue;
    }

    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += char;
      continue;
    }

    if (char === "," && parenDepth === 0 && bracketDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        parts.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) {
    parts.push(trimmed);
  }

  return parts;
}

function getCallContext(
  source: string,
  position: Position,
): { calleeText: string; calleePosition: Position; argumentIndex: number } | null {
  const offset = positionToOffset(source, position);
  const stack: { openOffset: number; argumentIndex: number; calleeText: string | null }[] = [];
  let inString = false;
  let escaping = false;

  for (let index = 0; index < offset; index += 1) {
    const char = source[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "(") {
      stack.push({
        openOffset: index,
        argumentIndex: 0,
        calleeText: extractCallCallee(source, index),
      });
      continue;
    }

    if (char === "," && stack.length > 0) {
      stack[stack.length - 1].argumentIndex += 1;
      continue;
    }

    if (char === ")" && stack.length > 0) {
      stack.pop();
    }
  }

  const activeCall = stack[stack.length - 1];
  if (!activeCall?.calleeText) {
    return null;
  }

  return {
    calleeText: activeCall.calleeText,
    calleePosition: offsetToPosition(source, activeCall.openOffset),
    argumentIndex: activeCall.argumentIndex,
  };
}

function extractCallCallee(source: string, openParenOffset: number): string | null {
  let index = openParenOffset - 1;
  while (index >= 0 && /\s/.test(source[index] ?? "")) {
    index -= 1;
  }

  if (index < 0) {
    return null;
  }

  let end = index + 1;
  while (index >= 0 && /[A-Za-z0-9_.]/.test(source[index] ?? "")) {
    index -= 1;
  }

  const callee = source.slice(index + 1, end).trim();
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(callee) ? callee : null;
}

function positionToOffset(source: string, position: Position): number {
  const lines = source.split(/\r?\n/);
  let offset = 0;

  for (let lineIndex = 0; lineIndex < position.line; lineIndex += 1) {
    offset += (lines[lineIndex] ?? "").length + 1;
  }

  return offset + position.character;
}

function offsetToPosition(source: string, offset: number): Position {
  const safeOffset = Math.max(0, Math.min(offset, source.length));
  const prefix = source.slice(0, safeOffset);
  const lines = prefix.split(/\r?\n/);
  const line = Math.max(0, lines.length - 1);
  const character = lines[line]?.length ?? 0;

  return { line, character };
}

function tokenTypeForSymbol(kind: SymbolKind, detail: string): number {
  switch (kind) {
    case SymbolKind.Class:
      return TOKEN_TYPE_INDEX.class;
    case SymbolKind.Method:
      return TOKEN_TYPE_INDEX.method;
    case SymbolKind.Field:
      return TOKEN_TYPE_INDEX.property;
    case SymbolKind.Function:
      return TOKEN_TYPE_INDEX.function;
    case SymbolKind.Variable:
      return detail === "parameter" ? TOKEN_TYPE_INDEX.parameter : TOKEN_TYPE_INDEX.variable;
    case SymbolKind.Namespace:
      return TOKEN_TYPE_INDEX.namespace;
    default:
      return TOKEN_TYPE_INDEX.variable;
  }
}

function recordSemanticToken(
  entries: Map<string, { range: Range; tokenType: number }>,
  range: Range,
  tokenType: number,
): void {
  const key = [
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
    tokenType,
  ].join(":");

  if (entries.has(key)) {
    return;
  }

  entries.set(key, { range, tokenType });
}

function rangeIsWithinScope(range: Range, symbol: ParsedSymbol, parsed: ParsedDocument): boolean {
  if (!symbol.scopeId) {
    return true;
  }

  const scope = parsed.scopeRanges.get(symbol.scopeId);
  if (!scope) {
    return true;
  }

  if (range.start.line < scope.start.line || range.end.line > scope.end.line) {
    return false;
  }

  if (range.start.line === scope.start.line && range.start.character < scope.start.character) {
    return false;
  }

  if (range.end.line === scope.end.line && range.end.character > scope.end.character) {
    return false;
  }

  return true;
}

function compareSemanticEntries(
  a: { range: Range; tokenType: number },
  b: { range: Range; tokenType: number },
): number {
  if (a.range.start.line !== b.range.start.line) {
    return a.range.start.line - b.range.start.line;
  }
  if (a.range.start.character !== b.range.start.character) {
    return a.range.start.character - b.range.start.character;
  }
  if (a.range.end.line !== b.range.end.line) {
    return a.range.end.line - b.range.end.line;
  }
  if (a.range.end.character !== b.range.end.character) {
    return a.range.end.character - b.range.end.character;
  }
  return a.tokenType - b.tokenType;
}

function createImportEdit(source: string, packageName: string): TextEdit {
  const lines = source.split(/\r?\n/);
  let insertLine = 0;

  while (insertLine < lines.length && /^\s*import\b/.test(lines[insertLine])) {
    insertLine += 1;
  }

  const newText = `import ${packageName};\n${insertLine > 0 ? "" : "\n"}`;
  return {
    range: {
      start: { line: insertLine, character: 0 },
      end: { line: insertLine, character: 0 },
    },
    newText,
  };
}

function findPackageRanges(source: string, packageName: string): Range[] {
  return findWordOccurrences(source, packageName);
}

function findBuiltinMemberRanges(source: string, packageName: string, memberName: string): Range[] {
  const lines = source.split(/\r?\n/);
  const ranges: Range[] = [];
  const matcher = new RegExp(`\\b${escapeRegExp(packageName)}\\b\\s*\\.\\s*(${escapeRegExp(memberName)})\\b`, "g");

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

function findFieldAccessOccurrences(source: string, fieldName: string): Range[] {
  const lines = source.split(/\r?\n/);
  const ranges: Range[] = [];
  const matcher = new RegExp(`\\.\\s*(${escapeRegExp(fieldName)})\\b`, "g");

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

function getMemberAccessContext(
  source: string,
  position: Position,
): { receiverName: string; memberPrefix: string } | null {
  const lines = source.split(/\r?\n/);
  const line = lines[position.line] ?? "";
  const prefix = line.slice(0, position.character);
  const match = prefix.match(/([A-Za-z_][A-Za-z0-9_]*)\.\s*([A-Za-z_][A-Za-z0-9_]*)?$/);
  if (!match) {
    return null;
  }

  return {
    receiverName: match[1],
    memberPrefix: match[2] ?? "",
  };
}

function findReceiverRangeAtPosition(
  source: string,
  position: Position,
  receiverName: string,
): Range | null {
  const lines = source.split(/\r?\n/);
  const line = lines[position.line] ?? "";
  const prefix = line.slice(0, position.character);
  const match = prefix.match(/([A-Za-z_][A-Za-z0-9_]*)\.\s*([A-Za-z_][A-Za-z0-9_]*)?$/);
  if (!match || match[1] !== receiverName) {
    return null;
  }

  const start = prefix.lastIndexOf(receiverName);
  if (start < 0) {
    return null;
  }

  return {
    start: { line: position.line, character: start },
    end: { line: position.line, character: start + receiverName.length },
  };
}

function inferVariableType(
  line: string,
  symbols: ParsedSymbol[],
  rawLine: string,
  lineIndex: number,
): string | undefined {
  const assignmentIndex = line.indexOf("=");
  if (assignmentIndex < 0) {
    return undefined;
  }

  const initializer = line.slice(assignmentIndex + 1).trim().replace(/;$/, "");
  if (!initializer) {
    return undefined;
  }

  const structLiteralMatch = initializer.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
  if (structLiteralMatch) {
    return normalizeTypeName(structLiteralMatch[1]);
  }

  const constructorCallMatch = initializer.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (constructorCallMatch) {
    const calleeName = constructorCallMatch[1];
    const callee = [...symbols]
      .reverse()
      .find((symbol) => symbol.name === calleeName && (symbol.kind === SymbolKind.Function || symbol.kind === SymbolKind.Method));
    if (callee?.typeName) {
      return normalizeTypeName(callee.typeName);
    }
  }

  const memberCallMatch = initializer.match(/^([A-Za-z_][A-Za-z0-9_]*)\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (memberCallMatch) {
    const receiverName = memberCallMatch[1];
    const memberName = memberCallMatch[2];
    const receiver = [...symbols]
      .reverse()
      .find((symbol) => symbol.name === receiverName && symbol.kind === SymbolKind.Variable);
    if (!receiver?.typeName) {
      return undefined;
    }

    const method = [...symbols]
      .reverse()
      .find(
        (symbol) =>
          symbol.name === memberName &&
          symbol.kind === SymbolKind.Method &&
          symbol.containerName === receiver.typeName,
      );

    return method?.typeName ? normalizeTypeName(method.typeName) : undefined;
  }

  const literalType = inferLiteralType(initializer);
  if (literalType) {
    return literalType;
  }

  return undefined;
}

function inferLiteralType(initializer: string): string | undefined {
  if (/^".*"$/.test(initializer)) {
    return "String";
  }
  if (/^(true|false)$/.test(initializer)) {
    return "Bool";
  }
  if (/^\d+\.\d+$/.test(initializer)) {
    return "Float";
  }
  if (/^\d+$/.test(initializer)) {
    return "Int";
  }
  return undefined;
}

function normalizeTypeName(typeName?: string): string | undefined {
  if (!typeName) {
    return undefined;
  }

  const trimmed = typeName.trim();
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  return match?.[1];
}

function findBuiltinDocLocation(marker: string): Location | null {
  if (!fs.existsSync(BUILTIN_DOCS_PATH)) {
    return null;
  }

  const lines = fs.readFileSync(BUILTIN_DOCS_PATH, "utf8").split(/\r?\n/);
  const lineIndex = lines.findIndex((line) => line.trim() === marker);
  if (lineIndex < 0) {
    return null;
  }

  return {
    uri: fsPathToUri(BUILTIN_DOCS_PATH),
    range: {
      start: { line: lineIndex, character: 0 },
      end: { line: lineIndex, character: lines[lineIndex].length },
    },
  };
}

function getImportContext(
  source: string,
  position: Position,
): { prefix: string; range: Range } | null {
  const lines = source.split(/\r?\n/);
  const line = lines[position.line] ?? "";
  const prefix = line.slice(0, position.character);

  const importMatch = prefix.match(/^\s*import\s+([A-Za-z_][A-Za-z0-9_.]*)?$/);
  if (importMatch) {
    const value = importMatch[1] ?? "";
    const start = prefix.length - value.length;
    return {
      prefix: value,
      range: {
        start: { line: position.line, character: start },
        end: { line: position.line, character: position.character },
      },
    };
  }

  const fromMatch = prefix.match(/^\s*from\s+([A-Za-z_][A-Za-z0-9_.]*)?$/);
  if (fromMatch) {
    const value = fromMatch[1] ?? "";
    const start = prefix.length - value.length;
    return {
      prefix: value,
      range: {
        start: { line: position.line, character: start },
        end: { line: position.line, character: position.character },
      },
    };
  }

  return null;
}

function modulePathFromFilePath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const withoutExt = normalized.replace(/\.sk$/i, "");
  const parts = withoutExt.split("/").filter(Boolean);
  const skepaIndex = parts.lastIndexOf("skepa-lang");
  const toolsIndex = parts.lastIndexOf("skepa-lang-tools");
  const startIndex = skepaIndex >= 0 ? skepaIndex + 1 : toolsIndex >= 0 ? toolsIndex + 1 : Math.max(parts.length - 1, 0);
  const relevant = parts.slice(startIndex);

  if (relevant.length === 0) {
    return null;
  }

  const last = relevant[relevant.length - 1];
  if (last === "main" || last === "mod" || last === "index") {
    relevant.pop();
  }

  return relevant.length > 0 ? relevant.join(".") : null;
}
