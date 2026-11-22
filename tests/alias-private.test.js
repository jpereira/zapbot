/*
 * /alias -private|-p: an alias only the owner sees and runs.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt, OWNER } = bot;
const { aliasNameOf } = bot.src('zb');

const FULANO = { de: OTHERAlt.jid };
const OWNER_CHAT = { chat: OWNER.jid };

beforeEach(async () => {
    await bot.restart();
    await bot.setSetting('bot.users', [OTHERAlt.user]);
});

describe('/alias -p', () => {
    test('cria privado (com -q, em qualquer ordem), torna privado o que existe e -public tira o cadeado', async () => {
        assert.match((await bot.replyAlt('/alias -q -p /meu /me só eu vejo isso'))[0], /^🔗 Alias salvo: \/meu → \/me só eu vejo isso\n🔇 quiet\n🔒 private$/);
        assert.match((await bot.replyAlt('/alias -p -q /meu2 /me outro'))[0], /🔇 quiet\n🔒 private/);
        assert.match((await bot.replyAlt('/alias /meu3 -p /me depois do nome'))[0], /🔒 private/);
        assert.match((await bot.replyAlt('/alias /meu'))[0], /^\*\/meu\* 🔇 🔒\n→ \/me só eu vejo isso$/);

        await bot.replyAlt('/alias /moeda /uptime');
        assert.doesNotMatch((await bot.replyAlt('/alias /moeda'))[0], /🔒/);
        assert.deepEqual(await bot.replyAlt('/alias -p /moeda'), ['🔒 O /moeda agora é privado: só você o vê e o executa.']);
        assert.match((await bot.replyAlt('/alias /moeda'))[0], /\*\/moeda\* 🔒/);
        assert.deepEqual(await bot.replyAlt('/alias -public /moeda'), ['🔓 O /moeda deixou de ser privado.']);
        assert.doesNotMatch((await bot.replyAlt('/alias /moeda'))[0], /🔒/);
        assert.match((await bot.replyAlt('/alias -p /naoexiste'))[0], /não encontrado/);
    });

    test('o usuário não o vê: nem no /help, nem pelo nome, nem por prefixo; o público continua; -public devolve', async () => {
        await bot.replyAlt('/alias -q /moeda /uptime');
        await bot.replyAlt('/alias -q -p /meu /joke');
        const section = (await bot.replyAlt('/help', FULANO))[0].split('🔗 *Atalhos*')[1] ?? '';
        assert.match(section, /\*\/moeda\*/);
        assert.doesNotMatch(section, /\/meu/);
        // For the user it is a command that does not exist (the same answer as for any other name)
        assert.deepEqual(await bot.replyAlt('/meu', FULANO), ["⚠️ Comando '/meu' desconhecido, tente: /help"]);
        assert.equal((await bot.replyAlt('/meu', OWNER_CHAT)).length > 0, true, 'o dono o executa');

        await bot.replyAlt('/alias -p /moeda');
        assert.deepEqual(await bot.replyAlt('/moeda', FULANO), ["⚠️ Comando '/moeda' desconhecido, tente: /help"]);
        assert.doesNotMatch((await bot.replyAlt('/help', FULANO))[0], /🔗 \*Atalhos\*/);
        assert.equal((await bot.replyAlt('/moeda', OWNER_CHAT)).length > 0, true);
        await bot.replyAlt('/alias -public /moeda');
        assert.equal((await bot.replyAlt('/moeda', FULANO)).length > 0, true, 'público de novo');
    });

    test('o admin extra não o vê nem o altera; só o dono usa -p e -public; o nome fica ocupado', async () => {
        await bot.setSetting('bot.admins', [OTHERAlt.user]);
        await bot.replyAlt('/alias -q /moeda /uptime');
        await bot.replyAlt('/alias -q -p /meu /joke');

        assert.doesNotMatch((await bot.replyAlt('/alias', FULANO))[0], /\/meu/, 'a lista');
        assert.match((await bot.replyAlt('/alias', FULANO))[0], /\/moeda/);
        assert.match((await bot.replyAlt('/alias /meu', FULANO))[0], /não encontrado/);
        assert.match((await bot.replyAlt('/alias -rm /meu', FULANO))[0], /não encontrado/);
        assert.match((await bot.replyAlt('/alias /meu /joke', FULANO))[0], /já existe/i, 'não sobrescreve');
        assert.match((await bot.replyAlt('/alias -m /meu /outro', FULANO))[0], /não encontrado/);
        assert.match((await bot.replyAlt('/alias -p /moeda', FULANO))[0], /^⛔ Só o dono do bot torna um alias privado/);
        assert.match((await bot.replyAlt('/alias -q -p /dele /joke', FULANO))[0], /^⛔ Só o dono do bot/);
        assert.match((await bot.replyAlt('/alias -rm all', FULANO))[0], /1/, 'só os públicos saem');
        assert.match((await bot.replyAlt('/alias /meu', OWNER_CHAT))[0], /\*\/meu\* 🔇 🔒/, 'o privado continua lá');
    });

    test('dentro do texto de outra pessoa ele não existe; o dono o usa em um /me normalmente', async () => {
        await bot.replyAlt('/alias -q -p /meu /uptime');
        await bot.replyAlt('/alias -q /pub /uptime');
        const user = await bot.replyAlt('/me ola {/meu}', FULANO);
        assert.match(user.join('\n'), /não existe|⚠️|❌/i);
        assert.doesNotMatch((await bot.replyAlt('/me ola {/pub}', FULANO)).join('\n'), /não existe/i);
        assert.doesNotMatch((await bot.replyAlt('/me ola {/meu}', OWNER_CHAT)).join('\n'), /não existe/i);
    });

    test('arquivo .zb: o loader aceita -p/-private antes do nome e cria o alias privado', async () => {
        assert.equal(aliasNameOf('/alias -q -p /meu -desc "x" /me oi'), '/meu');
        assert.equal(aliasNameOf('/alias -private /meu /me oi'), '/meu');
        assert.equal(aliasNameOf('/alias -p'), null);
        const { loadExample } = bot.src('zb');
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zb-')), 'privado.zb');
        fs.writeFileSync(file, '/alias -q -p /do.arquivo -desc "so meu" /uptime\n/alias -q /do.publico /uptime\n');
        const r = await loadExample({ name: 'privado', file });
        assert.deepEqual(r.failed, []);
        assert.equal((await bot.dbGet('SELECT owner_only FROM command_aliases WHERE name = ?', ['/do.arquivo'])).owner_only, 1);
        assert.equal((await bot.dbGet('SELECT owner_only FROM command_aliases WHERE name = ?', ['/do.publico'])).owner_only, 0);
    });
});
