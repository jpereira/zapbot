/*
 * Mensagens apagadas e editadas: os eventos do WhatsApp e os comandos
 * /show (/s): as apagadas (padrão, ou -d) e as editadas (-e).
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, OUTRO, Location } = bot;

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

    test('show.alert.deleted off: guarda sem avisar; o /show reexibe', async () => {
        await bot.setSetting('show.alert.deleted', false);
        const { msg, alerta } = await mensagemApagada('segredo');
        assert.deepEqual(alerta, []);
        assert.equal((await bot.dbGet('SELECT revoked FROM messages WHERE id = ?', [msg.id.id])).revoked, 1);

        // Não vale para status (show.alert.status)
        const { alerta: status } = await mensagemApagada('meu status', { chat: 'status@broadcast' });
        assert.match(status[0].texto, /📸 \*STATUS APAGADO DETECTADO\*/);
    });

    test('status apagado: título próprio; show.alert.status off ignora', async () => {
        const { alerta } = await mensagemApagada('meu status', { chat: 'status@broadcast' });
        assert.match(alerta[0].texto, /📸 \*STATUS APAGADO DETECTADO\*/);

        await bot.setSetting('show.alert.status', false);
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

    test('show.alert.edited off: guarda sem avisar; conta no /stats', async () => {
        await bot.setSetting('show.alert.edited', false);
        const { msg, alerta } = await mensagemEditada('a', 'b');
        assert.deepEqual(alerta, []);
        assert.ok(await bot.dbGet('SELECT 1 FROM message_edits WHERE message_id = ?', [msg.id.id]));
        assert.equal((await bot.dbGet('SELECT SUM(edited) AS n FROM stats')).n, 1);
    });
});

