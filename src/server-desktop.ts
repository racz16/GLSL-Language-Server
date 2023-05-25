import { Connection, ProposedFeatures, createConnection } from 'vscode-languageserver/node';
import { GLSL_LANGUAGE_SERVER } from './core/constants';
import { DiagnosticProvider } from './feature/diagnostic';

import { Configuration } from './core/configuration';
import { ConfigurationManager } from './core/configuration-manager';
import { Server } from './server';

export class ServerDesktop extends Server {
	public static start(): void {
		Server.setServer(new ServerDesktop());
	}

	protected createConnection(): Connection {
		return createConnection(ProposedFeatures.all);
	}

	protected addFeatures(): void {
		super.addFeatures();
		this.documents.onDidChangeContent(DiagnosticProvider.diagnosticOpenChangeHandler);
		this.documents.onDidClose(DiagnosticProvider.diagnosticCloseHandler);
	}

	protected async refreshConfiguration(): Promise<void> {
		const oldConfiguration = ConfigurationManager.getConfiguration();
		const newConfiguration: Configuration = await this.connection.workspace.getConfiguration(GLSL_LANGUAGE_SERVER);
		ConfigurationManager.setConfiguration(newConfiguration);
		if (DiagnosticProvider.isValidationRequired(oldConfiguration, newConfiguration)) {
			this.documents.all().forEach(async (document) => {
				await DiagnosticProvider.diagnosticConfigurationHandler(document);
			});
		}
	}
}

ServerDesktop.start();
