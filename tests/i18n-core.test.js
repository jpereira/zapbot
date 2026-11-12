/*
 * i18n (en_US) do núcleo: login, opção desconhecida, comando desconhecido, avisos de apagada/editada
 * e o tempo no ar. Os outros testes rodam em pt_BR.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OUTRO } = bot;
const { setSetting } = bot.src('settings');
const { getBotUptime } = bot.src('log');
const { lerQuando } = bot.src('util/quando');

beforeEach(async () => {
    await bot.reiniciar();
    await setSetting('show.delayMs', 0);
    await setSetting('zapbot.lang', 'en_US');
});

describe('en_US: núcleo', () => {
    test('/bot -passwd e -login em inglês', async () => {
        const privado = { chat: OUTRO.jid, de: OUTRO.jid };

        assert.equal((await bot.responder('/bot -login x', privado))[0], '🚫 Login disabled.');
        assert.match((await bot.responder('/bot -passwd short'))[0], /^❌ The password needs at least 8 characters\./);
        assert.match((await bot.responder('/bot -passwd segredo123'))[0], /^🔐 \*Password saved\*/);
        assert.equal((await bot.responder('/bot -login errada123', privado))[0], '❌ Wrong password.');

        const respostas = await bot.responder('/bot -login segredo123', privado);
        assert.ok(respostas.includes('👑 *Done:* you are now an admin of the bot.'));
        assert.ok(respostas.some(r => r.startsWith('🔑 New admin by password')));
    });

    test('comando desconhecido e opção desconhecida', async () => {
        assert.equal((await bot.responder('/naoexiste'))[0], "⚠️ Unknown command '/naoexiste', try: /help");
        assert.match((await bot.responder('/mute -zzz'))[0], /^❌ Unknown option: -zzz/);
    });

    test('aviso de mensagem apagada e de editada', async () => {
        const apagada = bot.criarMensagem({ texto: 'segredo', de: OUTRO.jid });
        await bot.entregar(apagada);
        const [alerta] = await bot.apagar(apagada);
        assert.match(alerta.content, /^❌ \*DELETED MESSAGE DETECTED\*\n\n/);
        assert.match(alerta.content, /\*Sent at:\*/);
        assert.match(alerta.content, /💬 \*Text:\* "segredo"$/);

        const editada = bot.criarMensagem({ texto: 'antes', de: OUTRO.jid });
        await bot.entregar(editada);
        const [aviso] = await bot.editar(editada, 'depois');
        assert.match(aviso.content, /^✏️ \*EDITED MESSAGE DETECTED\*/);
        assert.match(aviso.content, /📝 \*Before:\* "antes"\n💬 \*After:\* "depois"/);
    });

    test('tempo no ar e o "quando" em inglês', () => {
        const agora = Date.now();
        assert.equal(getBotUptime(agora - (2 * 86400 + 3 * 3600 + 60) * 1000), '2 days, 3 hours, 1 minute');
        assert.equal(getBotUptime(agora - 1000), '1 second');
        assert.ok(lerQuando(['tomorrow', '9h'], agora)?.ms > agora);
        assert.equal(lerQuando(['at', '18h'], agora)?.usadas, 2);
    });
});
