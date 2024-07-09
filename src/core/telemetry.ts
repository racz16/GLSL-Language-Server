import { Server } from '../server';
import { getConfiguration } from './configuration';
import { forEachDocument } from './document-info';

let validationCount = 0;
let validationTimeSum = 0;

interface TelemetryResult {
    type: 'report';
    stringData: StringTelemetryResult;
    numberData: NumberTelemetryResult;
}

interface StringTelemetryResult {
    configurationTargetEnvironment: string;
    configurationGlslVersion: string;
}

interface NumberTelemetryResult {
    documentCount: number;
    averageDocumentLength: number;
    configurationDiagnosticsEnabled: number;
    configurationWorkspaceDiagnostics: number;
    configurationMarkTheWholeLine: number;
    glslangExecutable: number;
    validationCount: number;
    averageValidationTime: number;
}

interface TelemetryErrorResult {
    type: 'error';
    stringData: StringTelemetryErrorResult;
    numberData: NumberTelemetryErrorResult;
}

interface StringTelemetryErrorResult {
    name: string;
    message: string;
    stackTrace: string;
}

interface NumberTelemetryErrorResult {}

export function addValidationMeasurement(validationTime: number): void {
    validationCount++;
    validationTimeSum += validationTime;
}

export function getTelemetryResult(): TelemetryResult {
    let documentCount = 0;
    let loadedDocumentCount = 0;
    let documentLengthSum = 0;
    forEachDocument((di) => {
        documentCount++;
        const length = di.document.getLength();
        if (length !== null) {
            documentLengthSum += length;
            loadedDocumentCount++;
        }
    });
    const configuration = getConfiguration();
    return {
        type: 'report',
        stringData: {
            configurationGlslVersion: configuration.compiler.glslVersion,
            configurationTargetEnvironment: configuration.compiler.targetEnvironment,
        },
        numberData: {
            documentCount,
            averageDocumentLength: documentLengthSum / loadedDocumentCount,
            configurationDiagnosticsEnabled: +configuration.diagnostics.enable,
            configurationMarkTheWholeLine: +configuration.diagnostics.markTheWholeLine,
            configurationWorkspaceDiagnostics: +configuration.diagnostics.workspace,
            glslangExecutable: +Server.getServer().getHost().isGlslangExecutable(),
            validationCount,
            averageValidationTime: validationTimeSum / validationCount,
        },
    };
}

export function sendTelemetryError(e: unknown): void {
    const ter = getTelemetryErrorResult(e);
    if (ter) {
        Server.getServer().sendTelemetry(ter);
    }
}

function getTelemetryErrorResult(error: unknown): TelemetryErrorResult | null {
    if (error instanceof Error) {
        const stackTrace = error.stack
            ? error.stack.replace(/(?:[a-zA-Z]:)?(?:[\\/][^\\/:*?"<>|]+)+[\\/]?/g, '<path>')
            : '';
        return createTelemetryErrorResult(error.message, error.name, stackTrace);
    } else if (typeof error === 'string') {
        return createTelemetryErrorResult(error);
    }
    return null;
}

function createTelemetryErrorResult(message: string, name = '', stackTrace = ''): TelemetryErrorResult {
    return {
        type: 'error',
        stringData: {
            name,
            message,
            stackTrace,
        },
        numberData: {},
    };
}
