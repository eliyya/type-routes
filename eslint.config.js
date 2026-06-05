import tseslint from 'typescript-eslint'
import importX from 'eslint-plugin-import-x'

export default tseslint.config(
    { ignores: ['dist'] },
    {
        extends: [
            ...tseslint.configs.recommended,
            importX.flatConfigs.recommended,
        ],
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: ['./tsconfig.json', './tsconfig.test.json'],
            },
        },
        settings: {
            'import-x/resolver': {
                typescript: true,
            },
        },
        rules: {},
    },
)
