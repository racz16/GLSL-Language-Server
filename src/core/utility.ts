import { Diagnostic, DocumentUri } from 'vscode-languageserver';
import { URI } from 'vscode-uri';

import { Server } from '../server';

export function lspUriToFsUri(uri: DocumentUri): DocumentUri {
    return URI.parse(uri).fsPath;
}

export function fsUriToLspUri(uri: DocumentUri): DocumentUri {
    return URI.file(uri).toString();
}

export function arraysEqual(a1: string[], a2: string[]): boolean {
    return a1.length === a2.length && a1.every((item, i) => item === a2[i]);
}

export function sendDiagnostics(uri: DocumentUri, diagnostics: Diagnostic[], version: number): void {
    Server.getServer()
        .getConnection()
        .sendDiagnostics({
            uri: fsUriToLspUri(uri),
            version,
            diagnostics,
        });
}
