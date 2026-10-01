/*
 * /mudo (/mute): silenciar os avisos de apagadas, editadas e status apagados
 * de uma pessoa ou de um grupo.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;
const { lerMudo } = bot.src('comandos/mudo');

const L200 = '120363000000000200@g.us';
const CICLANO = { jid: '5521922222222@c.us', nome: 'Ciclano' };

beforeEach(async () => {
    await bot.reiniciar();
    bot.criarGrupo(L200, 'Grupo sobre L200', [DONO.jid, OUTRO.jid, CICLANO.jid]);
    bot.criarContato(CICLANO.jid, CICLANO.nome);
});

// Alguém manda uma mensagem e apaga; devolve os avisos que chegaram
async function apagada(texto, opcoes = {}) {
    const msg = bot.criarMensagem({ texto, de: OUTRO.jid, ...opcoes });
    await bot.entregar(msg);
    return bot.apagar(msg);
}

async function editada(texto, novo, opcoes = {}) {
    const msg = bot.criarMensagem({ texto, de: OUTRO.jid, ...opcoes });
    await bot.entregar(msg);
    return bot.editar(msg, novo);
}

const hits = () => bot.dbAll('SELECT target_id, kind FROM mute_hits ORDER BY id');

describe('/mudo (/mute)', () => {
    test('lerMudo: opções antes do alvo; /nome/ e aspas', () => {
        assert.deepEqual([...lerMudo('-d -e /Grupo L200/').colunas], ['deleted', 'edited']);
        assert.equal(lerMudo('-d -e /Grupo L200/').alvo, 'Grupo L200');
        assert.equal(lerMudo('-a "Grupo L200"').alvo, 'Grupo L200');
        assert.deepEqual([...lerMudo('-all x').colunas], ['deleted', 'edited', 'status']);
        assert.equal(lerMudo('-rm 2').rm, '2');
        assert.match(lerMudo('-x y').erro, /Opção desconhecida: -x/);
    });

    test('-d num grupo: as apagadas dali não avisam, mas ficam guardadas; as de outros grupos avisam', async () => {
        assert.deepEqual(await bot.responder('/mudo -d /Grupo L200/'), [
            '🔇 *Silenciado:* 👥 Grupo sobre L200 — apagadas\n💡 _Só o aviso some: as mensagens continuam guardadas para o /show. Veja a lista com /mudo._'
        ]);

        assert.deepEqual(await apagada('psiu', { chat: L200 }), []);
        assert.equal((await bot.dbGet("SELECT revoked FROM messages WHERE body = 'psiu'")).revoked, 1, 'guardada para o /show');
        assert.deepEqual(await hits(), [{ target_id: L200, kind: 'apagada' }]);

        assert.equal((await apagada('oi', { chat: GRUPO })).length, 1, 'outro grupo avisa');
        assert.equal((await editada('a', 'b', { chat: L200 })).length, 1, 'só as apagadas foram silenciadas');
    });

    test('-a numa pessoa: apagadas, editadas e status dela, em qualquer chat', async () => {
        await bot.responder('/mute -a @5521911111111');

        assert.deepEqual(await apagada('x', { chat: GRUPO }), []);
        assert.deepEqual(await editada('a', 'b', { chat: L200 }), []);
        assert.deepEqual(await apagada('meu status', { chat: 'status@broadcast' }), []);
        assert.deepEqual((await hits()).map(h => h.kind), ['apagada', 'editada', 'status']);

        // Outra pessoa continua avisando
        const msg = bot.criarMensagem({ texto: 'do ciclano', de: CICLANO.jid });
        await bot.entregar(msg);
        assert.equal((await bot.apagar(msg)).length, 1);
    });

    test('-s só os status; silenciar de novo soma; a lista mostra os ignorados', async () => {
        await bot.responder('/mudo -s @5521911111111');
        assert.equal((await apagada('normal')).length, 1);
        assert.deepEqual(await apagada('status', { chat: 'status@broadcast' }), []);

        assert.match((await bot.responder('/mudo -e @5521911111111'))[0], /^🔇 \*Atualizado:\* 👤 Fulano — editadas, status/);
        await bot.responder('/mudo -d -e L200');

        const [lista] = await bot.responder('/mudo');
        assert.equal(lista, '🔇 *Silenciados* (2)\n\n' +
            '1. 👤 Fulano — editadas, status _(1 aviso ignorado)_\n' +
            '2. 👥 Grupo sobre L200 — apagadas, editadas\n\n' +
            '💡 _Desfaça com /mudo -rm <nº|all>._');
        assert.equal((await bot.responder('/mudo -l'))[0], lista);
    });

    test('-rm N e -rm all: os avisos voltam', async () => {
        await bot.responder('/mudo -a @5521911111111');
        await bot.responder('/mudo -d L200');

        assert.deepEqual(await bot.responder('/mudo -rm 1'), ['🔊 Os avisos de 👤 Fulano voltam.']);
        assert.equal((await apagada('voltou')).length, 1);
        assert.deepEqual(await bot.responder('/mudo -rm all'), ['🔊 1 silenciado removido: os avisos voltam.']);
        assert.match((await bot.responder('/mudo'))[0], /🔇 Ninguém silenciado/);
        assert.match((await bot.responder('/mudo -rm 9'))[0], /❌ Nº 9 não existe/);
    });

    test('erros: sem opção, sem alvo, alvo inválido, você mesmo', async () => {
        assert.match((await bot.responder('/mudo L200'))[0], /❌ Escolha o que silenciar/);
        assert.match((await bot.responder('/mudo -d'))[0], /❌ Informe quem/);
        assert.match((await bot.responder('/mudo -d xyz'))[0], /❌ Nenhum grupo com "xyz" no nome/);
        bot.criarContato(DONO.jid, DONO.nome);
        assert.deepEqual(await bot.responder('/mudo -d @5521900000000'), ['❌ As suas mensagens já não geram avisos.']);
        assert.deepEqual(await bot.dbAll('SELECT * FROM mutes'), []);
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.responder('/mudo -a L200', { de: OUTRO.jid }), []);
    });
});
