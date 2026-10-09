/*
 * Deleted and edited messages: the WhatsApp events and the commands
 * /show (/s): the deleted ones (default, or -d) and the edited ones (-e).
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, OTHERAlt, Location } = bot;

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

    test('show.alert.deleted off: guarda sem avisar; o /show reexibe', async () => {
        await bot.setSetting('show.alert.deleted', false);
        const { msg, alerta: alert } = await messageDeleted('segredo');
        assert.deepEqual(alert, []);
        assert.equal((await bot.dbGet('SELECT revoked FROM messages WHERE id = ?', [msg.id.id])).revoked, 1);

        // Does not apply to status (show.alert.status)
        const { alerta: status } = await messageDeleted('meu status', { chat: 'status@broadcast' });
        assert.match(status[0].texto, /📸 \*STATUS APAGADO DETECTADO\*/);
    });

    test('status apagado: título próprio; show.alert.status off ignora', async () => {
        const { alerta: alert } = await messageDeleted('meu status', { chat: 'status@broadcast' });
        assert.match(alert[0].texto, /📸 \*STATUS APAGADO DETECTADO\*/);

        await bot.setSetting('show.alert.status', false);
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
        const { alerta: alert } = await messageDeleted('/cache -a', { tipo: 'vcard' });
        assert.equal(alert.length, 1);
        assert.match(alert[0].texto, /CARTÃO DE CONTATO[\s\S]*💬 \*Conteúdo:\* "\/cache -a"/);
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

    test('show.alert.edited off: guarda sem avisar; conta no /stats', async () => {
        await bot.setSetting('show.alert.edited', false);
        const { msg, alerta: alert } = await messageEdited('a', 'b');
        assert.deepEqual(alert, []);
        assert.ok(await bot.dbGet('SELECT 1 FROM message_edits WHERE message_id = ?', [msg.id.id]));
        assert.equal((await bot.dbGet('SELECT SUM(edited) AS n FROM stats')).n, 1);
    });
});

describe('/show (/s)', () => {
    test('sem apagadas neste chat', async () => {
        assert.deepEqual(await bot.replyAlt('/show'), ['♻️ Nenhuma mensagem apagada registrada neste chat.']);
    });

    test('a última, ou as N últimas em ordem cronológica', async () => {
        for (const t of ['um', 'dois', 'três']) await messageDeleted(t);

        const [summary, single] = await bot.replyAlt('/show');
        assert.equal(summary, '♻️ *1 mensagem apagada*');
        assert.match(single, /❌ \*MENSAGEM APAGADA\* \(1\/1\)[\s\S]*"três"/);

        const r = await bot.replyAlt('/s -2');
        assert.equal(r[0], '♻️ *2 mensagens apagadas*');
        assert.match(r[1], /"dois"/);
        assert.match(r[2], /"três"/);

        assert.equal((await bot.replyAlt('/s -5'))[0], '♻️ *3 mensagens apagadas* (pedidas 5, encontradas 3)');
    });

    test('acima do show.max é limitado', async () => {
        await bot.setSetting('show.max', 1);
        await messageDeleted('a');
        await messageDeleted('b');
        assert.equal((await bot.replyAlt('/show -9'))[0], '♻️ *1 mensagem apagada*\n_(limitado a 1 por vez)_');
    });

    test('argumento inválido mostra a sintaxe', async () => {
        for (const line of ['/show -2 -3', '/show -0', '/show -xyz']) {
            assert.match((await bot.replyAlt(line))[0], /Uso: \/show/, line);
        }
    });
});

