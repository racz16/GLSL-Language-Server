/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
//@ts-check
'use strict';
//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require('path');

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
    devtool: 'source-map',
};

/**@type {import('webpack').Configuration}*/
const serverDesktopConfig = {
    context: path.join(__dirname),
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
    },
    devtool: 'source-map',
};

module.exports = [serverDesktopConfig, serverWebConfig];
