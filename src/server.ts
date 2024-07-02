import {
    Connection,
    DidChangeConfigurationNotification,
    InitializeParams,
    InitializeResult,
    TextDocumentChangeEvent,
    TextDocumentSyncKind,
    TextDocuments,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { getCapabilities, initializeCapabilities } from './core/capabilities';
import { Configuration, getConfiguration, setConfiguration } from './core/configuration';
import { GLSL_LANGUAGE_SERVER } from './core/constants';
import { analyzeDocument, getDocumentInfo } from './core/document-info';
import { Host } from './core/host';
import { lspUriToFsUri } from './core/utility';
import { CompletionProvider } from './feature/completion';

export abstract class Server {
    private static server: Server;

    protected connection: Connection;
    protected documents: TextDocuments<TextDocument>;
    protected workspaceFolders: string[] = [];
    protected initialized = Promise.resolve();
    protected host: Host;

    public static getServer(): Server {
        return this.server;
    }

    protected static setServer(newServer: Server): void {
        this.server = newServer;
    }

    public constructor() {
        this.connection = this.createConnection();
        this.documents = new TextDocuments(TextDocument);
        this.host = this.createHost();
        this.addEventHandlers();
        this.addFeatures();
        this.listen();
    }

    protected abstract createConnection(): Connection;

    public getHost(): Host {
        return this.host;
    }

    protected abstract createHost(): Host;

    protected addEventHandlers(): void {
        this.connection.onInitialize((params) => {
            return this.onInitialize(params);
        });
        this.initialized = new Promise((resolve) => {
            this.connection.onInitialized(async () => {
                await this.onInitialized();
                resolve();
            });
        });
        this.connection.onDidChangeConfiguration(async () => {
            await this.onConfigurationChanged();
        });
        this.documents.onDidOpen((event) => {
            this.onDidOpen(event);
        });
        this.documents.onDidChangeContent(async (event) => {
            await this.onDidChangeContent(event);
        });
        this.documents.onDidClose((event) => {
            this.onDidClose(event);
        });
        this.connection.onShutdown(async () => {
            await this.onShutdown();
        });
    }

    protected onInitialize(params: InitializeParams): InitializeResult {
        initializeCapabilities(params.capabilities);
        this.setWorkspaceFolders(params);
        return {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
                completionProvider: CompletionProvider.getCompletionOptions(
                    params.capabilities.textDocument?.completion
                ),
            },
        };
    }

    public getWorkspaceFolders(): string[] {
        return this.workspaceFolders;
    }

    private setWorkspaceFolders(params: InitializeParams): void {
        if (params.workspaceFolders?.length) {
            this.workspaceFolders = params.workspaceFolders.map((wf) => lspUriToFsUri(wf.uri));
        } else if (params.rootUri) {
            this.workspaceFolders = [lspUriToFsUri(params.rootUri)];
        } else if (params.rootPath) {
            this.workspaceFolders = [params.rootPath];
        }
    }

    protected async onInitialized(): Promise<void> {
        if (getCapabilities().configurations) {
            this.connection.client.register(DidChangeConfigurationNotification.type, undefined);
            const newConfiguration: Configuration =
                await this.connection.workspace.getConfiguration(GLSL_LANGUAGE_SERVER);
            setConfiguration(newConfiguration);
        }
    }

    public async waitUntilInitialized(): Promise<void> {
        return this.initialized;
    }

    protected async onConfigurationChanged(): Promise<void> {
        const oldConfiguration = getConfiguration();
        const newConfiguration: Configuration = await this.connection.workspace.getConfiguration(GLSL_LANGUAGE_SERVER);
        setConfiguration(newConfiguration);
        await this.refreshConfiguration(oldConfiguration, newConfiguration);
    }

    protected abstract refreshConfiguration(
        oldConfiguration: Configuration,
        newConfiguration: Configuration
    ): Promise<void>;

    protected onDidOpen(event: TextDocumentChangeEvent<TextDocument>): void {
        const di = getDocumentInfo(lspUriToFsUri(event.document.uri));
        di.document.setOpened(true);
    }

    protected async onDidChangeContent(event: TextDocumentChangeEvent<TextDocument>): Promise<void> {
        const di = getDocumentInfo(lspUriToFsUri(event.document.uri));
        di.document.increaseVersion();
        analyzeDocument(di);
    }

    protected onDidClose(event: TextDocumentChangeEvent<TextDocument>): void {
        const di = getDocumentInfo(lspUriToFsUri(event.document.uri));
        di.document.setOpened(false);
    }

    protected async onShutdown(): Promise<void> {}

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
