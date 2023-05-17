import {
	Diagnostic,
	DiagnosticSeverity,
	Position,
	Range,
	TextDocumentChangeEvent,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { exec, ChildProcess } from 'child_process';
import { Stream } from 'stream';

import path = require('path');
import { connection } from '../server';

export function diagnosticHandle(
	event: TextDocumentChangeEvent<TextDocument>
): void {
	validateTextDocument(event.document);
}

function validateTextDocument(textDocument: TextDocument): void {
	const diagnostics: Diagnostic[] = [];
	const validatorPath = path.join(
		path.dirname(__dirname),
		'res',
		'glslangValidatorWindows'
	);
	const result = exec(`${validatorPath} --stdin -C -S frag`);
	if (result.stdout) {
		result.stdout.on('data', (data: string) => {
			handleErrors(data, diagnostics);
		});
		result.stdout.on('close', () => {
			connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
		});
	}
	provideInput(result, textDocument);
}

function handleErrors(data: string, diagnostics: Diagnostic[]): void {
	const rows = getDiagnosticRows(data);
	for (const row of rows) {
		addDiagnostic(row, diagnostics);
	}
}

function getDiagnosticRows(data: string): Array<string> {
	const rows = data.split('\n');
	const results = new Array<string>();
	for (const row of rows) {
		if (row.startsWith('ERROR: ') || row.startsWith('WARNING: ')) {
			results.push(row);
		} else if (results.length) {
			results[results.length - 1] += ` ${row}`;
		}
	}
	return results;
}

function addDiagnostic(row: string, diagnostics: Diagnostic[]): void {
	if (row.startsWith('ERROR: 0:')) {
		const t1 = row.substring(9);
		const i = t1.indexOf(':');
		const line = +t1.substring(0, i);
		const error = row.substring(9 + i + 2);
		diagnostics.push({
			range: Range.create(
				Position.create(line - 1, 0),
				Position.create(line, 0)
			),
			message: error,
			severity: DiagnosticSeverity.Error,
		});
	} else if (row.startsWith('WARNING: 0:')) {
		const t1 = row.substring(11);
		const i = t1.indexOf(':');
		const line = +t1.substring(0, i);
		if (line > 0) {
			const error = row.substring(11 + i + 2);
			diagnostics.push({
				range: Range.create(
					Position.create(line - 1, 0),
					Position.create(line, 0)
				),
				message: error,
				severity: DiagnosticSeverity.Warning,
			});
		}
	}
}

function provideInput(result: ChildProcess, document: TextDocument): void {
	const stdinStream = new Stream.Readable();
	const text = document.getText();
	stdinStream.push(text);
	stdinStream.push(null);
	if (result.stdin) {
		stdinStream.pipe(result.stdin);
	}
}
