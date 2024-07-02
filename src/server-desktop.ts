import { FSWatcher, watch } from 'chokidar';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Connection, ProposedFeatures, TextDocumentChangeEvent, createConnection } from 'vscode-languageserver/node';

import {
    Configuration,
    extensionsConfigurationChanged,
    getConfiguration,
    increaseDiagnosticConfigurationVersion,
} from './core/configuration';
import {
    DocumentInfo,
    analyzeAllDocuments,
    analyzeDocument,
    forEachDocument,
    getDocumentInfo,
    removeDocumentInfo,
    removeInvalidDocumentInfos,
} from './core/document-info';
import { Host } from './core/host';
import { getDocumentContent } from './core/node-utility';
import { lspUriToFsUri, sendDiagnostics } from './core/utility';
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
            isDesktop: () => {
                return true;
            },
            getDocumentContent: getDocumentContent,
            validate: async (di) => {
                const dp = new DiagnosticProvider(di);
                await dp.validate();
            },
        };
    }

    protected override async onInitialized(): Promise<void> {
        await super.onInitialized();
        await DiagnosticProvider.initialize();
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
            const di = getDocumentInfo(uri);
            this.analyzeDocumentIfNotOpened(di);
        });
        documentWatcher.on('change', (uri) => {
            const di = getDocumentInfo(uri);
            di.document.increaseVersion();
            this.analyzeDocumentIfNotOpened(di);
        });
        documentWatcher.on('unlink', (uri) => {
            const di = getDocumentInfo(uri);
            const diagnostics = getConfiguration().diagnostics;
            if (diagnostics.enable && diagnostics.workspace) {
                this.removeDiagnosticsFrom(di);
            }
            removeDocumentInfo(uri);
        });
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

    private removeDiagnosticsFrom(di: DocumentInfo): void {
        sendDiagnostics(di.uri, [], di.diagnostics.increaseVersion());
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
            increaseDiagnosticConfigurationVersion();
            analyzeAllDocuments();
        } else if (extensionsConfigurationChanged(oldConfiguration.fileExtensions, newConfiguration.fileExtensions)) {
            await this.extensionsChanged();
        }
    }

    private diagnosticsEnableChanged(enable: boolean): void {
        increaseDiagnosticConfigurationVersion();
        if (enable) {
            analyzeAllDocuments();
        } else {
            forEachDocument((di) => {
                this.removeDiagnosticsFrom(di);
            });
        }
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
                    this.removeDiagnosticsFrom(di);
                }
            });
        }
    }

    private async extensionsChanged(): Promise<void> {
        increaseDiagnosticConfigurationVersion();
        await this.removeDocumentWatchers();
        forEachDocument((di) => {
            this.removeDiagnosticsFrom(di);
        });
        removeInvalidDocumentInfos();
        await this.addDocumentWatchers();
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
            this.removeDiagnosticsFrom(di);
        }
    }

    protected override async onShutdown(): Promise<void> {
        await super.onShutdown();
        await this.removeDocumentWatchers();
    }
}

ServerDesktop.start();
