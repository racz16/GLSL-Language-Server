import {
	createConnection,
	BrowserMessageReader,
	BrowserMessageWriter,
	TextDocuments,
	InitializeResult,
	TextDocumentSyncKind,
	InitializeParams,
} from 'vscode-languageserver/browser';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
	completionHandler,
	computeCompletionOptions,
} from './feature/completion';

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);
const connection = createConnection(messageReader, messageWriter);

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

connection.onCompletion(completionHandler);

documents.listen(connection);
connection.listen();
