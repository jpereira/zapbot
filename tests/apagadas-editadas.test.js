/*
 * Mensagens apagadas e editadas: os eventos do WhatsApp e os comandos
 * /show (/undo, /s): as apagadas (padrão, ou -d) e as editadas (-e).
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO, Location } = bot;

const PRIVADO_DONO = DONO.jid;
const TRABALHO = '120363000000000002@g.us';

beforeEach(async () => {
    await bot.reiniciar();
    await bot.setSetting('show.delayMs', 0); // sem a pausa entre os envios
    bot.criarGrupo(TRABALHO, 'Trabalho', [DONO.jid, OUTRO.jid]);
});

// Mensagem recebida e depois apagada
async function mensagemApagada(texto, opcoes = {}) {
    const msg = bot.criarMensagem({ texto, de: OUTRO.jid, ...opcoes });
    await bot.entregar(msg);
    return { msg, alerta: await bot.apagar(msg) };
}

async function mensagemEditada(texto, novo, opcoes = {}) {
    const msg = bot.criarMensagem({ texto, de: OUTRO.jid, ...opcoes });
    await bot.entregar(msg);
    return { msg, alerta: await bot.editar(msg, novo) };
}

describe('evento: mensagem apagada', () => {
    test('avisa no seu privado com grupo, autor e texto; marca como apagada', async () => {
        const { msg, alerta } = await mensagemApagada('segredo');

        assert.equal(alerta.length, 1);
        assert.equal(alerta[0].chatId, PRIVADO_DONO);
        assert.match(alerta[0].texto, /❌ \*MENSAGEM APAGADA DETECTADA\*/);
        assert.match(alerta[0].texto, /👥 \*Grupo:\* Família/);
        assert.match(alerta[0].texto, /👤 \*Nome:\* Fulano/);
        assert.match(alerta[0].texto, /📱 \*Número:\* \+5521911111111/);
        assert.match(alerta[0].texto, /💬 \*Texto:\* "segredo"/);

        const row = await bot.dbGet('SELECT revoked, revoked_at FROM messages WHERE id = ?', [msg.id.id]);
        assert.equal(row.revoked, 1);
        assert.ok(row.revoked_at > 0);
    });

    test('mensagem que não está no banco: só registra no log', async () => {
        const fantasma = bot.criarMensagem({ texto: 'x', de: OUTRO.jid, id: 'NUNCA_VISTA' });
        const logAntes = bot.logs.length;
        assert.deepEqual(await bot.apagar(fantasma), []);
        assert.ok(bot.errosNoLog(logAntes).some(l => l.includes('NUNCA_VISTA não encontrada')));
    });

    test('status apagado: título próprio; show.revoke.status off ignora', async () => {
        const { alerta } = await mensagemApagada('meu status', { chat: 'status@broadcast' });
        assert.match(alerta[0].texto, /📸 \*STATUS APAGADO DETECTADO\*/);

        await bot.setSetting('show.revoke.status', false);
        const { msg, alerta: nada } = await mensagemApagada('outro status', { chat: 'status@broadcast' });
        assert.deepEqual(nada, []);
        assert.equal((await bot.dbGet('SELECT revoked FROM messages WHERE id = ?', [msg.id.id])).revoked, 0);
    });

    test('mídia apagada volta como mídia, com a legenda', async () => {
        const { alerta } = await mensagemApagada('legenda da foto', {
            tipo: 'image', midia: { mimetype: 'image/jpeg', data: Buffer.from('jpg').toString('base64') }
        });
        assert.equal(alerta.length, 1);
        assert.equal(alerta[0].content.mimetype, 'image/jpeg');
        assert.match(alerta[0].options.caption, /🎬 \*Tipo:\* IMAGE[\s\S]*💬 \*Legenda:\* "legenda da foto"/);
    });

    test('áudio apagado volta como nota de voz, depois do aviso', async () => {
        const { alerta } = await mensagemApagada('', { tipo: 'ptt', midia: { mimetype: 'audio/ogg; codecs=opus', data: 'AA==' } });
        assert.equal(alerta.length, 2);
        assert.match(alerta[0].texto, /🎵 \*Tipo:\* ÁUDIO \/ NOTA DE VOZ/);
        assert.equal(alerta[1].content.mimetype, 'audio/ogg');
        assert.equal(alerta[1].options.sendAudioAsVoice, true);
    });

    test('documento apagado volta como documento', async () => {
        const { alerta } = await mensagemApagada('contrato', { tipo: 'document', midia: { mimetype: 'application/pdf', data: 'AA==' } });
        assert.equal(alerta.length, 1);
        assert.equal(alerta[0].options.sendMediaAsDocument, true);
        assert.match(alerta[0].options.caption, /📄 \*Tipo:\* DOCUMENTO\n💬 \*Legenda:\* "contrato"/);
    });

    test('contato (vCard de verdade) volta como contato', async () => {
        const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Maria\nEND:VCARD';
        const { alerta } = await mensagemApagada(vcard, { tipo: 'vcard' });
        assert.equal(alerta.length, 2);
        assert.match(alerta[0].texto, /📇 \*Tipo:\* CARTÃO DE CONTATO/);
        assert.equal(alerta[1].content, vcard);
        assert.equal(alerta[1].options.parseVCards, true);
    });

    test('remetente @lid: o aviso mostra o nome e o telefone reais', async () => {
        bot.client.lids.set('999@lid', OUTRO.jid);
        const msg = bot.criarMensagem({ texto: 'de um lid', de: '999@lid' });
        await bot.entregar(msg);
        const [alerta] = await bot.apagar(msg);
        assert.match(alerta.texto, /👤 \*Nome:\* Fulano\n📱 \*Número:\* \+5521911111111/);
    });

    test('mídia sem o arquivo no disco: avisa que não está disponível', async () => {
        const msg = bot.criarMensagem({ texto: '', de: OUTRO.jid, tipo: 'image', midia: { mimetype: 'image/jpeg', data: 'AA==' } });
        await bot.entregar(msg);
        const { media_path } = await bot.dbGet('SELECT media_path FROM messages WHERE id = ?', [msg.id.id]);
        fs.unlinkSync(media_path);

        const [alerta] = await bot.apagar(msg);
        assert.match(alerta.texto, /IMAGE _\(arquivo não disponível no cache\)_/);
    });

    test('localização apagada: link do mapa + a localização', async () => {
        const { alerta } = await mensagemApagada('Praia', { tipo: 'location', extras: { location: { latitude: -22.9, longitude: -43.1 } } });
        assert.equal(alerta.length, 2);
        assert.match(alerta[0].texto, /google\.com\/maps\?q=-22\.9,-43\.1/);
        assert.ok(alerta[1].content instanceof Location);
    });

    test('contato com texto que não é vCard vai só como texto (nunca cru)', async () => {
        const { alerta } = await mensagemApagada('/cache -a', { tipo: 'vcard' });
        assert.equal(alerta.length, 1);
        assert.match(alerta[0].texto, /CARTÃO DE CONTATO[\s\S]*💬 \*Conteúdo:\* "\/cache -a"/);
    });

    test('conta no /stats para o autor; apagada por você conta para você', async () => {
        await mensagemApagada('a');
        const minha = bot.criarMensagem({ texto: 'b' });
        await bot.entregar(minha);
        await bot.apagar(minha);

        const apagadas = await bot.dbAll('SELECT sender_id, SUM(deleted) AS n FROM stats WHERE deleted > 0 GROUP BY sender_id ORDER BY sender_id');
        assert.deepEqual(apagadas, [{ sender_id: DONO.user, n: 1 }, { sender_id: OUTRO.user, n: 1 }]);
    });
});

