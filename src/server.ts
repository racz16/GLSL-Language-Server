import {
    Connection,
    DidChangeConfigurationNotification,
    InitializeParams,
    InitializeResult,
    LSPAny,
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
import { initializeTelemetry, sendTelemetryError } from './core/telemetry';
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
        return Server.server;
    }

    protected static setServer(newServer: Server): void {
        Server.server = newServer;
    }

    public constructor() {
        try {
            this.connection = this.createConnection();
            this.documents = new TextDocuments(TextDocument);
            this.host = this.createHost();
            this.addEventHandlers();
            this.addFeatures();
            this.listen();
        } catch (e) {
            sendTelemetryError(e);
            throw e;
        }
    }

    protected abstract createConnection(): Connection;

    public getHost(): Host {
        return this.host;
    }

    protected abstract createHost(): Host;

    protected addEventHandlers(): void {
        this.connection.onInitialize(async (params) => {
            try {
                return await this.onInitialize(params);
            } catch (e) {
                sendTelemetryError(e);
                throw e;
            }
        });
        this.initialized = new Promise((resolve) => {
            this.connection.onInitialized(async () => {
                try {
                    await this.onInitialized();
                    resolve();
                } catch (e) {
                    sendTelemetryError(e);
                    throw e;
                }
            });
        });
        this.connection.onDidChangeConfiguration(async () => {
            try {
                await this.onConfigurationChanged();
            } catch (e) {
                sendTelemetryError(e);
                throw e;
            }
        });
        this.documents.onDidOpen((event) => {
            try {
                this.onDidOpen(event);
            } catch (e) {
                sendTelemetryError(e);
                throw e;
            }
        });
        this.documents.onDidChangeContent(async (event) => {
            try {
                await this.onDidChangeContent(event);
            } catch (e) {
                sendTelemetryError(e);
                throw e;
            }
        });
        this.documents.onDidClose((event) => {
            try {
                this.onDidClose(event);
            } catch (e) {
                sendTelemetryError(e);
                throw e;
            }
        });
        this.connection.onShutdown(async () => {
            try {
                await this.onShutdown();
            } catch (e) {
                sendTelemetryError(e);
                throw e;
            }
        });
    }

    protected async onInitialize(params: InitializeParams): Promise<InitializeResult> {
        initializeCapabilities(params.capabilities);
        this.setWorkspaceFolders(params);
        return {
            serverInfo: {
                name: 'GLSL Language Server',
            },
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
        initializeTelemetry();
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

    public sendTelemetry(data: LSPAny): void {
        this.connection.telemetry.logEvent(data);
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
