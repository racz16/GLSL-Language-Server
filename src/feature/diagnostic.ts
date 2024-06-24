import { ChildProcess, exec } from 'child_process';
import { Readable } from 'stream';
import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocumentChangeEvent } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Configuration, Defines } from '../core/configuration';
import { getConfiguration } from '../core/configuration-manager';
import { GLSLANG, NEW_LINE, VALIDATABLE_EXTENSIONS } from '../core/constants';
import { getExtension, getPlatformName } from '../core/utility';
import { Server } from '../server';

export class DiagnosticProvider {
    private configuration: Configuration;
    private document: TextDocument;
    private diagnostics: Diagnostic[] = [];

    public static async diagnosticOpenChangeHandler(event: TextDocumentChangeEvent<TextDocument>): Promise<void> {
        if (!getConfiguration().diagnostics.enable) {
            return;
        }
        await new DiagnosticProvider(event.document).onDocumentOpenChange();
    }

    public static async diagnosticConfigurationHandler(document: TextDocument): Promise<void> {
        await new DiagnosticProvider(document).onDocumentOpenChange();
    }

    public static diagnosticCloseHandler(event: TextDocumentChangeEvent<TextDocument>): void {
        new DiagnosticProvider(event.document).onDocumentClose();
    }

    public static isValidationRequired(oldConfiguration: Configuration, newConfiguration: Configuration): boolean {
        return (
            oldConfiguration.diagnostics.enable !== newConfiguration.diagnostics.enable ||
            (newConfiguration.diagnostics.enable &&
                (oldConfiguration.diagnostics.markTheWholeLine !== newConfiguration.diagnostics.markTheWholeLine ||
                    oldConfiguration.compiler.targetEnvironment !== newConfiguration.compiler.targetEnvironment ||
                    !DiagnosticProvider.definesEqual(
                        oldConfiguration.compiler.defines,
                        newConfiguration.compiler.defines
                    )))
        );
    }

    private static definesEqual(oldDefines: Defines, newDefines: Defines): boolean {
        const oldEntries = Object.entries(oldDefines);
        const newEntries = Object.entries(newDefines);
        if (oldEntries.length !== newEntries.length) {
            return false;
        }
        for (let i = 0; i < oldEntries.length; i++) {
            const oldKey = oldEntries[i][0];
            const oldValue = oldEntries[i][1];
            const newKey = newEntries[i][0];
            const newValue = newEntries[i][1];
            if (oldKey !== newKey || oldValue !== newValue) {
                return false;
            }
        }
        return true;
    }

    private static sendDiagnostics(document: TextDocument, diagnostics: Diagnostic[]): void {
        Server.getServer().getConnection().sendDiagnostics({
            uri: document.uri,
            version: document.version,
            diagnostics,
        });
    }

    private constructor(document: TextDocument) {
        this.configuration = getConfiguration();
        this.document = document;
    }

    private async onDocumentOpenChange(): Promise<void> {
        if (!this.configuration.diagnostics.enable) {
            DiagnosticProvider.sendDiagnostics(this.document, []);
            return;
        }
        const platformName = getPlatformName();
        const extension = getExtension(this.document);
        if (platformName && extension && this.isDocumentValidatable(platformName, extension)) {
            await this.validateDocument(platformName, extension);
        }
    }

    private onDocumentClose(): void {
        DiagnosticProvider.sendDiagnostics(this.document, []);
    }

    private isDocumentValidatable(platformName: string | undefined, extension: string | undefined): boolean {
        return !!(platformName && extension && VALIDATABLE_EXTENSIONS.includes(extension));
    }

    private async getGlslangOutput(platformName: string, shaderStage: string): Promise<string> {
        return new Promise<string>((resolve) => {
            const command = this.createGlslangCommand(platformName, shaderStage);
            const process = exec(command, (_, glslangOutput) => {
                resolve(glslangOutput);
            });
            this.provideInput(process);
        });
    }

    private createGlslangCommand(platformName: string, shaderStage: string): string {
        const glslangName = this.getGlslangName(platformName);
        const targetEnvironment = this.configuration.compiler.targetEnvironment
            ? `--target-env ${this.configuration.compiler.targetEnvironment}`
            : '';
        let defines = '';
        const keys = Object.keys(this.configuration.compiler.defines);
        for (const key of keys) {
            defines += `--define-macro ${key}=${this.configuration.compiler.defines[key]} `;
        }
        return `${glslangName} --stdin -C -l -S ${shaderStage} ${targetEnvironment} ${defines}`;
    }

    private async dalayValidation(): Promise<void> {
        const diagnosticDelay = this.configuration.diagnostics.delay;
        return new Promise((resolve) => setTimeout(resolve, diagnosticDelay));
    }

    private async validateDocument(platformName: string, shaderStage: string): Promise<void> {
        await this.dalayValidation();
        const oldVersion = this.document.version;
        const newVersion = Server.getServer().getDocuments().get(this.document.uri)?.version;
        if (oldVersion !== newVersion) {
            return;
        }
        const glslangOutput = await this.getGlslangOutput(platformName, shaderStage);
        this.addDiagnosticsAndSend(glslangOutput);
    }

    private getGlslangName(platformName: string): string {
        return GLSLANG + platformName;
    }

    private addDiagnosticsAndSend(glslangOutput: string): void {
        const glslangOutputRows = glslangOutput.split(NEW_LINE);
        for (const glslangOutputRow of glslangOutputRows) {
            this.addDiagnosticForRow(glslangOutputRow.trim());
        }
        DiagnosticProvider.sendDiagnostics(this.document, this.diagnostics);
    }

    private addDiagnosticForRow(glslangOutputRow: string): void {
        const regex =
            /(?<severity>\w+)\s*:\s*(\d+|\w+)\s*:\s*(?<line>\d+)\s*:\s*'(?<snippet>.*)'\s*:\s*(?<description>.+)/;
        const regexResult = regex.exec(glslangOutputRow);
        if (regexResult?.groups) {
            const severity = regexResult.groups['severity'];
            const line = +regexResult.groups['line'] - 1;
            const snippet: string | undefined = regexResult.groups['snippet'];
            const description = regexResult.groups['description'];
            this.addDiagnostic(severity, line, snippet, description);
        }
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
        const rowRange = Range.create(Position.create(line, 0), Position.create(line + 1, 0));
        const row = this.document.getText(rowRange);
        if (snippet && !this.configuration.diagnostics.markTheWholeLine) {
            const position = row.search(new RegExp(`\\b${snippet}\\b`));
            if (position !== -1) {
                return Range.create(Position.create(line, position), Position.create(line, position + snippet.length));
            }
        }
        return this.getTrimmedRange(line, row);
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

    private provideInput(process: ChildProcess): void {
        const sourceCode = this.document.getText();
        const stdinStream = new Readable();
        stdinStream.push(sourceCode);
        stdinStream.push(null);
        if (process.stdin) {
            stdinStream.pipe(process.stdin);
        }
    }
}