describe('evento: mensagem editada', () => {
    test('avisa com o antes e o depois, grava a edição e o texto final', async () => {
        const { msg, alerta } = await mensagemEditada('reunião às 14h', 'reunião às 15h');

        assert.equal(alerta.length, 1);
        assert.equal(alerta[0].chatId, PRIVADO_DONO);
        assert.match(alerta[0].texto, /✏️ \*MENSAGEM EDITADA DETECTADA\*/);
        assert.match(alerta[0].texto, /👥 \*Grupo:\* Família/);
        assert.match(alerta[0].texto, /📝 \*Antes:\* "reunião às 14h"\n💬 \*Depois:\* "reunião às 15h"/);

        const edit = await bot.dbGet('SELECT * FROM message_edits WHERE message_id = ?', [msg.id.id]);
        assert.deepEqual([edit.old_body, edit.new_body, edit.sender_number], ['reunião às 14h', 'reunião às 15h', OUTRO.user]);
        assert.equal((await bot.dbGet('SELECT body FROM messages WHERE id = ?', [msg.id.id])).body, 'reunião às 15h');
    });

    test('ignora: mudança que não é edição, as suas edições e texto igual', async () => {
        const msg = bot.criarMensagem({ texto: 'a', de: OUTRO.jid });
        await bot.entregar(msg);
        assert.deepEqual(await bot.editar(msg, 'b', { realmente: false }), []);
        assert.deepEqual(await bot.editar(msg, 'a'), []);

        const minha = bot.criarMensagem({ texto: 'x' });
        await bot.entregar(minha);
        assert.deepEqual(await bot.editar(minha, 'y'), []);

        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 0);
    });

    test('a mesma edição avisada duas vezes (body e caption) é gravada uma vez', async () => {
        const msg = bot.criarMensagem({ texto: 'a', de: OUTRO.jid });
        await bot.entregar(msg);
        const quando = Date.now();
        assert.equal((await bot.editar(msg, 'b', { editadaEm: quando })).length, 1);
        assert.equal((await bot.editar(msg, 'b', { editadaEm: quando })).length, 0);
        assert.equal((await bot.editar(msg, 'c', { antigo: 'b', editadaEm: quando + 1000 })).length, 1);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 2);
    });

    test('show.alert.edit off: guarda sem avisar; conta no /stats', async () => {
        await bot.setSetting('show.alert.edit', false);
        const { msg, alerta } = await mensagemEditada('a', 'b');
        assert.deepEqual(alerta, []);
        assert.ok(await bot.dbGet('SELECT 1 FROM message_edits WHERE message_id = ?', [msg.id.id]));
        assert.equal((await bot.dbGet('SELECT SUM(edited) AS n FROM stats')).n, 1);
    });
});

