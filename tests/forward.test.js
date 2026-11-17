/*
 * /forward: forwards the replied message to contacts, groups and emails (and the forward.header setting).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt, emails } = bot;
const CICLANO = { jid: '5521922222222@c.us', nome: 'Ciclano' };
const MARIA = { jid: '5521933333333@c.us', nome: 'Maria' };
const HEADER = '🤖 Mensagem encaminhada pelo ZapBot!';
const ENV = {
    QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com',
    QRCODE_EMAIL_SMTP_FROM: 'ZapBot <bot@exemplo.com>', QRCODE_EMAIL_SMTP_TO: 'Eu <eu@exemplo.com>', QRCODE_EMAIL_SMTP_ANTIPHISHING: 'Frase42'
};

beforeEach(async () => {
    await bot.restart();
    bot.createContact(CICLANO.jid, CICLANO.nome);
    bot.createContact(MARIA.jid, MARIA.nome);
    Object.assign(process.env, ENV);
    await bot.setSetting('forward.delayMs', 0); // without the pause between messages
});

afterEach(() => { for (const k of Object.keys(ENV)) delete process.env[k]; });

const quoted = (extras = {}) => bot.createMessage({ texto: 'Reunião às 10h', de: CICLANO.jid, ...extras });

// The status: the command's "wait" notice, which becomes the result when done
const status = (sendings) => sendings.find(e => /^(✉️ |⚠️ Encaminhada|❌ Não consegui encaminhar)/.test(e.texto));

// What was sent to the chat
const para = (sendings, chatId) => sendings.filter(e => e.chatId === chatId);

test('encaminha o texto com o cabeçalho para vários destinatários e lista o status', async () => {
    const sendings = await bot.executar('/forward /Fulano/ @5521933333333 +5521922222222', { citada: quoted(), chat: OWNER.jid,
        extras: { mentionedIds: [MARIA.jid] } });

    assert.equal(para(sendings, OTHERAlt.jid)[0].content, `${HEADER}\n\nReunião às 10h`);
    assert.equal(para(sendings, MARIA.jid)[0].content, `${HEADER}\n\nReunião às 10h`);
    assert.equal(para(sendings, CICLANO.jid)[0].content, `${HEADER}\n\nReunião às 10h`);
    assert.equal(status(sendings).texto, '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano\n👤 Maria\n👤 Ciclano');
    assert.equal(status(sendings).editada, true, 'o aviso "aguarde" foi editado, não é outra mensagem');
});

test('o setting forward.header=false manda só a mensagem', async () => {
    await bot.setSetting('forward.header', false);
    const sendings = await bot.executar('/forward /Fulano/', { citada: quoted() });
    assert.equal(para(sendings, OTHERAlt.jid)[0].content, 'Reunião às 10h');
    assert.equal(status(sendings).texto, '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano', 'sem o cabeçalho, mas o status (com a lista) continua');
});

test('só envia se todos os destinatários forem encontrados', async () => {
    const sendings = await bot.executar('/forward /Fulano/ /Naoexiste/', { citada: quoted() });
    assert.equal(para(sendings, OTHERAlt.jid).length, 0, 'o Fulano não recebeu nada');
    assert.equal(sendings.length, 1);
    assert.match(sendings[0].texto, /Naoexiste/);
});

test('-to por e-mail (vários, antes e depois dos contatos), com o cabeçalho; o status lista cada um', async () => {
    const sendings = await bot.executar('/forward -to fulano@gmail.com /Fulano/ /Maria/ -to root@brasnet.org', { citada: quoted() });

    assert.equal(para(sendings, OTHERAlt.jid).length, 1);
    assert.equal(para(sendings, MARIA.jid).length, 1);
    assert.deepEqual(emails.map(e => e.to), ['fulano@gmail.com', 'root@brasnet.org']);
    assert.match(emails[0].subject, /Mensagem encaminhada/);
    assert.match(emails[0].text, new RegExp(`^${HEADER}\\n\\nReunião às 10h`));
    assert.equal(status(sendings).texto,
        '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano\n👤 Maria\n📧 fulano@gmail.com\n📧 root@brasnet.org');
});

test('mídia: foto vai com o cabeçalho e o texto na legenda; áudio, o texto antes; e-mail, em anexo', async () => {
    const photo = quoted({ texto: 'olha isso', tipo: 'image', midia: { mimetype: 'image/jpeg', data: 'QUJD', filename: 'a.jpg' } });
    let sendings = await bot.executar('/forward /Fulano/ -to a@b.com', { citada: photo });
    const f = para(sendings, OTHERAlt.jid)[0];
    assert.equal(f.content.data, 'QUJD');
    assert.equal(f.options.caption, `${HEADER}\n\nolha isso`);
    assert.equal(emails[0].attachments[0].filename, 'a.jpg');
    assert.equal(emails[0].attachments[0].content.toString(), 'ABC');

    bot.client.enviadas.length = 0;
    const ptt = quoted({ texto: '', tipo: 'ptt', midia: { mimetype: 'audio/ogg; codecs=opus', data: 'QUJD' } });
    sendings = await bot.executar('/forward /Fulano/', { citada: ptt });
    const someone = para(sendings, OTHERAlt.jid);
    assert.equal(someone[0].content, HEADER);
    assert.equal(someone[1].content.data, 'QUJD');
    assert.equal(someone[1].options.sendAudioAsVoice, true);

    // Without a header and without text, the audio goes alone
    await bot.setSetting('forward.header', false);
    sendings = await bot.executar('/forward /Fulano/', { citada: ptt });
    assert.equal(para(sendings, OTHERAlt.jid).length, 1);
});

test('localização vira texto com o link do mapa', async () => {
    const local = quoted({ texto: '', tipo: 'location', extras: { location: { latitude: -22.9, longitude: -43.2, description: 'Cristo' } } });
    const sendings = await bot.executar('/forward /Fulano/', { citada: local });
    assert.equal(para(sendings, OTHERAlt.jid)[0].content, `${HEADER}\n\nCristo\nhttps://maps.google.com/?q=-22.9,-43.2`);
});

test('sem a mensagem respondida, sem destinatários e sem nada para encaminhar', async () => {
    assert.deepEqual(await bot.replyAlt('/forward /Fulano/'), ['Responda a mensagem que você quer encaminhar, ou diga a posição dela (ex.: /forward -1 /Fulano/).\n💡 _/forward -h para ajuda_']);
    assert.match((await bot.replyAlt('/forward', { citada: quoted() }))[0], /^```Usage: \/forward \[-q\] \[-d\] \[-N\] \[#lista\]\.\.\. <destinatário>\.\.\. \[-to <destino>\]\.\.\.\n     \/forward -a|-list|-rm|-move|-desc <\.\.\.>\n/);
    assert.deepEqual(await bot.replyAlt('/forward /Fulano/', { citada: quoted({ texto: '' }) }), ['❌ Essa mensagem não tem nada que eu possa encaminhar.']);
});

test('uma falha no envio não segura os outros: o status mostra ✅ e ❌', async () => {
    const original = bot.client.sendMessage;
    bot.client.sendMessage = async (chatId, ...rest) => {
        if (chatId === MARIA.jid) throw new Error('chat bloqueado');
        return original.call(bot.client, chatId, ...rest);
    };
    try {
        const sendings = await bot.executar('/forward /Fulano/ /Maria/', { citada: quoted(), erroEsperado: true });
        assert.equal(status(sendings).texto, '⚠️ Encaminhada para 1 de 2\n\n👤 Fulano\n👤 Maria · ❌ chat bloqueado');
    } finally {
        bot.client.sendMessage = original;
    }
});

test('um destinatário só: uma linha; todos falhando: o título de erro', async () => {
    let sendings = await bot.executar('/forward /Fulano/', { citada: quoted() });
    assert.equal(status(sendings).texto, '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano');

    const original = bot.client.sendMessage;
    bot.client.sendMessage = async (chatId, ...rest) => {
        if (chatId === OTHERAlt.jid) throw new Error('chat bloqueado');
        return original.call(bot.client, chatId, ...rest);
    };
    try {
        sendings = await bot.executar('/forward /Fulano/', { citada: quoted(), erroEsperado: true });
        assert.equal(status(sendings).texto, '❌ Não consegui encaminhar a mensagem\n\n👤 Fulano · ❌ chat bloqueado');
    } finally {
        bot.client.sendMessage = original;
    }
});

test('avisa na hora para quem vai e, depois de enviar, edita o aviso com o status', async () => {
    const original = bot.client.sendMessage;
    let noticeBefore = null;
    bot.client.sendMessage = async (chatId, ...rest) => {
        if (chatId === OTHERAlt.jid) noticeBefore = bot.client.enviadas.at(-1).content;
        return original.call(bot.client, chatId, ...rest);
    };
    try {
        const sendings = await bot.executar('/forward /Fulano/ -to a@b.com', { citada: quoted() });
        assert.equal(noticeBefore, '⏳ Encaminhando mensagem, aguarde.');
        assert.equal(status(sendings).texto, '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano\n📧 a@b.com');
        assert.equal(sendings.filter(e => /Encaminhando|encaminhada com sucesso/.test(e.texto)).length, 1, 'uma mensagem só, editada');
    } finally {
        bot.client.sendMessage = original;
    }
});

test('-nohdr tira só o cabeçalho (o status fica); -q tira os dois; -s força os dois mesmo com os settings desligados', async () => {
    // -q: no header and no status
    let sendings = await bot.executar('/forward -q /Fulano/', { citada: quoted() });
    assert.equal(sendings.length, 1);
    assert.equal(para(sendings, OTHERAlt.jid)[0].content, 'Reunião às 10h');

    // -nohdr (in any position): without the header, with the status and the list
    sendings = await bot.executar('/forward -nohdr /Fulano/', { citada: quoted() });
    assert.equal(para(sendings, OTHERAlt.jid)[0].content, 'Reunião às 10h');
    assert.equal(status(sendings).texto, '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano');
    sendings = await bot.executar('/forward /Fulano/ -nohdr', { citada: quoted() });
    assert.equal(para(sendings, OTHERAlt.jid)[0].content, 'Reunião às 10h');

    // And by email too
    emails.length = 0;
    await bot.executar('/forward -nohdr -q -to a@b.com', { citada: quoted() });
    assert.doesNotMatch(emails[0].text ?? '', /encaminhada pelo ZapBot/);

    // -s: the header and the status, even with both settings off
    await bot.setSetting('forward.header', false);
    await bot.setSetting('forward.status', false);
    sendings = await bot.executar('/forward /Fulano/', { citada: quoted() });
    assert.equal(sendings.length, 1, 'settings desligados: só a mensagem, sem status');
    assert.equal(para(sendings, OTHERAlt.jid)[0].content, 'Reunião às 10h');
    sendings = await bot.executar('/forward -s /Fulano/', { citada: quoted() });
    assert.equal(para(sendings, OTHERAlt.jid)[0].content, `${HEADER}\n\nReunião às 10h`);
    assert.equal(status(sendings).texto, '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano');
    sendings = await bot.executar('/forward -status /Fulano/', { citada: quoted() });
    assert.ok(sendings.some(e => /encaminhada com sucesso/.test(e.texto)));
});

test('forward.status=false: sem o aviso e sem a lista; as falhas continuam aparecendo', async () => {
    await bot.setSetting('forward.status', false);
    const sendings = await bot.executar('/forward /Fulano/', { citada: quoted() });
    assert.equal(sendings.length, 1);
    assert.equal(sendings[0].content, `${HEADER}\n\nReunião às 10h`, 'o cabeçalho segue o forward.header');
});

test('texto depois dos destinatários: vai no começo, a mensagem respondida embaixo, depois do cabeçalho', async () => {
    const sendings = await bot.executar('/forward /Fulano/ /Maria/ Essa mensagem vai para todos!', { citada: quoted() });
    const expected = `${HEADER}\n\nEssa mensagem vai para todos!\n\nReunião às 10h`;
    assert.equal(para(sendings, OTHERAlt.jid)[0].content, expected);
    assert.equal(para(sendings, MARIA.jid)[0].content, expected);

    // With -q: no header and no status
    const quiet = await bot.executar('/forward -q /Fulano/ Essa mensagem vai para todos!', { citada: quoted() });
    assert.equal(quiet.length, 1);
    assert.equal(para(quiet, OTHERAlt.jid)[0].content, 'Essa mensagem vai para todos!\n\nReunião às 10h');

    // Without a reply: only the typed text (without asking for the reply)
    const alone = await bot.executar('/forward /Fulano/ Bom dia, pessoal!');
    assert.equal(para(alone, OTHERAlt.jid)[0].content, `${HEADER}\n\nBom dia, pessoal!`);
    assert.ok(alone.some(e => /encaminhada com sucesso/.test(e.texto)));

    // Loose words only, with no explicit recipient, remain a name (as always)
    const withoutExplicit = await bot.executar('/forward Fulano', { citada: quoted() });
    assert.equal(para(withoutExplicit, OTHERAlt.jid).length, 1);
});

test('o exemplo dos docs: lista + alias -q; "/nopt" respondendo manda a mensagem, e "/nopt Olha isso!" põe o texto antes', async () => {
    // 1. a lista; 2. o alias mudo
    await bot.executar('/forward -add #nopt /Fulano/ /Maria/');
    assert.match((await bot.executar('/alias -q nopt /forward -q #nopt')).at(-1).texto ?? '', /nopt/);

    // 3. replying to a message: no header and no status (the alias is silent and -q removes both)
    let sendings = await bot.executar('/nopt', { citada: quoted() });
    assert.equal(para(sendings, OTHERAlt.jid)[0].content, 'Reunião às 10h');
    assert.equal(para(sendings, MARIA.jid)[0].content, 'Reunião às 10h');
    assert.equal(sendings.length, 2, 'só as duas mensagens encaminhadas, nada mais');

    // with an extra message: the text before, a blank line and the replied message
    sendings = await bot.executar('/nopt Olha isso!', { citada: quoted() });
    assert.equal(para(sendings, OTHERAlt.jid)[0].content, 'Olha isso!\n\nReunião às 10h');
    assert.equal(para(sendings, MARIA.jid)[0].content, 'Olha isso!\n\nReunião às 10h');
    assert.equal(sendings.length, 2);
});

test('-quiet|-q: envia sem aviso e sem status; só as falhas aparecem', async () => {
    let sendings = await bot.executar('/forward -q /Fulano/ -to a@b.com', { citada: quoted() });
    assert.equal(para(sendings, OTHERAlt.jid).length, 1, 'enviou');
    assert.equal(emails.length, 1);
    assert.equal(sendings.length, 1, 'só a mensagem encaminhada: sem o aviso e sem o status');
    assert.equal(sendings[0].content, 'Reunião às 10h', 'o -q tira também o cabeçalho');

    // -quiet works in any position and the long name too
    sendings = await bot.executar('/forward /Fulano/ -quiet', { citada: quoted() });
    assert.equal(sendings.length, 1);

    // Recipient that does not exist: the error shows up and nothing is sent
    sendings = await bot.executar('/forward -q /Naoexiste/', { citada: quoted() });
    assert.equal(sendings.length, 1);
    assert.match(sendings[0].texto, /Naoexiste/);

    // Send failure: the bot warns
    const original = bot.client.sendMessage;
    bot.client.sendMessage = async (chatId, ...rest) => {
        if (chatId === OTHERAlt.jid) throw new Error('chat bloqueado');
        return original.call(bot.client, chatId, ...rest);
    };
    try {
        sendings = await bot.executar('/forward -q /Fulano/', { citada: quoted(), erroEsperado: true });
        assert.equal(sendings.length, 1);
        assert.equal(sendings[0].texto, '❌ Não consegui encaminhar a mensagem\n\n👤 Fulano · ❌ chat bloqueado');
    } finally {
        bot.client.sendMessage = original;
    }
});

test('só o dono e os admins usam (não é delegável); para o grupo também vale', async () => {
    assert.deepEqual(await bot.replyAlt('/forward /Fulano/', { de: OTHERAlt.jid, citada: quoted() }), []);
    bot.createGroup(GROUP, 'Família', [OWNER.jid, OTHERAlt.jid]);
    const sendings = await bot.executar('/forward /Família/', { citada: quoted(), chat: OWNER.jid });
    assert.equal(para(sendings, GROUP)[0].content, `${HEADER}\n\nReunião às 10h`);
});

describe('várias mensagens: /forward -N', () => {
    let history;
    let group;

    beforeEach(() => {
        // m1 (the oldest) ... m6 (right above the command)
        history = [1, 2, 3, 4, 5, 6].map(n => bot.createMessage({ texto: `m${n}`, de: CICLANO.jid, id: `H${n}` }));
        group = bot.createGroup(GROUP, 'Família', [OWNER.jid, OTHERAlt.jid, CICLANO.jid]);
        group.fetchMessages = async ({ limit }) => history.slice(-limit);
    });

    const someone = (sendings) => para(sendings, OTHERAlt.jid).map(e => e.content);

    test('-1: a mensagem logo acima, com o cabeçalho na própria mensagem', async () => {
        const sendings = await bot.executar('/forward -1 /Fulano/');
        assert.deepEqual(someone(sendings), [`${HEADER}\n\nm6`]);
        assert.equal(status(sendings).texto, '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano');
    });

    test('-1 -4 -6 e -1,-4,-6: as posições, da mais antiga para a mais nova, com o cabeçalho uma vez antes', async () => {
        for (const line of ['/forward -1 -4 -6 /Fulano/', '/forward -1,-4,-6 /Fulano/', '/forward -6 -1 -4 /Fulano/', '/forward -1, -4 , -6 /Fulano/']) {
            const sendings = await bot.executar(line);
            assert.deepEqual(someone(sendings), [HEADER, 'm1', 'm3', 'm6'], line);
            assert.equal(status(sendings).texto, '✉️ 3 mensagens encaminhadas com sucesso!\n\n👤 Fulano', line);
        }
    });

    test('-3..-1 (e -1..-3): a faixa; misturada com posições soltas', async () => {
        assert.deepEqual(someone(await bot.executar('/forward -3..-1 /Fulano/')), [HEADER, 'm4', 'm5', 'm6']);
        assert.deepEqual(someone(await bot.executar('/forward -1..-3 /Fulano/')), [HEADER, 'm4', 'm5', 'm6']);
        assert.deepEqual(someone(await bot.executar('/forward -6 -2..-1 /Fulano/')), [HEADER, 'm1', 'm5', 'm6']);
    });

    test('vários destinatários e o status com a contagem; sem cabeçalho (forward.header=false)', async () => {
        await bot.setSetting('forward.header', false);
        const sendings = await bot.executar('/forward -2 -1 /Fulano/ /Maria/');
        assert.deepEqual(someone(sendings), ['m5', 'm6']);
        assert.deepEqual(para(sendings, MARIA.jid).map(e => e.content), ['m5', 'm6']);
        assert.equal(status(sendings).texto, '✉️ 2 mensagens encaminhadas com sucesso!\n\n👤 Fulano\n👤 Maria');
    });

    test('o aviso diz quantas mensagens vão; o -q tira o aviso e o status', async () => {
        const original = bot.client.sendMessage;
        let notice = null;
        bot.client.sendMessage = async (chatId, ...rest) => {
            if (chatId === OTHERAlt.jid) notice = notice ?? bot.client.enviadas.at(-1).content;
            return original.call(bot.client, chatId, ...rest);
        };
        try {
            await bot.executar('/forward -2 -1 /Fulano/');
            assert.equal(notice, '⏳ Encaminhando 2 mensagens, aguarde.');
        } finally {
            bot.client.sendMessage = original;
        }
        const sendings = await bot.executar('/forward -q -1,-2 /Fulano/');
        assert.deepEqual(sendings.map(e => e.chatId), [OTHERAlt.jid, OTHERAlt.jid], '2 mensagens, sem cabeçalho e sem status');
    });

    test('não contam: as mensagens do próprio bot e os avisos do WhatsApp', async () => {
        const doBot = await bot.client.sendMessage(GROUP, '✉️ Mensagem encaminhada com sucesso!');
        history.push({ id: doBot.id, type: 'chat', body: '✉️ Mensagem encaminhada com sucesso!' });
        history.push({ id: { _serialized: 'SIS1' }, type: 'gp2', body: '' });
        const sendings = await bot.executar('/forward -1 -2 /Fulano/');
        assert.deepEqual(someone(sendings), [HEADER, 'm5', 'm6']);
    });

    test('o comando em si (no fim do histórico) não conta', async () => {
        let commandAlt = null;
        group.fetchMessages = async () => [...history, commandAlt];
        const msg = bot.createMessage({ texto: '/forward -1 /Fulano/' });
        commandAlt = msg;
        const sendings = await bot.deliver(msg);
        assert.deepEqual(someone(sendings), [`${HEADER}\n\nm6`]);
    });

    test('mídia e e-mail: um e-mail só, com o cabeçalho, os textos em sequência e os anexos', async () => {
        history[5] = bot.createMessage({ texto: 'olha', tipo: 'image', de: CICLANO.jid, id: 'H6', midia: { mimetype: 'image/png', data: 'QUJD', filename: 'f.png' } });
        const sendings = await bot.executar('/forward -1 -2 -to a@b.com /Fulano/');
        assert.equal(emails.length, 1);
        assert.match(emails[0].text, new RegExp(`^${HEADER}\\n\\nm5\\n\\nolha\\n\\n`));
        assert.equal(emails[0].attachments.length, 1);
        assert.equal(emails[0].attachments[0].filename, 'f.png');
        const f = para(sendings, OTHERAlt.jid);
        assert.equal(f[2].options.caption, 'olha');
        assert.match(status(sendings).texto, /^✉️ 2 mensagens encaminhadas com sucesso!\n\n/);
    });

    test('erros: resposta e números juntos, posição 0, mais do que o limite, histórico curto, sem ler o chat', async () => {
        assert.deepEqual(await bot.replyAlt('/forward -1 /Fulano/', { citada: quoted() }), ['❌ Use a resposta ou os números (-1, -3..-1), não os dois.']);
        assert.deepEqual(await bot.replyAlt('/forward -0 /Fulano/'), ['❌ As posições começam em -1 (a mensagem logo acima).']);
        assert.deepEqual(await bot.replyAlt('/forward -9 /Fulano/'), ['❌ Só encontrei 6 mensagens acima, e você pediu a -9.']);

        await bot.setSetting('forward.max', 2);
        assert.deepEqual(await bot.replyAlt('/forward -1 -2 -3 /Fulano/'), ['❌ Encaminho até 2 mensagens por vez (você pediu 3). O limite é o setting forward.max.']);
        assert.deepEqual(await bot.replyAlt('/forward -3..-1 /Fulano/'), ['❌ Encaminho até 2 mensagens por vez (você pediu 3). O limite é o setting forward.max.']);

        group.fetchMessages = async () => { throw new Error('sem acesso'); };
        const [r] = await bot.executar('/forward -1 /Fulano/', { erroEsperado: true });
        assert.equal(r.texto, '❌ Não consegui ler as mensagens acima: sem acesso');
        assert.equal(emails.length, 0);
    });

    test('mensagem sem nada para encaminhar no meio: avisa qual posição e não envia nada', async () => {
        history[4] = bot.createMessage({ texto: '', de: CICLANO.jid, id: 'H5' });
        const sendings = await bot.executar('/forward -1 -2 /Fulano/');
        assert.equal(someone(sendings).length, 0);
        assert.equal(sendings.at(-1).texto, '❌ Mensagem -2: ❌ Essa mensagem não tem nada que eu possa encaminhar.');
    });
});

test('lerPosicoes: -1, listas, vírgulas, faixas, e o resto do texto', () => {
    const { readPositions } = bot.src('commands/forward');
    assert.deepEqual(readPositions('-1 /Fulano/'), { posicoes: [1], resto: '/Fulano/' });
    assert.deepEqual(readPositions('-6 -1,-4 /Fulano/'), { posicoes: [1, 4, 6], resto: '/Fulano/' });
    assert.deepEqual(readPositions('-3..-1'), { posicoes: [1, 2, 3], resto: '' });
    assert.deepEqual(readPositions('-1 -1 Fulano'), { posicoes: [1], resto: 'Fulano' });
    assert.deepEqual(readPositions('/Fulano/ -1'), { posicoes: [], resto: '/Fulano/ -1' });
    assert.deepEqual(readPositions('-to a@b.com'), { posicoes: [], resto: '-to a@b.com' });
});

test('-dry|-d: só valida os destinatários, sem enviar e sem precisar de resposta', async () => {
    let sendings = await bot.executar('/forward -dry /Fulano/ -to a@b.com');
    assert.equal(sendings.length, 1, 'só a resposta da simulação');
    assert.match(sendings[0].texto, /Simulação.*nada foi enviado/s);
    assert.match(sendings[0].texto, /Os 2 destinatários foram encontrados/);
    assert.equal(emails.length, 0);

    // With a reply, it does not send either; -d works in any position
    sendings = await bot.executar('/forward /Fulano/ -d', { citada: quoted() });
    assert.equal(sendings.length, 1);
    assert.equal(para(sendings, OTHERAlt.jid).length, 0);

    // Recipient that does not exist: the usual error
    sendings = await bot.executar('/forward -d /Naoexiste/');
    assert.equal(sendings.length, 1);
    assert.match(sendings[0].texto, /Naoexiste/);
    assert.doesNotMatch(sendings[0].texto, /Simulação/);
});

describe('listas de destinatários (#lista)', () => {
    const list = (sendings) => sendings.map(e => e.texto).join('\n');

    test('-add cria a lista, -l mostra e acrescentar não repete ninguém', async () => {
        let r = list(await bot.executar('/forward -add #amigos /Fulano/ +5521922222222'));
        assert.match(r, /Lista #amigos criada com 2 destinatários/);

        r = list(await bot.executar('/forward -add #amigos /Fulano/ -to a@b.com'));
        assert.match(r, /Lista #amigos atualizada: \+1 \(agora 3\)/);
        assert.match(list(await bot.executar('/forward -a #amigos /Fulano/')), /Ninguém novo/);

        assert.match(list(await bot.executar('/forward -l')), /• #amigos \(3\)/);
        const r2 = list(await bot.executar('/forward -l #ami'));
        assert.match(r2, /#amigos\* · 3\/30/);
        assert.match(r2, /Pessoas \(2\)\*\n1\. Fulano\n2\. Ciclano\n\n.*E-mails \(1\)\*\n3\. a@b\.com/s);
        assert.match(r2, /💡 _\/forward #amigos → envia_\n_\/forward -rm #amigos 2 → tira o nº 2_\n_\/forward -a #amigos <destinatários> → acrescenta_$/);
        assert.match(list(await bot.executar('/forward -l #xyz')), /A lista #xyz não existe/);
    });

    test('/forward #lista envia para todos, mistura com avulsos e sem repetir', async () => {
        await bot.executar('/forward -add #amigos /Fulano/ -to a@b.com');

        let sendings = await bot.executar('/forward #amigos', { citada: quoted() });
        assert.equal(para(sendings, OTHERAlt.jid).length, 1);
        assert.equal(emails.length, 1);

        sendings = await bot.executar('/forward #amigos /Fulano/ +5521922222222', { citada: quoted() });
        assert.equal(para(sendings, OTHERAlt.jid).length, 1, 'Fulano só uma vez');
        assert.equal(para(sendings, CICLANO.jid).length, 1);

        sendings = await bot.executar('/forward #naoexiste', { citada: quoted() });
        assert.equal(sendings.length, 1);
        assert.match(sendings[0].texto, /A lista #naoexiste não existe/);
        assert.equal(await bot.executar('/forward #ami', { citada: quoted() }).then(e => para(e, OTHERAlt.jid).length), 0, 'parcial não envia');
    });

    test('quem da lista é o chat do comando fica de fora (avulso digitado vale)', async () => {
        await bot.executar('/forward -add #amigos /Fulano/ /Ciclano/');

        // The bot also replies (notice and status) in the command chat: only the forwarded message counts
        const forwarded = (sendings, chatId) => para(sendings, chatId).filter(e => String(e.content).includes('Reunião às 10h'));

        let sendings = await bot.executar('/forward #amigos', { citada: quoted(), chat: OTHERAlt.jid });
        assert.equal(forwarded(sendings, OTHERAlt.jid).length, 0, 'não manda de volta para a conversa de origem');
        assert.equal(forwarded(sendings, CICLANO.jid).length, 1);

        sendings = await bot.executar('/forward #amigos /Fulano/', { citada: quoted(), chat: OTHERAlt.jid });
        assert.equal(forwarded(sendings, OTHERAlt.jid).length, 1, 'digitado de propósito, vai');

        assert.match(list(await bot.executar('/forward -d #amigos', { chat: OTHERAlt.jid })), /Ficou de fora, por ser este chat: 👤 Fulano/);

        await bot.executar('/forward -add #so /Fulano/');
        sendings = await bot.executar('/forward #so', { citada: quoted(), chat: OTHERAlt.jid });
        assert.equal(sendings.length, 1);
        assert.match(sendings[0].texto, /Ninguém para encaminhar: 👤 Fulano é este mesmo chat/);
    });

    test('-dry com lista mostra os membros sem enviar', async () => {
        await bot.executar('/forward -add #amigos /Fulano/ -to a@b.com');
        const sendings = await bot.executar('/forward -dry #amigos');
        assert.equal(sendings.length, 1);
        assert.match(sendings[0].texto, /Os 2 destinatários foram encontrados/);
        assert.equal(emails.length, 0);
    });

    test('-rm: tira membro, apaga a lista e é tudo ou nada', async () => {
        await bot.executar('/forward -add #amigos /Fulano/ -to a@b.com');

        assert.match(list(await bot.executar('/forward -rm #amigos /Naoexiste/')), /Não estão em #amigos: Naoexiste/);
        assert.match(list(await bot.executar('/forward -l #amigos')), /· 2\/30/, 'nada foi removido');

        assert.match(list(await bot.executar('/forward -rm #amigos 9')), /Não estão em #amigos: 9/);
        assert.match(list(await bot.executar('/forward -rm #amigos 2')), /Removido de #amigos: .*a@b\.com/);
        const last = list(await bot.executar('/forward -rm #amigos 1'));
        assert.match(last, /A lista ficou vazia, então #amigos também foi removida/);
        assert.match(list(await bot.executar('/forward -l')), /Nenhuma lista ainda/);

        await bot.executar('/forward -add #a /Fulano/');
        await bot.executar('/forward -add #b /Fulano/');
        assert.match(list(await bot.executar('/forward -rm #a #zzz')), /Listas não encontradas: #zzz/);
        assert.match(list(await bot.executar('/forward -rm #a')), /Lista #a removida/);
        assert.match(list(await bot.executar('/forward -rm all')), /Lista #b removida/);
    });

    test('-move renomeia e junta; -desc grava, mostra e apaga', async () => {
        await bot.executar('/forward -add #a /Fulano/');
        await bot.executar('/forward -add #b -to a@b.com');

        assert.match(list(await bot.executar('/forward -m #a #c')), /#a renomeada para #c/);
        assert.match(list(await bot.executar('/forward -m #c #b')), /#c juntada em #b \(2 destinatários\)/);
        assert.match(list(await bot.executar('/forward -m #c #b')), /A lista #c não existe/);

        assert.match(list(await bot.executar('/forward -desc #b A turma')), /Descrição de #b salva/);
        assert.match(list(await bot.executar('/forward -desc #b')), /#b\*: A turma/);
        assert.match(list(await bot.executar('/forward -l')), /• #b \(2\) — A turma/);
        assert.match(list(await bot.executar('/forward -desc #b -rm')), /Descrição de #b removida/);
    });

    test('nome inválido e o limite forward.maxRecipients', async () => {
        assert.match(list(await bot.executar('/forward -a #a.b /Fulano/')), /Nome de lista inválido: #a\.b/);

        await bot.setSetting('forward.maxRecipients', 1);
        assert.match(list(await bot.executar('/forward -a #amigos /Fulano/ -to a@b.com')), /acima do limite de 1/);
        assert.match(list(await bot.executar('/forward -l')), /Nenhuma lista/);
        const sendings = await bot.executar('/forward /Fulano/ -to a@b.com', { citada: quoted() });
        assert.match(sendings[0].texto, /São 2 destinatários, acima do limite de 1/);
    });
});
