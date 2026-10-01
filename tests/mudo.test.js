/*
 * /mudo (/mute): mute the notices of deleted, edited and deleted-status messages
 * of a person or a group.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const { readMuted } = bot.src('commands/mudo');

const L200 = '120363000000000200@g.us';
const CICLANO = { jid: '5521922222222@c.us', nome: 'Ciclano' };

beforeEach(async () => {
    await bot.restart();
    bot.createGroup(L200, 'Grupo sobre L200', [OWNER.jid, OTHERAlt.jid, CICLANO.jid]);
    bot.createContact(CICLANO.jid, CICLANO.nome);
});

// Someone sends a message and deletes it; returns the notices that arrived
async function deleted(textAlt, optionsAlt = {}) {
    const msg = bot.createMessage({ texto: textAlt, de: OTHERAlt.jid, ...optionsAlt });
    await bot.deliver(msg);
    return bot.apagar(msg);
}

async function edited(textAlt, freshAlt, optionsAlt = {}) {
    const msg = bot.createMessage({ texto: textAlt, de: OTHERAlt.jid, ...optionsAlt });
    await bot.deliver(msg);
    return bot.edit(msg, freshAlt);
}

const hits = () => bot.dbAll('SELECT target_id, kind FROM mute_hits ORDER BY id');

describe('/mudo (/mute)', () => {
    test('lerMudo: opções antes do alvo; /nome/ e aspas', () => {
        assert.deepEqual([...readMuted('-d -e /Grupo L200/').colunas], ['deleted', 'edited']);
        assert.equal(readMuted('-d -e /Grupo L200/').alvo, 'Grupo L200');
        assert.equal(readMuted('-a "Grupo L200"').alvo, 'Grupo L200');
        assert.deepEqual([...readMuted('-all x').colunas], ['deleted', 'edited', 'status']);
        assert.equal(readMuted('-rm 2').rm, '2');
        assert.match(readMuted('-x y').erro, /Opção desconhecida: -x/);
    });

    test('-d num grupo: as apagadas dali não avisam, mas ficam guardadas; as de outros grupos avisam', async () => {
        assert.deepEqual(await bot.replyAlt('/mudo -d /Grupo L200/'), [
            '🔇 *Silenciado:* 👥 Grupo sobre L200 — apagadas\n💡 _Só o aviso some: as mensagens continuam guardadas para o /show. Veja a lista com /mudo._'
        ]);

        assert.deepEqual(await deleted('psiu', { chat: L200 }), []);
        assert.equal((await bot.dbGet("SELECT revoked FROM messages WHERE body = 'psiu'")).revoked, 1, 'guardada para o /show');
        assert.deepEqual(await hits(), [{ target_id: L200, kind: 'apagada' }]);

        assert.equal((await deleted('oi', { chat: GROUP })).length, 1, 'outro grupo avisa');
        assert.equal((await edited('a', 'b', { chat: L200 })).length, 1, 'só as apagadas foram silenciadas');
    });

    test('-a numa pessoa: apagadas, editadas e status dela, em qualquer chat', async () => {
        await bot.replyAlt('/mute -a @5521911111111');

        assert.deepEqual(await deleted('x', { chat: GROUP }), []);
        assert.deepEqual(await edited('a', 'b', { chat: L200 }), []);
        assert.deepEqual(await deleted('meu status', { chat: 'status@broadcast' }), []);
        assert.deepEqual((await hits()).map(h => h.kind), ['apagada', 'editada', 'status']);

        // Outra pessoa continua avisando
        const msg = bot.createMessage({ texto: 'do ciclano', de: CICLANO.jid });
        await bot.deliver(msg);
        assert.equal((await bot.apagar(msg)).length, 1);
    });

    test('-s só os status; silenciar de novo soma; a lista mostra os ignorados', async () => {
        await bot.replyAlt('/mudo -s @5521911111111');
        assert.equal((await deleted('normal')).length, 1);
        assert.deepEqual(await deleted('status', { chat: 'status@broadcast' }), []);

        assert.match((await bot.replyAlt('/mudo -e @5521911111111'))[0], /^🔇 \*Atualizado:\* 👤 Fulano — editadas, status/);
        await bot.replyAlt('/mudo -d -e L200');

        const [list] = await bot.replyAlt('/mudo');
        assert.equal(list, '🔇 *Silenciados* (2)\n\n' +
            '1. 👤 Fulano — editadas, status _(1 aviso ignorado)_\n' +
            '2. 👥 Grupo sobre L200 — apagadas, editadas\n\n' +
            '💡 _Desfaça com /mudo -rm <nº|all>._');
        assert.equal((await bot.replyAlt('/mudo -l'))[0], list);
    });

    test('-rm N e -rm all: os avisos voltam', async () => {
        await bot.replyAlt('/mudo -a @5521911111111');
        await bot.replyAlt('/mudo -d L200');

        assert.deepEqual(await bot.replyAlt('/mudo -rm 1'), ['🔊 Os avisos de 👤 Fulano voltam.']);
        assert.equal((await deleted('voltou')).length, 1);
        assert.deepEqual(await bot.replyAlt('/mudo -rm all'), ['🔊 1 silenciado removido: os avisos voltam.']);
        assert.match((await bot.replyAlt('/mudo'))[0], /🔇 Ninguém silenciado/);
        assert.match((await bot.replyAlt('/mudo -rm 9'))[0], /❌ Nº 9 não existe/);
    });

    test('erros: sem opção, sem alvo, alvo inválido, você mesmo', async () => {
        assert.match((await bot.replyAlt('/mudo L200'))[0], /❌ Escolha o que silenciar/);
        assert.match((await bot.replyAlt('/mudo -d'))[0], /❌ Informe quem/);
        assert.match((await bot.replyAlt('/mudo -d xyz'))[0], /❌ Nenhum grupo com "xyz" no nome/);
        bot.createContact(OWNER.jid, OWNER.nome);
        assert.deepEqual(await bot.replyAlt('/mudo -d @5521900000000'), ['❌ As suas mensagens já não geram avisos.']);
        assert.deepEqual(await bot.dbAll('SELECT * FROM mutes'), []);
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.replyAlt('/mudo -a L200', { de: OTHERAlt.jid }), []);
    });
});
