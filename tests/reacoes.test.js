/*
 * Reações removidas ou trocadas: o evento 'message_reaction', o aviso no seu
 * privado, o /show -r e o /mute -r.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;
const DIA = 24 * 60 * 60 * 1000;

beforeEach(async () => {
    await bot.reiniciar();
    await bot.setSetting('show.delayMs', 0); // sem a pausa entre os envios
});

// Mensagem recebida no grupo e a reação do Fulano nela
async function mensagemReagida(texto = 'o chefe vai adorar', emoji = '😂', opcoes = {}) {
    const msg = bot.criarMensagem({ texto, de: OUTRO.jid, ...opcoes });
    await bot.entregar(msg);
    assert.deepEqual(await bot.reagir(msg, OUTRO.jid, emoji), [], 'reagir só guarda');
    return msg;
}

describe('evento: reação removida ou trocada', () => {
    test('removida: avisa no seu privado com grupo, quem, a reação e a mensagem', async () => {
        const msg = await mensagemReagida();
        assert.equal((await bot.dbGet('SELECT reaction FROM reactions WHERE message_id = ?', [msg.id.id])).reaction, '😂');

        const [aviso, ...resto] = await bot.reagir(msg, OUTRO.jid, '');
        assert.deepEqual(resto, []);
        assert.equal(aviso.chatId, DONO.jid);
        assert.match(aviso.texto, /^😶 \*REAÇÃO REMOVIDA DETECTADA\*\n\n/);
        assert.match(aviso.texto, /👥 \*Grupo:\* Família\n👤 \*Nome:\* Fulano\n📱 \*Número:\* \+5521911111111\n/);
        assert.match(aviso.texto, /🗑️ \*Removida em:\* /);
        assert.match(aviso.texto, /😶 \*Reação:\* 😂\n💬 \*Na mensagem:\* "o chefe vai adorar"$/);

        const row = await bot.dbGet('SELECT * FROM reaction_changes WHERE message_id = ?', [msg.id.id]);
        assert.deepEqual([row.old_reaction, row.new_reaction, row.chat_id, row.sender_number], ['😂', '', GRUPO, OUTRO.user]);
        assert.equal(await bot.dbGet('SELECT 1 FROM reactions WHERE message_id = ?', [msg.id.id]), undefined, 'a atual sai');
    });

    test('trocada: a de antes e a nova; na sua mensagem, diz que é sua', async () => {
        const enviada = bot.criarMensagem({ texto: 'chego às 8' });
        await bot.entregar(enviada);
        await bot.reagir(enviada, OUTRO.jid, '👍');

        const [aviso] = await bot.reagir(enviada, OUTRO.jid, '❤️');
        assert.match(aviso.texto, /^🔄 \*REAÇÃO TROCADA DETECTADA\*/);
        assert.match(aviso.texto, /🔄 \*Trocada em:\* .*\n😶 \*Reação:\* 👍 → ❤️\n💬 \*Na sua mensagem:\* "chego às 8"$/);
        assert.equal((await bot.dbGet('SELECT reaction FROM reactions WHERE message_id = ?', [enviada.id.id])).reaction, '❤️');
    });

    test('nada a avisar: a mesma reação de novo, removida sem a anterior, a sua e a de canal', async () => {
        const msg = await mensagemReagida();
        assert.deepEqual(await bot.reagir(msg, OUTRO.jid, '😂'), [], 'a mesma, avisada de novo');

        const outra = bot.criarMensagem({ texto: 'x', de: OUTRO.jid });
        await bot.entregar(outra);
        assert.deepEqual(await bot.reagir(outra, OUTRO.jid, ''), [], 'sem a anterior: não sabe qual era');

        await bot.reagir(msg, DONO.jid, '👍');
        assert.deepEqual(await bot.reagir(msg, DONO.jid, ''), [], 'a sua');

        const canal = bot.criarMensagem({ texto: 'notícia', chat: '120363000000000099@newsletter', de: OUTRO.jid });
        await bot.reagir(canal, OUTRO.jid, '🔥');
        assert.deepEqual(await bot.reagir(canal, OUTRO.jid, ''), [], 'canal');

        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM reaction_changes')).n, 0);
    });

    test('mensagem fora do cache: o aviso diz', async () => {
        const fantasma = bot.criarMensagem({ texto: 'nunca vista', de: OUTRO.jid });
        await bot.reagir(fantasma, OUTRO.jid, '😮');
        const [aviso] = await bot.reagir(fantasma, OUTRO.jid, '');
        assert.match(aviso.texto, /💬 \*Na mensagem:\* _\(fora do cache\)_$/);
    });

    test('a chave da mensagem reagida também sai do _serialized', () => {
        const { chaveDaMensagem } = bot.src('eventos/reacoes');
        assert.deepEqual(chaveDaMensagem({ _serialized: `false_${GRUPO}_ABC_${OUTRO.jid}` }), { id: 'ABC', chatId: GRUPO, fromMe: false });
        assert.deepEqual(chaveDaMensagem({ id: 'X', remote: { _serialized: GRUPO }, fromMe: true }), { id: 'X', chatId: GRUPO, fromMe: true });
        assert.equal(chaveDaMensagem(null), null);
    });
});

