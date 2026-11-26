/*
 * Loads the real dependencies in an isolated process, without connecting to WhatsApp.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { applyPatches } = require('../scripts/apply-patches');

test('o lock não instala braces nem a cadeia de patch-package do alerta #36', () => {
    const lock = require('../package-lock.json');
    for (const nameAlt of Object.keys(lock.packages)) {
        assert.doesNotMatch(nameAlt, /(?:^|\/)node_modules\/(braces|patch-package)$/);
    }
});

test('patches reais são aplicados sem repositório, repetíveis e recusam arquivos divergentes', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-patches-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    t.mock.method(console, 'log', () => {});
    const project = path.join(__dirname, '..');
    fs.cpSync(path.join(project, 'patches'), path.join(root, 'patches'), { recursive: true });
    const files = [
        'node_modules/tr46/index.js',
        'node_modules/whatwg-url/lib/url-state-machine.js',
        'node_modules/whatsapp-web.js/src/Client.js'
    ];
    for (const fileAlt of files) {
        const destination = path.join(root, fileAlt);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(project, fileAlt), destination);
    }
    for (const patch of fs.readdirSync(path.join(root, 'patches'))) {
        const resultAlt = spawnSync('git', ['apply', '--reverse', path.join('patches', patch)], {
            cwd: root, encoding: 'utf8'
        });
        assert.equal(resultAlt.status, 0, resultAlt.stderr);
    }
    applyPatches(root);
    const content = files.map(a => fs.readFileSync(path.join(root, a), 'utf8'));
    assert.match(content[0], /require\("punycode\/"\)/);
    assert.match(content[1], /require\("punycode\/"\)/);
    // the new /login/ page of WhatsApp Web (no WAWebSocketModel): the state from the BackendEventBus
    assert.match(content[2], /zapbot patch: the \/login\/ page of WhatsApp Web/);
    assert.match(content[2], /BackendEventBus\?\.socketState/);
    applyPatches(root);
    assert.deepEqual(files.map(a => fs.readFileSync(path.join(root, a), 'utf8')), content);
    fs.writeFileSync(path.join(root, files[0]), 'arquivo incompatível\n');
    assert.throws(() => applyPatches(root), /Patch incompatível: tr46/);
    assert.equal(fs.readFileSync(path.join(root, files[0]), 'utf8'), 'arquivo incompatível\n');
});

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
