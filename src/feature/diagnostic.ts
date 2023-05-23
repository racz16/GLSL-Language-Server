import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocumentChangeEvent } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { exec, ChildProcess } from 'child_process';
import { Readable } from 'stream';
import * as path from 'path';

import { connection } from '../server';
import { GLSLANGVALIDATOR, NEW_LINE, VALIDATABLE_EXTENSIONS } from '../core/constants';
import { RES_FOLDER, getExtension, getPlatformName } from '../core/utility';
import { Configuration } from '../core/configuration';
import { ConfigurationManager } from '../core/configuration-manager';

export class DiagnosticProvider {
	private configuration: Configuration;
	private document: TextDocument;
	private diagnostics: Diagnostic[] = [];

	public static diagnosticOpenChangeHandler(event: TextDocumentChangeEvent<TextDocument>): void {
		new DiagnosticProvider(event.document).onDocumentOpenChange();
	}

	public static diagnosticConfigurationHandler(document: TextDocument): void {
		new DiagnosticProvider(document).onDocumentOpenChange();
	}

	public static diagnosticCloseHandler(event: TextDocumentChangeEvent<TextDocument>): void {
		new DiagnosticProvider(event.document).onDocumentClose();
	}

	public static isValidationRequired(oldConfiguration: Configuration, newConfiguration: Configuration): boolean {
		return (
			oldConfiguration.diagnostics.enable !== newConfiguration.diagnostics.enable ||
			(newConfiguration.diagnostics.enable &&
				oldConfiguration.diagnostics.markTheWholeLine !== newConfiguration.diagnostics.markTheWholeLine)
		);
	}

	private static sendDiagnostics(document: TextDocument, diagnostics: Diagnostic[]): void {
		connection.sendDiagnostics({
			uri: document.uri,
			version: document.version,
			diagnostics,
		});
	}

	private constructor(document: TextDocument) {
		this.configuration = ConfigurationManager.getConfiguration();
		this.document = document;
	}

	private onDocumentOpenChange(): void {
		if (!this.configuration.diagnostics.enable) {
			DiagnosticProvider.sendDiagnostics(this.document, []);
			return;
		}
		const platformName = getPlatformName();
		const extension = getExtension(this.document);
		if (this.isDocumentValidatable(platformName, extension)) {
			this.validateDocument(platformName!, extension!);
		}
	}

	private onDocumentClose(): void {
		DiagnosticProvider.sendDiagnostics(this.document, []);
	}

	private isDocumentValidatable(platformName: string | undefined, extension: string | undefined): boolean {
		return !!(platformName && extension && VALIDATABLE_EXTENSIONS.includes(extension));
	}

	private validateDocument(platformName: string, shaderStage: string): void {
		const validatorPath = this.getValidatorPath(platformName);
		const process = exec(`${validatorPath} --stdin -C -S ${shaderStage}`, (_, validatorOutput) => {
			if (DiagnosticProvider.isValidationRequired(this.configuration, ConfigurationManager.getConfiguration())) {
				return;
			}
			this.addDiagnosticsAndSend(validatorOutput);
		});
		this.provideInput(process);
	}

	private getValidatorPath(platformName: string): string {
		return path.join(RES_FOLDER, GLSLANGVALIDATOR + platformName);
	}

	private addDiagnosticsAndSend(validatorOutput: string): void {
		const validatorOutputRows = validatorOutput.split(NEW_LINE);
		for (const validatorOutputRow of validatorOutputRows) {
			this.addDiagnosticForRow(validatorOutputRow.trim());
		}
		DiagnosticProvider.sendDiagnostics(this.document, this.diagnostics);
	}

	private addDiagnosticForRow(validatorOutputRow: string): void {
		const regex = new RegExp(
			"(?<severity>\\w+)\\s*:\\s*(?<column>\\d+)\\s*:\\s*(?<line>\\d+)\\s*:\\s*'(?<snippet>.*)'\\s*:\\s*(?<description>.+)"
		);
		const regexResult = regex.exec(validatorOutputRow);
		if (regexResult?.groups) {
			const validatorSeverity = regexResult.groups['severity'];
			const line = +regexResult.groups['line'] - 1;
			const snippet: string | undefined = regexResult.groups['snippet'];
			const description = regexResult.groups['description'];
			this.addDiagnostic(validatorSeverity, line, snippet, description);
		}
	}

	private addDiagnostic(
		validatorSeverity: string,
		line: number,
		snippet: string | undefined,
		description: string
	): void {
		const diagnostic = Diagnostic.create(
			this.getRange(line, snippet),
			this.getMessage(description, snippet),
			this.getSeverity(validatorSeverity),
			undefined, // glslangValidator doesn't provide error codes
			GLSLANGVALIDATOR
		);
		this.diagnostics.push(diagnostic);
	}

	private getRange(line: number, snippet: string | undefined): Range {
		const rowRange = Range.create(Position.create(line, 0), Position.create(line + 1, 0));
		const row = this.document.getText(rowRange);
		if (snippet && !this.configuration.diagnostics.markTheWholeLine) {
			const position = row.indexOf(snippet);
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

	private getSeverity(validatorSeverity: string): DiagnosticSeverity | undefined {
		if (validatorSeverity.includes('ERROR')) {
			return DiagnosticSeverity.Error;
		} else if (validatorSeverity.includes('WARNING')) {
			return DiagnosticSeverity.Warning;
		} else if (validatorSeverity.includes('UNIMPLEMENTED')) {
			return DiagnosticSeverity.Information;
		} else if (validatorSeverity.includes('NOTE')) {
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
