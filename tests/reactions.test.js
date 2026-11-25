/*
 * Removed or changed reactions: the 'message_reaction' event, the notice in your
 * private chat, /show -r and /mute -r.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
    await bot.restart();
    await bot.setSetting('show.delayMs', 0); // without the pause between sends
});

// Message received in the group and Fulano's reaction to it
async function messageReacted(textAlt = 'o chefe vai adorar', emoji = '😂', optionsAlt = {}) {
    const msg = bot.createMessage({ text: textAlt, de: OTHERAlt.jid, ...optionsAlt });
    await bot.deliver(msg);
    assert.deepEqual(await bot.react(msg, OTHERAlt.jid, emoji), [], 'reagir só guarda');
    return msg;
}

describe('evento: reação removida ou trocada', () => {
    test('removida: avisa no seu privado com grupo, quem, a reação e a mensagem', async () => {
        const msg = await messageReacted();
        assert.equal((await bot.dbGet('SELECT reaction FROM reactions WHERE message_id = ?', [msg.id.id])).reaction, '😂');

        const [notice, ...rest] = await bot.react(msg, OTHERAlt.jid, '');
        assert.deepEqual(rest, []);
        assert.equal(notice.chatId, OWNER.jid);
        assert.match(notice.text, /^😶 \*REAÇÃO REMOVIDA DETECTADA\*\n\n/);
        assert.match(notice.text, /👥 \*Grupo:\* Família\n👤 \*Nome:\* Fulano\n📱 \*Número:\* \+5521911111111\n/);
        assert.match(notice.text, /🗑️ \*Removida em:\* /);
        assert.match(notice.text, /😶 \*Reação:\* 😂\n💬 \*Na mensagem:\* "o chefe vai adorar"$/);

        const row = await bot.dbGet('SELECT * FROM reaction_changes WHERE message_id = ?', [msg.id.id]);
        assert.deepEqual([row.old_reaction, row.new_reaction, row.chat_id, row.sender_number], ['😂', '', GROUP, OTHERAlt.user]);
        assert.equal(await bot.dbGet('SELECT 1 FROM reactions WHERE message_id = ?', [msg.id.id]), undefined, 'a atual sai');
    });

    test('a menção crua (@número) da mensagem vira o nome no aviso', async () => {
        const msg = await messageReacted(`@${OTHERAlt.user} parabéns! Tudo de bom`, '❤️');
        const [notice] = await bot.react(msg, OTHERAlt.jid, '');
        assert.match(notice.text, /💬 \*Na mensagem:\* "@Fulano parabéns! Tudo de bom"$/);
        assert.equal((await bot.dbGet('SELECT body FROM reaction_changes WHERE message_id = ?', [msg.id.id])).body, `@${OTHERAlt.user} parabéns! Tudo de bom`);
    });

    test('trocada: a de antes e a nova; na sua mensagem, diz que é sua', async () => {
        const sent = bot.createMessage({ text: 'chego às 8' });
        await bot.deliver(sent);
        await bot.react(sent, OTHERAlt.jid, '👍');

        const [notice] = await bot.react(sent, OTHERAlt.jid, '❤️');
        assert.match(notice.text, /^🔄 \*REAÇÃO TROCADA DETECTADA\*/);
        assert.match(notice.text, /🔄 \*Trocada em:\* .*\n😶 \*Reação:\* 👍 → ❤️\n💬 \*Na sua mensagem:\* "chego às 8"$/);
        assert.equal((await bot.dbGet('SELECT reaction FROM reactions WHERE message_id = ?', [sent.id.id])).reaction, '❤️');
    });

    test('nada a avisar: a mesma reação de novo, removida sem a anterior, a sua e a de canal', async () => {
        const msg = await messageReacted();
        assert.deepEqual(await bot.react(msg, OTHERAlt.jid, '😂'), [], 'a mesma, avisada de novo');

        const other = bot.createMessage({ text: 'x', de: OTHERAlt.jid });
        await bot.deliver(other);
        assert.deepEqual(await bot.react(other, OTHERAlt.jid, ''), [], 'sem a anterior: não sabe qual era');

        await bot.react(msg, OWNER.jid, '👍');
        assert.deepEqual(await bot.react(msg, OWNER.jid, ''), [], 'a sua');

        const channel = bot.createMessage({ text: 'notícia', chat: '120363000000000099@newsletter', de: OTHERAlt.jid });
        await bot.react(channel, OTHERAlt.jid, '🔥');
        assert.deepEqual(await bot.react(channel, OTHERAlt.jid, ''), [], 'canal');

        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM reaction_changes')).n, 0);
    });

    test('mensagem fora do cache: o aviso diz', async () => {
        const ghost = bot.createMessage({ text: 'nunca vista', de: OTHERAlt.jid });
        await bot.react(ghost, OTHERAlt.jid, '😮');
        const [notice] = await bot.react(ghost, OTHERAlt.jid, '');
        assert.match(notice.text, /💬 \*Na mensagem:\* _\(fora do cache\)_$/);
    });

    test('a chave da mensagem reagida também sai do _serialized', () => {
        const { messageKey } = bot.src('events/reactions');
        assert.deepEqual(messageKey({ _serialized: `false_${GROUP}_ABC_${OTHERAlt.jid}` }), { id: 'ABC', chatId: GROUP, fromMe: false });
        assert.deepEqual(messageKey({ id: 'X', remote: { _serialized: GROUP }, fromMe: true }), { id: 'X', chatId: GROUP, fromMe: true });
        assert.equal(messageKey(null), null);
    });
});

