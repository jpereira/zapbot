/*
 * /contacts: the address book as a vCard, with the photos (cache in CONTACTS_DIR).
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');

const { OTHERAlt, OWNER, GROUP, network } = bot;
const { CONTACTS_DIR } = bot.src('constants');
const { assembleVcard } = bot.src('vcard');
const PHOTO = 'https://pps.whatsapp.net/v/foto.jpg';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const MY_CHAT = OWNER.jid;

beforeEach(async () => {
    await bot.restart();
    await fs.emptyDir(CONTACTS_DIR);
    bot.client.photos.clear();
    const c = bot.createContact(OTHERAlt.jid, OTHERAlt.name);
    c.getProfilePicUrl = async () => bot.client.photos.get(OTHERAlt.jid);
    c.getAbout = async () => 'Disponível; no trabalho, ok';
    bot.client.photos.set(OTHERAlt.jid, PHOTO);
    network.responder('get', PHOTO, network.http({ data: JPEG, headers: { 'content-type': 'image/jpeg' } }));
});

const last = () => bot.client.sent.at(-1);
const vcf = () => Buffer.from(last().content.data, 'base64').toString('utf8');
const downloaded = () => network.calls.filter(c => c.url === PHOTO).length;

test('vCard: campos, escapes, UID fixo e linhas dobradas em 75 colunas', () => {
    const v = assembleVcard({ phone: '5521911111111', name: 'Ana; Silva', note: 'a, b\nc', photo: Buffer.alloc(200, 7) });
    const bar = String.fromCharCode(92);
    assert.ok(v.startsWith(['BEGIN:VCARD', 'VERSION:3.0', 'UID:zapbot-5521911111111', `FN:Ana${bar}; Silva`, ''].join('\r\n')));
    assert.match(v, /TEL;TYPE=CELL:\+5521911111111\r\n/);
    assert.ok(v.includes(`NOTE:a${bar}, b${bar}nc\r\n`));
    assert.ok(v.endsWith('END:VCARD\r\n'));
    assert.ok(v.split('\r\n').every(l => l.length <= 75), 'linha acima de 75 colunas');
    const photo = v.replace(/\r\n /g, '').match(/PHOTO;ENCODING=b;TYPE=JPEG:(\S+)\r\n/)[1];
    assert.equal(Buffer.from(photo, 'base64').length, 200);
});

test('só no próprio privado do dono: grupo e chat de outra pessoa são recusados', async () => {
    const [g] = await bot.replyAlt('/contacts -e', { chat: GROUP });
    assert.match(g, /só funciona no seu próprio privado|only works in your own private chat/);
    const [o] = await bot.replyAlt('/contacts -e', { chat: OTHERAlt.jid });
    assert.match(o, /próprio privado|own private chat/);
    assert.equal(downloaded(), 0);
});

test('-e: um .vcf com nome, número, recado e foto; segunda vez usa o cache', async () => {
    await bot.replyAlt('/contacts -e -p', { chat: MY_CHAT });
    const v = vcf();
    assert.equal(last().content.mimetype, 'text/vcard');
    assert.match(last().content.filename, /^contacts-\d{8}\.vcf$/);
    assert.match(v, new RegExp(`FN:${OTHERAlt.name}`));
    assert.match(v, new RegExp(`TEL;TYPE=CELL:\\+${OTHERAlt.user}`));
    assert.ok(v.includes(`NOTE:Disponível${String.fromCharCode(92)}; no trabalho${String.fromCharCode(92)}, ok`));
    assert.match(v.replace(/\r\n /g, ''), new RegExp(`PHOTO;ENCODING=b;TYPE=JPEG:${JPEG.toString('base64')}`));
    assert.ok(fs.existsSync(`${CONTACTS_DIR}/${OTHERAlt.user}.jpg`));
    assert.equal(downloaded(), 1);

    await bot.replyAlt('/contacts -e -p', { chat: MY_CHAT });
    assert.equal(downloaded(), 1, 'a foto veio do cache');
    await bot.replyAlt('/contacts -e -p -r', { chat: MY_CHAT });
    assert.equal(downloaded(), 2, '-r baixa de novo');
});

test('sem opção mostra a ajuda; no privado com id @lid também vale', async () => {
    const [h] = await bot.replyAlt('/contacts', { chat: MY_CHAT });
    assert.match(h, /Usage|Uso/);
    assert.match(h, /\n`-e` · /);
    const [ok] = await bot.replyAlt('/contacts -l', { chat: MY_CHAT });
    assert.match(ok, /1 contato|1 contact/);
});

test('a mesma pessoa como @c.us e @lid sai uma vez só, e o aviso "Processando" vira a lista', async () => {
    const c = bot.createContact('99887766554433@lid', OTHERAlt.name);
    c.number = '99887766554433';
    const [notice, list] = await bot.replyAlt('/contacts -l', { chat: MY_CHAT });
    assert.match(notice ?? '', /Processando|Processing|contato|contact/);
    const textAlt = list ?? notice;
    assert.equal((textAlt.match(new RegExp(OTHERAlt.name, 'g')) ?? []).length, 1);
    assert.doesNotMatch(textAlt, /99887766554433/);
});

test('lista grande (mais de 40) vai num .txt em vez de uma mensagem que trunca', async () => {
    for (let i = 0; i < 45; i++) bot.createContact(`55219${String(i).padStart(8, '0')}@c.us`, `Pessoa ${i}`);
    await bot.replyAlt('/contacts -l', { chat: MY_CHAT });
    const e = last();
    assert.equal(e.content.mimetype, 'text/plain');
    assert.match(e.content.filename, /^contacts-\d{8}\.txt$/);
    const txt = Buffer.from(e.content.data, 'base64').toString('utf8');
    assert.ok(txt.includes('• Pessoa 44 · +55219'));
    assert.ok(txt.includes(OTHERAlt.name));
});

test('o telefone é o id.user: a cópia com `number` interno (15 dígitos) não vira outro contato', async () => {
    const copy = bot.createContact(OTHERAlt.jid, OTHERAlt.name);
    copy.number = '256473988890652';
    bot.client.contacts.set('copia', { ...copy, id: { ...copy.id } });
    const [notice, list] = await bot.replyAlt('/contacts -l', { chat: MY_CHAT });
    const textAlt = list ?? notice;
    assert.equal((textAlt.match(new RegExp(OTHERAlt.name, 'g')) ?? []).length, 1);
    assert.ok(textAlt.includes(`+${OTHERAlt.user}`));
    assert.doesNotMatch(textAlt, /256473988890652/);
});

test('-e sem -p: só texto, sem baixar nem guardar foto', async () => {
    await bot.replyAlt('/contacts -e', { chat: MY_CHAT });
    assert.match(vcf(), new RegExp(`TEL;TYPE=CELL:\\+${OTHERAlt.user}`));
    assert.doesNotMatch(vcf(), /PHOTO/);
    assert.equal(downloaded(), 0);
    assert.deepEqual(fs.readdirSync(CONTACTS_DIR), []);
});

test('vários filtros /Nome Composto/ valem juntos (qualquer um); palavras soltas também', async () => {
    bot.createContact('5521922222222@c.us', 'Maria Lucia');
    bot.createContact('5521933333333@c.us', 'Rafael Silva');
    const list = async (line) => { const r = await bot.replyAlt(line, { chat: MY_CHAT }); return r.at(-1); };

    const two = await list('/contacts -l /Maria Lucia/ /Rafael Silva/');
    assert.match(two, /Maria Lucia/); assert.match(two, /Rafael Silva/); assert.doesNotMatch(two, new RegExp(OTHERAlt.name));
    assert.match(await list('/contacts -l /Maria Lucia/ 5521933'), /Rafael Silva/);
    assert.match(await list('/contacts -l Maria'), /Maria Lucia/);
});

test('-n não lê nem grava o cache; contacts.cache=off idem', async () => {
    await bot.replyAlt('/contacts -e -p -n', { chat: MY_CHAT });
    assert.ok(!fs.existsSync(`${CONTACTS_DIR}/${OTHERAlt.user}.jpg`));
    assert.match(vcf(), /PHOTO;/);

    await bot.replyAlt('/set contacts.cache off', { chat: MY_CHAT });
    await bot.replyAlt('/contacts -e -p', { chat: MY_CHAT });
    assert.ok(!fs.existsSync(`${CONTACTS_DIR}/${OTHERAlt.user}.jpg`));
});

test('sem foto (privacidade): sai sem PHOTO e o cache lembra para não perguntar de novo', async () => {
    bot.client.photos.clear();
    await bot.replyAlt('/contacts -e -p', { chat: MY_CHAT });
    assert.doesNotMatch(vcf(), /PHOTO/);
    assert.ok(fs.existsSync(`${CONTACTS_DIR}/${OTHERAlt.user}.none`));
});

test('filtro por nome e por número; -l lista; -c apaga o cache', async () => {
    const [nothing] = await bot.replyAlt('/contacts -l zzz', { chat: MY_CHAT });
    assert.match(nothing, /Nenhum contato|No contact/);
    const [list] = await bot.replyAlt(`/contacts -l ${OTHERAlt.user.slice(0, 6)}`, { chat: MY_CHAT });
    assert.match(list, new RegExp(`${OTHERAlt.name} · \\+${OTHERAlt.user}`));

    await bot.replyAlt('/contacts -e -p', { chat: MY_CHAT });
    await bot.replyAlt('/contacts -c', { chat: MY_CHAT });
    assert.deepEqual(fs.readdirSync(CONTACTS_DIR), []);
});

test('o backup guarda as fotos do cache e a restauração as devolve', async () => {
    await bot.replyAlt('/contacts -e -p', { chat: MY_CHAT });
    const { createBackup, restoreBackup, removeBackup } = bot.src('backup');
    const b = await createBackup();
    assert.ok(b.contactsFile && b.contactsBytes > 0 && b.photos === 1);

    await fs.emptyDir(CONTACTS_DIR);
    await restoreBackup(b);
    assert.ok(fs.existsSync(`${CONTACTS_DIR}/${OTHERAlt.user}.jpg`));
    await removeBackup(b);
    assert.ok(!fs.existsSync(b.contactsFile));
});
