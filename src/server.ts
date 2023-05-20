import {
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

export const connection = createConnection(ProposedFeatures.all);

const documents = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams): InitializeResult => {
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: CompletionProvider.getCompletionOptions(params.capabilities.textDocument?.completion),
		},
	};
});

documents.onDidChangeContent(DiagnosticProvider.diagnosticOpenChangeHandler);
documents.onDidClose(DiagnosticProvider.diagnosticCloseHandler);
connection.onCompletion(CompletionProvider.completionHandler);

documents.listen(connection);
connection.listen();
