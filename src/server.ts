import {
	DidChangeConfigurationNotification,
	InitializeParams,
	InitializeResult,
	ProposedFeatures,
	TextDocumentSyncKind,
	TextDocuments,
	createConnection,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { CompletionProvider } from './feature/completion';
import { DiagnosticProvider } from './feature/diagnostic';
import { Configuration } from './core/configuration';
import { ConfigurationManager } from './core/configuration-manager';
import { GLSL_LANGUAGE_SERVER } from './core/constants';

export const connection = createConnection(ProposedFeatures.all);

export const documents = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams): InitializeResult => {
	ConfigurationManager.initialize(!!params.capabilities.workspace?.configuration);
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: CompletionProvider.getCompletionOptions(params.capabilities.textDocument?.completion),
		},
	};
});

connection.onInitialized( () => {
	if (ConfigurationManager.isConfigurationSupported()) {
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
		await refreshConfiguration();
	}
});

connection.onDidChangeConfiguration(async () => {
	await refreshConfiguration();
});

async function refreshConfiguration(): Promise<void> {
	const oldConfiguration = ConfigurationManager.getConfiguration();
	const newConfiguration: Configuration = await connection.workspace.getConfiguration(GLSL_LANGUAGE_SERVER);
	ConfigurationManager.setConfiguration(newConfiguration);
	if (DiagnosticProvider.isValidationRequired(oldConfiguration, newConfiguration)) {
		documents.all().forEach(async (document) => {
			await DiagnosticProvider.diagnosticConfigurationHandler(document);
		});
	}
}

documents.onDidChangeContent(DiagnosticProvider.diagnosticOpenChangeHandler);
documents.onDidClose(DiagnosticProvider.diagnosticCloseHandler);
connection.onCompletion(CompletionProvider.completionHandler);

documents.listen(connection);
connection.listen();
