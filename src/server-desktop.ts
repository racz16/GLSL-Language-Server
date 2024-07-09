import { FSWatcher, watch } from 'chokidar';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    Connection,
    DocumentUri,
    InitializeParams,
    InitializeResult,
    ProposedFeatures,
    TextDocumentChangeEvent,
    createConnection,
} from 'vscode-languageserver/node';

import {
    Configuration,
    extensionsConfigurationChanged,
    getConfiguration,
    increaseDiagnosticConfigurationVersion,
    onlyInFirstExtensions,
} from './core/configuration';
import {
    DocumentInfo,
    analyzeAllDocuments,
    analyzeDocument,
    forEachDocument,
    getDocumentInfo,
    removeDocumentInfo,
} from './core/document-info';
import { Host } from './core/host';
import { getDocumentContent } from './core/node-utility';
import { sendTelemetryError } from './core/telemetry';
import { lspUriToFsUri } from './core/utility';
import { DiagnosticProvider } from './feature/diagnostic';
import { Server } from './server';

export class ServerDesktop extends Server {
    private documentWatchers: FSWatcher[] = [];

    public static start(): void {
        Server.setServer(new ServerDesktop());
    }

    protected override createConnection(): Connection {
        return createConnection(ProposedFeatures.all);
    }

    protected override createHost(): Host {
        return {
            isDesktop: () => true,
            getDocumentContent: getDocumentContent,
            isGlslangExecutable: DiagnosticProvider.isGlslangExecutable,
            validate: async (di) => {
                const dp = new DiagnosticProvider(di);
                return await dp.validate();
            },
            sendDiagnostics: DiagnosticProvider.sendDiagnostics,
        };
    }

    protected async onInitialize(params: InitializeParams): Promise<InitializeResult> {
        const result = await super.onInitialize(params);
        await DiagnosticProvider.initialize();
        if (DiagnosticProvider.isPullDiagnostics()) {
            result.capabilities.diagnosticProvider = {
                documentSelector: [{ language: 'glsl' }],
                interFileDependencies: false,
                workspaceDiagnostics: true,
            };
        }
        return result;
    }

    protected override async onInitialized(): Promise<void> {
        await super.onInitialized();
        await this.addDocumentWatchers();
    }

    private async addDocumentWatchers(): Promise<void> {
        const workspaceFolders = Server.getServer().getWorkspaceFolders();
        const extensionList = this.getExtensionList();
        for (const workspaceFolder of workspaceFolders) {
            const documentWatcher = watch(`${workspaceFolder}/**/*.{${extensionList}}`);
            this.addDocumentWatcherHandlers(documentWatcher);
            this.documentWatchers.push(documentWatcher);
        }
    }

    private addDocumentWatcherHandlers(documentWatcher: FSWatcher): void {
        documentWatcher.on('add', (uri) => {
            try {
                this.onAddDocumentInDisk(uri);
            } catch (e) {
                sendTelemetryError(e);
                throw e;
            }
        });
        documentWatcher.on('change', (uri) => {
            try {
                this.onChangeDocumentInDisk(uri);
            } catch (e) {
                sendTelemetryError(e);
                throw e;
            }
        });
        documentWatcher.on('unlink', (uri) => {
            try {
                this.onDeleteDocumentInDisk(uri);
            } catch (e) {
                sendTelemetryError(e);
                throw e;
            }
        });
    }

    private onAddDocumentInDisk(uri: DocumentUri): void {
        const di = getDocumentInfo(uri);
        this.analyzeDocumentIfNotOpened(di);
    }

    private onChangeDocumentInDisk(uri: DocumentUri): void {
        const di = getDocumentInfo(uri);
        if (!di.document.isOpened()) {
            di.document.increaseVersion();
        }
        this.analyzeDocumentIfNotOpened(di);
    }

    private onDeleteDocumentInDisk(uri: DocumentUri): void {
        const di = getDocumentInfo(uri);
        const diagnostics = getConfiguration().diagnostics;
        if (diagnostics.enable && diagnostics.workspace) {
            DiagnosticProvider.removeDiagnosticsFrom(di);
        }
        removeDocumentInfo(uri);
    }

    private getExtensionList(): string {
        const fileExtensions = getConfiguration().fileExtensions;
        const extensions = [
            ...fileExtensions.vertexShader,
            ...fileExtensions.tessellationControlShader,
            ...fileExtensions.tessellationEvaluationShader,
            ...fileExtensions.geometryShader,
            ...fileExtensions.fragmentShader,
            ...fileExtensions.computeShader,
        ];
        return extensions.map((ext) => (ext.startsWith('.') ? ext.substring(1) : ext)).join(',');
    }

