import {
    BrowserMessageReader,
    BrowserMessageWriter,
    Connection,
    createConnection,
} from 'vscode-languageserver/browser';

import { Configuration } from './core/configuration';
import { setConfiguration } from './core/configuration-manager';
import { GLSL_LANGUAGE_SERVER } from './core/constants';
import { Server } from './server';

export class ServerWeb extends Server {
    public static start(): void {
        Server.setServer(new ServerWeb());
    }

    protected createConnection(): Connection {
        const messageReader = new BrowserMessageReader(self);
        const messageWriter = new BrowserMessageWriter(self);
        return createConnection(messageReader, messageWriter);
    }

    protected async refreshConfiguration(): Promise<void> {
        const configuration: Configuration = await this.connection.workspace.getConfiguration(GLSL_LANGUAGE_SERVER);
        setConfiguration(configuration);
    }
}

ServerWeb.start();
