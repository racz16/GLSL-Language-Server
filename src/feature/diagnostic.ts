import { ChildProcess, exec } from 'child_process';
import { access, chmod, constants } from 'fs/promises';
import { arch, platform } from 'os';
//import { performance } from 'perf_hooks';
import {
    CancellationToken,
    Diagnostic,
    DiagnosticSeverity,
    DocumentDiagnosticParams,
    DocumentDiagnosticReport,
    DocumentUri,
    Position,
    PublishDiagnosticsParams,
    Range,
    ResultProgressReporter,
    WorkspaceDiagnosticReport,
    WorkspaceDiagnosticReportPartialResult,
    WorkspaceDocumentDiagnosticReport,
} from 'vscode-languageserver';

import { getCapabilities } from '../core/capabilities';
import { Configuration, getConfiguration } from '../core/configuration';
import { GLSLANG, NEW_LINE, SPACE } from '../core/constants';
import {
    createDiagnosticVersion,
    DiagnosticVersion,
    DocumentInfo,
    forEachDocument,
    getDocumentInfo,
} from '../core/document-info';
import { getPlatformName } from '../core/node-utility';
//import { addValidationMeasurement } from '../core/telemetry';
import { fsUriToLspUri, lspUriToFsUri } from '../core/utility';
import { Server } from '../server';

type DiagnosticType = 'publish' | 'pull' | null;

export class DiagnosticProvider {
    private static ignoredErrorMessages = ['No code generated', 'Missing entry point'];
    private static glslangName = '';
    private static type: DiagnosticType = null;

    private configuration: Configuration;
    private di: DocumentInfo;
    private sourceCodeRows: string[] = [];
    private diagnostics: Diagnostic[] = [];

    public static async initialize(): Promise<void> {
        const platformName = platform();
        if (DiagnosticProvider.isExecutableAvailable(platformName)) {
            const glslangName = GLSLANG + getPlatformName();
            const executablePath = glslangName;
            const executable = await DiagnosticProvider.makeFileExecutableIfNeeded(executablePath, platformName);
            if (executable) {
                if (platformName === 'win32') {
                    DiagnosticProvider.glslangName = glslangName;
                } else {
                    DiagnosticProvider.glslangName = `./${glslangName}`;
                }
                DiagnosticProvider.setType();
            }
        }
    }

    public static isGlslangExecutable(): boolean {
        return !!DiagnosticProvider.glslangName;
    }

    private static setType(): void {
        const capabilities = getCapabilities();
        if (capabilities.publishDiagnostics) {
            DiagnosticProvider.type = 'publish';
        } else if (capabilities.pullDiagnostics) {
            DiagnosticProvider.type = 'pull';
        }
    }

    public static isPublishDiagnostics(): boolean {
        return DiagnosticProvider.type === 'publish';
    }

    public static isPullDiagnostics(): boolean {
        return DiagnosticProvider.type === 'pull';
    }

    private static isExecutableAvailable(platformName: NodeJS.Platform): boolean {
        return (platformName === 'win32' || platformName === 'linux' || platformName === 'darwin') && arch() === 'x64';
    }

    private static async makeFileExecutableIfNeeded(file: string, platformName: NodeJS.Platform): Promise<boolean> {
        if (platformName === 'win32') {
            return true;
        }
        try {
            await access(file, constants.X_OK);
            return true;
        } catch {
            // file is not executable
            try {
                await chmod(file, 0o755);
                return true;
            } catch {
                // can't make the file executable
                return false;
            }
        }
    }

    public static async validateDocument(params: DocumentDiagnosticParams): Promise<DocumentDiagnosticReport> {
        await Server.getServer().waitUntilInitialized();
        const di = getDocumentInfo(lspUriToFsUri(params.textDocument.uri));
        const dv = createDiagnosticVersion(di);
        if (DiagnosticProvider.diagnosticsValid(di, dv) && params.previousResultId) {
            return {
                kind: 'unchanged',
                resultId: params.previousResultId,
            };
        } else if (!getConfiguration().diagnostics.enable) {
            return {
                kind: 'full',
                resultId: di.diagnostics.increaseVersion().toString(),
                items: [],
            };
        }
        return {
            resultId: di.diagnostics.increaseVersion().toString(),
            kind: 'full',
            items: await di.diagnostics.getDiagnostics(),
        };
    }

    public static async validateWorkspace(
        resultProgress: ResultProgressReporter<WorkspaceDiagnosticReportPartialResult> | undefined,
        token: CancellationToken
    ): Promise<WorkspaceDiagnosticReport> {
        await Server.getServer().waitUntilInitialized();
        const items: WorkspaceDocumentDiagnosticReport[] = [];
        const promises: Promise<Diagnostic[]>[] = [];
        forEachDocument(async (di) => {
            const dv = createDiagnosticVersion(di);
            if (DiagnosticProvider.diagnosticsValid(di, dv) || token.isCancellationRequested) {
                return;
            }
            const item = await DiagnosticProvider.getDiagnosticItem(di, promises);
            items.push(item);
            if (resultProgress) {
                resultProgress.report({
                    items: [item],
                });
            }
            di.diagnostics.setDisplayVersion(dv);
        });
        await Promise.all(promises);
        return { items };
    }

