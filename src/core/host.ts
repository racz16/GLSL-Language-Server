import { Diagnostic, DocumentUri } from 'vscode-languageserver';

import { DocumentInfo } from './document-info';

export interface Host {
    isDesktop(): boolean;
    getDocumentContent(uri: DocumentUri): Promise<string>;
    isGlslangExecutable(): boolean;
    validate(di: DocumentInfo): Promise<Diagnostic[]>;
    sendDiagnostics(di: DocumentInfo, diagnostics: Diagnostic[]): void;
}
