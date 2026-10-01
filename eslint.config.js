/*
 * ESLint (npm run lint): as regras recomendadas, para o código e os testes.
 * O CI roda junto com os testes.
 */
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: ['node_modules/', 'site/', 'cache/', '.venv-docs/']
    },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                // Funções passadas ao pupPage.evaluate() rodam no browser (WhatsApp Web)
                window: 'readonly',
                document: 'readonly',
                location: 'readonly'
            }
        },
        rules: {
            // catch sem uso do erro e parâmetros de callback são comuns e legíveis aqui
            'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }]
        }
    },
    {
        // Os testes comparam a saída exata do bot, com os espaços de alinhamento
        files: ['tests/**/*.js'],
        rules: {
            'no-regex-spaces': 'off'
        }
    }
];
