import {
	Connection,
	DidChangeConfigurationNotification,
	InitializeParams,
	InitializeResult,
	TextDocumentSyncKind,
	TextDocuments,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ConfigurationManager } from './core/configuration-manager';
import { CompletionProvider } from './feature/completion';

export abstract class Server {
	private static server: Server;

	protected connection: Connection;
	protected documents: TextDocuments<TextDocument>;

	public static getServer(): Server {
		return this.server;
	}

	protected static setServer(newServer: Server): void {
		this.server = newServer;
	}

	public constructor() {
		this.connection = this.createConnection();
		this.documents = new TextDocuments(TextDocument);
		this.onInitialize();
		this.onInitialized();
		this.onConfigurationChanged();
		this.addFeatures();
		this.listen();
	}

	private onInitialize(): void {
		this.connection.onInitialize((params: InitializeParams): InitializeResult => {
			ConfigurationManager.initialize(!!params.capabilities.workspace?.configuration);
			return {
				capabilities: {
					textDocumentSync: TextDocumentSyncKind.Incremental,
					completionProvider: CompletionProvider.getCompletionOptions(
						params.capabilities.textDocument?.completion
					),
				},
			};
		});
	}

	private onInitialized(): void {
		this.connection.onInitialized(async () => {
			if (ConfigurationManager.isConfigurationSupported()) {
				this.connection.client.register(DidChangeConfigurationNotification.type, undefined);
				await this.refreshConfiguration();
			}
		});
	}

	private onConfigurationChanged(): void {
		this.connection.onDidChangeConfiguration(async () => {
			await this.refreshConfiguration();
		});
	}

	protected abstract createConnection(): Connection;

	protected abstract refreshConfiguration(): Promise<void>;

	protected addFeatures(): void {
		this.connection.onCompletion(CompletionProvider.completionHandler);
	}

	private listen(): void {
		this.documents.listen(this.connection);
		this.connection.listen();
	}

	public getConnection(): Connection {
		return this.connection;
	}

	public getDocuments(): TextDocuments<TextDocument> {
		return this.documents;
	}
}
