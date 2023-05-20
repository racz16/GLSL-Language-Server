import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocumentChangeEvent } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { exec, ChildProcess } from 'child_process';
import { Readable } from 'stream';
import * as path from 'path';

import { connection } from '../server';
import { GLSLANGVALIDATOR, NEW_LINE, VALIDATABLE_EXTENSIONS } from '../core/constants';
import { RES_FOLDER, getExtension, getPlatformName } from '../core/utility';

export class DiagnosticProvider {
	public static diagnosticOpenChangeHandler(event: TextDocumentChangeEvent<TextDocument>): void {
		new DiagnosticProvider().onDocumentOpenChange(event.document);
	}

	public static diagnosticCloseHandler(event: TextDocumentChangeEvent<TextDocument>): void {
		new DiagnosticProvider().onDocumentClose(event.document);
	}

	private onDocumentOpenChange(document: TextDocument): void {
		const platformName = getPlatformName();
		const extension = getExtension(document);
		if (this.isDocumentValidatable(platformName, extension)) {
			this.validateDocument(document, platformName!, extension!);
		}
	}

	private onDocumentClose(document: TextDocument): void {
		connection.sendDiagnostics({
			uri: document.uri,
			version: document.version,
			diagnostics: [],
		});
	}

	private isDocumentValidatable(platformName: string | undefined, extension: string | undefined): boolean {
		return !!(platformName && extension && VALIDATABLE_EXTENSIONS.includes(extension));
	}

	private validateDocument(document: TextDocument, platformName: string, shaderStage: string): void {
		const validatorPath = this.getValidatorPath(platformName);
		const process = exec(`${validatorPath} --stdin -C -S ${shaderStage}`, (_, validatorOutput) => {
			const diagnostics = this.getDiagnostics(validatorOutput, document);
			connection.sendDiagnostics({
				uri: document.uri,
				version: document.version,
				diagnostics,
			});
		});
		this.provideInput(process, document.getText());
	}

	private getValidatorPath(platformName: string): string {
		return path.join(RES_FOLDER, GLSLANGVALIDATOR + platformName);
	}

	private getDiagnostics(validatorOutput: string, document: TextDocument): Diagnostic[] {
		const diagnostics: Diagnostic[] = [];
		const validatorOutputRows = validatorOutput.split(NEW_LINE);
		for (const validatorOutputRow of validatorOutputRows) {
			this.addDiagnosticForRow(validatorOutputRow.trim(), document, diagnostics);
		}
		return diagnostics;
	}

	private addDiagnosticForRow(validatorOutputRow: string, document: TextDocument, diagnostics: Diagnostic[]): void {
		const regex = new RegExp(
			"(?<severity>\\w+)\\s*:\\s*(?<column>\\d+)\\s*:\\s*(?<line>\\d+)\\s*:\\s*'(?<snippet>.*)'\\s*:\\s*(?<description>.+)"
		);
		const regexResult = regex.exec(validatorOutputRow);
		if (regexResult?.groups) {
			const validatorSeverity = regexResult.groups['severity'];
			const line = +regexResult.groups['line'] - 1;
			const snippet: string | undefined = regexResult.groups['snippet'];
			const description = regexResult.groups['description'];
			this.addDiagnostic(validatorSeverity, line, snippet, description, document, diagnostics);
		}
	}

	private addDiagnostic(
		validatorSeverity: string,
		line: number,
		snippet: string | undefined,
		description: string,
		document: TextDocument,
		diagnostics: Diagnostic[]
	): void {
		const diagnostic = Diagnostic.create(
			this.getRange(line, snippet, document),
			this.getMessage(description, snippet),
			this.getSeverity(validatorSeverity),
			undefined, // glslangValidator doesn't provide error codes
			GLSLANGVALIDATOR
		);
		diagnostics.push(diagnostic);
	}

	private getRange(line: number, snippet: string | undefined, document: TextDocument): Range {
		const rowRange = Range.create(Position.create(line, 0), Position.create(line + 1, 0));
		const row = document.getText(rowRange);
		if (snippet) {
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

	private provideInput(process: ChildProcess, sourceCode: string): void {
		const stdinStream = new Readable();
		stdinStream.push(sourceCode);
		stdinStream.push(null);
		if (process.stdin) {
			stdinStream.pipe(process.stdin);
		}
	}
}
