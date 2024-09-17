// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.strict,
    {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
        },
        rules: {
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'enumMember',
                    format: ['UPPER_CASE'],
                },
                {
                    selector: 'typeLike',
                    format: ['PascalCase'],
                },
                {
                    selector: 'variableLike',
                    format: ['camelCase'],
                },
                {
                    selector: 'variable',
                    modifiers: ['global', 'exported', 'const'],
                    format: ['UPPER_CASE'],
                },
                {
                    selector: 'parameter',
                    modifiers: ['unused'],
                    format: ['camelCase'],
                    leadingUnderscore: 'allow',
                },
                {
                    selector: 'property',
                    format: ['camelCase'],
                },
                {
                    selector: 'property',
                    modifiers: ['readonly'],
                    format: ['UPPER_CASE'],
                },
                {
                    selector: 'method',
                    format: ['camelCase'],
                },
            ],
            eqeqeq: ['error', 'smart'],
            curly: 'warn',
        },
    },
    {
        ignores: ['node_modules', 'out', '**/*.js', '**/*.d.ts'],
    }
);
