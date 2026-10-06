/*
 * Telefones ocultos na saída, sem alterar o histórico nem o destinatário de um envio.
 */
const bot = require('./helpers/bot');
const { beforeEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { mascararTelefones } = bot.src('util/telefone');

const FONE = '5521999999944';
const JID = `${FONE}@c.us`;
const OCULTO = '+55219****44';

beforeEach(async () => {
    await bot.reiniciar();
    await bot.setSetting('show.delayMs', 0);
    bot.criarContato(JID, 'Nome Sobrenome');
    bot.criarGrupo(bot.GRUPO, 'Família', [bot.DONO.jid, bot.OUTRO.jid, JID]);
});

const textoMascarado = (texto) => {
    assert.ok(texto.includes(OCULTO), texto);
    assert.ok(!texto.includes(FONE), texto);
};

async function mensagem(texto, midia) {
    const msg = bot.criarMensagem({ texto, de: JID, tipo: midia ? 'image' : 'chat', midia });
    await bot.entregar(msg);
    return msg;
}

describe('-mask / -m', () => {
    test('formato da máscara e preservação de IDs, datas e números curtos', () => {
        assert.equal(mascararTelefones(`Nome Sobrenome +${FONE}`), `Nome Sobrenome ${OCULTO}`);
        const ids = '120363555000000001@g.us 120363555000000001@newsletter ' +
            '100000000000001@lid 06/10/2026 01:09:35';
        assert.equal(mascararTelefones(ids), ids);
        assert.equal(mascararTelefones(`+${FONE} e +${FONE}`), `${OCULTO} e ${OCULTO}`);
    });

    test('/show mascara autor e texto; o cache e o envio normal preservam o telefone', async () => {
        const msg = await mensagem(`Ligue +${FONE}`);
        await bot.apagar(msg);
        const [, r] = await bot.responder('/show -mask');
        textoMascarado(r);
        assert.match(r, /Nome:\* Nome Sobrenome/);
        const row = await bot.dbGet('SELECT * FROM messages WHERE id = ?', [msg.id.id]);
        assert.equal(row.sender_number, FONE);
        assert.equal(row.body, `Ligue +${FONE}`);
        assert.ok((await bot.responder('/show'))[1].includes(`+${FONE}`));
    });

    test('/show -e -m mascara texto de antes e depois', async () => {
        const msg = await mensagem(`Antes +${FONE}`);
        await bot.editar(msg, `Depois +${FONE}`);
        const [, r] = await bot.responder('/show -e -m');
        textoMascarado(r);
        assert.ok(r.includes(`Antes ${OCULTO}`));
        assert.ok(r.includes(`Depois ${OCULTO}`));
        assert.equal((await bot.dbGet('SELECT * FROM message_edits')).sender_number, FONE);
    });

    test('/show mascara legendas de mídia sem alterar o arquivo', async () => {
        const msg = await mensagem(`Legenda +${FONE}`,
            { mimetype: 'image/png', data: Buffer.from('png').toString('base64') });
        await bot.apagar(msg);
        const [, r] = await bot.executar('/show -m');
        textoMascarado(r.options.caption);
        assert.equal(r.content.data, Buffer.from('png').toString('base64'));
    });

    test('/watch mascara listagem e textos completos, sem afetar avisos automáticos', async () => {
        await bot.responder(`/watch /${FONE}/ -mask`);
        assert.equal(bot.getSetting('watch.rules')[0], `/${FONE}/`);
        const msg = await mensagem(`Contato +${FONE}`);
        textoMascarado((await bot.responder('/watch -mask'))[0]);
        textoMascarado((await bot.responder('/watch -s 1 -m'))[0]);
        assert.equal((await bot.dbGet('SELECT * FROM watch_hits WHERE message_id = ?',
            [msg.id.id])).sender_number, FONE);
        const [aviso] = await bot.executar(`Outro contato +${FONE}`, { de: JID });
        assert.ok(aviso.texto.includes(`+${FONE}`));
    });

    test('-mask dentro da regex não ativa máscara; aspas de nomes são preservadas', async () => {
        const [r] = await bot.responder(`/watch /${FONE} -mask palavra/i`);
        assert.ok(r.includes(FONE));
        assert.equal(bot.getSetting('watch.rules')[0], `/${FONE} -mask palavra/i`);
        bot.criarContato(JID, 'Nome -m Sobrenome');
        await bot.setSetting('bot.users', false);
        const [usuario] = await bot.responder('/bot +v /Nome -m Sobrenome/ -mask');
        textoMascarado(usuario);
        assert.ok(usuario.includes('Nome -m Sobrenome'));
        assert.ok(bot.getSetting('bot.users').includes(`${FONE}:${bot.GRUPO}`));
    });

    test('/bot lista usuários e confirma atalhos com máscara; settings ficam íntegros', async () => {
        await bot.setSetting('bot.users', false);
        textoMascarado((await bot.responder('/bot -m +v /Nome Sobrenome/'))[0]);
        textoMascarado((await bot.responder('/bot -users -mask'))[0]);
        textoMascarado((await bot.responder('/bot -mask'))[0]);
        assert.ok(bot.getSetting('bot.users').includes(`${FONE}:${bot.GRUPO}`));
        assert.ok((await bot.responder('/bot -users'))[0].includes(FONE));
    });

    test('execuções concorrentes mantêm a máscara isolada por mensagem', async () => {
        await bot.setSetting('bot.users', [bot.OUTRO.user]);
        await Promise.all([
            bot.executar('/bot -users -mask', { chat: bot.DONO.jid }),
            bot.executar('/bot -users', { chat: bot.GRUPO })
        ]);
        const privado = bot.client.enviadas.find(e => e.chatId === bot.DONO.jid).content;
        const grupo = bot.client.enviadas.find(e => e.chatId === bot.GRUPO).content;
        assert.ok(!privado.includes(bot.OUTRO.user));
        assert.ok(privado.includes('+55219****11'));
        assert.ok(grupo.includes(bot.OUTRO.user));
    });

    test('/bot -status -to mascara texto enviado por e-mail sem alterar destinatário', async () => {
        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com',
            QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'eu@exemplo.com' };
        Object.assign(process.env, env);
        try {
            await bot.setSetting('watch.rules', [FONE]);
            await mensagem(`Contato +${FONE}`);
            await bot.responder('/bot -status -to email -mask');
            const email = bot.emails.at(-1);
            assert.equal(email.to, 'eu@exemplo.com');
            assert.ok(!email.text.includes(FONE));
            assert.ok(email.text.includes('55219****44'));
        } finally {
            for (const chave of Object.keys(env)) delete process.env[chave];
        }
    });
});
