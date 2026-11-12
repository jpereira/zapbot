/*
 * i18n (en_US) das respostas de /mute, /unmute, /block, /poll e /leave. Os outros testes rodam em pt_BR.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, OUTRO } = bot;
const { setSetting } = bot.src('settings');

const L200 = '120363000000000200@g.us';

beforeEach(async () => {
    await bot.reiniciar();
    bot.criarGrupo(L200, 'Grupo sobre L200', [DONO.jid, OUTRO.jid]);
    await setSetting('zapbot.lang', 'en_US');
});

describe('en_US: grp', () => {
    test('/mute: a lista vazia, silenciar e a lista', async () => {
        assert.match((await bot.responder('/mute'))[0], /^🔇 Nobody muted\./);
        assert.deepEqual(await bot.responder('/mute -d /Grupo L200/'), [
            '🔇 *Muted:* 👥 Grupo sobre L200 — deleted\n💡 _Only the alert goes away: the messages are still stored for /show. See the list with /mute; undo with /unmute._'
        ]);
        assert.match((await bot.responder('/mute'))[0], /^🔇 \*Muted\* \(1\)\n\n1\. 👥 Grupo sobre L200 — deleted/);
    });

    test('/mute: opção desconhecida e nº inexistente', async () => {
        assert.match((await bot.responder('/mute -x y'))[0], /^❌ Unknown option: -x/);
        assert.equal((await bot.responder('/unmute 9'))[0], '❌ No. 9 does not exist. See the list with /mute');
    });

    test('/block: ninguém bloqueado', async () => {
        assert.match((await bot.responder('/block'))[0], /^🚫 Nobody blocked\./);
    });

    test('/poll: poucas opções e o placar sem enquete', async () => {
        assert.match((await bot.responder('/poll Hi? | only one'))[0], /^❌ Provide the question and at least 2 options\./);
        assert.match((await bot.responder('/poll -r'))[0], /^📊 No poll recorded in this chat\./);
    });
});
