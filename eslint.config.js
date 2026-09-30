import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
    { ignores: ['dist', 'node_modules', 'relay', '.claude'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: { ...globals.browser },
        },
        plugins: { 'react-hooks': reactHooks },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            // Replacing `any` with real types is ongoing work; keep it visible without failing the lint
            '@typescript-eslint/no-explicit-any': 'warn',
            // `_name` marks a value that is deliberately unused, e.g. `const { polygon: _polygon, ...rest } = room`
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true,
            }],
        },
    },
    {
        // Runs in Node: the MCP bridge/helper, Vite config and tests
        files: ['mcp/**/*.ts', 'vite.config.ts', '**/*.test.ts'],
        languageOptions: { globals: { ...globals.node } },
    },
);
