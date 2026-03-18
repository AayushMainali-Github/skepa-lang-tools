import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(
    path.join("out", "server", "server", "src", "server.js"),
  );

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ["--nolazy", "--inspect=6010"],
      },
    },
  };

  const outputChannel = vscode.window.createOutputChannel("Skepa Language Server");

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "skepa" },
      { scheme: "untitled", language: "skepa" },
    ],
    synchronize: {
      configurationSection: "skepa",
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.sk"),
    },
    outputChannel,
  };

  client = new LanguageClient(
    "skepaLanguageServer",
    "Skepa Language Server",
    serverOptions,
    clientOptions,
  );

  context.subscriptions.push(outputChannel);
  context.subscriptions.push(client);
  void client.start();
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
  }
}