describe('/show -r e /mute -r', () => {
    test('show.alert.reaction off: guarda sem avisar; o /show -r reexibe no grupo', async () => {
        await bot.setSetting('show.alert.reaction', false);
        const msg = await messageReacted();
        assert.deepEqual(await bot.react(msg, OTHERAlt.jid, ''), []);

        const [summary, item] = await bot.execute('/show -r');
        assert.equal(summary.text, '😶 *1 reação removida ou trocada*');
        assert.match(item.text, /^😶 \*REAÇÃO REMOVIDA\* \(1\/1\)\n/);
        assert.equal(item.chatId, GROUP);
    });

    test('/show -l conta as reações; /show <chat> traz junto com as editadas; -f -r remove', async () => {
        const msg = await messageReacted();
        await bot.react(msg, OTHERAlt.jid, '');
        await bot.edit(msg, 'o chefe vai amar');

        const [list] = await bot.replyAlt('/show -l', { chat: OWNER.jid });
        assert.match(list, /😶 \*Reações:\* 1 _\(a mais antiga expira em 30 dias\)_/);
        assert.match(list, /1\. 👥 Família — ✏️ 1 · 😶 1 /);

        const [summary] = await bot.replyAlt('/show -5 Família', { chat: OWNER.jid });
        assert.match(summary, /^🗄️ \*2 mensagens\* \(✏️ 1 · 😶 1\)/);

        assert.match((await bot.replyAlt('/show -f -r'))[0], /😶 Reações: \*1 reação\*/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM reaction_changes')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 1, 'as editadas ficam');
    });

    test('/mute -r silencia só as reações (e conta a ignorada); /mute -d não', async () => {
        await bot.replyAlt('/mute -d /Família/');
        const msg = await messageReacted();
        assert.equal((await bot.react(msg, OTHERAlt.jid, '')).length, 1, 'o -d não silencia reações');

        assert.match((await bot.replyAlt('/mute -r /Família/'))[0], /^🔇 \*Atualizado:\* 👥 Família — apagadas, reações\n/);
        await bot.react(msg, OTHERAlt.jid, '👍');
        assert.deepEqual(await bot.react(msg, OTHERAlt.jid, '❤️'), []);

        const hit = await bot.dbGet('SELECT kind FROM mute_hits');
        assert.equal(hit.kind, 'reacao');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM reaction_changes')).n, 2, 'guardada para o /show');
    });

    test('respondendo o aviso, o /mute silencia de onde ele veio', async () => {
        const msg = await messageReacted();
        const [notice] = await bot.react(msg, OTHERAlt.jid, '');

        const quoted = bot.createMessage({ text: notice.text, chat: OWNER.jid, id: notice.id.id });
        const [r] = await bot.replyAlt('/mute -r', { chat: OWNER.jid, quoted });
        assert.match(r, /^🔇 \*Silenciado:\* 👥 Família — reações\n/);
    });

    test('/bot -status conta; a limpeza tira as antigas', async () => {
        const msg = await messageReacted();
        await bot.react(msg, OTHERAlt.jid, '');

        const { statusText } = bot.src('status');
        assert.match(await statusText(), /😶 \*Reações removidas ou trocadas:\* 1\n/);

        await bot.dbRun('UPDATE reaction_changes SET changed_at = ?', [Date.now() - 31 * DAY]);
        await bot.dbRun("INSERT INTO reactions VALUES ('velha', ?, ?, '👍', ?)", [OTHERAlt.jid, GROUP, Date.now() - 31 * DAY]);
        await bot.src('cleanup').cleanReactionsOld();
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM reaction_changes')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM reactions')).n, 0);
    });
});
