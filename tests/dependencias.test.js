/*
 * Carrega as dependências reais em um processo isolado, sem conectar ao WhatsApp.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { aplicarPatches } = require('../scripts/aplicar-patches');

test('o lock não instala braces nem a cadeia de patch-package do alerta #36', () => {
    const lock = require('../package-lock.json');
    for (const nome of Object.keys(lock.packages)) {
        assert.doesNotMatch(nome, /(?:^|\/)node_modules\/(braces|patch-package)$/);
    }
});

test('patches reais são aplicados sem repositório, repetíveis e recusam arquivos divergentes', t => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-patches-'));
    t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
    t.mock.method(console, 'log', () => {});
    const projeto = path.join(__dirname, '..');
    fs.cpSync(path.join(projeto, 'patches'), path.join(raiz, 'patches'), { recursive: true });
    const arquivos = [
        'node_modules/tr46/index.js',
        'node_modules/whatwg-url/lib/url-state-machine.js',
        'node_modules/whatsapp-web.js/src/util/Injected/Utils.js'
    ];
    for (const arquivo of arquivos) {
        const destino = path.join(raiz, arquivo);
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.copyFileSync(path.join(projeto, arquivo), destino);
    }
    for (const patch of fs.readdirSync(path.join(raiz, 'patches'))) {
        const resultado = spawnSync('git', ['apply', '--reverse', path.join('patches', patch)], {
            cwd: raiz, encoding: 'utf8'
        });
        assert.equal(resultado.status, 0, resultado.stderr);
    }
    aplicarPatches(raiz);
    const conteudo = arquivos.map(a => fs.readFileSync(path.join(raiz, a), 'utf8'));
    assert.match(conteudo[0], /require\("punycode\/"\)/);
    assert.match(conteudo[1], /require\("punycode\/"\)/);
    assert.match(conteudo[2], /delete message\.__x_id/);
    aplicarPatches(raiz);
    assert.deepEqual(arquivos.map(a => fs.readFileSync(path.join(raiz, a), 'utf8')), conteudo);
    fs.writeFileSync(path.join(raiz, arquivos[0]), 'arquivo incompatível\n');
    assert.throws(() => aplicarPatches(raiz), /Patch incompatível: tr46/);
    assert.equal(fs.readFileSync(path.join(raiz, arquivos[0]), 'utf8'), 'arquivo incompatível\n');
});

test('WhatsApp e URLs internacionais carregam sem o punycode nativo', () => {
    const codigo = `
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
    const resultado = spawnSync(process.execPath, ['--throw-deprecation', '-e', codigo], {
        cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 15000
    });
    assert.equal(resultado.error, undefined);
    assert.equal(resultado.status, 0, resultado.stderr);
    assert.doesNotMatch(resultado.stderr, /DEP0040|punycode.*deprecated/i);
});
