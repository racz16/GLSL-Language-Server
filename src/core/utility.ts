import { platform } from 'os';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { DOT } from './constants';

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

export function getExtension(document: TextDocument): string | undefined {
    return document.uri.split(DOT).pop();
}