describe('/show <chat>', () => {
    test('chat pelo nº da lista, pelo nome ou por /regex/ (em qualquer chat)', async () => {
        await messageDeleted('do trabalho', { chat: WORK });
        await messageDeleted('da família');
        // Tie in amount: the most recent deleted one comes first (Família = no. 1)
        await bot.dbRun("UPDATE messages SET revoked_at = revoked_at - 1000 WHERE body = 'do trabalho'");
        await bot.replyAlt('/show -l');

        const byNumber = await bot.replyAlt('/show 1', { chat: OTHERAlt.jid });
        assert.equal(byNumber[0], '🗄️ *1 mensagem* (🗑️ 1)\n💬 *Chat:* Família');
        assert.match(byNumber[1], /"da família"/);

        assert.match((await bot.replyAlt('/show trab'))[1], /"do trabalho"/);
        assert.match((await bot.replyAlt('/show "familia"'))[1], /"da família"/);
        assert.match((await bot.replyAlt('/show /^trab/'))[1], /"do trabalho"/);
        assert.match((await bot.replyAlt('/show /LIA$/'))[1], /"da família"/);
    });

    test('chat: tudo junto, por data; -d, -e e -s filtram e se somam', async () => {
        await messageDeleted('apagada', { chat: OTHERAlt.jid });
        await messageEdited('antes', 'depois', { chat: OTHERAlt.jid });
        await messageDeleted('meu status', { chat: 'status@broadcast' });
        await messageDeleted('no grupo');
        // One second apart between each: the order is by date
        const nowAlt = Date.now();
        await bot.dbRun("UPDATE messages SET revoked_at = ? WHERE body = 'apagada'", [nowAlt - 3000]);
        await bot.dbRun('UPDATE message_edits SET edited_at = ?', [nowAlt - 2000]);

        const r = await bot.replyAlt('/show -5 Fulano');
        assert.equal(r[0], '🗄️ *3 mensagens* (🗑️ 1 · ✏️ 1 · 📸 1) (pedidas 5, encontradas 3)\n💬 *Chat:* Fulano');
        assert.match(r[1], /MENSAGEM APAGADA[\s\S]*"apagada"/);
        assert.match(r[2], /MENSAGEM EDITADA[\s\S]*"depois"/);
        assert.match(r[3], /STATUS APAGADO[\s\S]*"meu status"/);

        assert.equal((await bot.replyAlt('/show -5 -e Fulano'))[0], '✏️ *1 mensagem editada* (pedidas 5, encontradas 1)\n💬 *Chat:* Fulano');
        assert.match((await bot.replyAlt('/show -s Fulano'))[1], /"meu status"/);
        assert.equal((await bot.replyAlt('/show -5 -d -s /fulano/'))[0],
            '🗄️ *2 mensagens* (🗑️ 1 · 📸 1) (pedidas 5, encontradas 2)\n💬 *Chat:* Fulano');
    });

    test('-s: no privado da pessoa, os status dela; no seu privado, de todos', async () => {
        await messageDeleted('meu status', { chat: 'status@broadcast' });

        assert.match((await bot.replyAlt('/show -s', { chat: OTHERAlt.jid }))[1], /"meu status"/);
        assert.equal((await bot.replyAlt('/show -s', { chat: PRIVATE_OWNER }))[0], '📸 *1 status apagado*\n💬 *Chats:* todos');
        assert.deepEqual(await bot.replyAlt('/show -s'), ['📸 Nenhum status apagado registrado neste chat.']);
    });

    test('@menção: o privado da pessoa', async () => {
        await messageDeleted('oi', { chat: OTHERAlt.jid });
        await messageDeleted('meu status', { chat: 'status@broadcast' }); // the name "Fulano" in the cache

        const r = await bot.replyAlt(`/show -2 @${OTHERAlt.user}`, { mencoes: [OTHERAlt.jid] });
        assert.equal(r[0], '🗄️ *2 mensagens* (🗑️ 1 · 📸 1)\n💬 *Chat:* Fulano');
        assert.match((await bot.replyAlt(`/show @${OTHERAlt.user}`))[0], /não é uma menção/);
        assert.match((await bot.replyAlt('/show @Fulano -d'))[1], /"oi"/, '@ digitado: vale o nome');
    });

    test('chat inexistente, sem correspondência, regex inválida ou ambíguo', async () => {
        assert.deepEqual(await bot.replyAlt('/show xyz'),
            ['🗄️ Nada no cache: nenhuma mensagem apagada, editada ou status apagado.']);

        await messageDeleted('a');
        await messageDeleted('b', { chat: WORK });
        assert.deepEqual(await bot.replyAlt('/show 9'),
            ['❌ Chat nº 9 não existe (ou não tem mais nada no cache).\n💡 _Veja a lista atual com /show -l_']);
        assert.match((await bot.replyAlt('/show xyz'))[0], /❌ Nenhum chat no cache casa com "xyz"/);
        assert.match((await bot.replyAlt('/show /(/'))[0], /❌ Regex inválida: \/\(\//);

        // Tie in amount: the most recent comes first
        await bot.dbRun("UPDATE messages SET revoked_at = revoked_at - 1000 WHERE body = 'a'");
        const r = await bot.replyChoosing('/show a', 1);
        assert.match(r[0], /🔎 "a" corresponde a 2 chats:\n\n1\. 👥 Trabalho\n2\. 👥 Família/);
        assert.match(r.at(-1), /"b"/);
    });
});

describe('/show -l (lista)', () => {
    test('sem parâmetros no privado lista o cache, como -l, inclusive vazio e pelo alias',
        async () => {
            for (const chat of [PRIVATE_OWNER, OTHERAlt.jid]) {
                assert.deepEqual(await bot.replyAlt('/show', { chat }),
                    await bot.replyAlt('/show -l', { chat }));
            }
            await messageDeleted('do grupo');
            await messageEdited('antes', 'depois', { chat: WORK });
            for (const chat of [PRIVATE_OWNER, OTHERAlt.jid]) {
                assert.deepEqual(await bot.replyAlt('/s   ', { chat }),
                    await bot.replyAlt('/show -l', { chat }));
            }
            const [summary, messageAlt] = await bot.replyAlt('/show -d', { chat: OTHERAlt.jid });
            assert.doesNotMatch(summary, /Mensagens no cache/);
            assert.equal(messageAlt, undefined);
        });

    test('-l: o que tem no cache por tipo e os chats numerados, marcando o atual', async () => {
        await messageDeleted('a');
        await messageDeleted('b');
        await messageDeleted('c');
        await messageDeleted('d', { chat: WORK });
        await messageEdited('x', 'y', { chat: WORK });
        await messageDeleted('meu status', { chat: 'status@broadcast' });

        const [r] = await bot.replyAlt('/show -l');
        assert.match(r, /🗑️ \*Apagadas:\* 4 [^\n]*\n✏️ \*Editadas:\* 1 [^\n]*\n📸 \*Status:\* 1 /);
        assert.match(r, /1\. 👥 Família — 🗑️ 3 .*← _este chat_/);
        assert.match(r, /2\. 👥 Trabalho — 🗑️ 1 · ✏️ 1 /);
        assert.match(r, /3\. 👤 Fulano — 📸 1 /);
        assert.match(r, /💡 _\/show <nº, nome, @menção ou \/regex\/>/);

        // The types do not change the list
        assert.equal((await bot.replyAlt('/show -e -l'))[0], r);
    });

    test('-l <chat>: só os que casam (nº, nome, @menção ou /regex/), com o nº da lista completa',
        async () => {
            // Família (3) before Trabalho (2): with no tie, the order does not depend on the clock
            await messageDeleted('a');
            await messageDeleted('b');
            await messageDeleted('c');
            await messageDeleted('d', { chat: WORK });
            await messageEdited('x', 'y', { chat: WORK });
            await messageDeleted('meu status', { chat: 'status@broadcast' });

            const [byName] = await bot.replyAlt('/show -l trab');
            assert.match(byName, /Mensagens no cache de:\* Trabalho\n/);
            assert.match(byName, /🗑️ \*Apagadas:\* 1 [^\n]*\n✏️ \*Editadas:\* 1 [^\n]*\n📸 \*Status:\* 0\n/);
            assert.match(byName, /2\. 👥 Trabalho — 🗑️ 1 · ✏️ 1 /);
            assert.doesNotMatch(byName, /Família|Fulano/);

            assert.equal((await bot.replyAlt('/show -l 2'))[0], byName);
            assert.match((await bot.replyAlt('/show -l /^(fam|trab)/'))[0],
                /1\. 👥 Família[^\n]*\n2\. 👥 Trabalho/);

            const [byMention] = await bot.replyAlt(`/show -l @${OTHERAlt.user}`, { mencoes: [OTHERAlt.jid] });
            assert.match(byMention, /📸 \*Status:\* 1 /);
            assert.match(byMention, /3\. 👤 Fulano — 📸 1 /);
            assert.doesNotMatch(byMention, /Família|Trabalho/);

            assert.match((await bot.replyAlt('/show -l nada'))[0], /❌ Nenhum chat no cache casa com "nada"/);
            assert.deepEqual(await bot.replyAlt('/show -l Família', { chat: OTHERAlt.jid }),
                await bot.replyAlt('/show -l 1', { chat: OTHERAlt.jid }));
        });

    test('-l lista todos os chats e permite selecionar os que ficam depois do décimo', async () => {
        for (let i = 1; i <= 12; i++) {
            const chat = `120363000000000${String(i + 100).padStart(3, '0')}@g.us`;
            bot.createGroup(chat, `Grupo ${i}`, [OWNER.jid, OTHERAlt.jid]);
            await messageDeleted(`conteúdo ${i}`, { chat });
        }
        const [list] = await bot.replyAlt('/show -l', { chat: PRIVATE_OWNER });
        assert.equal((list.match(/^\d+\. 👥 /gm) ?? []).length, 12);
        assert.match(list, /12\. 👥 Grupo \d+ — 🗑️ 1/);
        assert.doesNotMatch(list, /\+\d+ chat\(s\)/);
        const nameAlt = list.match(/12\. 👥 (Grupo \d+) —/)[1];
        const [summary, messageAlt] = await bot.replyAlt('/show 12', { chat: PRIVATE_OWNER });
        assert.ok(summary.includes(nameAlt));
        assert.match(messageAlt, /conteúdo \d+/);
    });
});

describe('/show -q (busca)', () => {
    test('-q: busca pelo texto (sem acentos); no seu privado, em todos os chats; sem -N, as 5 mais recentes', async () => {
        await messageDeleted('manda o PIX');
        await messageDeleted('nada a ver');
        await messageDeleted('pix no trabalho', { chat: WORK });

        const r = await bot.replyAlt('/show -q pix');
        assert.equal(r[0], '♻️ *1 mensagem apagada* com "pix"');
        assert.match(r[1], /"manda o PIX"/);

        // In your private chat: in all chats and all types
        const allAlt2 = await bot.replyAlt('/show -q pix', { chat: PRIVATE_OWNER });
        assert.equal(allAlt2[0], '🗄️ *2 mensagens* (🗑️ 2) com "pix"\n💬 *Chats:* todos');

        for (let i = 0; i < 6; i++) await messageDeleted(`pix ${i}`);
        assert.equal((await bot.replyAlt('/show -q pix'))[0], '♻️ *5 mensagens apagadas* com "pix" _(as 5 mais recentes de 7; use -N para mais)_');
        assert.equal((await bot.replyAlt('/show -q pix -2')).length, 3);

        assert.deepEqual(await bot.replyAlt('/show -q boleto'), ['♻️ Nenhuma mensagem apagada com "boleto" neste chat.']);
        assert.deepEqual(await bot.replyAlt('/show -q boleto', { chat: PRIVATE_OWNER }), ['🗄️ Nada no cache com "boleto" em nenhum chat.']);
    });

    test('-e -q: busca no texto de antes e no de depois; -q não combina com -f e -l', async () => {
        await messageEdited('reunião às 10h', 'reuniao às 11h');
        await messageEdited('oi', 'olá');

        const r = await bot.replyAlt('/show -e -q REUNIAO');
        assert.equal(r[0], '✏️ *1 mensagem editada* com "REUNIAO"');
        assert.equal((await bot.replyAlt('/show -e -q olá'))[0], '✏️ *1 mensagem editada* com "olá"');

        assert.match((await bot.replyAlt('/show -q x -f'))[0], /❌ O -q não combina com o -f nem com o -l/);
        assert.deepEqual(await bot.replyAlt('/show -q'),
            ['❌ Informe o que buscar: /show -q <texto|/regex/flags>\n💡 _Com espaços, entre aspas: -q "bom dia"_']);
    });

    test('-q com /regex/flags: no texto como veio; regex inválida avisa', async () => {
        await messageDeleted('manda o PIX');
        await messageDeleted('segue o boleto');
        await messageDeleted('pixel art');
        await messageEdited('reunião às 10h', 'reunião às 11h');

        const r = await bot.replyAlt('/show -5 -q /\\bpix\\b|boleto/i');
        assert.equal(r[0], '♻️ *2 mensagens apagadas* com "/\\bpix\\b|boleto/i"');
        assert.match(r[1], /"manda o PIX"/);
        assert.match(r[2], /"segue o boleto"/);

        // Without the i flag, case-sensitive; in the edited ones, the before or the after
        assert.deepEqual(await bot.replyAlt('/show -q /Pix/'), ['♻️ Nenhuma mensagem apagada com "/Pix/" neste chat.']);
        assert.equal((await bot.replyAlt('/show -e -q "/às 1[01]h/"'))[0], '✏️ *1 mensagem editada* com "/às 1[01]h/"');

        assert.match((await bot.replyAlt('/show -q /[/'))[0], /^❌ Busca inválida: regex inválida/);
    });

    test('-q com chat: só nele', async () => {
        await messageDeleted('pix aqui');
        await messageDeleted('pix no trabalho', { chat: WORK });

        const r = await bot.replyAlt('/show -q pix Trabalho');
        assert.equal(r[0], '🗄️ *1 mensagem* (🗑️ 1) com "pix"\n💬 *Chat:* Trabalho');
        assert.match(r[1], /"pix no trabalho"/);
    });
});

describe('/show -f (flush)', () => {
    test('-f: só o dono; remove só as apagadas deste chat (e as mídias)', async () => {
        const { msg } = await messageDeleted('foto', { midia: { mimetype: 'image/png', data: 'AA==' } });
        await messageDeleted('b', { chat: WORK });
        const { media_path } = await bot.dbGet('SELECT media_path FROM messages WHERE id = ?', [msg.id.id]);

        assert.deepEqual(await bot.replyAlt('/show -f', { de: OTHERAlt.jid }), []); // onlyAdmin

        const [r] = await bot.replyAlt('/show -f');
        assert.equal(r, '🧹 *Flush do cache deste chat*\n\n🗑️ Apagadas: *1 mensagem*\n📎 Mídias apagadas do disco: *1* _(1 B)_\n' +
            '\n💡 _Para limpar as de todos os chats, use /show -f no seu privado._');
        assert.ok(!fs.existsSync(media_path));
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE revoked = 1')).n, 1);
    });

    test('-f no seu privado remove de todos; -f com chat, tudo dele', async () => {
        await messageDeleted('a');
        await messageDeleted('b', { chat: WORK });
        await messageDeleted('c', { chat: WORK });
        await messageEdited('x', 'y', { chat: WORK });

        const [umChat] = await bot.replyAlt('/show -f trabalho');
        assert.match(umChat, /Flush do cache de:\* Trabalho\n\n🗑️ Apagadas: \*2 mensagens\*\n✏️ Editadas: \*1 mensagem\*\n📸 Status: \*0 status\*/);

        const [general] = await bot.replyAlt('/show -f', { chat: PRIVATE_OWNER });
        assert.match(general, /🧹 \*Flush geral do cache\*\n\n🗑️ Apagadas: \*1 mensagem\*[\s\S]*\*Por chat\* \(1\):\n1\. 👥 Família — \*1\*/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE revoked = 1')).n, 0);
        assert.deepEqual(await bot.replyAlt('/show -f', { chat: PRIVATE_OWNER }), ['♻️ Nenhuma mensagem apagada no cache.']);
    });
});

describe('/show -e (editadas)', () => {
    test('sem editadas neste chat', async () => {
        assert.deepEqual(await bot.replyAlt('/show -e'), ['✏️ Nenhuma mensagem editada registrada neste chat.']);
    });

    test('-d (o padrão) mostra as apagadas, -e as editadas; os dois juntos, por data', async () => {
        await messageDeleted('apagada');
        await messageEdited('antes', 'depois');

        assert.match((await bot.replyAlt('/show -d'))[1], /MENSAGEM APAGADA[\s\S]*"apagada"/);
        assert.match((await bot.replyAlt('/show -deleted'))[1], /"apagada"/);
        assert.match((await bot.replyAlt('/show -edited'))[1], /MENSAGEM EDITADA[\s\S]*"depois"/);
        assert.equal((await bot.replyAlt('/show -d -e -2'))[0], '🗄️ *2 mensagens* (🗑️ 1 · ✏️ 1)');
    });

    test('/edit e /e não existem mais', async () => {
        await messageEdited('x', 'y');
        assert.deepEqual(await bot.replyAlt('/edit'), ["⚠️ Comando '/edit' desconhecido, tente: /help"]);
        assert.deepEqual(await bot.replyAlt('/e'), ["⚠️ Comando '/e' desconhecido, tente: /help"]);
    });

    test('a última e as N últimas, com antes e depois', async () => {
        await messageEdited('a1', 'a2');
        await messageEdited('b1', 'b2');

        const [summary, item] = await bot.replyAlt('/show -e');
        assert.equal(summary, '✏️ *1 mensagem editada*');
        assert.match(item, /✏️ \*MENSAGEM EDITADA\* \(1\/1\)[\s\S]*Antes:\* "b1"\n💬 \*Depois:\* "b2"/);

        const r = await bot.replyAlt('/s -2 -e');
        assert.equal(r[0], '✏️ *2 mensagens editadas*');
        assert.match(r[1], /"a2"/);
    });

    test('chat sem editadas', async () => {
        await messageDeleted('a');
        // The no. comes from the last -l (which may be from another test): the current list, here
        await bot.replyAlt('/show -l');
        assert.deepEqual(await bot.replyAlt('/show -e 1'), ['✏️ Nenhuma mensagem editada em Família.']);
    });

    test('dica no seu privado aponta para o -e', async () => {
        const [r] = await bot.replyAlt('/show -e', { chat: PRIVATE_OWNER });
        assert.equal(r, '✏️ Nenhuma mensagem editada neste chat.\n' +
            '💡 _Para ver as de outro chat: /show -l e depois /show -e -N <chat>_\n' +
            '💡 _Para buscar em todos: /show -e -q <texto|/regex/>_');
    });

    test('-f remove as editadas deste chat; não mexe nas apagadas', async () => {
        await messageEdited('x', 'y');
        await messageDeleted('z');
        const [r] = await bot.replyAlt('/show -e -f');
        assert.equal(r, '🧹 *Flush do cache deste chat*\n\n✏️ Editadas: *1 mensagem*\n' +
            '\n💡 _Para limpar as de todos os chats, use /show -e -f no seu privado._');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE revoked = 1')).n, 1);
    });
});
