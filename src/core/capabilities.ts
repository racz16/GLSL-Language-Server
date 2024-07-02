import { ClientCapabilities } from 'vscode-languageserver';

export interface Capabilities {
    configurations: boolean;
    diagnostics: boolean;
}

const capabilities: Capabilities = {
    configurations: false,
    diagnostics: false,
};

export function initializeCapabilities(clientCapabilities: ClientCapabilities): void {
    capabilities.configurations = !!clientCapabilities.workspace?.configuration;
    capabilities.diagnostics = !!clientCapabilities.textDocument?.diagnostic;
}

export function getCapabilities(): Capabilities {
    return capabilities;
}
