export interface Defines {
    [key: string]: string;
}

export interface Configuration {
    diagnostics: {
        enable: boolean;
        markTheWholeLine: boolean;
        delay: number;
    };
    compiler: {
        targetEnvironment: string;
        defines: Defines;
    };
}