    private static async getDiagnosticItem(
        di: DocumentInfo,
        promises: Promise<Diagnostic[]>[]
    ): Promise<WorkspaceDocumentDiagnosticReport> {
        const configuration = getConfiguration();
        const version = di.diagnostics.increaseVersion();
        if (!configuration.diagnostics.enable || !configuration.diagnostics.workspace) {
            return {
                items: [],
                kind: 'full',
                uri: fsUriToLspUri(di.uri),
                version,
            };
        } else {
            const promise = di.diagnostics.getDiagnostics();
            promises.push(promise);
            const diagnostics = await promise;
            return {
                items: diagnostics,
                kind: 'full',
                uri: fsUriToLspUri(di.uri),
                version,
            };
        }
    }

    private static diagnosticsValid(di: DocumentInfo, dv: DiagnosticVersion): boolean {
        const latestDv = di.diagnostics.getDisplayVersion();
        return !!(
            latestDv &&
            latestDv.configurationVersion >= dv.configurationVersion &&
            latestDv.contentVersion >= dv.contentVersion
        );
    }

    public static sendDiagnostics(di: DocumentInfo, diagnostics: Diagnostic[]): void {
        if (!DiagnosticProvider.isPublishDiagnostics()) {
            return;
        }
        const result: PublishDiagnosticsParams = {
            uri: fsUriToLspUri(di.uri),
            diagnostics,
        };
        if (getCapabilities().publishDiagnosticsVersion) {
            result.version = di.diagnostics.increaseVersion();
        }
        Server.getServer().getConnection().sendDiagnostics(result);
    }

    public static removeDiagnosticsFrom(di: DocumentInfo): void {
        DiagnosticProvider.sendDiagnostics(di, []);
    }

    public constructor(di: DocumentInfo) {
        this.configuration = getConfiguration();
        this.di = di;
    }

    public async validate(): Promise<Diagnostic[]> {
        const shaderStage = this.getShaderStage(this.di.uri);
        if (DiagnosticProvider.glslangName && shaderStage) {
            //const start = performance.now();
            const sourceCode = await this.di.document.getText();
            this.sourceCodeRows = sourceCode.split(NEW_LINE);
            const glslangOutput = await this.runGlslang(shaderStage, sourceCode);
            // if (platform() === 'darwin') {
            //     const diagnostic = Diagnostic.create(
            //         Range.create(Position.create(0, 0), Position.create(1, 0)),
            //         glslangOutput,
            //         DiagnosticSeverity.Error,
            //         undefined,
            //         GLSLANG
            //     );
            //     this.diagnostics.push(diagnostic);
            //     this.diagnostics.push(diagnostic);
            // } else {
            this.addDiagnostics(glslangOutput);
            // }
            //const end = performance.now();
            //const elapsed = end - start;
            //addValidationMeasurement(elapsed);
        }
        return this.diagnostics;
    }

    private getShaderStage(uri: DocumentUri): string | null {
        if (this.configuration.fileExtensions.vertexShader.some((ext) => uri.endsWith(ext))) {
            return 'vert';
        }
        if (this.configuration.fileExtensions.tessellationControlShader.some((ext) => uri.endsWith(ext))) {
            return 'tesc';
        }
        if (this.configuration.fileExtensions.tessellationEvaluationShader.some((ext) => uri.endsWith(ext))) {
            return 'tese';
        }
        if (this.configuration.fileExtensions.geometryShader.some((ext) => uri.endsWith(ext))) {
            return 'geom';
        }
        if (this.configuration.fileExtensions.fragmentShader.some((ext) => uri.endsWith(ext))) {
            return 'frag';
        }
        if (this.configuration.fileExtensions.computeShader.some((ext) => uri.endsWith(ext))) {
            return 'comp';
        }
        return null;
    }

    private async runGlslang(shaderStage: string, sourceCode: string): Promise<string> {
        return new Promise<string>((resolve) => {
            const command = this.createGlslangCommand(shaderStage);
            const process = exec(command, (_, stdout) => {
                resolve(stdout);
            });
            this.provideInput(process, sourceCode);
        });
    }

    private createGlslangCommand(shaderStage: string): string {
        const targetEnvironment = this.configuration.compiler.targetEnvironment
            ? `--target-env ${this.configuration.compiler.targetEnvironment}`
            : '';
        const version = this.configuration.compiler.glslVersion
            ? `--glsl-version ${this.configuration.compiler.glslVersion}`
            : '';
        return `${DiagnosticProvider.glslangName} --stdin -C -l -S ${shaderStage} ${targetEnvironment} ${version}`;
    }

