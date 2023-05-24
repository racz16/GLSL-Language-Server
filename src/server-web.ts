import { TextDocument } from 'vscode-languageserver-textdocument';
import {
	BrowserMessageReader,
	BrowserMessageWriter,
	DidChangeConfigurationNotification,
	InitializeParams,
	InitializeResult,
	TextDocumentSyncKind,
	TextDocuments,
	createConnection,
} from 'vscode-languageserver/browser';

import { Configuration } from './core/configuration';
import { ConfigurationManager } from './core/configuration-manager';
import { GLSL_LANGUAGE_SERVER } from './core/constants';
import { CompletionProvider } from './feature/completion';

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);
const connection = createConnection(messageReader, messageWriter);

const documents = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams): InitializeResult => {
	ConfigurationManager.initialize(!!params.capabilities.workspace?.configuration);
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: CompletionProvider.getCompletionOptions(params.capabilities.textDocument?.completion),
		},
	};
});

connection.onInitialized(async () => {
	if (ConfigurationManager.isConfigurationSupported()) {
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
		await refreshConfiguration();
	}
});

connection.onDidChangeConfiguration(async () => {
	await refreshConfiguration();
});

async function refreshConfiguration(): Promise<void> {
	const configuration: Configuration = await connection.workspace.getConfiguration(GLSL_LANGUAGE_SERVER);
	ConfigurationManager.setConfiguration(configuration);
}

connection.onCompletion(CompletionProvider.completionHandler);

documents.listen(connection);
connection.listen();
