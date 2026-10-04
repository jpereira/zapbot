/*
 * /mute (/mudo, /m) e /unmute: silenciar os avisos de apagadas, editadas e status
 * apagados de uma pessoa, de um grupo ou de uma comunidade, e desfazer.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;
const { lerMudo } = bot.src('comandos/mute');

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

describe('/mute (/mudo, /m)', () => {
    test('lerMudo: opções antes do alvo; /nome/ e aspas', () => {
        assert.deepEqual([...lerMudo('-d -e /Grupo L200/').colunas], ['deleted', 'edited']);
        assert.equal(lerMudo('-d -e /Grupo L200/').alvo, 'Grupo L200');
        assert.equal(lerMudo('-a "Grupo L200"').alvo, 'Grupo L200');
        assert.deepEqual([...lerMudo('-all x').colunas], ['deleted', 'edited', 'status']);
        assert.equal(lerMudo('-rm 2').rm, '2');
        assert.match(lerMudo('-x y').erro, /Opção desconhecida: -x/);
    });

    test('-d num grupo: as apagadas dali não avisam, mas ficam guardadas; as de outros grupos avisam', async () => {
        assert.deepEqual(await bot.responder('/mute -d /Grupo L200/'), [
            '🔇 *Silenciado:* 👥 Grupo sobre L200 — apagadas\n💡 _Só o aviso some: as mensagens continuam guardadas para o /show. Veja a lista com /mute; desfaça com /unmute._'
        ]);

        assert.deepEqual(await apagada('psiu', { chat: L200 }), []);
        assert.equal((await bot.dbGet("SELECT revoked FROM messages WHERE body = 'psiu'")).revoked, 1, 'guardada para o /show');
        assert.deepEqual(await hits(), [{ target_id: L200, kind: 'apagada' }]);

        assert.equal((await apagada('oi', { chat: GRUPO })).length, 1, 'outro grupo avisa');
        assert.equal((await editada('a', 'b', { chat: L200 })).length, 1, 'só as apagadas foram silenciadas');
    });

    test('-a numa pessoa: apagadas, editadas e status dela, em qualquer chat', async () => {
        await bot.responder('/mute -a +5521911111111');

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
        await bot.responder('/mute -s +5521911111111');
        assert.equal((await apagada('normal')).length, 1);
        assert.deepEqual(await apagada('status', { chat: 'status@broadcast' }), []);

        assert.match((await bot.responder('/mute -e +5521911111111'))[0], /^🔇 \*Atualizado:\* 👤 Fulano — editadas, status/);
        await bot.responder('/mute -d -e L200');

        const [lista] = await bot.responder('/mute');
        assert.equal(lista, '🔇 *Silenciados* (2)\n\n' +
            '1. 👤 Fulano — editadas, status _(1 aviso ignorado)_\n' +
            '2. 👥 Grupo sobre L200 — apagadas, editadas\n\n' +
            '💡 _Desfaça com /unmute <nº|nome> (ou /unmute -all, todos)._');
        assert.equal((await bot.responder('/mute -l'))[0], lista);
    });

    test('-rm N e -rm all: os avisos voltam', async () => {
        await bot.responder('/mute -a +5521911111111');
        await bot.responder('/mute -d L200');

        assert.deepEqual(await bot.responder('/mute -rm 1'), ['🔊 Os avisos de 👤 Fulano voltam.']);
        assert.equal((await apagada('voltou')).length, 1);
        assert.deepEqual(await bot.responder('/mute -rm all'), ['🔊 1 silenciado removido: os avisos voltam.']);
        assert.match((await bot.responder('/mute'))[0], /🔇 Ninguém silenciado/);
        assert.match((await bot.responder('/mute -rm 9'))[0], /❌ Nº 9 não existe/);
    });

    test('só o alvo, sem opção, é o -a: silencia tudo', async () => {
        assert.match((await bot.responder('/mute /Grupo sobre L200/'))[0], /^🔇 \*Silenciado:\* 👥 Grupo sobre L200 — apagadas, editadas, status\n/);
        assert.match((await bot.responder('/mute +5521911111111'))[0], /^🔇 \*Silenciado:\* 👤 Fulano — apagadas, editadas, status\n/);
    });

    test('erros: sem alvo, alvo inválido, você mesmo', async () => {
        assert.match((await bot.responder('/mute -d'))[0], /❌ Informe quem/);
        assert.match((await bot.responder('/mute -d xyz'))[0], /❌ Nenhum contato ou grupo com "xyz" no nome/);
        assert.match((await bot.responder('/mute -d email'))[0], /❌ O \/mute silencia uma pessoa ou um grupo/);
        bot.criarContato(DONO.jid, DONO.nome);
        assert.deepEqual(await bot.responder('/mute -d +5521900000000'), ['❌ As suas mensagens já não geram avisos.']);
        assert.deepEqual(await bot.dbAll('SELECT * FROM mutes'), []);
    });

    test('alvo pelo nome: o contato antes do grupo; o nome inteiro igual ganha', async () => {
        bot.criarGrupo('120363000000000201@g.us', 'Fulano e amigos', [DONO.jid]);
        bot.criarGrupo('120363000000000202@g.us', 'Ciclano', [DONO.jid]);

        assert.match((await bot.responder('/mute -s fulano'))[0], /^🔇 \*Silenciado:\* 👤 Fulano — status/);
        assert.match((await bot.responder('/mute -d /amigos/'))[0], /^🔇 \*Silenciado:\* 👥 Fulano e amigos — apagadas/);
        assert.match((await bot.responder('/mute -e "Ciclano"'))[0], /^🔇 \*Silenciado:\* 👤 Ciclano — editadas/);
        assert.match((await bot.responder('/mute -e +55 21 92222-2222'))[0], /^🔇 \*Atualizado:\* 👤 Ciclano — editadas/);
    });

    test('vários contatos com o nome: a lista, e o nº respondido escolhe', async () => {
        bot.criarContato('5521933333333@c.us', 'Jorge Pereira');
        bot.criarContato('5511944444444@c.us', 'Jorge Silva');

        const r = await bot.responderEscolhendo('/m -a /jorge/', [9, 2]);
        assert.deepEqual(r, [
            '🔎 "jorge" corresponde a 2 contatos:\n\n1. 👤 Jorge Pereira · +5521933333333\n2. 👤 Jorge Silva · +5511944444444\n\n' +
                '💡 _Responda só com o nº (em até 2 minutos), ou repita o comando com mais palavras do nome._',
            '❌ Escolha um nº de 1 a 2.',
            '🔇 *Silenciado:* 👤 Jorge Silva — apagadas, editadas, status\n' +
                '💡 _Só o aviso some: as mensagens continuam guardadas para o /show. Veja a lista com /mute; desfaça com /unmute._'
        ]);
        assert.deepEqual((await bot.dbAll('SELECT target_id FROM mutes')).map(m => m.target_id), ['5511944444444@c.us']);

        // Sem escolha pendente, um nº é uma mensagem comum
        assert.deepEqual(await bot.responder('1'), []);
    });

    test('lista de escolha de um admin extra: só ele responde (o seu nº não conta)', async () => {
        await bot.setSetting('bot.admins', [OUTRO.user]);
        bot.criarContato('5521933333333@c.us', 'Jorge Pereira');
        bot.criarContato('5511944444444@c.us', 'Jorge Silva');

        const comando = bot.executar('/mute -a jorge', { de: OUTRO.jid });
        for (let i = 0; i < 50; i++) await new Promise(setImmediate);

        assert.deepEqual(await bot.responder('1'), [], 'o dono respondendo: mensagem comum');
        await bot.executar('2', { de: OUTRO.jid });
        await comando;
        assert.deepEqual((await bot.dbAll('SELECT target_id FROM mutes')).map(m => m.target_id), ['5511944444444@c.us']);
    });

    test('a escolha expira em 2 minutos sem fazer nada', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        bot.criarContato('5521933333333@c.us', 'Jorge Pereira');
        bot.criarContato('5511944444444@c.us', 'Jorge Silva');

        const comando = bot.executar('/mute -a jorge');
        for (let i = 0; i < 50; i++) await new Promise(setImmediate);
        t.mock.timers.tick(bot.src('escolhas').ESCOLHA_MS);

        const r = (await comando).map(e => e.texto);
        assert.equal(r.at(-1), '⌛ Nenhum nº escolhido para "jorge" em 2 minutos: nada foi feito.');
        assert.deepEqual(await bot.dbAll('SELECT * FROM mutes'), []);
        assert.deepEqual(await bot.responder('1'), []);
    });

    test('alvo por menção (@ no WhatsApp): o LID vira o telefone', async () => {
        bot.client.lids.set('100000000000002@lid', CICLANO.jid);
        assert.match((await bot.responder('/m -a @100000000000002', { mencoes: ['100000000000002@lid'] }))[0], /^🔇 \*Silenciado:\* 👤 Ciclano — /);
        assert.deepEqual((await bot.dbAll('SELECT target_id FROM mutes')).map(m => m.target_id), [CICLANO.jid]);
    });

    test('/mudo e /m são o /mute', async () => {
        assert.match((await bot.responder('/mudo -d /Grupo L200/'))[0], /^🔇 \*Silenciado:\* 👥 Grupo sobre L200 — apagadas/);
        assert.match((await bot.responder('/m'))[0], /^🔇 \*Silenciados\* \(1\)/);
    });

    test('respondendo um aviso: de onde ele veio (a pessoa no privado e no status, o grupo, a comunidade)', async () => {
        // A resposta ao aviso (o aviso é uma mensagem sua, no seu privado)
        const respondendo = (linha, aviso) => bot.responder(linha, {
            chat: DONO.jid, citada: bot.criarMensagem({ texto: aviso.texto, chat: DONO.jid, id: aviso.id.id })
        });

        // No privado do Fulano: ele
        const [doPrivado] = await apagada('psiu', { chat: OUTRO.jid });
        assert.match((await respondendo('/mute', doPrivado))[0], /^🔇 \*Silenciado:\* 👤 Fulano — apagadas, editadas, status/);

        // Num grupo: o grupo (com a opção, só aquilo)
        const [doGrupo] = await apagada('oi', { chat: L200, de: CICLANO.jid });
        assert.match((await respondendo('/mute -s', doGrupo))[0], /^🔇 \*Silenciado:\* 👥 Grupo sobre L200 — status/);

        // Num status: a pessoa
        const [doStatus] = await apagada('meu status', { chat: 'status@broadcast', de: CICLANO.jid });
        assert.match((await respondendo('/mute -s', doStatus))[0], /^🔇 \*Silenciado:\* 👤 Ciclano — status/);

        // Na comunidade (o grupo de avisos dela): a comunidade
        const COMUNIDADE = '120363000000000900@g.us';
        bot.criarGrupo(COMUNIDADE, 'Condomínio', [DONO.jid, OUTRO.jid]).groupMetadata.defaultSubgroup = true;
        await bot.responder('/unmute -all');
        const [daComunidade] = await apagada('aviso', { chat: COMUNIDADE });
        assert.match((await respondendo('/mute', daComunidade))[0], /^🔇 \*Silenciado:\* 🏘️ Condomínio — /);
        assert.deepEqual(await apagada('outro aviso', { chat: COMUNIDADE }), [], 'silenciada');
        assert.match((await bot.responder('/mute'))[0], /1\. 🏘️ Condomínio — apagadas, editadas, status/);

        // Aviso antigo (sem a origem guardada): a pessoa do "📱 Número"
        await bot.responder('/unmute -all');
        const antigo = { texto: '❌ *MENSAGEM APAGADA DETECTADA*\n\n👤 *Nome:* Ciclano\n📱 *Número:* +5521922222222', id: { id: 'VELHO1' } };
        assert.match((await respondendo('/mute -d', antigo))[0], /^🔇 \*Silenciado:\* 👤 Ciclano — apagadas/);

        // A mensagem de alguém (não um aviso): quem a mandou
        const deAlguem = bot.criarMensagem({ texto: 'oi', de: OUTRO.jid, chat: L200 });
        assert.match((await bot.responder('/mute -e', { chat: L200, citada: deAlguem }))[0], /^🔇 \*Silenciado:\* 👤 Fulano — editadas/);

        // Uma mensagem sua que não é aviso: não sabe de quem é
        const minha = bot.criarMensagem({ texto: 'nada', chat: DONO.jid });
        assert.match((await bot.responder('/mute', { chat: DONO.jid, citada: minha }))[0], /^❌ Não sei de quem é essa mensagem/);
    });

    test('/unmute: pelo nome, pelo nº, respondendo um aviso, -all; quem não está silenciado', async () => {
        // Um aviso do Ciclano (no privado dele), antes de silenciar
        const [aviso] = await apagada('x', { chat: CICLANO.jid, de: CICLANO.jid });

        await bot.responder('/mute /Grupo L200/');
        await bot.responder('/mute +5521911111111');
        await bot.responder('/mute +5521922222222');

        assert.deepEqual(await bot.responder('/unmute /Grupo L200/'), ['🔊 Os avisos de 👥 Grupo sobre L200 voltam.']);
        assert.deepEqual(await bot.responder('/unmute 1'), ['🔊 Os avisos de 👤 Fulano voltam.']);
        assert.deepEqual(await bot.responder('/unmute /Grupo L200/'), ['ℹ️ 👥 Grupo sobre L200 não está silenciado.\n💡 _Veja a lista com /mute_']);

        // Respondendo o aviso do Ciclano
        assert.deepEqual(await bot.responder('/unmute', {
            chat: DONO.jid, citada: bot.criarMensagem({ texto: aviso.texto, chat: DONO.jid, id: aviso.id.id })
        }), ['🔊 Os avisos de 👤 Ciclano voltam.']);

        // -all (e o -a); sem nada, a lista
        await bot.responder('/mute /Grupo L200/');
        await bot.responder('/mute +5521911111111');
        assert.deepEqual(await bot.responder('/unmute -all'), ['🔊 2 silenciados removidos: os avisos voltam.']);
        await bot.responder('/mute /Grupo L200/');
        assert.deepEqual(await bot.responder('/unmute -a'), ['🔊 1 silenciado removido: os avisos voltam.']);
        assert.match((await bot.responder('/unmute'))[0], /^🔇 Ninguém silenciado\./);
        assert.match((await bot.responder('/unmute 9'))[0], /^❌ Nº 9 não existe/);
    });

    test('limpeza: os avisos ignorados e a origem dos avisos com mais de 30 dias saem', async () => {
        const { limparIgnoradasAntigas } = bot.src('limpeza');
        const velho = Date.now() - 31 * 86400_000;
        await bot.dbRun("INSERT INTO mute_hits (target_id, kind, at) VALUES ('x', 'apagada', ?), ('y', 'apagada', ?)",
            [velho, Date.now()]);
        await bot.dbRun(
            "INSERT INTO alerts (message_id, chat_id, sender, created_at) VALUES ('A1', ?, NULL, ?), ('A2', ?, NULL, ?)",
            [L200, velho, L200, Date.now()]);

        await limparIgnoradasAntigas();
        assert.deepEqual((await hits()).map(h => h.target_id), ['y']);
        assert.deepEqual((await bot.dbAll('SELECT message_id FROM alerts')).map(a => a.message_id), ['A2']);
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.responder('/mute -a L200', { de: OUTRO.jid }), []);
    });
});