describe('/show -r e /mute -r', () => {
    test('show.alert.reaction off: guarda sem avisar; o /show -r reexibe no grupo', async () => {
        await bot.setSetting('show.alert.reaction', false);
        const msg = await mensagemReagida();
        assert.deepEqual(await bot.reagir(msg, OUTRO.jid, ''), []);

        const [resumo, item] = await bot.executar('/show -r');
        assert.equal(resumo.texto, '😶 *1 reação removida ou trocada*');
        assert.match(item.texto, /^😶 \*REAÇÃO REMOVIDA\* \(1\/1\)\n/);
        assert.equal(item.chatId, GRUPO);
    });

    test('/show -l conta as reações; /show <chat> traz junto com as editadas; -f -r remove', async () => {
        const msg = await mensagemReagida();
        await bot.reagir(msg, OUTRO.jid, '');
        await bot.editar(msg, 'o chefe vai amar');

        const [lista] = await bot.responder('/show -l', { chat: DONO.jid });
        assert.match(lista, /😶 \*Reações:\* 1 _\(a mais antiga expira em 30 dias\)_/);
        assert.match(lista, /1\. 👥 Família — ✏️ 1 · 😶 1 /);

        const [resumo] = await bot.responder('/show -5 Família', { chat: DONO.jid });
        assert.match(resumo, /^🗄️ \*2 mensagens\* \(✏️ 1 · 😶 1\)/);

        assert.match((await bot.responder('/show -f -r'))[0], /😶 Reações: \*1 reação\*/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM reaction_changes')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 1, 'as editadas ficam');
    });

    test('/mute -r silencia só as reações (e conta a ignorada); /mute -d não', async () => {
        await bot.responder('/mute -d /Família/');
        const msg = await mensagemReagida();
        assert.equal((await bot.reagir(msg, OUTRO.jid, '')).length, 1, 'o -d não silencia reações');

        assert.match((await bot.responder('/mute -r /Família/'))[0], /^🔇 \*Atualizado:\* 👥 Família — apagadas, reações\n/);
        await bot.reagir(msg, OUTRO.jid, '👍');
        assert.deepEqual(await bot.reagir(msg, OUTRO.jid, '❤️'), []);

        const hit = await bot.dbGet('SELECT kind FROM mute_hits');
        assert.equal(hit.kind, 'reacao');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM reaction_changes')).n, 2, 'guardada para o /show');
    });

    test('respondendo o aviso, o /mute silencia de onde ele veio', async () => {
        const msg = await mensagemReagida();
        const [aviso] = await bot.reagir(msg, OUTRO.jid, '');

        const citada = bot.criarMensagem({ texto: aviso.texto, chat: DONO.jid, id: aviso.id.id });
        const [r] = await bot.responder('/mute -r', { chat: DONO.jid, citada });
        assert.match(r, /^🔇 \*Silenciado:\* 👥 Família — reações\n/);
    });

    test('/bot -status conta; a limpeza tira as antigas', async () => {
        const msg = await mensagemReagida();
        await bot.reagir(msg, OUTRO.jid, '');

        const { textoDoStatus } = bot.src('status');
        assert.match(await textoDoStatus(), /😶 \*Reações removidas ou trocadas:\* 1\n/);

        await bot.dbRun('UPDATE reaction_changes SET changed_at = ?', [Date.now() - 31 * DIA]);
        await bot.dbRun("INSERT INTO reactions VALUES ('velha', ?, ?, '👍', ?)", [OUTRO.jid, GRUPO, Date.now() - 31 * DIA]);
        await bot.src('limpeza').limparReacoesAntigas();
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM reaction_changes')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM reactions')).n, 0);
    });
});
