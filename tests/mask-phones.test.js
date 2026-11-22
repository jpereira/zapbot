/*
 * Phones hidden in the output, without changing the history or a send's recipient.
 */
const bot = require('./helpers/bot');
const { beforeEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { maskPhones } = bot.src('util/phone');

const PHONE = '5521999999944';
const JID = `${PHONE}@c.us`;
const HIDDEN = '+55219****44';

beforeEach(async () => {
    await bot.restart();
    await bot.setSetting('show.delayMs', 0);
    bot.createContact(JID, 'Nome Sobrenome');
    bot.createGroup(bot.GROUP, 'Família', [bot.OWNER.jid, bot.OTHERAlt.jid, JID]);
});

const textMasked = (textAlt) => {
    assert.ok(textAlt.includes(HIDDEN), textAlt);
    assert.ok(!textAlt.includes(PHONE), textAlt);
};

async function messageAlt(textAlt, mediaAlt) {
    const msg = bot.createMessage({ text: textAlt, de: JID, type: mediaAlt ? 'image' : 'chat', media: mediaAlt });
    await bot.deliver(msg);
    return msg;
}

describe('-mask / -m', () => {
    test('formato da máscara e preservação de IDs, datas e números curtos', () => {
        assert.equal(maskPhones(`Nome Sobrenome +${PHONE}`), `Nome Sobrenome ${HIDDEN}`);
        const ids = '120363555000000001@g.us 120363555000000001@newsletter ' +
            '100000000000001@lid 06/10/2026 01:09:35';
        assert.equal(maskPhones(ids), ids);
        assert.equal(maskPhones(`+${PHONE} e +${PHONE}`), `${HIDDEN} e ${HIDDEN}`);
    });

    test('/show mascara autor e texto; o cache e o envio normal preservam o telefone', async () => {
        const msg = await messageAlt(`Ligue +${PHONE}`);
        await bot.erase(msg);
        const [, r] = await bot.replyAlt('/show -mask');
        textMasked(r);
        assert.match(r, /Nome:\* Nome Sobrenome/);
        const row = await bot.dbGet('SELECT * FROM messages WHERE id = ?', [msg.id.id]);
        assert.equal(row.sender_number, PHONE);
        assert.equal(row.body, `Ligue +${PHONE}`);
        assert.ok((await bot.replyAlt('/show'))[1].includes(`+${PHONE}`));
    });

    test('/show -e -m mascara texto de antes e depois', async () => {
        const msg = await messageAlt(`Antes +${PHONE}`);
        await bot.edit(msg, `Depois +${PHONE}`);
        const [, r] = await bot.replyAlt('/show -e -m');
        textMasked(r);
        assert.ok(r.includes(`Antes ${HIDDEN}`));
        assert.ok(r.includes(`Depois ${HIDDEN}`));
        assert.equal((await bot.dbGet('SELECT * FROM message_edits')).sender_number, PHONE);
    });

    test('/show mascara legendas de mídia sem alterar o arquivo', async () => {
        const msg = await messageAlt(`Legenda +${PHONE}`,
            { mimetype: 'image/png', data: Buffer.from('png').toString('base64') });
        await bot.erase(msg);
        const [, r] = await bot.execute('/show -m');
        textMasked(r.options.caption);
        assert.equal(r.content.data, Buffer.from('png').toString('base64'));
    });

    test('/watch -mask mascara listagem e textos completos, sem afetar avisos de regra sem 🔒', async () => {
        await bot.replyAlt(`/watch /${PHONE}/`);
        assert.equal(bot.getSetting('watch.rules')[0], `/${PHONE}/`);
        const msg = await messageAlt(`Contato +${PHONE}`);
        textMasked((await bot.replyAlt('/watch -mask'))[0]);
        textMasked((await bot.replyAlt('/watch -s 1 -m'))[0]);
        assert.equal((await bot.dbGet('SELECT * FROM watch_hits WHERE message_id = ?',
            [msg.id.id])).sender_number, PHONE);
        const [notice] = await bot.execute(`Outro contato +${PHONE}`, { de: JID });
        assert.ok(notice.text.includes(`+${PHONE}`));
    });

    test('-mask dentro da regex não ativa máscara; aspas de nomes são preservadas', async () => {
        const [r] = await bot.replyAlt(`/watch /${PHONE} -mask palavra/i`);
        assert.ok(r.includes(PHONE));
        assert.equal(bot.getSetting('watch.rules')[0], `/${PHONE} -mask palavra/i`);
        bot.createContact(JID, 'Nome -m Sobrenome');
        await bot.setSetting('bot.users', false);
        const [user] = await bot.replyAlt('/bot +u /Nome -m Sobrenome/ -mask');
        textMasked(user);
        assert.ok(user.includes('Nome -m Sobrenome'));
        assert.ok(bot.getSetting('bot.users').includes(`${PHONE}:${bot.GROUP}`));
    });

    test('/bot lista usuários e confirma atalhos com máscara; settings ficam íntegros', async () => {
        await bot.setSetting('bot.users', false);
        textMasked((await bot.replyAlt('/bot -m +u /Nome Sobrenome/'))[0]);
        textMasked((await bot.replyAlt('/bot -list-users -mask'))[0]);
        textMasked((await bot.replyAlt('/bot -mask'))[0]);
        assert.ok(bot.getSetting('bot.users').includes(`${PHONE}:${bot.GROUP}`));
        assert.ok((await bot.replyAlt('/bot -lu'))[0].includes(PHONE));
    });

    test('execuções concorrentes mantêm a máscara isolada por mensagem', async () => {
        await bot.setSetting('bot.users', [bot.OTHERAlt.user]);
        await Promise.all([
            bot.execute('/bot -list-users -mask', { chat: bot.OWNER.jid }),
            bot.execute('/bot -list-users', { chat: bot.GROUP })
        ]);
        const private = bot.client.sent.find(e => e.chatId === bot.OWNER.jid).content;
        const group = bot.client.sent.find(e => e.chatId === bot.GROUP).content;
        assert.ok(!private.includes(bot.OTHERAlt.user));
        assert.ok(private.includes('+55219****11'));
        assert.ok(group.includes(bot.OTHERAlt.user));
    });

    test('/bot -status -to mascara texto enviado por e-mail sem alterar destinatário', async () => {
        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com',
            QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'eu@exemplo.com' };
        Object.assign(process.env, env);
        try {
            await bot.setSetting('watch.rules', [PHONE]);
            await messageAlt(`Contato +${PHONE}`);
            await bot.replyAlt('/bot -status -to email -mask');
            const email = bot.emails.at(-1);
            assert.equal(email.to, 'eu@exemplo.com');
            assert.ok(!email.text.includes(PHONE));
            assert.ok(email.text.includes('55219****44'));
        } finally {
            for (const keyAlt of Object.keys(env)) delete process.env[keyAlt];
        }
    });
});
