/*
 * Loads the real dependencies in an isolated process, without connecting to WhatsApp.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('WhatsApp e URLs internacionais carregam sem o punycode nativo', () => {
    const codeAlt = `
        const assert = require('node:assert/strict');
        const Module = require('node:module');
        const carregar = Module._load;
        Module._load = function (pedido, ...args) {
            if (pedido === 'punycode' || pedido === 'node:punycode') {
                throw new Error('Dependência tentou carregar o punycode nativo');
            }
            return carregar.call(this, pedido, ...args);
        };
        require('whatsapp-web.js');
        const { URL } = require('whatwg-url');
        assert.equal(new URL('https://mañana.com/chuva').hostname, 'xn--maana-pta.com');
        assert.equal(require('tr46').toASCII('mañana.com'), 'xn--maana-pta.com');
        assert.equal(new URL('https://exemplo.com/chuva').pathname, '/chuva');
    `;
    const resultAlt = spawnSync(process.execPath, ['--throw-deprecation', '-e', codeAlt], {
        cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 15000
    });
    assert.equal(resultAlt.error, undefined);
    assert.equal(resultAlt.status, 0, resultAlt.stderr);
    assert.doesNotMatch(resultAlt.stderr, /DEP0040|punycode.*deprecated/i);
});
