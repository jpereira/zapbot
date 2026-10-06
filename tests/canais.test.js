/*
 * Publicações de @newsletter têm um canal como origem, sem contato ou telefone inventado.
 */
const bot = require('./helpers/bot');
const { beforeEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');

const CANAL = '120363555000000001@newsletter';
const NOME = 'Defesa Civil de Niterói';

beforeEach(async () => {
    await bot.reiniciar();
    await bot.setSetting('show.delayMs', 0);
    bot.client.chats.set(CANAL, {
        id: { _serialized: CANAL }, name: NOME, isGroup: false, isChannel: true
    });
});

function publicacao(texto = 'Defesa Civil informa: alerta de chuva', opcoes = {}) {
    return bot.criarMensagem({
        texto, chat: CANAL, de: bot.OUTRO.jid,
        extras: { _data: { notifyName: 'Fátima', chat: { name: 'Fátima' } }, ...opcoes }
    });
}

const origemCorreta = (texto) => {
    assert.match(texto, /📰 \*Canal:\* Defesa Civil de Niterói/);
    assert.doesNotMatch(texto, /👤 \*Nome:|📱 \*Número:|Fátima/);
};

describe('canais @newsletter', () => {
    test('/watch usa o nome do canal no aviso e no histórico', async () => {
        await bot.setSetting('watch.rules', '/Defesa.*Civil/');
        // Nem um contato espúrio com o ID do canal pode fornecer nome ou número.
        bot.criarContato(CANAL, 'Fátima');
        const msg = publicacao();
        const [aviso] = await bot.entregar(msg);
        origemCorreta(aviso.texto);
        const row = await bot.dbGet('SELECT * FROM messages WHERE id = ?', [msg.id.id]);
        assert.equal(row.chat_id, CANAL);
        assert.equal(row.chat_name, NOME);
        assert.equal(row.sender_jid, CANAL);
        assert.equal(row.sender_name, NOME);
        assert.equal(row.sender_number, null);
        assert.equal(row.is_group, 0);
        const [historico] = await bot.responder('/watch -show');
        assert.match(historico, /📰 Defesa Civil de Niterói/);
        assert.doesNotMatch(historico, /👤|Fátima/);
    });

    test('from @newsletter identifica canal mesmo com remote divergente', async () => {
        await bot.setSetting('watch.rules', 'chuva');
        const msg = publicacao();
        msg.id.remote = bot.OUTRO.jid;
        origemCorreta((await bot.entregar(msg))[0].texto);
        const row = await bot.dbGet('SELECT chat_id FROM messages WHERE id = ?', [msg.id.id]);
        assert.equal(row.chat_id, CANAL);
    });

    test('sem nome disponível, identifica pelo ID e ignora notifyName', async () => {
        bot.client.chats.delete(CANAL);
        await bot.setSetting('watch.rules', 'chuva');
        const [aviso] = await bot.entregar(publicacao());
        assert.match(aviso.texto, /📰 \*Canal:\* Canal 120363555000000001/);
        assert.doesNotMatch(aviso.texto, /Fátima|👤|📱/);
    });

    test('autor de uma publicação não vira contato ou número do canal', async () => {
        await bot.setSetting('watch.rules', 'chuva');
        origemCorreta((await bot.entregar(publicacao(undefined,
            { author: bot.OUTRO.jid })))[0].texto);
    });

    test('apagada: aviso, /show por nome e /show -l identificam o canal', async () => {
        const msg = publicacao();
        await bot.entregar(msg);
        origemCorreta((await bot.apagar(msg))[0].texto);
        const [lista] = await bot.responder('/show -l');
        assert.match(lista, /📰 Defesa Civil de Niterói/);
        const [resumo, item] = await bot.responder('/show Defesa Civil');
        origemCorreta(resumo);
        origemCorreta(item);
        assert.match(item, /MENSAGEM APAGADA/);
        assert.match(item, /alerta de chuva/);
    });

    test('editada: aviso e /show -e preservam o canal e os dois textos', async () => {
        const msg = publicacao('alerta amarelo');
        await bot.entregar(msg);
        origemCorreta((await bot.editar(msg, 'alerta vermelho'))[0].texto);
        const [, item] = await bot.responder('/show -e Defesa Civil');
        origemCorreta(item);
        assert.match(item, /Antes:\* "alerta amarelo"/);
        assert.match(item, /Depois:\* "alerta vermelho"/);
    });

    test('/show e /watch preservam o nome salvo quando o canal está indisponível', async () => {
        await bot.setSetting('watch.rules', 'chuva');
        const msg = publicacao();
        await bot.entregar(msg);
        await bot.apagar(msg);
        bot.client.chats.delete(CANAL);
        origemCorreta((await bot.responder('/show Defesa Civil'))[1]);
        assert.match((await bot.responder('/watch -s'))[0], /📰 Defesa Civil de Niterói/);
    });

    test('mídia apagada também identifica o canal na legenda', async () => {
        const msg = bot.criarMensagem({
            texto: 'mapa da chuva', chat: CANAL, de: bot.OUTRO.jid, tipo: 'image',
            midia: { mimetype: 'image/png', data: Buffer.from('png').toString('base64') }
        });
        await bot.entregar(msg);
        origemCorreta((await bot.apagar(msg))[0].texto);
        origemCorreta((await bot.responder('/show Defesa Civil'))[1]);
    });
});