describe('/show (/s)', () => {
    test('sem parâmetros no privado lista o cache, como -l, inclusive vazio e pelo alias',
        async () => {
            for (const chat of [PRIVADO_DONO, OUTRO.jid]) {
                assert.deepEqual(await bot.responder('/show', { chat }),
                    await bot.responder('/show -l', { chat }));
            }
            await mensagemApagada('do grupo');
            await mensagemEditada('antes', 'depois', { chat: TRABALHO });
            for (const chat of [PRIVADO_DONO, OUTRO.jid]) {
                assert.deepEqual(await bot.responder('/s   ', { chat }),
                    await bot.responder('/show -l', { chat }));
            }
            const [resumo, mensagem] = await bot.responder('/show -d', { chat: OUTRO.jid });
            assert.doesNotMatch(resumo, /Mensagens no cache/);
            assert.equal(mensagem, undefined);
        });

    test('-l lista todos os chats e permite selecionar os que ficam depois do décimo', async () => {
        for (let i = 1; i <= 12; i++) {
            const chat = `120363000000000${String(i + 100).padStart(3, '0')}@g.us`;
            bot.criarGrupo(chat, `Grupo ${i}`, [DONO.jid, OUTRO.jid]);
            await mensagemApagada(`conteúdo ${i}`, { chat });
        }
        const [lista] = await bot.responder('/show -l', { chat: PRIVADO_DONO });
        assert.equal((lista.match(/^\d+\. 👥 /gm) ?? []).length, 12);
        assert.match(lista, /12\. 👥 Grupo \d+ — 🗑️ 1/);
        assert.doesNotMatch(lista, /\+\d+ chat\(s\)/);
        const nome = lista.match(/12\. 👥 (Grupo \d+) —/)[1];
        const [resumo, mensagem] = await bot.responder('/show 12', { chat: PRIVADO_DONO });
        assert.ok(resumo.includes(nome));
        assert.match(mensagem, /conteúdo \d+/);
    });

    test('sem apagadas neste chat', async () => {
        assert.deepEqual(await bot.responder('/show'), ['♻️ Nenhuma mensagem apagada registrada neste chat.']);
    });

    test('a última, ou as N últimas em ordem cronológica', async () => {
        for (const t of ['um', 'dois', 'três']) await mensagemApagada(t);

        const [resumo, unica] = await bot.responder('/show');
        assert.equal(resumo, '♻️ *1 mensagem apagada*');
        assert.match(unica, /❌ \*MENSAGEM APAGADA\* \(1\/1\)[\s\S]*"três"/);

        const r = await bot.responder('/s -2');
        assert.equal(r[0], '♻️ *2 mensagens apagadas*');
        assert.match(r[1], /"dois"/);
        assert.match(r[2], /"três"/);

        assert.equal((await bot.responder('/s -5'))[0], '♻️ *3 mensagens apagadas* (pedidas 5, encontradas 3)');
    });

    test('acima do show.max é limitado', async () => {
        await bot.setSetting('show.max', 1);
        await mensagemApagada('a');
        await mensagemApagada('b');
        assert.equal((await bot.responder('/show -9'))[0], '♻️ *1 mensagem apagada*\n_(limitado a 1 por vez)_');
    });

    test('argumento inválido mostra a sintaxe', async () => {
        for (const linha of ['/show -2 -3', '/show -0', '/show -xyz']) {
            assert.match((await bot.responder(linha))[0], /Uso: \/show/, linha);
        }
    });

    test('-q: busca pelo texto (sem acentos); no seu privado, em todos os chats; sem -N, as 5 mais recentes', async () => {
        await mensagemApagada('manda o PIX');
        await mensagemApagada('nada a ver');
        await mensagemApagada('pix no trabalho', { chat: TRABALHO });

        const r = await bot.responder('/show -q pix');
        assert.equal(r[0], '♻️ *1 mensagem apagada* com "pix"');
        assert.match(r[1], /"manda o PIX"/);

        // No seu privado: em todos os chats e em todos os tipos
        const todos = await bot.responder('/show -q pix', { chat: PRIVADO_DONO });
        assert.equal(todos[0], '🗄️ *2 mensagens* (🗑️ 2) com "pix"\n💬 *Chats:* todos');

        for (let i = 0; i < 6; i++) await mensagemApagada(`pix ${i}`);
        assert.equal((await bot.responder('/show -q pix'))[0], '♻️ *5 mensagens apagadas* com "pix" _(as 5 mais recentes de 7; use -N para mais)_');
        assert.equal((await bot.responder('/show -q pix -2')).length, 3);

        assert.deepEqual(await bot.responder('/show -q boleto'), ['♻️ Nenhuma mensagem apagada com "boleto" neste chat.']);
        assert.deepEqual(await bot.responder('/show -q boleto', { chat: PRIVADO_DONO }), ['🗄️ Nada no cache com "boleto" em nenhum chat.']);
    });

    test('-e -q: busca no texto de antes e no de depois; -q não combina com -f e -l', async () => {
        await mensagemEditada('reunião às 10h', 'reuniao às 11h');
        await mensagemEditada('oi', 'olá');

        const r = await bot.responder('/show -e -q REUNIAO');
        assert.equal(r[0], '✏️ *1 mensagem editada* com "REUNIAO"');
        assert.equal((await bot.responder('/show -e -q olá'))[0], '✏️ *1 mensagem editada* com "olá"');

        assert.match((await bot.responder('/show -q x -f'))[0], /❌ O -q não combina com o -f nem com o -l/);
        assert.match((await bot.responder('/show -q'))[0], /❌ Informe o que buscar/);
    });

    test('-q com /regex/flags: no texto como veio; regex inválida avisa', async () => {
        await mensagemApagada('manda o PIX');
        await mensagemApagada('segue o boleto');
        await mensagemApagada('pixel art');
        await mensagemEditada('reunião às 10h', 'reunião às 11h');

        const r = await bot.responder('/show -5 -q /\\bpix\\b|boleto/i');
        assert.equal(r[0], '♻️ *2 mensagens apagadas* com "/\\bpix\\b|boleto/i"');
        assert.match(r[1], /"manda o PIX"/);
        assert.match(r[2], /"segue o boleto"/);

        // Sem a flag i, diferencia maiúsculas; nas editadas, o antes ou o depois
        assert.deepEqual(await bot.responder('/show -q /Pix/'), ['♻️ Nenhuma mensagem apagada com "/Pix/" neste chat.']);
        assert.equal((await bot.responder('/show -e -q "/às 1[01]h/"'))[0], '✏️ *1 mensagem editada* com "/às 1[01]h/"');

        assert.match((await bot.responder('/show -q /[/'))[0], /^❌ Busca inválida: regex inválida/);
    });

    test('-q com chat: só nele', async () => {
        await mensagemApagada('pix aqui');
        await mensagemApagada('pix no trabalho', { chat: TRABALHO });

        const r = await bot.responder('/show -q pix Trabalho');
        assert.equal(r[0], '🗄️ *1 mensagem* (🗑️ 1) com "pix"\n💬 *Chat:* Trabalho');
        assert.match(r[1], /"pix no trabalho"/);
    });

    test('-l: o que tem no cache por tipo e os chats numerados, marcando o atual', async () => {
        await mensagemApagada('a');
        await mensagemApagada('b');
        await mensagemApagada('c');
        await mensagemApagada('d', { chat: TRABALHO });
        await mensagemEditada('x', 'y', { chat: TRABALHO });
        await mensagemApagada('meu status', { chat: 'status@broadcast' });

        const [r] = await bot.responder('/show -l');
        assert.match(r, /🗑️ \*Apagadas:\* 4 [^\n]*\n✏️ \*Editadas:\* 1 [^\n]*\n📸 \*Status:\* 1 /);
        assert.match(r, /1\. 👥 Família — 🗑️ 3 .*← _este chat_/);
        assert.match(r, /2\. 👥 Trabalho — 🗑️ 1 · ✏️ 1 /);
        assert.match(r, /3\. 👤 Fulano — 📸 1 /);
        assert.match(r, /💡 _\/show <nº, nome, @menção ou \/regex\/>/);

        // Os tipos não mudam a lista
        assert.equal((await bot.responder('/show -e -l'))[0], r);
    });

    test('-l <chat>: só os que casam (nº, nome, @menção ou /regex/), com o nº da lista completa',
        async () => {
            // Família (3) antes de Trabalho (2): sem empate, a ordem não depende do relógio
            await mensagemApagada('a');
            await mensagemApagada('b');
            await mensagemApagada('c');
            await mensagemApagada('d', { chat: TRABALHO });
            await mensagemEditada('x', 'y', { chat: TRABALHO });
            await mensagemApagada('meu status', { chat: 'status@broadcast' });

            const [porNome] = await bot.responder('/show -l trab');
            assert.match(porNome, /Mensagens no cache de:\* trab/);
            assert.match(porNome, /🗑️ \*Apagadas:\* 1 [^\n]*\n✏️ \*Editadas:\* 1 [^\n]*\n📸 \*Status:\* 0\n/);
            assert.match(porNome, /2\. 👥 Trabalho — 🗑️ 1 · ✏️ 1 /);
            assert.doesNotMatch(porNome, /Família|Fulano/);

            assert.equal((await bot.responder('/show -l 2'))[0].replace('2', 'trab'), porNome);
            assert.match((await bot.responder('/show -l /^(fam|trab)/'))[0],
                /1\. 👥 Família[^\n]*\n2\. 👥 Trabalho/);

            const [porMencao] = await bot.responder(`/show -l @${OUTRO.user}`, { mencoes: [OUTRO.jid] });
            assert.match(porMencao, /📸 \*Status:\* 1 /);
            assert.match(porMencao, /3\. 👤 Fulano — 📸 1 /);
            assert.doesNotMatch(porMencao, /Família|Trabalho/);

            assert.match((await bot.responder('/show -l nada'))[0], /❌ Nenhum chat no cache casa com "nada"/);
        });

    test('chat pelo nº da lista, pelo nome ou por /regex/ (em qualquer chat)', async () => {
        await mensagemApagada('do trabalho', { chat: TRABALHO });
        await mensagemApagada('da família');
        // Empate em quantidade: a apagada mais recente vem antes (Família = nº 1)
        await bot.dbRun("UPDATE messages SET revoked_at = revoked_at - 1000 WHERE body = 'do trabalho'");
        await bot.responder('/show -l');

        const porNumero = await bot.responder('/show 1', { chat: OUTRO.jid });
        assert.equal(porNumero[0], '🗄️ *1 mensagem* (🗑️ 1)\n💬 *Chat:* Família');
        assert.match(porNumero[1], /"da família"/);

        assert.match((await bot.responder('/show trab'))[1], /"do trabalho"/);
        assert.match((await bot.responder('/show "familia"'))[1], /"da família"/);
        assert.match((await bot.responder('/show /^trab/'))[1], /"do trabalho"/);
        assert.match((await bot.responder('/show /LIA$/'))[1], /"da família"/);
    });

    test('chat: tudo junto, por data; -d, -e e -s filtram e se somam', async () => {
        await mensagemApagada('apagada', { chat: OUTRO.jid });
        await mensagemEditada('antes', 'depois', { chat: OUTRO.jid });
        await mensagemApagada('meu status', { chat: 'status@broadcast' });
        await mensagemApagada('no grupo');
        // Um segundo de diferença entre cada um: a ordem é a da data
        const agora = Date.now();
        await bot.dbRun("UPDATE messages SET revoked_at = ? WHERE body = 'apagada'", [agora - 3000]);
        await bot.dbRun('UPDATE message_edits SET edited_at = ?', [agora - 2000]);

        const r = await bot.responder('/show -5 Fulano');
        assert.equal(r[0], '🗄️ *3 mensagens* (🗑️ 1 · ✏️ 1 · 📸 1) (pedidas 5, encontradas 3)\n💬 *Chat:* Fulano');
        assert.match(r[1], /MENSAGEM APAGADA[\s\S]*"apagada"/);
        assert.match(r[2], /MENSAGEM EDITADA[\s\S]*"depois"/);
        assert.match(r[3], /STATUS APAGADO[\s\S]*"meu status"/);

        assert.equal((await bot.responder('/show -5 -e Fulano'))[0], '✏️ *1 mensagem editada* (pedidas 5, encontradas 1)\n💬 *Chat:* Fulano');
        assert.match((await bot.responder('/show -s Fulano'))[1], /"meu status"/);
        assert.equal((await bot.responder('/show -5 -d -s /fulano/'))[0],
            '🗄️ *2 mensagens* (🗑️ 1 · 📸 1) (pedidas 5, encontradas 2)\n💬 *Chat:* Fulano');
    });

    test('-s: no privado da pessoa, os status dela; no seu privado, de todos', async () => {
        await mensagemApagada('meu status', { chat: 'status@broadcast' });

        assert.match((await bot.responder('/show -s', { chat: OUTRO.jid }))[1], /"meu status"/);
        assert.equal((await bot.responder('/show -s', { chat: PRIVADO_DONO }))[0], '📸 *1 status apagado*\n💬 *Chats:* todos');
        assert.deepEqual(await bot.responder('/show -s'), ['📸 Nenhum status apagado registrado neste chat.']);
    });

    test('@menção: o privado da pessoa', async () => {
        await mensagemApagada('oi', { chat: OUTRO.jid });
        await mensagemApagada('meu status', { chat: 'status@broadcast' }); // o nome "Fulano" no cache

        const r = await bot.responder(`/show -2 @${OUTRO.user}`, { mencoes: [OUTRO.jid] });
        assert.equal(r[0], '🗄️ *2 mensagens* (🗑️ 1 · 📸 1)\n💬 *Chat:* Fulano');
        assert.match((await bot.responder(`/show @${OUTRO.user}`))[0], /não é uma menção/);
        assert.match((await bot.responder('/show @Fulano -d'))[1], /"oi"/, '@ digitado: vale o nome');
    });

    test('chat inexistente, sem correspondência, regex inválida ou ambíguo', async () => {
        assert.deepEqual(await bot.responder('/show xyz'),
            ['🗄️ Nada no cache: nenhuma mensagem apagada, editada ou status apagado.']);

        await mensagemApagada('a');
        await mensagemApagada('b', { chat: TRABALHO });
        assert.match((await bot.responder('/show 9'))[0], /❌ Chat nº 9 não existe/);
        assert.match((await bot.responder('/show xyz'))[0], /❌ Nenhum chat no cache casa com "xyz"/);
        assert.match((await bot.responder('/show /(/'))[0], /❌ Regex inválida: \/\(\//);

        // Empate em quantidade: o mais recente vem antes
        await bot.dbRun("UPDATE messages SET revoked_at = revoked_at - 1000 WHERE body = 'a'");
        const r = await bot.responderEscolhendo('/show a', 1);
        assert.match(r[0], /🔎 "a" corresponde a 2 chats:\n\n1\. 👥 Trabalho\n2\. 👥 Família/);
        assert.match(r.at(-1), /"b"/);
    });

    test('-f: só o dono; remove só as apagadas deste chat (e as mídias)', async () => {
        const { msg } = await mensagemApagada('foto', { midia: { mimetype: 'image/png', data: 'AA==' } });
        await mensagemApagada('b', { chat: TRABALHO });
        const { media_path } = await bot.dbGet('SELECT media_path FROM messages WHERE id = ?', [msg.id.id]);

        assert.deepEqual(await bot.responder('/show -f', { de: OUTRO.jid }), []); // onlyAdmin

        const [r] = await bot.responder('/show -f');
        assert.equal(r, '🧹 *Flush do cache deste chat*\n\n🗑️ Apagadas: *1 mensagem*\n📎 Mídias apagadas do disco: *1* _(1 B)_\n' +
            '\n💡 _Para limpar as de todos os chats, use /show -f no seu privado._');
        assert.ok(!fs.existsSync(media_path));
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE revoked = 1')).n, 1);
    });

    test('-f no seu privado remove de todos; -f com chat, tudo dele', async () => {
        await mensagemApagada('a');
        await mensagemApagada('b', { chat: TRABALHO });
        await mensagemApagada('c', { chat: TRABALHO });
        await mensagemEditada('x', 'y', { chat: TRABALHO });

        const [umChat] = await bot.responder('/show -f trabalho');
        assert.match(umChat, /Flush do cache de:\* Trabalho\n\n🗑️ Apagadas: \*2 mensagens\*\n✏️ Editadas: \*1 mensagem\*\n📸 Status: \*0 status\*/);

        const [geral] = await bot.responder('/show -f', { chat: PRIVADO_DONO });
        assert.match(geral, /🧹 \*Flush geral do cache\*\n\n🗑️ Apagadas: \*1 mensagem\*[\s\S]*\*Por chat\* \(1\):\n1\. 👥 Família — \*1\*/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE revoked = 1')).n, 0);
        assert.deepEqual(await bot.responder('/show -f', { chat: PRIVADO_DONO }), ['♻️ Nenhuma mensagem apagada no cache.']);
    });
});

describe('/show -e (editadas)', () => {
    test('sem editadas neste chat', async () => {
        assert.deepEqual(await bot.responder('/show -e'), ['✏️ Nenhuma mensagem editada registrada neste chat.']);
    });

    test('-d (o padrão) mostra as apagadas, -e as editadas; os dois juntos, por data', async () => {
        await mensagemApagada('apagada');
        await mensagemEditada('antes', 'depois');

        assert.match((await bot.responder('/show -d'))[1], /MENSAGEM APAGADA[\s\S]*"apagada"/);
        assert.match((await bot.responder('/show -deleted'))[1], /"apagada"/);
        assert.match((await bot.responder('/show -edited'))[1], /MENSAGEM EDITADA[\s\S]*"depois"/);
        assert.equal((await bot.responder('/show -d -e -2'))[0], '🗄️ *2 mensagens* (🗑️ 1 · ✏️ 1)');
    });

    test('/edit e /e não existem mais', async () => {
        await mensagemEditada('x', 'y');
        assert.deepEqual(await bot.responder('/edit'), ["⚠️ Comando '/edit' desconhecido, tente: /help"]);
        assert.deepEqual(await bot.responder('/e'), ["⚠️ Comando '/e' desconhecido, tente: /help"]);
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

    test('chat sem editadas', async () => {
        await mensagemApagada('a');
        assert.deepEqual(await bot.responder('/show -e 1'), ['✏️ Nenhuma mensagem editada em Família.']);
    });

    test('dica no seu privado aponta para o -e', async () => {
        const [r] = await bot.responder('/show -e', { chat: PRIVADO_DONO });
        assert.match(r, /\/show -l e depois \/show -e -N <chat>/);
    });

    test('-f remove as editadas deste chat; não mexe nas apagadas', async () => {
        await mensagemEditada('x', 'y');
        await mensagemApagada('z');
        const [r] = await bot.responder('/show -e -f');
        assert.equal(r, '🧹 *Flush do cache deste chat*\n\n✏️ Editadas: *1 mensagem*\n' +
            '\n💡 _Para limpar as de todos os chats, use /show -e -f no seu privado._');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE revoked = 1')).n, 1);
    });
});