    private provideInput(process: ChildProcess, sourceCode: string): void {
        process.stdin?.write(sourceCode);
        process.stdin?.end();
        // const stdinStream = new Readable();
        // stdinStream.push(sourceCode);
        // stdinStream.push(null);
        // if (process.stdin) {
        //     stdinStream.pipe(process.stdin);
        // }
    }

    private addDiagnostics(glslangOutput: string): void {
        const glslangOutputRows = glslangOutput.split(NEW_LINE);
        for (const glslangOutputRow of glslangOutputRows) {
            this.addDiagnosticForRow(glslangOutputRow.trim());
        }
    }

    private addDiagnosticForRow(glslangOutputRow: string): void {
        const regex =
            /(?<severity>\w+)\s*:\s*((\d+|\w+)\s*:\s*(?<line>\d+)\s*:\s*)?(?:'(?<snippet>.*)'\s*:\s*)?(?<description>.+)/;
        const regexResult = regex.exec(glslangOutputRow);
        if (regexResult?.groups) {
            const severity = regexResult.groups['severity'];
            const line = this.getLine(regexResult.groups['line']);
            const snippet: string | undefined = regexResult.groups['snippet'];
            const description = regexResult.groups['description'];
            const row = this.sourceCodeRows[line];
            if (
                row != null &&
                severity &&
                description &&
                !DiagnosticProvider.ignoredErrorMessages.some((em) => description.includes(em))
            ) {
                this.addDiagnostic(severity, line, row, snippet, description);
            }
        }
    }

    private getLine(lineMatch?: string): number {
        if (!lineMatch) {
            return 0;
        }
        const line = +lineMatch - 1;
        return 0 <= line && line < this.sourceCodeRows.length ? line : 0;
    }

    private addDiagnostic(
        severity: string,
        line: number,
        row: string,
        snippet: string | undefined,
        description: string
    ): void {
        const diagnostic = Diagnostic.create(
            this.getRange(line, row, snippet),
            this.getMessage(description, snippet),
            this.getSeverity(severity),
            undefined, // glslang doesn't provide error codes
            GLSLANG
        );
        this.diagnostics.push(diagnostic);
    }

    private getRange(line: number, row: string, snippet?: string): Range {
        if (this.configuration.diagnostics.markTheWholeLine) {
            return Range.create(Position.create(line, 0), Position.create(line, row.length));
        }
        const processedRow = this.processRow(row, snippet);
        if (snippet) {
            const result = this.getRangeInTheRow(processedRow, line, snippet);
            if (result) {
                return result;
            }
        }
        return this.getTrimmedRange(line, processedRow);
    }

    private getRangeInTheRow(row: string, line: number, snippet: string): Range | null {
        const regExp = this.createSnippetRegExp(snippet);
        let regExpResult: RegExpExecArray | null;
        let first = true;
        let result: Range | null = null;
        while ((regExpResult = regExp.exec(row))) {
            if (!first) {
                return null;
            }
            result = Range.create(
                Position.create(line, regExpResult.index),
                Position.create(line, regExpResult.index + regExpResult[0].length)
            );
            first = false;
        }
        return result;
    }

    private createSnippetRegExp(snippet: string): RegExp {
        if (snippet.match(/^\w+$/g)) {
            return new RegExp(`\\b${snippet}\\b`, 'g');
        } else {
            return new RegExp(snippet, 'g');
        }
    }

    private processRow(line: string, snippet?: string): string {
        const regex = /\/\*.*?\*\/|^(?:[^/]|\/[^*])*\*\/|\/\*(?:[^*]|\*[^/])*$|\/\/.*/g;
        let regexResult: RegExpExecArray | null;
        let result = line;
        if (snippet !== 'line continuation') {
            while ((regexResult = regex.exec(line))) {
                const position = regexResult.index;
                const matchLength = regexResult[0].length;
                result =
                    line.substring(0, position) + SPACE.repeat(matchLength) + line.substring(position + matchLength);
            }
        }
        return result;
    }

    private getTrimmedRange(line: number, row: string): Range {
        const trimmedRow = row.trim();
        const start = Position.create(line, row.indexOf(trimmedRow));
        const end = Position.create(line, start.character + trimmedRow.length);
        return Range.create(start, end);
    }

    private getMessage(description: string, snippet: string | undefined): string {
        return snippet ? `'${snippet}' : ${description}` : description;
    }

    private getSeverity(severity: string): DiagnosticSeverity | undefined {
        if (severity.includes('ERROR')) {
            return DiagnosticSeverity.Error;
        } else if (severity.includes('WARNING')) {
            return DiagnosticSeverity.Warning;
        } else if (severity.includes('UNIMPLEMENTED')) {
            return DiagnosticSeverity.Information;
        } else if (severity.includes('NOTE')) {
            return DiagnosticSeverity.Hint;
        } else {
            return undefined;
        }
    }
}
