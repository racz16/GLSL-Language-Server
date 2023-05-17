import {
	InitializeParams,
	InitializeResult,
	ProposedFeatures,
	TextDocumentSyncKind,
	TextDocuments,
	createConnection,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
	completionHandler,
	computeCompletionOptions,
} from './feature/completion';
import { diagnosticHandle } from './feature/diagnostic';

export const connection = createConnection(ProposedFeatures.all);

const documents = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams): InitializeResult => {
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: computeCompletionOptions(
				params.capabilities.textDocument?.completion
			),
		},
	};
});

documents.onDidChangeContent(diagnosticHandle);
connection.onCompletion(completionHandler);

documents.listen(connection);
connection.listen();
