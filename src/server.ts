import {
	InitializeParams,
	InitializeResult,
	ProposedFeatures,
	TextDocumentSyncKind,
	TextDocuments,
	createConnection,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { completionHandler, getCompletionOptions } from './feature/completion';
import { diagnosticHandler } from './feature/diagnostic';

export const connection = createConnection(ProposedFeatures.all);

const documents = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams): InitializeResult => {
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: getCompletionOptions(
				params.capabilities.textDocument?.completion
			),
		},
	};
});

documents.onDidChangeContent(diagnosticHandler);
connection.onCompletion(completionHandler);

documents.listen(connection);
connection.listen();
