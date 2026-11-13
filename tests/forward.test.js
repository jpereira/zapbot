/*
 * /forward: encaminha a mensagem respondida para contatos, grupos e e-mails (e o setting forward.header).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO, emails } = bot;
const CICLANO = { jid: '5521922222222@c.us', nome: 'Ciclano' };
const MARIA = { jid: '5521933333333@c.us', nome: 'Maria' };
const CABECALHO = '🤖 Mensagem encaminhada pelo ZapBot!';
const ENV = {
    QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com',
    QRCODE_EMAIL_SMTP_FROM: 'ZapBot <bot@exemplo.com>', QRCODE_EMAIL_SMTP_TO: 'Eu <eu@exemplo.com>', QRCODE_EMAIL_SMTP_ANTIPHISHING: 'Frase42'
};

beforeEach(async () => {
    await bot.reiniciar();
    bot.criarContato(CICLANO.jid, CICLANO.nome);
    bot.criarContato(MARIA.jid, MARIA.nome);
    Object.assign(process.env, ENV);
    await bot.setSetting('forward.delayMs', 0); // sem a pausa entre as mensagens
});

afterEach(() => { for (const k of Object.keys(ENV)) delete process.env[k]; });

const citada = (extras = {}) => bot.criarMensagem({ texto: 'Reunião às 10h', de: CICLANO.jid, ...extras });

// O status: o aviso "aguarde" do comando, que vira o resultado ao terminar
const status = (envios) => envios.find(e => /^(✉️ |⚠️ Encaminhada|❌ Não consegui encaminhar)/.test(e.texto));

// O que foi enviado para o chat
const para = (envios, chatId) => envios.filter(e => e.chatId === chatId);

test('encaminha o texto com o cabeçalho para vários destinatários e lista o status', async () => {
    const envios = await bot.executar('/forward /Fulano/ @5521933333333 +5521922222222', { citada: citada(), chat: DONO.jid,
        extras: { mentionedIds: [MARIA.jid] } });

    assert.equal(para(envios, OUTRO.jid)[0].content, `${CABECALHO}\n\nReunião às 10h`);
    assert.equal(para(envios, MARIA.jid)[0].content, `${CABECALHO}\n\nReunião às 10h`);
    assert.equal(para(envios, CICLANO.jid)[0].content, `${CABECALHO}\n\nReunião às 10h`);
    assert.equal(status(envios).texto, '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano\n👤 Maria\n👤 Ciclano');
    assert.equal(status(envios).editada, true, 'o aviso "aguarde" foi editado, não é outra mensagem');
});

test('o setting forward.header=false manda só a mensagem', async () => {
    await bot.setSetting('forward.header', false);
    const envios = await bot.executar('/forward /Fulano/', { citada: citada() });
    assert.equal(para(envios, OUTRO.jid)[0].content, 'Reunião às 10h');
    assert.equal(status(envios).texto, '✉️ Mensagem encaminhada com sucesso!', 'sem o cabeçalho, sem a lista de quem recebeu');
});

test('só envia se todos os destinatários forem encontrados', async () => {
    const envios = await bot.executar('/forward /Fulano/ /Naoexiste/', { citada: citada() });
    assert.equal(para(envios, OUTRO.jid).length, 0, 'o Fulano não recebeu nada');
    assert.equal(envios.length, 1);
    assert.match(envios[0].texto, /Naoexiste/);
});

test('-to por e-mail (vários, antes e depois dos contatos), com o cabeçalho; o status lista cada um', async () => {
    const envios = await bot.executar('/forward -to fulano@gmail.com /Fulano/ /Maria/ -to root@brasnet.org', { citada: citada() });

    assert.equal(para(envios, OUTRO.jid).length, 1);
    assert.equal(para(envios, MARIA.jid).length, 1);
    assert.deepEqual(emails.map(e => e.to), ['fulano@gmail.com', 'root@brasnet.org']);
    assert.match(emails[0].subject, /Mensagem encaminhada/);
    assert.match(emails[0].text, new RegExp(`^${CABECALHO}\\n\\nReunião às 10h`));
    assert.equal(status(envios).texto,
        '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano\n👤 Maria\n📧 fulano@gmail.com\n📧 root@brasnet.org');
});

test('mídia: foto vai com o cabeçalho e o texto na legenda; áudio, o texto antes; e-mail, em anexo', async () => {
    const foto = citada({ texto: 'olha isso', tipo: 'image', midia: { mimetype: 'image/jpeg', data: 'QUJD', filename: 'a.jpg' } });
    let envios = await bot.executar('/forward /Fulano/ -to a@b.com', { citada: foto });
    const f = para(envios, OUTRO.jid)[0];
    assert.equal(f.content.data, 'QUJD');
    assert.equal(f.options.caption, `${CABECALHO}\n\nolha isso`);
    assert.equal(emails[0].attachments[0].filename, 'a.jpg');
    assert.equal(emails[0].attachments[0].content.toString(), 'ABC');

    bot.client.enviadas.length = 0;
    const ptt = citada({ texto: '', tipo: 'ptt', midia: { mimetype: 'audio/ogg; codecs=opus', data: 'QUJD' } });
    envios = await bot.executar('/forward /Fulano/', { citada: ptt });
    const doFulano = para(envios, OUTRO.jid);
    assert.equal(doFulano[0].content, CABECALHO);
    assert.equal(doFulano[1].content.data, 'QUJD');
    assert.equal(doFulano[1].options.sendAudioAsVoice, true);

    // Sem cabeçalho e sem texto, o áudio vai sozinho
    await bot.setSetting('forward.header', false);
    envios = await bot.executar('/forward /Fulano/', { citada: ptt });
    assert.equal(para(envios, OUTRO.jid).length, 1);
});

test('localização vira texto com o link do mapa', async () => {
    const local = citada({ texto: '', tipo: 'location', extras: { location: { latitude: -22.9, longitude: -43.2, description: 'Cristo' } } });
    const envios = await bot.executar('/forward /Fulano/', { citada: local });
    assert.equal(para(envios, OUTRO.jid)[0].content, `${CABECALHO}\n\nCristo\nhttps://maps.google.com/?q=-22.9,-43.2`);
});

test('sem a mensagem respondida, sem destinatários e sem nada para encaminhar', async () => {
    assert.deepEqual(await bot.responder('/forward /Fulano/'), ['❌ Responda a mensagem que você quer encaminhar, ou diga a posição dela (ex.: /forward -1 /Fulano/).']);
    assert.match((await bot.responder('/forward', { citada: citada() }))[0], /^```Uso: \/forward \[-q\] \[-N\] <destinatário>\.\.\. \[-to <destino>\]\.\.\.\n/);
    assert.deepEqual(await bot.responder('/forward /Fulano/', { citada: citada({ texto: '' }) }), ['❌ Essa mensagem não tem nada que eu possa encaminhar.']);
});

test('uma falha no envio não segura os outros: o status mostra ✅ e ❌', async () => {
    const original = bot.client.sendMessage;
    bot.client.sendMessage = async (chatId, ...resto) => {
        if (chatId === MARIA.jid) throw new Error('chat bloqueado');
        return original.call(bot.client, chatId, ...resto);
    };
    try {
        const envios = await bot.executar('/forward /Fulano/ /Maria/', { citada: citada(), erroEsperado: true });
        assert.equal(status(envios).texto, '⚠️ Encaminhada para 1 de 2\n\n👤 Fulano\n👤 Maria · ❌ chat bloqueado');
    } finally {
        bot.client.sendMessage = original;
    }
});

test('um destinatário só: uma linha; todos falhando: o título de erro', async () => {
    let envios = await bot.executar('/forward /Fulano/', { citada: citada() });
    assert.equal(status(envios).texto, '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano');

    const original = bot.client.sendMessage;
    bot.client.sendMessage = async (chatId, ...resto) => {
        if (chatId === OUTRO.jid) throw new Error('chat bloqueado');
        return original.call(bot.client, chatId, ...resto);
    };
    try {
        envios = await bot.executar('/forward /Fulano/', { citada: citada(), erroEsperado: true });
        assert.equal(status(envios).texto, '❌ Não consegui encaminhar a mensagem\n\n👤 Fulano · ❌ chat bloqueado');
    } finally {
        bot.client.sendMessage = original;
    }
});

test('avisa na hora para quem vai e, depois de enviar, edita o aviso com o status', async () => {
    const original = bot.client.sendMessage;
    let avisoAntes = null;
    bot.client.sendMessage = async (chatId, ...resto) => {
        if (chatId === OUTRO.jid) avisoAntes = bot.client.enviadas.at(-1).content;
        return original.call(bot.client, chatId, ...resto);
    };
    try {
        const envios = await bot.executar('/forward /Fulano/ -to a@b.com', { citada: citada() });
        assert.equal(avisoAntes, '⏳ Encaminhando mensagem...');
        assert.equal(status(envios).texto, '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano\n📧 a@b.com');
        assert.equal(envios.filter(e => /Encaminhando|encaminhada com sucesso/.test(e.texto)).length, 1, 'uma mensagem só, editada');
    } finally {
        bot.client.sendMessage = original;
    }
});

test('-quiet|-q: envia sem aviso e sem status; só as falhas aparecem', async () => {
    let envios = await bot.executar('/forward -q /Fulano/ -to a@b.com', { citada: citada() });
    assert.equal(para(envios, OUTRO.jid).length, 1, 'enviou');
    assert.equal(emails.length, 1);
    assert.equal(envios.length, 1, 'só a mensagem encaminhada: sem o aviso e sem o status');
    assert.equal(envios[0].content, `${CABECALHO}\n\nReunião às 10h`);

    // O -quiet vale em qualquer posição e o nome longo também
    envios = await bot.executar('/forward /Fulano/ -quiet', { citada: citada() });
    assert.equal(envios.length, 1);

    // Destinatário que não existe: o erro aparece e nada é enviado
    envios = await bot.executar('/forward -q /Naoexiste/', { citada: citada() });
    assert.equal(envios.length, 1);
    assert.match(envios[0].texto, /Naoexiste/);

    // Falha no envio: o bot avisa
    const original = bot.client.sendMessage;
    bot.client.sendMessage = async (chatId, ...resto) => {
        if (chatId === OUTRO.jid) throw new Error('chat bloqueado');
        return original.call(bot.client, chatId, ...resto);
    };
    try {
        envios = await bot.executar('/forward -q /Fulano/', { citada: citada(), erroEsperado: true });
        assert.equal(envios.length, 1);
        assert.equal(envios[0].texto, '❌ Não consegui encaminhar a mensagem\n\n👤 Fulano · ❌ chat bloqueado');
    } finally {
        bot.client.sendMessage = original;
    }
});

test('só o dono e os admins usam (não é delegável); para o grupo também vale', async () => {
    assert.deepEqual(await bot.responder('/forward /Fulano/', { de: OUTRO.jid, citada: citada() }), []);
    bot.criarGrupo(GRUPO, 'Família', [DONO.jid, OUTRO.jid]);
    const envios = await bot.executar('/forward /Família/', { citada: citada(), chat: DONO.jid });
    assert.equal(para(envios, GRUPO)[0].content, `${CABECALHO}\n\nReunião às 10h`);
});

describe('várias mensagens: /forward -N', () => {
    let historico;
    let grupo;

    beforeEach(() => {
        // m1 (a mais antiga) ... m6 (logo acima do comando)
        historico = [1, 2, 3, 4, 5, 6].map(n => bot.criarMensagem({ texto: `m${n}`, de: CICLANO.jid, id: `H${n}` }));
        grupo = bot.criarGrupo(GRUPO, 'Família', [DONO.jid, OUTRO.jid, CICLANO.jid]);
        grupo.fetchMessages = async ({ limit }) => historico.slice(-limit);
    });

    const doFulano = (envios) => para(envios, OUTRO.jid).map(e => e.content);

    test('-1: a mensagem logo acima, com o cabeçalho na própria mensagem', async () => {
        const envios = await bot.executar('/forward -1 /Fulano/');
        assert.deepEqual(doFulano(envios), [`${CABECALHO}\n\nm6`]);
        assert.equal(status(envios).texto, '✉️ Mensagem encaminhada com sucesso!\n\n👤 Fulano');
    });

    test('-1 -4 -6 e -1,-4,-6: as posições, da mais antiga para a mais nova, com o cabeçalho uma vez antes', async () => {
        for (const linha of ['/forward -1 -4 -6 /Fulano/', '/forward -1,-4,-6 /Fulano/', '/forward -6 -1 -4 /Fulano/', '/forward -1, -4 , -6 /Fulano/']) {
            const envios = await bot.executar(linha);
            assert.deepEqual(doFulano(envios), [CABECALHO, 'm1', 'm3', 'm6'], linha);
            assert.equal(status(envios).texto, '✉️ 3 mensagens encaminhadas com sucesso!\n\n👤 Fulano', linha);
        }
    });

    test('-3..-1 (e -1..-3): a faixa; misturada com posições soltas', async () => {
        assert.deepEqual(doFulano(await bot.executar('/forward -3..-1 /Fulano/')), [CABECALHO, 'm4', 'm5', 'm6']);
        assert.deepEqual(doFulano(await bot.executar('/forward -1..-3 /Fulano/')), [CABECALHO, 'm4', 'm5', 'm6']);
        assert.deepEqual(doFulano(await bot.executar('/forward -6 -2..-1 /Fulano/')), [CABECALHO, 'm1', 'm5', 'm6']);
    });

    test('vários destinatários e o status com a contagem; sem cabeçalho (forward.header=false)', async () => {
        await bot.setSetting('forward.header', false);
        const envios = await bot.executar('/forward -2 -1 /Fulano/ /Maria/');
        assert.deepEqual(doFulano(envios), ['m5', 'm6']);
        assert.deepEqual(para(envios, MARIA.jid).map(e => e.content), ['m5', 'm6']);
        assert.equal(status(envios).texto, '✉️ 2 mensagens encaminhadas com sucesso!');
    });

    test('o aviso diz quantas mensagens vão; o -q tira o aviso e o status', async () => {
        const original = bot.client.sendMessage;
        let aviso = null;
        bot.client.sendMessage = async (chatId, ...resto) => {
            if (chatId === OUTRO.jid) aviso = aviso ?? bot.client.enviadas.at(-1).content;
            return original.call(bot.client, chatId, ...resto);
        };
        try {
            await bot.executar('/forward -2 -1 /Fulano/');
            assert.equal(aviso, '⏳ Encaminhando 2 mensagens...');
        } finally {
            bot.client.sendMessage = original;
        }
        const envios = await bot.executar('/forward -q -1,-2 /Fulano/');
        assert.deepEqual(envios.map(e => e.chatId), [OUTRO.jid, OUTRO.jid, OUTRO.jid], 'cabeçalho + 2 mensagens, sem status');
    });

    test('não contam: as mensagens do próprio bot e os avisos do WhatsApp', async () => {
        const doBot = await bot.client.sendMessage(GRUPO, '✉️ Mensagem encaminhada com sucesso!');
        historico.push({ id: doBot.id, type: 'chat', body: '✉️ Mensagem encaminhada com sucesso!' });
        historico.push({ id: { _serialized: 'SIS1' }, type: 'gp2', body: '' });
        const envios = await bot.executar('/forward -1 -2 /Fulano/');
        assert.deepEqual(doFulano(envios), [CABECALHO, 'm5', 'm6']);
    });

    test('o comando em si (no fim do histórico) não conta', async () => {
        let comando = null;
        grupo.fetchMessages = async () => [...historico, comando];
        const msg = bot.criarMensagem({ texto: '/forward -1 /Fulano/' });
        comando = msg;
        const envios = await bot.entregar(msg);
        assert.deepEqual(doFulano(envios), [`${CABECALHO}\n\nm6`]);
    });

    test('mídia e e-mail: um e-mail só, com o cabeçalho, os textos em sequência e os anexos', async () => {
        historico[5] = bot.criarMensagem({ texto: 'olha', tipo: 'image', de: CICLANO.jid, id: 'H6', midia: { mimetype: 'image/png', data: 'QUJD', filename: 'f.png' } });
        const envios = await bot.executar('/forward -1 -2 -to a@b.com /Fulano/');
        assert.equal(emails.length, 1);
        assert.match(emails[0].text, new RegExp(`^${CABECALHO}\\n\\nm5\\n\\nolha\\n\\n`));
        assert.equal(emails[0].attachments.length, 1);
        assert.equal(emails[0].attachments[0].filename, 'f.png');
        const f = para(envios, OUTRO.jid);
        assert.equal(f[2].options.caption, 'olha');
        assert.match(status(envios).texto, /^✉️ 2 mensagens encaminhadas com sucesso!\n\n/);
    });

    test('erros: resposta e números juntos, posição 0, mais do que o limite, histórico curto, sem ler o chat', async () => {
        assert.deepEqual(await bot.responder('/forward -1 /Fulano/', { citada: citada() }), ['❌ Use a resposta ou os números (-1, -3..-1), não os dois.']);
        assert.deepEqual(await bot.responder('/forward -0 /Fulano/'), ['❌ As posições começam em -1 (a mensagem logo acima).']);
        assert.deepEqual(await bot.responder('/forward -9 /Fulano/'), ['❌ Só encontrei 6 mensagens acima, e você pediu a -9.']);

        await bot.setSetting('forward.max', 2);
        assert.deepEqual(await bot.responder('/forward -1 -2 -3 /Fulano/'), ['❌ Encaminho até 2 mensagens por vez (você pediu 3). O limite é o setting forward.max.']);
        assert.deepEqual(await bot.responder('/forward -3..-1 /Fulano/'), ['❌ Encaminho até 2 mensagens por vez (você pediu 3). O limite é o setting forward.max.']);

        grupo.fetchMessages = async () => { throw new Error('sem acesso'); };
        const [r] = await bot.executar('/forward -1 /Fulano/', { erroEsperado: true });
        assert.equal(r.texto, '❌ Não consegui ler as mensagens acima: sem acesso');
        assert.equal(emails.length, 0);
    });

    test('mensagem sem nada para encaminhar no meio: avisa qual posição e não envia nada', async () => {
        historico[4] = bot.criarMensagem({ texto: '', de: CICLANO.jid, id: 'H5' });
        const envios = await bot.executar('/forward -1 -2 /Fulano/');
        assert.equal(doFulano(envios).length, 0);
        assert.equal(envios.at(-1).texto, '❌ Mensagem -2: ❌ Essa mensagem não tem nada que eu possa encaminhar.');
    });
});

test('lerPosicoes: -1, listas, vírgulas, faixas, e o resto do texto', () => {
    const { lerPosicoes } = bot.src('comandos/forward');
    assert.deepEqual(lerPosicoes('-1 /Fulano/'), { posicoes: [1], resto: '/Fulano/' });
    assert.deepEqual(lerPosicoes('-6 -1,-4 /Fulano/'), { posicoes: [1, 4, 6], resto: '/Fulano/' });
    assert.deepEqual(lerPosicoes('-3..-1'), { posicoes: [1, 2, 3], resto: '' });
    assert.deepEqual(lerPosicoes('-1 -1 Fulano'), { posicoes: [1], resto: 'Fulano' });
    assert.deepEqual(lerPosicoes('/Fulano/ -1'), { posicoes: [], resto: '/Fulano/ -1' });
    assert.deepEqual(lerPosicoes('-to a@b.com'), { posicoes: [], resto: '-to a@b.com' });
});
