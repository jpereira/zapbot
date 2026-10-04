/*
 * /mute (/mudo, /m) and /unmute: mute the notices of deleted, edited and status messages
 * deleted of a person, a group or a community, and undo.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const { readMuted } = bot.src('commands/mute');

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

describe('/mute (/mudo, /m)', () => {
    test('lerMudo: opções antes do alvo; /nome/ e aspas', () => {
        assert.deepEqual([...readMuted('-d -e /Grupo L200/').colunas], ['deleted', 'edited']);
        assert.equal(readMuted('-d -e /Grupo L200/').alvo, 'Grupo L200');
        assert.equal(readMuted('-a "Grupo L200"').alvo, 'Grupo L200');
        assert.deepEqual([...readMuted('-all x').colunas], ['deleted', 'edited', 'status']);
        assert.equal(readMuted('-rm 2').rm, '2');
        assert.match(readMuted('-x y').erro, /Opção desconhecida: -x/);
    });

    test('-d num grupo: as apagadas dali não avisam, mas ficam guardadas; as de outros grupos avisam', async () => {
        assert.deepEqual(await bot.replyAlt('/mute -d /Grupo L200/'), [
            '🔇 *Silenciado:* 👥 Grupo sobre L200 — apagadas\n💡 _Só o aviso some: as mensagens continuam guardadas para o /show. Veja a lista com /mute; desfaça com /unmute._'
        ]);

        assert.deepEqual(await deleted('psiu', { chat: L200 }), []);
        assert.equal((await bot.dbGet("SELECT revoked FROM messages WHERE body = 'psiu'")).revoked, 1, 'guardada para o /show');
        assert.deepEqual(await hits(), [{ target_id: L200, kind: 'apagada' }]);

        assert.equal((await deleted('oi', { chat: GROUP })).length, 1, 'outro grupo avisa');
        assert.equal((await edited('a', 'b', { chat: L200 })).length, 1, 'só as apagadas foram silenciadas');
    });

    test('-a numa pessoa: apagadas, editadas e status dela, em qualquer chat', async () => {
        await bot.replyAlt('/mute -a +5521911111111');

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
        await bot.replyAlt('/mute -s +5521911111111');
        assert.equal((await deleted('normal')).length, 1);
        assert.deepEqual(await deleted('status', { chat: 'status@broadcast' }), []);

        assert.match((await bot.replyAlt('/mute -e +5521911111111'))[0], /^🔇 \*Atualizado:\* 👤 Fulano — editadas, status/);
        await bot.replyAlt('/mute -d -e L200');

        const [list] = await bot.replyAlt('/mute');
        assert.equal(list, '🔇 *Silenciados* (2)\n\n' +
            '1. 👤 Fulano — editadas, status _(1 aviso ignorado)_\n' +
            '2. 👥 Grupo sobre L200 — apagadas, editadas\n\n' +
            '💡 _Desfaça com /unmute <nº|nome> (ou /unmute -all, todos)._');
        assert.equal((await bot.replyAlt('/mute -l'))[0], list);
    });

    test('-rm N e -rm all: os avisos voltam', async () => {
        await bot.replyAlt('/mute -a +5521911111111');
        await bot.replyAlt('/mute -d L200');

        assert.deepEqual(await bot.replyAlt('/mute -rm 1'), ['🔊 Os avisos de 👤 Fulano voltam.']);
        assert.equal((await deleted('voltou')).length, 1);
        assert.deepEqual(await bot.replyAlt('/mute -rm all'), ['🔊 1 silenciado removido: os avisos voltam.']);
        assert.match((await bot.replyAlt('/mute'))[0], /🔇 Ninguém silenciado/);
        assert.match((await bot.replyAlt('/mute -rm 9'))[0], /❌ Nº 9 não existe/);
    });

    test('só o alvo, sem opção, é o -a: silencia tudo', async () => {
        assert.match((await bot.replyAlt('/mute /Grupo sobre L200/'))[0], /^🔇 \*Silenciado:\* 👥 Grupo sobre L200 — apagadas, editadas, status\n/);
        assert.match((await bot.replyAlt('/mute +5521911111111'))[0], /^🔇 \*Silenciado:\* 👤 Fulano — apagadas, editadas, status\n/);
    });

    test('erros: sem alvo, alvo inválido, você mesmo', async () => {
        assert.match((await bot.replyAlt('/mute -d'))[0], /❌ Informe quem/);
        assert.match((await bot.replyAlt('/mute -d xyz'))[0], /❌ Nenhum contato ou grupo com "xyz" no nome/);
        assert.match((await bot.replyAlt('/mute -d email'))[0], /❌ O \/mute silencia uma pessoa ou um grupo/);
        bot.createContact(OWNER.jid, OWNER.nome);
        assert.deepEqual(await bot.replyAlt('/mute -d +5521900000000'), ['❌ As suas mensagens já não geram avisos.']);
        assert.deepEqual(await bot.dbAll('SELECT * FROM mutes'), []);
    });

    test('alvo pelo nome: o contato antes do grupo; o nome inteiro igual ganha', async () => {
        bot.createGroup('120363000000000201@g.us', 'Fulano e amigos', [OWNER.jid]);
        bot.createGroup('120363000000000202@g.us', 'Ciclano', [OWNER.jid]);

        assert.match((await bot.replyAlt('/mute -s fulano'))[0], /^🔇 \*Silenciado:\* 👤 Fulano — status/);
        assert.match((await bot.replyAlt('/mute -d /amigos/'))[0], /^🔇 \*Silenciado:\* 👥 Fulano e amigos — apagadas/);
        assert.match((await bot.replyAlt('/mute -e "Ciclano"'))[0], /^🔇 \*Silenciado:\* 👤 Ciclano — editadas/);
        assert.match((await bot.replyAlt('/mute -e +55 21 92222-2222'))[0], /^🔇 \*Atualizado:\* 👤 Ciclano — editadas/);
    });

    test('vários contatos com o nome: a lista, e o nº respondido escolhe', async () => {
        bot.createContact('5521933333333@c.us', 'Jorge Pereira');
        bot.createContact('5511944444444@c.us', 'Jorge Silva');

        const r = await bot.replyChoosing('/m -a /jorge/', [9, 2]);
        assert.deepEqual(r, [
            '🔎 "jorge" corresponde a 2 contatos:\n\n1. 👤 Jorge Pereira · +5521933333333\n2. 👤 Jorge Silva · +5511944444444\n\n' +
                '💡 _Responda só com o nº (em até 2 minutos), ou repita o comando com mais palavras do nome._',
            '❌ Escolha um nº de 1 a 2.',
            '🔇 *Silenciado:* 👤 Jorge Silva — apagadas, editadas, status\n' +
                '💡 _Só o aviso some: as mensagens continuam guardadas para o /show. Veja a lista com /mute; desfaça com /unmute._'
        ]);
        assert.deepEqual((await bot.dbAll('SELECT target_id FROM mutes')).map(m => m.target_id), ['5511944444444@c.us']);

        // Without a pending choice, a no. is a regular message
        assert.deepEqual(await bot.replyAlt('1'), []);
    });

    test('lista de escolha de um admin extra: só ele responde (o seu nº não conta)', async () => {
        await bot.setSetting('bot.admins', [OTHERAlt.user]);
        bot.createContact('5521933333333@c.us', 'Jorge Pereira');
        bot.createContact('5511944444444@c.us', 'Jorge Silva');

        const commandAlt = bot.executar('/mute -a jorge', { de: OTHERAlt.jid });
        for (let i = 0; i < 50; i++) await new Promise(setImmediate);

        assert.deepEqual(await bot.replyAlt('1'), [], 'o dono respondendo: mensagem comum');
        await bot.executar('2', { de: OTHERAlt.jid });
        await commandAlt;
        assert.deepEqual((await bot.dbAll('SELECT target_id FROM mutes')).map(m => m.target_id), ['5511944444444@c.us']);
    });

    test('a escolha expira em 2 minutos sem fazer nada', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        bot.createContact('5521933333333@c.us', 'Jorge Pereira');
        bot.createContact('5511944444444@c.us', 'Jorge Silva');

        const commandAlt = bot.executar('/mute -a jorge');
        for (let i = 0; i < 50; i++) await new Promise(setImmediate);
        t.mock.timers.tick(bot.src('choices').CHOICE_MS);

        const r = (await commandAlt).map(e => e.texto);
        assert.equal(r.at(-1), '⌛ Nenhum nº escolhido para "jorge" em 2 minutos: nada foi feito.');
        assert.deepEqual(await bot.dbAll('SELECT * FROM mutes'), []);
        assert.deepEqual(await bot.replyAlt('1'), []);
    });

    test('alvo por menção (@ no WhatsApp): o LID vira o telefone', async () => {
        bot.client.lids.set('100000000000002@lid', CICLANO.jid);
        assert.match((await bot.replyAlt('/m -a @100000000000002', { mencoes: ['100000000000002@lid'] }))[0], /^🔇 \*Silenciado:\* 👤 Ciclano — /);
        assert.deepEqual((await bot.dbAll('SELECT target_id FROM mutes')).map(m => m.target_id), [CICLANO.jid]);
    });

    test('/mudo e /m são o /mute', async () => {
        assert.match((await bot.replyAlt('/mudo -d /Grupo L200/'))[0], /^🔇 \*Silenciado:\* 👥 Grupo sobre L200 — apagadas/);
        assert.match((await bot.replyAlt('/m'))[0], /^🔇 \*Silenciados\* \(1\)/);
    });

    test('respondendo um aviso: de onde ele veio (a pessoa no privado e no status, o grupo, a comunidade)', async () => {
        // The reply to the notice (the notice is a message from you, in your private chat)
        const replying = (line, notice) => bot.replyAlt(line, {
            chat: OWNER.jid, citada: bot.createMessage({ texto: notice.texto, chat: OWNER.jid, id: notice.id.id })
        });

        // In Fulano's private chat: him
        const [private] = await deleted('psiu', { chat: OTHERAlt.jid });
        assert.match((await replying('/mute', private))[0], /^🔇 \*Silenciado:\* 👤 Fulano — apagadas, editadas, status/);

        // In a group: the group (with the option, only that)
        const [group] = await deleted('oi', { chat: L200, de: CICLANO.jid });
        assert.match((await replying('/mute -s', group))[0], /^🔇 \*Silenciado:\* 👥 Grupo sobre L200 — status/);

        // Num status: a pessoa
        const [doStatus] = await deleted('meu status', { chat: 'status@broadcast', de: CICLANO.jid });
        assert.match((await replying('/mute -s', doStatus))[0], /^🔇 \*Silenciado:\* 👤 Ciclano — status/);

        // In the community (its announcements group): the community
        const COMMUNITY = '120363000000000900@g.us';
        bot.createGroup(COMMUNITY, 'Condomínio', [OWNER.jid, OTHERAlt.jid]).groupMetadata.defaultSubgroup = true;
        await bot.replyAlt('/unmute -all');
        const [community] = await deleted('aviso', { chat: COMMUNITY });
        assert.match((await replying('/mute', community))[0], /^🔇 \*Silenciado:\* 🏘️ Condomínio — /);
        assert.deepEqual(await deleted('outro aviso', { chat: COMMUNITY }), [], 'silenciada');
        assert.match((await bot.replyAlt('/mute'))[0], /1\. 🏘️ Condomínio — apagadas, editadas, status/);

        // Old notice (without the stored origin): the person of "📱 Número"
        await bot.replyAlt('/unmute -all');
        const oldAlt2 = { texto: '❌ *MENSAGEM APAGADA DETECTADA*\n\n👤 *Nome:* Ciclano\n📱 *Número:* +5521922222222', id: { id: 'VELHO1' } };
        assert.match((await replying('/mute -d', oldAlt2))[0], /^🔇 \*Silenciado:\* 👤 Ciclano — apagadas/);

        // Someone's message (not a notice): whoever sent it
        const someone = bot.createMessage({ texto: 'oi', de: OTHERAlt.jid, chat: L200 });
        assert.match((await bot.replyAlt('/mute -e', { chat: L200, citada: someone }))[0], /^🔇 \*Silenciado:\* 👤 Fulano — editadas/);

        // A message of yours that is not a notice: does not know whose it is
        const my = bot.createMessage({ texto: 'nada', chat: OWNER.jid });
        assert.match((await bot.replyAlt('/mute', { chat: OWNER.jid, citada: my }))[0], /^❌ Não sei de quem é essa mensagem/);
    });

    test('/unmute: pelo nome, pelo nº, respondendo um aviso, -all; quem não está silenciado', async () => {
        // A notice from Ciclano (in their private chat), before muting
        const [notice] = await deleted('x', { chat: CICLANO.jid, de: CICLANO.jid });

        await bot.replyAlt('/mute /Grupo L200/');
        await bot.replyAlt('/mute +5521911111111');
        await bot.replyAlt('/mute +5521922222222');

        assert.deepEqual(await bot.replyAlt('/unmute /Grupo L200/'), ['🔊 Os avisos de 👥 Grupo sobre L200 voltam.']);
        assert.deepEqual(await bot.replyAlt('/unmute 1'), ['🔊 Os avisos de 👤 Fulano voltam.']);
        assert.deepEqual(await bot.replyAlt('/unmute /Grupo L200/'), ['ℹ️ 👥 Grupo sobre L200 não está silenciado.\n💡 _Veja a lista com /mute_']);

        // Replying to Ciclano's notice
        assert.deepEqual(await bot.replyAlt('/unmute', {
            chat: OWNER.jid, citada: bot.createMessage({ texto: notice.texto, chat: OWNER.jid, id: notice.id.id })
        }), ['🔊 Os avisos de 👤 Ciclano voltam.']);

        // -all (and -a); with nothing, the list
        await bot.replyAlt('/mute /Grupo L200/');
        await bot.replyAlt('/mute +5521911111111');
        assert.deepEqual(await bot.replyAlt('/unmute -all'), ['🔊 2 silenciados removidos: os avisos voltam.']);
        await bot.replyAlt('/mute /Grupo L200/');
        assert.deepEqual(await bot.replyAlt('/unmute -a'), ['🔊 1 silenciado removido: os avisos voltam.']);
        assert.match((await bot.replyAlt('/unmute'))[0], /^🔇 Ninguém silenciado\./);
        assert.match((await bot.replyAlt('/unmute 9'))[0], /^❌ Nº 9 não existe/);
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.replyAlt('/mute -a L200', { de: OTHERAlt.jid }), []);
    });
});
