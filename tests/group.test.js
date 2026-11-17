/*
 * /group: the information, the changes and the timed closing (src/commands/group.js, src/groupReopen.js).
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const { reopenExpired } = bot.src('groupReopen');
const { dbAll, dbReady } = bot.src('db');

let group;
let calls;

beforeEach(async () => {
    await bot.restart();
    // The bot (the owner) is a group admin; Fulano is the creator
    group = bot.createGroup(GROUP, 'Família', [{ jid: OWNER.jid, isAdmin: true }, { jid: OTHERAlt.jid, isSuperAdmin: true, isAdmin: true }]);
    group.description = 'Regras: sem brigas';
    group.createdAt = new Date(2024, 2, 15, 10, 30);
    group.groupMetadata = { subject: 'Família', announce: false, restrict: true, memberAddMode: 'admin_add' };
    calls = [];
    for (const nameAlt of ['setSubject', 'setDescription', 'setPicture', 'deletePicture', 'setMessagesAdminsOnly', 'setInfoAdminsOnly', 'setAddMembersAdminsOnly']) {
        group[nameAlt] = async (...args) => { calls.push([nameAlt, ...args]); return true; };
    }
});

test('/group: as informações do grupo (e o -info é o mesmo)', async () => {
    const [r] = await bot.replyAlt('/group');
    assert.match(r, /^👥 \*Família\*\n👤 2 membros · ⭐ 2 admins\n👑 Criador: .*Fulano/);
    assert.match(r, /Criado em .*15\/03\/2024/);
    assert.match(r, /📝 Regras: sem brigas/);
    assert.match(r, /💬 Enviar mensagens: todos\n✏️ Editar as informações do grupo: só admins\n➕ Adicionar pessoas: só admins\n🤖 Sua conta é admin/);
    assert.deepEqual(await bot.replyAlt('/group -info'), [r]);
});

test('/group -admins: o criador (👑) e os admins (⭐)', async () => {
    const [r] = await bot.replyAlt('/group -admins');
    assert.match(r, /⭐ \*Admins de Família\* \(2\)/);
    assert.match(r, /👑 .*Fulano/);
    assert.match(r, /⭐ .*Dono|⭐ /);
});

test('só funciona em grupo', async () => {
    assert.match((await bot.replyAlt('/group', { chat: OTHERAlt.jid }))[0], /grupos/);
});

test('-name e -desc: o resto do comando é o texto; sem texto no -desc apaga', async () => {
    const r = await bot.replyAlt('/group -name Amigos da L200');
    assert.deepEqual(calls, [['setSubject', 'Amigos da L200']]);
    assert.match(r[0], /✅ Nome mudado para \*Amigos da L200\*\./);

    calls.length = 0;
    assert.match((await bot.replyAlt('/group -desc Regras: sem spam'))[0], /✅ Descrição mudada\./);
    assert.deepEqual(calls, [['setDescription', 'Regras: sem spam']]);

    calls.length = 0;
    assert.match((await bot.replyAlt('/group -desc'))[0], /✅ Descrição apagada\./);
    assert.deepEqual(calls, [['setDescription', '']]);

    assert.match((await bot.replyAlt('/group -name'))[0], /precisa de um texto/);
    assert.match((await bot.replyAlt('/group -name A -desc B'))[0], /um de cada vez/);
});

test('-send, -edit e -add; valores inválidos são recusados', async () => {
    const r = await bot.replyAlt('/group -send admins -edit all -add admins');
    assert.deepEqual(calls, [['setMessagesAdminsOnly', true], ['setInfoAdminsOnly', false], ['setAddMembersAdminsOnly', true]]);
    assert.match(r[0], /✅ Enviar mensagens: só admins\./);
    assert.match(r[0], /✅ Editar as informações do grupo: todos\./);
    assert.match(r[0], /✅ Adicionar pessoas: só admins\./);

    calls.length = 0;
    assert.match((await bot.replyAlt('/group -send talvez'))[0], /-send: "talvez" não vale\. Use admins ou all/);
    assert.match((await bot.replyAlt('/group -for 30m'))[0], /O -for é do -send admins/);
    assert.match((await bot.replyAlt('/group -send admins -for xyz'))[0], /"xyz" não é um tempo/);
    assert.deepEqual(calls, []);
});

test('-send admins -for 30m: fecha e reabre sozinho (a hora fica no banco)', async () => {
    const r = await bot.replyAlt('/group -send admins -for 30m');
    assert.deepEqual(calls, [['setMessagesAdminsOnly', true]]);
    assert.match(r[0], /🔒 Só admins podem mandar mensagem\. Reabre sozinho em /);

    await dbReady;
    const linesAlt = await dbAll('SELECT chat_id, reopen_at FROM group_reopen');
    assert.equal(linesAlt.length, 1);
    assert.equal(linesAlt[0].chat_id, GROUP);

    // Before the deadline, nothing; afterward, reopens and notifies the group
    calls.length = 0;
    assert.equal(await reopenExpired(Date.now() + 10 * 60 * 1000), 0);
    assert.deepEqual(calls, []);
    assert.equal(await reopenExpired(Date.now() + 31 * 60 * 1000), 1);
    assert.deepEqual(calls, [['setMessagesAdminsOnly', false]]);
    assert.ok(bot.client.enviadas.some(e => e.chatId === GROUP && /aberto de novo/.test(e.content)));
    assert.deepEqual(await dbAll('SELECT * FROM group_reopen'), []);
});

test('-send all antes do prazo cancela a reabertura', async () => {
    await bot.replyAlt('/group -send admins -for 1h');
    await bot.replyAlt('/group -send all');
    assert.deepEqual(await dbAll('SELECT * FROM group_reopen'), []);
});

test('-pic: usa a imagem respondida; sem imagem, avisa; -rmpic tira a foto', async () => {
    const quoted = bot.createMessage({ de: OTHERAlt.jid, midia: { mimetype: 'image/jpeg', data: Buffer.from('jpg').toString('base64') } });
    assert.match((await bot.replyAlt('/group -pic', { citada: quoted }))[0], /✅ Foto do grupo mudada\./);
    assert.equal(calls[0][0], 'setPicture');
    assert.equal(calls[0][1].mimetype, 'image/jpeg');

    assert.match((await bot.replyAlt('/group -pic'))[0], /precisa de uma imagem/);
    assert.match((await bot.replyAlt('/group -rmpic'))[0], /✅ Foto do grupo removida\./);
});

test('as mudanças pedem que a conta seja admin; o WhatsApp recusando é dito', async () => {
    group.participants.find(p => p.id._serialized === OWNER.jid).isAdmin = false;
    assert.match((await bot.replyAlt('/group -name Novo'))[0], /precisa ser admin do grupo/);
    assert.deepEqual(calls, []);
    assert.match((await bot.replyAlt('/group'))[0], /Sua conta é não é admin|não é admin/, 'ver não exige admin');

    group.participants.find(p => p.id._serialized === OWNER.jid).isAdmin = true;
    group.setSubject = async () => false;
    assert.match((await bot.replyAlt('/group -name Novo'))[0], /O WhatsApp recusou o -name/);
});
