import { ClientCapabilities } from 'vscode-languageserver';

export interface Capabilities {
    configurations: boolean;
    publishDiagnostics: boolean;
    publishDiagnosticsVersion: boolean;
    pullDiagnostics: boolean;
}

const capabilities: Capabilities = {
    configurations: false,
    publishDiagnostics: false,
    publishDiagnosticsVersion: false,
    pullDiagnostics: false,
};

export function initializeCapabilities(clientCapabilities: ClientCapabilities): void {
    capabilities.configurations = !!clientCapabilities.workspace?.configuration;
    capabilities.publishDiagnostics = !!clientCapabilities.textDocument?.publishDiagnostics;
    capabilities.publishDiagnosticsVersion = !!clientCapabilities.textDocument?.publishDiagnostics?.versionSupport;
    capabilities.pullDiagnostics = !!clientCapabilities.textDocument?.diagnostic;
}

export function getCapabilities(): Capabilities {
    return capabilities;
}
