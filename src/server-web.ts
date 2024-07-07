import {
    BrowserMessageReader,
    BrowserMessageWriter,
    Connection,
    createConnection,
} from 'vscode-languageserver/browser';

import { Configuration, extensionsConfigurationChanged } from './core/configuration';
import { analyzeAllDocuments } from './core/document-info';
import { Host } from './core/host';
import { Server } from './server';

export class ServerWeb extends Server {
    public static start(): void {
        Server.setServer(new ServerWeb());
    }

    protected override createConnection(): Connection {
        const messageReader = new BrowserMessageReader(self);
        const messageWriter = new BrowserMessageWriter(self);
        return createConnection(messageReader, messageWriter);
    }

    protected override createHost(): Host {
        return {
            isDesktop: () => {
                return false;
            },
            getDocumentContent: async () => {
                return '';
            },
            validate: async () => [],
            sendDiagnostics: () => {},
        };
    }

    protected override async refreshConfiguration(
        oldConfiguration: Configuration,
        newConfiguration: Configuration
    ): Promise<void> {
        if (
            oldConfiguration.compiler.glslVersion !== newConfiguration.compiler.glslVersion ||
            oldConfiguration.compiler.targetEnvironment !== newConfiguration.compiler.targetEnvironment ||
            extensionsConfigurationChanged(oldConfiguration.fileExtensions, newConfiguration.fileExtensions)
        ) {
            analyzeAllDocuments();
        }
    }
}

ServerWeb.start();
