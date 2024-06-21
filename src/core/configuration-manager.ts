import { Configuration } from './configuration';

let configurationSupported = false;
let configuration: Configuration = {
    diagnostics: {
        enable: true,
        markTheWholeLine: false,
        delay: 300,
    },
};

export function initializeConfiguration(configSupported: boolean): void {
    configurationSupported = configSupported;
}

export function isConfigurationSupported(): boolean {
    return configurationSupported;
}

export function getConfiguration(): Configuration {
    return configuration;
}

export function setConfiguration(config: Configuration): void {
    configuration = config;
}