describe('/show (/undo, /s)', () => {
    test('sem apagadas neste chat', async () => {
        assert.deepEqual(await bot.responder('/show'), ['♻️ Nenhuma mensagem apagada registrada neste chat.']);
    });

    test('a última, ou as N últimas em ordem cronológica', async () => {
        for (const t of ['um', 'dois', 'três']) await mensagemApagada(t);

        const [resumo, unica] = await bot.responder('/show');
        assert.equal(resumo, '♻️ *1 mensagem apagada*');
        assert.match(unica, /❌ \*MENSAGEM APAGADA\* \(1\/1\)[\s\S]*"três"/);

        const r = await bot.responder('/undo -2');
        assert.equal(r[0], '♻️ *2 mensagens apagadas*');
        assert.match(r[1], /"dois"/);
        assert.match(r[2], /"três"/);

        assert.equal((await bot.responder('/s 5'))[0], '♻️ *3 mensagens apagadas* (pedidas 5, encontradas 3)');
    });

    test('acima do show.max é limitado', async () => {
        await bot.setSetting('show.max', 1);
        await mensagemApagada('a');
        await mensagemApagada('b');
        assert.equal((await bot.responder('/show -9'))[0], '♻️ *1 mensagem apagada*\n_(limitado a 1 por vez)_');
    });

    test('argumento inválido mostra a sintaxe', async () => {
        for (const linha of ['/show abc', '/show 1 2', '/show -0']) {
            assert.match((await bot.responder(linha))[0], /Usage: \/show/, linha);
        }
    });

    test('-pv manda o resumo e as mensagens no seu privado', async () => {
        await mensagemApagada('privado');
        const r = await bot.executar('/show -pv');
        assert.equal(r[0].chatId, GRUPO);
        assert.equal(r[0].texto, '♻️ Enviado no seu privado.');
        assert.ok(r.slice(1).every(e => e.chatId === PRIVADO_DONO));
        assert.match(r[1].texto, /💬 \*Chat:\* Família/);
    });

    test('-l: apagadas e editadas de todos os chats, marcando o atual', async () => {
        await mensagemApagada('a');
        await mensagemApagada('b');
        await mensagemApagada('c', { chat: TRABALHO });
        await mensagemEditada('x', 'y', { chat: TRABALHO });

        const [r] = await bot.responder('/show -l');
        assert.match(r, /🗑️ \*Deletadas:\* 3/);
        assert.match(r, /1\. 👥 Família — \*2\*.*← _este chat_/);
        assert.match(r, /2\. 👥 Trabalho — \*1\*/);
        assert.match(r, /✏️ \*Editadas:\* 1[^\n]*\n1\. 👥 Trabalho — \*1\*/);
        assert.doesNotMatch(r.split('Editadas')[1], /← _este chat_/);

        // Com -e a lista é a mesma
        assert.equal((await bot.responder('/show -e -l'))[0], r);
    });

    test('-l -pv manda a lista no seu privado', async () => {
        await mensagemApagada('a');
        const r = await bot.executar('/show -l -pv');
        assert.equal(r[0].texto, '🗄️ Resumo enviado no seu privado.');
        assert.equal(r[1].chatId, PRIVADO_DONO);
    });

    test('-c pelo nº da lista ou pelo nome (em qualquer chat)', async () => {
        await mensagemApagada('do trabalho', { chat: TRABALHO });
        await mensagemApagada('da família');
        // Empate em quantidade: a apagada mais recente vem antes (Família = nº 1)
        await bot.responder('/show -l');

        const porNumero = await bot.responder('/show -c 1', { chat: OUTRO.jid });
        assert.match(porNumero[0], /💬 \*Chat:\* Família/);
        assert.match(porNumero[1], /"da família"/);

        const porNome = await bot.responder('/show -c trab');
        assert.match(porNome[1], /"do trabalho"/);
    });

    test('-c inexistente, sem correspondência ou ambíguo', async () => {
        await mensagemApagada('a');
        await mensagemApagada('b', { chat: TRABALHO });
        assert.match((await bot.responder('/show -c 9'))[0], /❌ Chat nº 9 não existe/);
        assert.match((await bot.responder('/show -c xyz'))[0], /❌ Nenhum chat com apagadas contém "xyz"/);
        assert.match((await bot.responder('/show -c a'))[0], /🔎 "a" corresponde a 2 chats/);
    });

    test('-f: só o dono; remove só as deste chat (e as mídias)', async () => {
        const { msg } = await mensagemApagada('foto', { midia: { mimetype: 'image/png', data: 'AA==' } });
        await mensagemApagada('b', { chat: TRABALHO });
        const { media_path } = await bot.dbGet('SELECT media_path FROM messages WHERE id = ?', [msg.id.id]);

        assert.deepEqual(await bot.responder('/show -f', { de: OUTRO.jid }), []); // onlyAdmin

        const [r] = await bot.responder('/show -f');
        assert.match(r, /🧹 \*Flush das mensagens apagadas deste chat\*[\s\S]*Removidas: \*1 mensagem\*[\s\S]*Mídias apagadas do disco: \*1\*/);
        assert.ok(!fs.existsSync(media_path));
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE revoked = 1')).n, 1);
    });

    test('-f no seu privado remove de todos; -f -c de um chat', async () => {
        await mensagemApagada('a');
        await mensagemApagada('b', { chat: TRABALHO });
        await mensagemApagada('c', { chat: TRABALHO });

        const [umChat] = await bot.responder('/show -f -c trabalho');
        assert.match(umChat, /Flush das mensagens apagadas de:\* Trabalho[\s\S]*\*2 mensagens\*/);

        const [geral] = await bot.responder('/show -f', { chat: PRIVADO_DONO });
        assert.match(geral, /🧹 \*Flush geral das mensagens apagadas\*[\s\S]*\*1 mensagem\* de \*1 chat\*/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE revoked = 1')).n, 0);
    });
});

describe('/show -e (editadas)', () => {
    test('sem editadas neste chat', async () => {
        assert.deepEqual(await bot.responder('/show -e'), ['✏️ Nenhuma mensagem editada registrada neste chat.']);
    });

    test('-d (o padrão) mostra as apagadas, -e as editadas; os dois juntos não', async () => {
        await mensagemApagada('apagada');
        await mensagemEditada('antes', 'depois');

        assert.match((await bot.responder('/show -d'))[1], /MENSAGEM APAGADA[\s\S]*"apagada"/);
        assert.match((await bot.responder('/show -deleted'))[1], /"apagada"/);
        assert.match((await bot.responder('/show -edited'))[1], /MENSAGEM EDITADA[\s\S]*"depois"/);
        assert.deepEqual(await bot.responder('/show -d -e'), ['❌ Use -d (apagadas) ou -e (editadas), não os dois.']);
    });

    test('/edit e /e não existem mais', async () => {
        await mensagemEditada('x', 'y');
        assert.deepEqual(await bot.responder('/edit'), []);
        assert.deepEqual(await bot.responder('/e'), []);
    });

    test('a última e as N últimas, com antes e depois', async () => {
        await mensagemEditada('a1', 'a2');
        await mensagemEditada('b1', 'b2');

        const [resumo, item] = await bot.responder('/show -e');
        assert.equal(resumo, '✏️ *1 mensagem editada*');
        assert.match(item, /✏️ \*MENSAGEM EDITADA\* \(1\/1\)[\s\S]*Antes:\* "b1"\n💬 \*Depois:\* "b2"/);

        const r = await bot.responder('/s -2 -e');
        assert.equal(r[0], '✏️ *2 mensagens editadas*');
        assert.match(r[1], /"a2"/);
    });

    test('-c e -pv', async () => {
        await mensagemEditada('x', 'y', { chat: TRABALHO });
        const r = await bot.executar('/show -e -c trabalho -pv');
        assert.equal(r[0].texto, '✏️ Enviado no seu privado.');
        assert.match(r[1].texto, /💬 \*Chat:\* Trabalho/);
        assert.equal(r[2].chatId, PRIVADO_DONO);
    });

    test('-c sem editadas; o nº é o da lista de editadas', async () => {
        assert.equal((await bot.responder('/show -e -c 1'))[0], '✏️ Nenhuma mensagem editada no cache.');

        await mensagemApagada('a');
        await mensagemEditada('x', 'y', { chat: TRABALHO });
        await bot.responder('/show -l');
        assert.match((await bot.responder('/show -e -c 1'))[0], /💬 \*Chat:\* Trabalho/);
        assert.match((await bot.responder('/show -c 1'))[0], /💬 \*Chat:\* Família/);
    });

    test('dica no seu privado aponta para o -e', async () => {
        const [r] = await bot.responder('/show -e', { chat: PRIVADO_DONO });
        assert.match(r, /\/show -l e depois \/show -e -N -c <nº ou nome>/);
    });

    test('-f remove as editadas deste chat; não mexe nas apagadas', async () => {
        await mensagemEditada('x', 'y');
        await mensagemApagada('z');
        const [r] = await bot.responder('/show -e -f');
        assert.match(r, /Flush das mensagens editadas deste chat[\s\S]*\*1 mensagem\*[\s\S]*use \/show -e -f no seu privado/);
        assert.doesNotMatch(r, /Mídias/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE revoked = 1')).n, 1);
    });
});
