/*
 * @newsletter posts have a channel as the origin, with no invented contact or phone.
 */
const bot = require('./helpers/bot');
const { beforeEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');

const CHANNEL = '120363555000000001@newsletter';
const NAME = 'Defesa Civil de Niterói';

beforeEach(async () => {
    await bot.restart();
    await bot.setSetting('show.delayMs', 0);
    bot.client.chats.set(CHANNEL, {
        id: { _serialized: CHANNEL }, name: NAME, isGroup: false, isChannel: true
    });
});

function publication(textAlt = 'Defesa Civil informa: alerta de chuva', optionsAlt = {}) {
    return bot.createMessage({
        texto: textAlt, chat: CHANNEL, de: bot.OTHERAlt.jid,
        extras: { _data: { notifyName: 'Fátima', chat: { name: 'Fátima' } }, ...optionsAlt }
    });
}

const originCorrect = (textAlt) => {
    assert.match(textAlt, /📰 \*Canal:\* Defesa Civil de Niterói/);
    assert.doesNotMatch(textAlt, /👤 \*Nome:|📱 \*Número:|Fátima/);
};

describe('canais @newsletter', () => {
    test('/watch usa o nome do canal no aviso e no histórico', async () => {
        await bot.setSetting('watch.rules', '/Defesa.*Civil/');
        // Not even a spurious contact with the channel ID can provide a name or number.
        bot.createContact(CHANNEL, 'Fátima');
        const msg = publication();
        const [notice] = await bot.deliver(msg);
        originCorrect(notice.texto);
        const row = await bot.dbGet('SELECT * FROM messages WHERE id = ?', [msg.id.id]);
        assert.equal(row.chat_id, CHANNEL);
        assert.equal(row.chat_name, NAME);
        assert.equal(row.sender_jid, CHANNEL);
        assert.equal(row.sender_name, NAME);
        assert.equal(row.sender_number, null);
        assert.equal(row.is_group, 0);
        const [history] = await bot.replyAlt('/watch -show');
        assert.match(history, /📰 Defesa Civil de Niterói/);
        assert.doesNotMatch(history, /👤|Fátima/);
    });

    test('from @newsletter identifica canal mesmo com remote divergente', async () => {
        await bot.setSetting('watch.rules', 'chuva');
        const msg = publication();
        msg.id.remote = bot.OTHERAlt.jid;
        originCorrect((await bot.deliver(msg))[0].texto);
        const row = await bot.dbGet('SELECT chat_id FROM messages WHERE id = ?', [msg.id.id]);
        assert.equal(row.chat_id, CHANNEL);
    });

    test('sem nome disponível, identifica pelo ID e ignora notifyName', async () => {
        bot.client.chats.delete(CHANNEL);
        await bot.setSetting('watch.rules', 'chuva');
        const [notice] = await bot.deliver(publication());
        assert.match(notice.texto, /📰 \*Canal:\* Canal 120363555000000001/);
        assert.doesNotMatch(notice.texto, /Fátima|👤|📱/);
    });

    test('autor de uma publicação não vira contato ou número do canal', async () => {
        await bot.setSetting('watch.rules', 'chuva');
        originCorrect((await bot.deliver(publication(undefined,
            { author: bot.OTHERAlt.jid })))[0].texto);
    });

    test('apagada: aviso, /show por nome e /show -l identificam o canal', async () => {
        const msg = publication();
        await bot.deliver(msg);
        originCorrect((await bot.apagar(msg))[0].texto);
        const [list] = await bot.replyAlt('/show -l');
        assert.match(list, /📰 Defesa Civil de Niterói/);
        const [summary, item] = await bot.replyAlt('/show Defesa Civil');
        originCorrect(summary);
        originCorrect(item);
        assert.match(item, /MENSAGEM APAGADA/);
        assert.match(item, /alerta de chuva/);
    });

    test('editada: aviso e /show -e preservam o canal e os dois textos', async () => {
        const msg = publication('alerta amarelo');
        await bot.deliver(msg);
        originCorrect((await bot.edit(msg, 'alerta vermelho'))[0].texto);
        const [, item] = await bot.replyAlt('/show -e Defesa Civil');
        originCorrect(item);
        assert.match(item, /Antes:\* "alerta amarelo"/);
        assert.match(item, /Depois:\* "alerta vermelho"/);
    });

    test('/show e /watch preservam o nome salvo quando o canal está indisponível', async () => {
        await bot.setSetting('watch.rules', 'chuva');
        const msg = publication();
        await bot.deliver(msg);
        await bot.apagar(msg);
        bot.client.chats.delete(CHANNEL);
        originCorrect((await bot.replyAlt('/show Defesa Civil'))[1]);
        assert.match((await bot.replyAlt('/watch -s'))[0], /📰 Defesa Civil de Niterói/);
    });

    test('mídia apagada também identifica o canal na legenda', async () => {
        const msg = bot.createMessage({
            texto: 'mapa da chuva', chat: CHANNEL, de: bot.OTHERAlt.jid, tipo: 'image',
            midia: { mimetype: 'image/png', data: Buffer.from('png').toString('base64') }
        });
        await bot.deliver(msg);
        originCorrect((await bot.apagar(msg))[0].texto);
        originCorrect((await bot.replyAlt('/show Defesa Civil'))[1]);
    });
});
