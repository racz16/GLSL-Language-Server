/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
//@ts-check
'use strict';
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require('path');
const child_process = require('child_process');

module.exports = (_env, argv) => {
    const isProductionMode = argv.mode === 'production';

    /** @type WebpackConfig */
    const serverWebConfig = {
        context: path.join(__dirname),
        mode: 'none',
        target: 'webworker',
        entry: './src/server-web.ts',
        output: {
            filename: 'server-web.js',
            path: path.join(__dirname, 'out'),
            libraryTarget: 'var',
            library: 'serverExportVar',
        },
        resolve: {
            mainFields: ['module', 'main'],
            extensions: ['.ts', '.js'],
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: 'ts-loader',
                        },
                    ],
                },
            ],
        },
        externals: {
            vscode: 'commonjs vscode',
        },
        performance: {
            hints: false,
        },
        devtool: isProductionMode ? false : 'source-map',
    };

    /**@type {import('webpack').Configuration}*/
    const serverDesktopConfig = {
        context: path.join(__dirname),
        mode: isProductionMode ? 'production' : 'development',
        target: 'node',
        entry: './src/server-desktop.ts',
        output: {
            filename: 'server-desktop.js',
            path: path.resolve(__dirname, 'out'),
            libraryTarget: 'commonjs2',
            devtoolModuleFilenameTemplate: '../[resource-path]',
        },
        resolve: {
            extensions: ['.ts', '.js'],
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: 'ts-loader',
                        },
                    ],
                },
            ],
        },
        externals: {
            vscode: 'commonjs vscode',
            fsevents: "require('fsevents')",
        },
        devtool: isProductionMode ? false : 'source-map',
    };

    if (isProductionMode) {
        serverDesktopConfig.plugins = [
            {
                /**@type {import('webpack').WebpackPluginFunction}*/
                apply: (compiler) => {
                    compiler.hooks.afterEmit.tap('AfterEmitPlugin', () => {
                        child_process.exec(
                            'npx pkg -t node14-win-x64,node14-linux-x64,node14-macos-x64 --out-path bin out/server-desktop.js',
                            { cwd: __dirname },
                            (_err, stdout, stderr) => {
                                if (stdout) process.stdout.write(stdout);
                                if (stderr) process.stderr.write(stderr);
                            }
                        );
                    });
                },
            },
        ];
    }
    return [serverDesktopConfig, serverWebConfig];
};
