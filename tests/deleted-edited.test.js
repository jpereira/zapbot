/*
 * Deleted and edited messages: the WhatsApp events and the commands
 * /show (/undo, /s) e /edit (/e).
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt, Location } = bot;

const PRIVATE_OWNER = OWNER.jid;
const WORK = '120363000000000002@g.us';

beforeEach(async () => {
    await bot.restart();
    await bot.setSetting('show.delayMs', 0); // without the pause between sends
    bot.createGroup(WORK, 'Trabalho', [OWNER.jid, OTHERAlt.jid]);
});

// Message received and later deleted
async function messageDeleted(textAlt, optionsAlt = {}) {
    const msg = bot.createMessage({ texto: textAlt, de: OTHERAlt.jid, ...optionsAlt });
    await bot.deliver(msg);
    return { msg, alerta: await bot.apagar(msg) };
}

async function messageEdited(textAlt, freshAlt, optionsAlt = {}) {
    const msg = bot.createMessage({ texto: textAlt, de: OTHERAlt.jid, ...optionsAlt });
    await bot.deliver(msg);
    return { msg, alerta: await bot.edit(msg, freshAlt) };
}

describe('evento: mensagem apagada', () => {
    test('avisa no seu privado com grupo, autor e texto; marca como apagada', async () => {
        const { msg, alerta: alert } = await messageDeleted('segredo');

        assert.equal(alert.length, 1);
        assert.equal(alert[0].chatId, PRIVATE_OWNER);
        assert.match(alert[0].texto, /❌ \*MENSAGEM APAGADA DETECTADA\*/);
        assert.match(alert[0].texto, /👥 \*Grupo:\* Família/);
        assert.match(alert[0].texto, /👤 \*Nome:\* Fulano/);
        assert.match(alert[0].texto, /📱 \*Número:\* \+5521911111111/);
        assert.match(alert[0].texto, /💬 \*Texto:\* "segredo"/);

        const row = await bot.dbGet('SELECT revoked, revoked_at FROM messages WHERE id = ?', [msg.id.id]);
        assert.equal(row.revoked, 1);
        assert.ok(row.revoked_at > 0);
    });

    test('mensagem que não está no banco: só registra no log', async () => {
        const ghost = bot.createMessage({ texto: 'x', de: OTHERAlt.jid, id: 'NUNCA_VISTA' });
        const logBefore = bot.logs.length;
        assert.deepEqual(await bot.apagar(ghost), []);
        assert.ok(bot.errorsInLog(logBefore).some(l => l.includes('NUNCA_VISTA não encontrada')));
    });

    test('status apagado: título próprio; revoke.status off ignora', async () => {
        const { alerta: alert } = await messageDeleted('meu status', { chat: 'status@broadcast' });
        assert.match(alert[0].texto, /📸 \*STATUS APAGADO DETECTADO\*/);

        await bot.setSetting('revoke.status', false);
        const { msg, alerta: nothing } = await messageDeleted('outro status', { chat: 'status@broadcast' });
        assert.deepEqual(nothing, []);
        assert.equal((await bot.dbGet('SELECT revoked FROM messages WHERE id = ?', [msg.id.id])).revoked, 0);
    });

    test('mídia apagada volta como mídia, com a legenda', async () => {
        const { alerta: alert } = await messageDeleted('legenda da foto', {
            tipo: 'image', midia: { mimetype: 'image/jpeg', data: Buffer.from('jpg').toString('base64') }
        });
        assert.equal(alert.length, 1);
        assert.equal(alert[0].content.mimetype, 'image/jpeg');
        assert.match(alert[0].options.caption, /🎬 \*Tipo:\* IMAGE[\s\S]*💬 \*Legenda:\* "legenda da foto"/);
    });

    test('áudio apagado volta como nota de voz, depois do aviso', async () => {
        const { alerta: alert } = await messageDeleted('', { tipo: 'ptt', midia: { mimetype: 'audio/ogg; codecs=opus', data: 'AA==' } });
        assert.equal(alert.length, 2);
        assert.match(alert[0].texto, /🎵 \*Tipo:\* ÁUDIO \/ NOTA DE VOZ/);
        assert.equal(alert[1].content.mimetype, 'audio/ogg');
        assert.equal(alert[1].options.sendAudioAsVoice, true);
    });

    test('documento apagado volta como documento', async () => {
        const { alerta: alert } = await messageDeleted('contrato', { tipo: 'document', midia: { mimetype: 'application/pdf', data: 'AA==' } });
        assert.equal(alert.length, 1);
        assert.equal(alert[0].options.sendMediaAsDocument, true);
        assert.match(alert[0].options.caption, /📄 \*Tipo:\* DOCUMENTO\n💬 \*Legenda:\* "contrato"/);
    });

    test('contato (vCard de verdade) volta como contato', async () => {
        const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Maria\nEND:VCARD';
        const { alerta: alert } = await messageDeleted(vcard, { tipo: 'vcard' });
        assert.equal(alert.length, 2);
        assert.match(alert[0].texto, /📇 \*Tipo:\* CARTÃO DE CONTATO/);
        assert.equal(alert[1].content, vcard);
        assert.equal(alert[1].options.parseVCards, true);
    });

    test('remetente @lid: o aviso mostra o nome e o telefone reais', async () => {
        bot.client.lids.set('999@lid', OTHERAlt.jid);
        const msg = bot.createMessage({ texto: 'de um lid', de: '999@lid' });
        await bot.deliver(msg);
        const [alert] = await bot.apagar(msg);
        assert.match(alert.texto, /👤 \*Nome:\* Fulano\n📱 \*Número:\* \+5521911111111/);
    });

    test('mídia sem o arquivo no disco: avisa que não está disponível', async () => {
        const msg = bot.createMessage({ texto: '', de: OTHERAlt.jid, tipo: 'image', midia: { mimetype: 'image/jpeg', data: 'AA==' } });
        await bot.deliver(msg);
        const { media_path } = await bot.dbGet('SELECT media_path FROM messages WHERE id = ?', [msg.id.id]);
        fs.unlinkSync(media_path);

        const [alert] = await bot.apagar(msg);
        assert.match(alert.texto, /IMAGE _\(arquivo não disponível no cache\)_/);
    });

    test('localização apagada: link do mapa + a localização', async () => {
        const { alerta: alert } = await messageDeleted('Praia', { tipo: 'location', extras: { location: { latitude: -22.9, longitude: -43.1 } } });
        assert.equal(alert.length, 2);
        assert.match(alert[0].texto, /google\.com\/maps\?q=-22\.9,-43\.1/);
        assert.ok(alert[1].content instanceof Location);
    });

    test('contato com texto que não é vCard vai só como texto (nunca cru)', async () => {
        const { alerta: alert } = await messageDeleted('/cache -c -f', { tipo: 'vcard' });
        assert.equal(alert.length, 1);
        assert.match(alert[0].texto, /CARTÃO DE CONTATO[\s\S]*💬 \*Conteúdo:\* "\/cache -c -f"/);
    });

    test('conta no /stats para o autor; apagada por você conta para você', async () => {
        await messageDeleted('a');
        const my = bot.createMessage({ texto: 'b' });
        await bot.deliver(my);
        await bot.apagar(my);

        const deletedAlt = await bot.dbAll('SELECT sender_id, SUM(deleted) AS n FROM stats WHERE deleted > 0 GROUP BY sender_id ORDER BY sender_id');
        assert.deepEqual(deletedAlt, [{ sender_id: OWNER.user, n: 1 }, { sender_id: OTHERAlt.user, n: 1 }]);
    });
});

