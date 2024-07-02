import { arraysEqual } from './utility';

export interface Configuration {
    diagnostics: DiagnosticsConfiguration;
    compiler: CompilerConfiguration;
    fileExtensions: FileExtensionsConfiguration;
}

interface DiagnosticsConfiguration {
    enable: boolean;
    workspace: boolean;
    markTheWholeLine: boolean;
}

interface CompilerConfiguration {
    glslVersion: string;
    targetEnvironment: string;
}

export interface FileExtensionsConfiguration {
    vertexShader: string[];
    tessellationControlShader: string[];
    tessellationEvaluationShader: string[];
    geometryShader: string[];
    fragmentShader: string[];
    computeShader: string[];
    generalShader: string[];
}

let diagnosticConfigurationVersion = 1;
let configuration: Configuration = {
    diagnostics: {
        enable: true,
        workspace: true,
        markTheWholeLine: false,
    },
    compiler: {
        glslVersion: '',
        targetEnvironment: '',
    },
    fileExtensions: {
        vertexShader: ['.vert'],
        tessellationControlShader: ['.tesc'],
        tessellationEvaluationShader: ['.tese'],
        geometryShader: ['.geom'],
        fragmentShader: ['.frag'],
        computeShader: ['.comp'],
        generalShader: ['.glsl'],
    },
};

export function getConfiguration(): Configuration {
    return configuration;
}

export function setConfiguration(config: Configuration): void {
    configuration = config;
}

export function getDiagnosticConfigurationVersion(): number {
    return diagnosticConfigurationVersion;
}

export function increaseDiagnosticConfigurationVersion(): void {
    diagnosticConfigurationVersion++;
}

export function extensionsConfigurationChanged(
    oldExtensions: FileExtensionsConfiguration,
    newExtensions: FileExtensionsConfiguration
): boolean {
    return !(
        arraysEqual(oldExtensions.vertexShader, newExtensions.vertexShader) &&
        arraysEqual(oldExtensions.tessellationControlShader, newExtensions.tessellationControlShader) &&
        arraysEqual(oldExtensions.tessellationEvaluationShader, newExtensions.tessellationEvaluationShader) &&
        arraysEqual(oldExtensions.geometryShader, newExtensions.geometryShader) &&
        arraysEqual(oldExtensions.fragmentShader, newExtensions.fragmentShader) &&
        arraysEqual(oldExtensions.computeShader, newExtensions.computeShader)
    );
}
