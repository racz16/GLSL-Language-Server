import { ChildProcess, exec } from 'child_process';
import { access, chmod, constants } from 'fs/promises';
import { arch, platform } from 'os';
import { Readable } from 'stream';
import { Diagnostic, DiagnosticSeverity, DocumentUri, Position, Range } from 'vscode-languageserver';

import { Configuration, getConfiguration } from '../core/configuration';
import { GLSLANG, NEW_LINE, SPACE } from '../core/constants';
import { DocumentInfo } from '../core/document-info';
import { getPlatformName } from '../core/node-utility';
import { sendDiagnostics } from '../core/utility';

export class DiagnosticProvider {
    private static ignoredErrorMessages = ['No code generated', 'Missing entry point'];
    private static glslangName = '';

    private configuration: Configuration;
    private di: DocumentInfo;
    private sourceCodeRows: string[] = [];
    private version: number;
    private diagnostics: Diagnostic[] = [];

    public static async initialize(): Promise<void> {
        const platformName = platform();
        if (DiagnosticProvider.isExecutableAvailable(platformName)) {
            const glslangName = GLSLANG + getPlatformName();
            const executablePath = glslangName;
            const executable = await DiagnosticProvider.makeFileExecutableIfNeeded(executablePath, platformName);
            if (executable) {
                DiagnosticProvider.glslangName = glslangName;
            }
        }
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
        } catch (e1) {
            // file is not executable
            try {
                await chmod(file, 0o755);
                return true;
            } catch (e2) {
                // can't make the file executable
                return false;
            }
        }
    }

    public constructor(di: DocumentInfo) {
        this.configuration = getConfiguration();
        this.di = di;
        this.version = di.diagnostics.increaseVersion();
    }

    public async validate(): Promise<void> {
        const shaderStage = this.getShaderStage(this.di.uri);
        if (DiagnosticProvider.glslangName && shaderStage) {
            const sourceCode = await this.di.document.getText();
            this.sourceCodeRows = sourceCode.split(NEW_LINE);
            const glslangOutput = await this.runGlslang(shaderStage, sourceCode);
            this.addDiagnosticsAndSend(glslangOutput);
        }
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
            const process = exec(command, (_, glslangOutput) => {
                resolve(glslangOutput);
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
        const stdinStream = new Readable();
        stdinStream.push(sourceCode);
        stdinStream.push(null);
        if (process.stdin) {
            stdinStream.pipe(process.stdin);
        }
    }

    private addDiagnosticsAndSend(glslangOutput: string): void {
        const glslangOutputRows = glslangOutput.split(NEW_LINE);
        for (const glslangOutputRow of glslangOutputRows) {
            this.addDiagnosticForRow(glslangOutputRow.trim());
        }
        sendDiagnostics(this.di.uri, this.diagnostics, this.version);
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
            if (!DiagnosticProvider.ignoredErrorMessages.some((em) => description.includes(em))) {
                this.addDiagnostic(severity, line, snippet, description);
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

    private addDiagnostic(severity: string, line: number, snippet: string | undefined, description: string): void {
        const diagnostic = Diagnostic.create(
            this.getRange(line, snippet),
            this.getMessage(description, snippet),
            this.getSeverity(severity),
            undefined, // glslang doesn't provide error codes
            GLSLANG
        );
        this.diagnostics.push(diagnostic);
    }

    private getRange(line: number, snippet: string | undefined): Range {
        const row = this.replaceComments(this.sourceCodeRows[line]);
        if (snippet && !this.configuration.diagnostics.markTheWholeLine) {
            const position = row.search(new RegExp(`\\b${snippet}\\b`));
            if (position !== -1) {
                return Range.create(Position.create(line, position), Position.create(line, position + snippet.length));
            }
        }
        return this.getTrimmedRange(line, row);
    }

    private replaceComments(line: string): string {
        const regex = /\/\*.*?\*\/|^(?:[^/]|\/[^*])*\*\/|\/\*(?:[^*]|\*[^/])*$|\/\/.*/g;
        let regexResult: RegExpExecArray | null;
        while ((regexResult = regex.exec(line))) {
            const position = regexResult.index;
            const matchLength = regexResult[0].length;
            line = line.substring(0, position) + SPACE.repeat(matchLength) + line.substring(position + matchLength);
        }
        return line;
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
