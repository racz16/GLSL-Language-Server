import { DocumentUri } from 'vscode-languageserver';
import { URI } from 'vscode-uri';

export function lspUriToFsUri(uri: DocumentUri): DocumentUri {
    return URI.parse(uri).fsPath;
}

export function fsUriToLspUri(uri: DocumentUri): DocumentUri {
    return URI.file(uri).toString();
}

export function arraysEqual<T>(a1: T[], a2: T[]): boolean {
    return a1.length === a2.length && a1.every((item, i) => item === a2[i]);
}

export function onlyInFirstArray<T>(a1: T[], a2: T[]): T[] {
    const result: T[] = [];
    for (const item of a1) {
        if (!a2.includes(item)) {
            result.push(item);
        }
    }
    return result;
}
