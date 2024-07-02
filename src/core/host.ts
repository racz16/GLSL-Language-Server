import { DocumentUri } from 'vscode-languageserver';

import { DocumentInfo } from './document-info';

export interface Host {
    isDesktop(): boolean;
    getDocumentContent(uri: DocumentUri): Promise<string>;
    validate(di: DocumentInfo): Promise<void>;
}
