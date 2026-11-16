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
    assert.equal(status(sendings).texto, '✉️ Mensagem encaminhada com sucesso!', 'sem o cabeçalho, sem a lista de quem recebeu');
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
    assert.deepEqual(await bot.replyAlt('/forward /Fulano/'), ['❌ Responda a mensagem que você quer encaminhar, ou diga a posição dela (ex.: /forward -1 /Fulano/).']);
    assert.match((await bot.replyAlt('/forward', { citada: quoted() }))[0], /^```Usage: \/forward \[-q\] \[-N\] <destinatário>\.\.\. \[-to <destino>\]\.\.\.\n/);
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
        assert.equal(noticeBefore, '⏳ Encaminhando mensagem...');
        assert.equal(status(sendings).texto, '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano\n📧 a@b.com');
        assert.equal(sendings.filter(e => /Encaminhando|encaminhada com sucesso/.test(e.texto)).length, 1, 'uma mensagem só, editada');
    } finally {
        bot.client.sendMessage = original;
    }
});

test('-quiet|-q: envia sem aviso e sem status; só as falhas aparecem', async () => {
    let sendings = await bot.executar('/forward -q /Fulano/ -to a@b.com', { citada: quoted() });
    assert.equal(para(sendings, OTHERAlt.jid).length, 1, 'enviou');
    assert.equal(emails.length, 1);
    assert.equal(sendings.length, 1, 'só a mensagem encaminhada: sem o aviso e sem o status');
    assert.equal(sendings[0].content, `${HEADER}\n\nReunião às 10h`);

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
        assert.equal(status(sendings).texto, '✉️ 2 mensagens encaminhadas com sucesso!');
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
            assert.equal(notice, '⏳ Encaminhando 2 mensagens...');
        } finally {
            bot.client.sendMessage = original;
        }
        const sendings = await bot.executar('/forward -q -1,-2 /Fulano/');
        assert.deepEqual(sendings.map(e => e.chatId), [OTHERAlt.jid, OTHERAlt.jid, OTHERAlt.jid], 'cabeçalho + 2 mensagens, sem status');
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
