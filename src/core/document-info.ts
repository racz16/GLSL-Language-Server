import { platform } from 'os';
import { Diagnostic, DiagnosticSeverity, DocumentUri, Position, Range } from 'vscode-languageserver';

import { Server } from '../server';
import { getConfiguration, getDiagnosticConfigurationVersion } from './configuration';
import { GLSLANG } from './constants';
import { fsUriToLspUri } from './utility';
import { VersionedExecutor } from './versioned-executor';

export interface DocumentInfo {
    document: DocumentContent;
    uri: DocumentUri;
    diagnostics: DocumentDiagnostics;
}

export class DocumentContent {
    private uri: DocumentUri;
    private opened = false;
    private version = 1;
    private versionedContent: VersionedDocumentContent;

    public constructor(uri: DocumentUri) {
        this.uri = uri;
        this.versionedContent = new VersionedDocumentContent(uri);
    }

    public getVersion(): number {
        return this.version;
    }

    public increaseVersion(): void {
        this.version++;
    }

    public isOpened(): boolean {
        return this.opened;
    }

    public setOpened(opened: boolean): void {
        this.opened = opened;
    }

    public getLength(): number | null {
        const vd = this.versionedContent.getVersionedData();
        if (!vd) {
            return null;
        }
        return vd.data.length;
    }

    public async getText(): Promise<string> {
        if (this.opened) {
            const textDocument = Server.getServer().getDocuments().get(fsUriToLspUri(this.uri));
            if (textDocument) {
                return textDocument.getText();
            } else {
                throw new Error('Document is opened, but not managed by the LSP');
            }
        } else {
            return this.versionedContent.getResult(this.version);
        }
    }
}

class VersionedDocumentContent extends VersionedExecutor<string> {
    private uri: DocumentUri;

    public constructor(uri: DocumentUri) {
        super();
        this.uri = uri;
    }

    protected override execute(): Promise<string> {
        return Server.getServer().getHost().getDocumentContent(this.uri);
    }
}

export class DocumentDiagnostics {
    private version = 0;
    private displayVersion?: DiagnosticVersion;
    private uri: DocumentUri;
    private versionedDiagnostics: VersionedDiagnostics;

    public constructor(uri: DocumentUri) {
        this.uri = uri;
        this.versionedDiagnostics = new VersionedDiagnostics(uri);
    }

    public increaseVersion(): number {
        return ++this.version;
    }

    public getDisplayVersion(): DiagnosticVersion | undefined {
        return this.displayVersion;
    }

    public setDisplayVersion(dv: DiagnosticVersion): void {
        this.displayVersion = dv;
    }

    public async getDiagnostics(): Promise<Diagnostic[]> {
        const di = getDocumentInfo(this.uri);
        const dv = createDiagnosticVersion(di);
        return await this.versionedDiagnostics.getResult(dv);
    }
}

class VersionedDiagnostics extends VersionedExecutor<Diagnostic[], DiagnosticVersion> {
    private uri: DocumentUri;

    public constructor(uri: DocumentUri) {
        super();
        this.uri = uri;
    }

    protected override isGreaterOrEqual(v1: DiagnosticVersion, v2: DiagnosticVersion): boolean {
        return v1.contentVersion >= v2.contentVersion && v1.configurationVersion >= v2.configurationVersion;
    }

    protected override async execute(): Promise<Diagnostic[]> {
        const di = getDocumentInfo(this.uri);
        return await Server.getServer().getHost().validate(di);
    }
}

export interface DiagnosticVersion {
    contentVersion: number;
    configurationVersion: number;
}

export function createDiagnosticVersion(di: DocumentInfo): DiagnosticVersion {
    return {
        contentVersion: di.document.getVersion(),
        configurationVersion: getDiagnosticConfigurationVersion(),
    };
}

const documentInfos = new Map<DocumentUri, DocumentInfo>();

export function getDocumentInfo(uri: DocumentUri): DocumentInfo {
    let di = documentInfos.get(uri);
    if (!di) {
        di = {
            uri,
            document: new DocumentContent(uri),
            diagnostics: new DocumentDiagnostics(uri),
        };
        documentInfos.set(uri, di);
    }
    return di;
}

export async function analyzeDocument(di: DocumentInfo): Promise<void> {
    const server = Server.getServer();
    await server.waitUntilInitialized();

    if (platform() === 'darwin') {
        const diagnostic = Diagnostic.create(
            Range.create(Position.create(0, 0), Position.create(1, 0)),
            'asd',
            DiagnosticSeverity.Error,
            undefined,
            GLSLANG
        );
        const diagnostics: Diagnostic[] = [];
        diagnostics.push(diagnostic);
        diagnostics.push(diagnostic);
        server.getHost().sendDiagnostics(di, diagnostics);
    }

    if (!isUriValid(di.uri)) {
        return;
    }
    const configuration = getConfiguration();
    if (
        server.getHost().isDesktop() &&
        configuration.diagnostics.enable &&
        (configuration.diagnostics.workspace || di.document.isOpened())
    ) {
        const diagnostics = await di.diagnostics.getDiagnostics();
        server.getHost().sendDiagnostics(di, diagnostics);
    }
}

export async function analyzeAllDocuments(): Promise<void> {
    forEachDocument((di) => {
        analyzeDocument(di);
    });
}

export function removeDocumentInfo(uri: DocumentUri): void {
    documentInfos.delete(uri);
}

function isUriValid(uri: DocumentUri): boolean {
    const fileExtensions = getConfiguration().fileExtensions;
    return (
        fileExtensions.vertexShader.some((ext) => uri.endsWith(ext)) ||
        fileExtensions.tessellationControlShader.some((ext) => uri.endsWith(ext)) ||
        fileExtensions.tessellationEvaluationShader.some((ext) => uri.endsWith(ext)) ||
        fileExtensions.geometryShader.some((ext) => uri.endsWith(ext)) ||
        fileExtensions.fragmentShader.some((ext) => uri.endsWith(ext)) ||
        fileExtensions.computeShader.some((ext) => uri.endsWith(ext)) ||
        fileExtensions.generalShader.some((ext) => uri.endsWith(ext))
    );
}

export function forEachDocument(handler: (di: DocumentInfo) => void): void {
    documentInfos.forEach((di) => {
        handler(di);
    });
}