    private analyzeDocumentIfNotOpened(di: DocumentInfo): void {
        if (!di.document.isOpened()) {
            analyzeDocument(di);
        }
    }

    private refreshDiagnostics(): void {
        if (DiagnosticProvider.isPullDiagnostics()) {
            this.connection.languages.diagnostics.refresh();
        }
    }

    protected override async refreshConfiguration(
        oldConfiguration: Configuration,
        newConfiguration: Configuration
    ): Promise<void> {
        if (oldConfiguration.diagnostics.enable !== newConfiguration.diagnostics.enable) {
            this.diagnosticsEnableChanged(newConfiguration.diagnostics.enable);
        } else if (oldConfiguration.diagnostics.workspace !== newConfiguration.diagnostics.workspace) {
            this.diagnosticsWorkspaceChanged(newConfiguration.diagnostics.workspace);
        } else if (
            oldConfiguration.diagnostics.markTheWholeLine !== newConfiguration.diagnostics.markTheWholeLine ||
            oldConfiguration.compiler.glslVersion !== newConfiguration.compiler.glslVersion ||
            oldConfiguration.compiler.targetEnvironment !== newConfiguration.compiler.targetEnvironment
        ) {
            this.generalConfigurationChanged();
        } else if (extensionsConfigurationChanged(oldConfiguration.fileExtensions, newConfiguration.fileExtensions)) {
            const removedExtensions = onlyInFirstExtensions(
                oldConfiguration.fileExtensions,
                newConfiguration.fileExtensions
            );
            const addedExtensions = onlyInFirstExtensions(
                newConfiguration.fileExtensions,
                oldConfiguration.fileExtensions
            );
            await this.extensionsChanged(removedExtensions, addedExtensions);
        }
    }

    private diagnosticsEnableChanged(enable: boolean): void {
        increaseDiagnosticConfigurationVersion();
        if (enable) {
            analyzeAllDocuments();
        } else {
            forEachDocument((di) => {
                DiagnosticProvider.removeDiagnosticsFrom(di);
            });
        }
        this.refreshDiagnostics();
    }

    private diagnosticsWorkspaceChanged(workspace: boolean): void {
        increaseDiagnosticConfigurationVersion();
        if (workspace) {
            if (getConfiguration().diagnostics.enable) {
                analyzeAllDocuments();
            }
        } else {
            forEachDocument((di) => {
                if (!di.document.isOpened()) {
                    DiagnosticProvider.removeDiagnosticsFrom(di);
                }
            });
        }
        this.refreshDiagnostics();
    }

    private generalConfigurationChanged(): void {
        increaseDiagnosticConfigurationVersion();
        analyzeAllDocuments();
        this.refreshDiagnostics();
    }

    private async extensionsChanged(removedExtensions: string[], addedExtensions: string[]): Promise<void> {
        increaseDiagnosticConfigurationVersion();
        await this.removeDocumentWatchers();
        forEachDocument((di) => {
            if (removedExtensions.some((e) => di.uri.endsWith(e))) {
                DiagnosticProvider.removeDiagnosticsFrom(di);
            }
            if (addedExtensions.some((e) => di.uri.endsWith(e))) {
                analyzeDocument(di);
            }
        });
        await this.addDocumentWatchers();
        this.refreshDiagnostics();
    }

    private async removeDocumentWatchers(): Promise<void> {
        for (const documentWatcher of this.documentWatchers) {
            await documentWatcher.close();
        }
        this.documentWatchers = [];
    }

    protected override onDidClose(event: TextDocumentChangeEvent<TextDocument>): void {
        super.onDidClose(event);
        const diagnostics = getConfiguration().diagnostics;
        if (diagnostics.enable && !diagnostics.workspace) {
            const di = getDocumentInfo(lspUriToFsUri(event.document.uri));
            DiagnosticProvider.removeDiagnosticsFrom(di);
        }
    }

    protected override async onShutdown(): Promise<void> {
        await super.onShutdown();
        await this.removeDocumentWatchers();
    }

    protected override addFeatures(): void {
        super.addFeatures();
        this.connection.languages.diagnostics.on(async (params) => {
            try {
                return await DiagnosticProvider.validateDocument(params);
            } catch (e) {
                sendTelemetryError(e);
                throw e;
            }
        });
        this.connection.languages.diagnostics.onWorkspace(async (params, token, workDoneProgress, resultProgress) => {
            try {
                return await DiagnosticProvider.validateWorkspace(resultProgress, token);
            } catch (e) {
                sendTelemetryError(e);
                throw e;
            }
        });
    }
}

ServerDesktop.start();