describe('evento: mensagem editada', () => {
    test('avisa com o antes e o depois, grava a edição e o texto final', async () => {
        const { msg, alerta: alert } = await messageEdited('reunião às 14h', 'reunião às 15h');

        assert.equal(alert.length, 1);
        assert.equal(alert[0].chatId, PRIVATE_OWNER);
        assert.match(alert[0].texto, /✏️ \*MENSAGEM EDITADA DETECTADA\*/);
        assert.match(alert[0].texto, /👥 \*Grupo:\* Família/);
        assert.match(alert[0].texto, /📝 \*Antes:\* "reunião às 14h"\n💬 \*Depois:\* "reunião às 15h"/);

        const edit = await bot.dbGet('SELECT * FROM message_edits WHERE message_id = ?', [msg.id.id]);
        assert.deepEqual([edit.old_body, edit.new_body, edit.sender_number], ['reunião às 14h', 'reunião às 15h', OTHERAlt.user]);
        assert.equal((await bot.dbGet('SELECT body FROM messages WHERE id = ?', [msg.id.id])).body, 'reunião às 15h');
    });

    test('ignora: mudança que não é edição, as suas edições e texto igual', async () => {
        const msg = bot.createMessage({ texto: 'a', de: OTHERAlt.jid });
        await bot.deliver(msg);
        assert.deepEqual(await bot.edit(msg, 'b', { realmente: false }), []);
        assert.deepEqual(await bot.edit(msg, 'a'), []);

        const my = bot.createMessage({ texto: 'x' });
        await bot.deliver(my);
        assert.deepEqual(await bot.edit(my, 'y'), []);

        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 0);
    });

    test('a mesma edição avisada duas vezes (body e caption) é gravada uma vez', async () => {
        const msg = bot.createMessage({ texto: 'a', de: OTHERAlt.jid });
        await bot.deliver(msg);
        const when = Date.now();
        assert.equal((await bot.edit(msg, 'b', { editadaEm: when })).length, 1);
        assert.equal((await bot.edit(msg, 'b', { editadaEm: when })).length, 0);
        assert.equal((await bot.edit(msg, 'c', { antigo: 'b', editadaEm: when + 1000 })).length, 1);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 2);
    });

    test('edit.alert off: guarda sem avisar; conta no /stats', async () => {
        await bot.setSetting('edit.alert', false);
        const { msg, alerta: alert } = await messageEdited('a', 'b');
        assert.deepEqual(alert, []);
        assert.ok(await bot.dbGet('SELECT 1 FROM message_edits WHERE message_id = ?', [msg.id.id]));
        assert.equal((await bot.dbGet('SELECT SUM(edited) AS n FROM stats')).n, 1);
    });
});

