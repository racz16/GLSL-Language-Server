import { Configuration } from './configuration';

export class ConfigurationManager {
	private static configurationSupported = false;
	private static configuration: Configuration = {
		diagnostics: {
			enable: true,
			markTheWholeLine: false,
		},
	};

	public static initialize(configurationSupported: boolean): void {
		this.configurationSupported = configurationSupported;
	}

	public static isConfigurationSupported(): boolean {
		return this.configurationSupported;
	}

	public static getConfiguration(): Configuration {
		return this.configuration;
	}

	public static setConfiguration(configuration: Configuration): void {
		this.configuration = configuration;
	}
}
