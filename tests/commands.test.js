/*
 * Commands without an external service: /help, /debug, /uptime, /version, /ping,
 * /noffa, /bot e /set.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const packageJson = require('../package.json');
const { OTHERAlt } = bot;

beforeEach(bot.restart);

describe('/help (/h)', () => {
    test('sem argumento: todos os comandos ativos', async () => {
        const [r] = await bot.replyAlt('/help');
        assert.match(r, /MENU DE AJUDA/);
        assert.match(r, /Usage: \/show/);
        assert.match(r, /Usage: \/cotacao/);
        assert.doesNotMatch(r, /Usage: \/monitor/); // disabled in the config
    });

    test('um comando, com ou sem "/", por nome ou alias', async () => {
        for (const line of ['/help show', '/help /show', '/h undo']) {
            const [r] = await bot.replyAlt(line);
            assert.match(r, /AJUDA[\s\S]*Usage: \/show/, line);
        }
    });

    test('comando inexistente', async () => {
        assert.deepEqual(await bot.replyAlt('/help naoexiste'), ['❌ Comando não encontrado: /naoexiste']);
    });

    test('comando desativado por setting some do menu', async () => {
        await bot.setSetting('commands.disabled', 'noffa');
        assert.doesNotMatch((await bot.replyAlt('/help'))[0], /Usage: \/noffa/);
    });
});

describe('/debug (/d, /dbg)', () => {
    test('-on e -off gravam o setting; sem opção mostra o estado', async () => {
        assert.deepEqual(await bot.replyAlt('/debug -on'), ['🪲 Debug Ativado.']);
        assert.equal(bot.getSetting('debug.enabled'), true);
        assert.deepEqual(await bot.replyAlt('/dbg -off'), ['🪲 Debug Desativado.']);
        assert.equal(bot.getSetting('debug.enabled'), false);
        assert.deepEqual(await bot.replyAlt('/d'), ['🪲 Debug Desativado.']);
    });
});

describe('/uptime (/u, /up) e /version (/ver)', () => {
    const banner = new RegExp(`🤖 \\*ZapBot ${packageJson.version.replace('.', '\\.')}\\*[\\s\\S]*⚡ Online:[\\s\\S]*🔐 Conectado:`);

    test('o mesmo banner com a versão em todos os nomes', async () => {
        for (const line of ['/uptime', '/u', '/up', '/version', '/ver']) {
            const [r] = await bot.replyAlt(line);
            assert.match(r, banner, line);
        }
    });

    test('"não conectado" antes de autenticar; tempo depois', async () => {
        bot.estado.autenticadoEm = 0;
        assert.match((await bot.replyAlt('/uptime'))[0], /Conectado: \*não conectado\*/);
        bot.estado.autenticadoEm = Date.now() - 2 * 60 * 1000;
        assert.match((await bot.replyAlt('/uptime'))[0], /Conectado: \*2 minutos, 0 segundos\*/);
    });
});

describe('/noffa', () => {
    test('enfeita os espaços do texto', async () => {
        assert.deepEqual(await bot.replyAlt('/noffa bom dia grupo'), ['bom 🌈 dia 🏳️‍🌈 grupo']);
    });

    test('usa o texto da mensagem respondida', async () => {
        const quoted = bot.createMessage({ texto: 'olá mundo', de: OTHERAlt.jid });
        assert.deepEqual(await bot.replyAlt('/noffa', { citada: quoted }), ['olá 🌈 mundo']);
    });

    test('sem texto mostra a sintaxe', async () => {
        assert.match((await bot.replyAlt('/noffa'))[0], /^Syntax: \/noffa/);
    });

    test('texto começando com "/" ganha um 🌈 na frente (nunca vira comando)', async () => {
        const [r] = await bot.replyAlt('/noffa /cache -c -f');
        assert.ok(r.startsWith('🌈 /cache'));
    });
});