describe('/show (/undo, /s)', () => {
    test('sem apagadas neste chat', async () => {
        assert.deepEqual(await bot.replyAlt('/show'), ['♻️ Nenhuma mensagem apagada registrada neste chat.']);
    });

    test('a última, ou as N últimas em ordem cronológica', async () => {
        for (const t of ['um', 'dois', 'três']) await messageDeleted(t);

        const [summary, single] = await bot.replyAlt('/show');
        assert.equal(summary, '♻️ *1 mensagem apagada*');
        assert.match(single, /❌ \*MENSAGEM APAGADA\* \(1\/1\)[\s\S]*"três"/);

        const r = await bot.replyAlt('/undo -2');
        assert.equal(r[0], '♻️ *2 mensagens apagadas*');
        assert.match(r[1], /"dois"/);
        assert.match(r[2], /"três"/);

        assert.equal((await bot.replyAlt('/s 5'))[0], '♻️ *3 mensagens apagadas* (pedidas 5, encontradas 3)');
    });

    test('acima do show.max é limitado', async () => {
        await bot.setSetting('show.max', 1);
        await messageDeleted('a');
        await messageDeleted('b');
        assert.equal((await bot.replyAlt('/show -9'))[0], '♻️ *1 mensagem apagada*\n_(limitado a 1 por vez)_');
    });

    test('argumento inválido mostra a sintaxe', async () => {
        for (const line of ['/show abc', '/show 1 2', '/show -0']) {
            assert.match((await bot.replyAlt(line))[0], /Usage: \/show/, line);
        }
    });

    test('-pv manda o resumo e as mensagens no seu privado', async () => {
        await messageDeleted('privado');
        const r = await bot.executar('/show -pv');
        assert.equal(r[0].chatId, GROUP);
        assert.equal(r[0].texto, '♻️ Enviado no seu privado.');
        assert.ok(r.slice(1).every(e => e.chatId === PRIVATE_OWNER));
        assert.match(r[1].texto, /💬 \*Chat:\* Família/);
    });

    test('-l: apagadas e editadas de todos os chats, marcando o atual', async () => {
        await messageDeleted('a');
        await messageDeleted('b');
        await messageDeleted('c', { chat: WORK });
        await messageEdited('x', 'y', { chat: WORK });

        const [r] = await bot.replyAlt('/show -l');
        assert.match(r, /🗑️ \*Deletadas:\* 3/);
        assert.match(r, /1\. 👥 Família — \*2\*.*← _este chat_/);
        assert.match(r, /2\. 👥 Trabalho — \*1\*/);
        assert.match(r, /✏️ \*Editadas:\* 1[^\n]*\n1\. 👥 Trabalho — \*1\*/);
        assert.doesNotMatch(r.split('Editadas')[1], /← _este chat_/);

        // /edit -l is the same list
        assert.equal((await bot.replyAlt('/edit -l'))[0], r);
    });

    test('-l -pv manda a lista no seu privado', async () => {
        await messageDeleted('a');
        const r = await bot.executar('/show -l -pv');
        assert.equal(r[0].texto, '🗄️ Resumo enviado no seu privado.');
        assert.equal(r[1].chatId, PRIVATE_OWNER);
    });

    test('-c pelo nº da lista ou pelo nome (em qualquer chat)', async () => {
        await messageDeleted('do trabalho', { chat: WORK });
        await messageDeleted('da família');
        // Tie in amount: the most recent deleted one comes first (Família = no. 1)
        await bot.replyAlt('/show -l');

        const byNumber = await bot.replyAlt('/show -c 1', { chat: OTHERAlt.jid });
        assert.match(byNumber[0], /💬 \*Chat:\* Família/);
        assert.match(byNumber[1], /"da família"/);

        const byName = await bot.replyAlt('/show -c trab');
        assert.match(byName[1], /"do trabalho"/);
    });

    test('-c inexistente, sem correspondência ou ambíguo', async () => {
        await messageDeleted('a');
        await messageDeleted('b', { chat: WORK });
        assert.match((await bot.replyAlt('/show -c 9'))[0], /❌ Chat nº 9 não existe/);
        assert.match((await bot.replyAlt('/show -c xyz'))[0], /❌ Nenhum chat com apagadas contém "xyz"/);
        assert.match((await bot.replyAlt('/show -c a'))[0], /🔎 "a" corresponde a 2 chats/);
    });

    test('-f: só o dono; remove só as deste chat (e as mídias)', async () => {
        const { msg } = await messageDeleted('foto', { midia: { mimetype: 'image/png', data: 'AA==' } });
        await messageDeleted('b', { chat: WORK });
        const { media_path } = await bot.dbGet('SELECT media_path FROM messages WHERE id = ?', [msg.id.id]);

        assert.deepEqual(await bot.replyAlt('/show -f', { de: OTHERAlt.jid }), []); // onlyAdmin

        const [r] = await bot.replyAlt('/show -f');
        assert.match(r, /🧹 \*Flush das mensagens apagadas deste chat\*[\s\S]*Removidas: \*1 mensagem\*[\s\S]*Mídias apagadas do disco: \*1\*/);
        assert.ok(!fs.existsSync(media_path));
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE revoked = 1')).n, 1);
    });

    test('-f no seu privado remove de todos; -f -c de um chat', async () => {
        await messageDeleted('a');
        await messageDeleted('b', { chat: WORK });
        await messageDeleted('c', { chat: WORK });

        const [umChat] = await bot.replyAlt('/show -f -c trabalho');
        assert.match(umChat, /Flush das mensagens apagadas de:\* Trabalho[\s\S]*\*2 mensagens\*/);

        const [general] = await bot.replyAlt('/show -f', { chat: PRIVATE_OWNER });
        assert.match(general, /🧹 \*Flush geral das mensagens apagadas\*[\s\S]*\*1 mensagem\* de \*1 chat\*/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE revoked = 1')).n, 0);
    });
});

describe('/edit (/e)', () => {
    test('sem editadas neste chat', async () => {
        assert.deepEqual(await bot.replyAlt('/edit'), ['✏️ Nenhuma mensagem editada registrada neste chat.']);
    });

    test('a última e as N últimas, com antes e depois', async () => {
        await messageEdited('a1', 'a2');
        await messageEdited('b1', 'b2');

        const [summary, item] = await bot.replyAlt('/edit');
        assert.equal(summary, '✏️ *1 mensagem editada*');
        assert.match(item, /✏️ \*MENSAGEM EDITADA\* \(1\/1\)[\s\S]*Antes:\* "b1"\n💬 \*Depois:\* "b2"/);

        const r = await bot.replyAlt('/e -2');
        assert.equal(r[0], '✏️ *2 mensagens editadas*');
        assert.match(r[1], /"a2"/);
    });

    test('-c e -pv', async () => {
        await messageEdited('x', 'y', { chat: WORK });
        const r = await bot.executar('/edit -c trabalho -pv');
        assert.equal(r[0].texto, '✏️ Enviado no seu privado.');
        assert.match(r[1].texto, /💬 \*Chat:\* Trabalho/);
        assert.equal(r[2].chatId, PRIVATE_OWNER);
    });

    test('-c sem editadas', async () => {
        assert.equal((await bot.replyAlt('/edit -c 1'))[0], '✏️ Nenhuma mensagem editada no cache.');
    });

    test('-f remove as editadas deste chat; não mexe nas apagadas', async () => {
        await messageEdited('x', 'y');
        await messageDeleted('z');
        const [r] = await bot.replyAlt('/edit -f');
        assert.match(r, /Flush das mensagens editadas deste chat[\s\S]*\*1 mensagem\*/);
        assert.doesNotMatch(r, /Mídias/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE revoked = 1')).n, 1);
    });
});
