import { readFile } from 'fs/promises';
import { platform } from 'os';
import { DocumentUri } from 'vscode-languageserver';

export function getPlatformName(): string | undefined {
    switch (platform()) {
        case 'win32':
            return 'Windows';
        case 'linux':
            return 'Linux';
        case 'darwin':
            return 'Mac';
        default:
            return undefined;
    }
}

export async function getDocumentContent(uri: DocumentUri): Promise<string> {
    return readFile(uri, { encoding: 'utf-8' });
}