describe('/bot', () => {
    test('sem opção mostra os dois estados', async () => {
        const [r] = await bot.replyAlt('/bot');
        assert.match(r, /▶️ \*Bot:\* ativo/);
        assert.match(r, /🔓 \*Modo admin:\* desligado/);
    });

    test('-off, -on, +admin e -admin gravam os settings', async () => {
        await bot.replyAlt('/bot -off');
        assert.equal(bot.getSetting('bot.paused'), true);
        await bot.replyAlt('/bot -on +admin');
        assert.equal(bot.getSetting('bot.paused'), false);
        assert.equal(bot.getSetting('bot.adminMode'), true);
        const [r] = await bot.replyAlt('/bot -admin');
        assert.equal(bot.getSetting('bot.adminMode'), false);
        assert.match(r, /🔓 \*Modo admin:\* desligado/);
    });

    test('combinações inválidas mostram o uso', async () => {
        for (const line of ['/bot -on -off', '/bot +admin -admin', '/bot xyz']) {
            assert.match((await bot.replyAlt(line))[0], /❌ Uso: \/bot/, line);
        }
    });
});

describe('/set', () => {
    test('sem argumento lista todas as chaves, em ordem', async () => {
        const [r] = await bot.replyAlt('/set');
        const keys = [...r.matchAll(/^([a-z][\w.]+)\s{2}/gm)].map(m => m[1]);
        assert.deepEqual(keys, [...keys].sort());
        assert.ok(keys.includes('show.max') && keys.includes('alerta.max'));
    });

    test('<chave> mostra valor, padrão, tipo e limites', async () => {
        const [r] = await bot.replyAlt('/set show.max');
        assert.match(r, /\*Valor:\* 20\n\*Padrão:\* 20\n\*Tipo:\* number \(1\.\.100\)/);
    });

    test('<chave> <valor> altera; valor inválido é recusado', async () => {
        assert.deepEqual(await bot.replyAlt('/set show.max 10'), ['✅ *show.max* = 10']);
        assert.equal(bot.getSetting('show.max'), 10);
        assert.match((await bot.replyAlt('/set show.max 500'))[0], /❌ Valor inválido para \*show.max\*: precisa estar entre 1 e 100/);
    });

    test('lista: itens separados por espaço; "" esvazia', async () => {
        assert.deepEqual(await bot.replyAlt('/set crypto.coins btc eth'), ['✅ *crypto.coins* = BTC, ETH']);
        assert.deepEqual(await bot.replyAlt('/set commands.disabled ""'), ['✅ *commands.disabled* = (vazio)']);
    });

    test('lista "uma por linha" (watch.rules) usa o texto cru', async () => {
        await bot.replyAlt('/set watch.rules oi, tudo bem\n/pix/i');
        assert.deepEqual(bot.getSetting('watch.rules'), ['oi, tudo bem', '/pix/i']);
        const [r] = await bot.replyAlt('/set watch.rules');
        assert.match(r, /\*Valor:\* \n1\. oi, tudo bem\n2\. \/pix\/i/);
    });

    test('segredo aparece mascarado', async () => {
        assert.deepEqual(await bot.replyAlt('/set openai.api.key sk-abcdef123456'), ['✅ *openai.api.key* = ••••3456']);
        assert.match((await bot.replyAlt('/set'))[0], /openai\.api\.key\s+••••3456/);
    });

    test('-reset volta ao padrão; chave desconhecida', async () => {
        await bot.setSetting('show.max', 5);
        assert.deepEqual(await bot.replyAlt('/set -reset show.max'), ['♻️ *show.max* = 20 _(padrão)_']);
        assert.match((await bot.replyAlt('/set -r naoexiste'))[0], /❌ Setting desconhecido: naoexiste/);
        assert.match((await bot.replyAlt('/set naoexiste 1'))[0], /❌ Setting desconhecido: naoexiste/);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.replyAlt('/set show.max 1', { de: OTHERAlt.jid }), []);
        assert.equal(bot.getSetting('show.max'), 20);
    });
});
