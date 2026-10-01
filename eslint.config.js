/*
 * ESLint (npm run lint): the recommended rules, for the code and the tests.
 * The CI runs along with the tests.
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
                // Functions passed to pupPage.evaluate() run in the browser (WhatsApp Web)
                window: 'readonly',
                document: 'readonly',
                location: 'readonly'
            }
        },
        rules: {
            // catch with an unused error and callback parameters are common and readable here
            'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }]
        }
    },
    {
        // The tests compare the bot's exact output, with the alignment spaces
        files: ['tests/**/*.js'],
        rules: {
            'no-regex-spaces': 'off'
        }
    }
];
