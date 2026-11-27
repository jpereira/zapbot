#!/usr/bin/env node
/*
 * The screenshots of docs/web.md and of the README: the web interface with FICTITIOUS data (made up names, numbers
 * and messages), served from the test environment (no WhatsApp, no real database) and photographed by Chrome.
 *
 *   npm i --no-save puppeteer-core
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/web-screenshots.js
 *
 * It writes docs/assets/web/*.png (English) and, with LANG_UI=pt, docs/assets/web/pt-BR/*.png (the same, in Portuguese).
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// English (en_US) by default: docs/assets/web. LANG_UI=pt: the same pictures in Portuguese, in docs/assets/web/pt-BR
const EN = process.env.LANG_UI !== 'pt';
const OUT = path.join(__dirname, '..', 'docs', 'assets', 'web', ...(EN ? [] : ['pt-BR']));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const USER = 'demo';
const PASSWORD = 'demo-password-123';

const bot = require('../tests/helpers/bot');

const PAIRS = [["Oi! Vamos no cinema sábado?", "Hi! Want to go to the movies on Saturday?"], ["Bora! Qual filme?", "Sure! Which movie?"], ["O novo do Villeneuve, sessão das 19h30", "The new Villeneuve, the 7:30 pm showing"], ["Fechado 🍿", "Deal 🍿"], ["Olha onde fui hoje!", "Look where I went today!"], ["o código do wifi é 8842-1190, não passa pra ninguém", "the wifi code is 8842-1190, do not share it"], ["Chego às 19h15 na porta do cinema, ok?", "I will be at the cinema door at 7:15 pm, ok?"], ["Chego às 19h na porta do cinema", "I will be at the cinema door at 7 pm"], ["Almoço domingo na casa da vovó, 13h!", "Sunday lunch at grandma and grandpa, 1 pm!"], ["Levo a sobremesa", "I will bring dessert"], ["Eu levo o refri 🥤", "I will bring the soda 🥤"], ["Mandei o contrato por e-mail", "I emailed the contract"], ["Recebi, valeu!", "Got it, thanks!"], ["Bom dia, pessoal! Reunião do condomínio na quinta, 19h.", "Good morning, everyone! Building meeting on Thursday, 7 pm."], ["Lembrete: o boleto de novembro vence dia 28 e já está no portal.", "Reminder: the November invoice is due on the 28th and is already on the portal."], ["Obrigada! Alguém sabe se o boleto aceita pix?", "Thanks! Does anyone know if the invoice accepts pix?"], ["Aceita sim, é só usar o pix copia e cola do portal.", "It does, just use the pix copy and paste on the portal."], ["Condomínio Solar", "Solar Building"], ["Síndico Paulo", "Manager Paul"], ["Administração", "Management"], ["Dona Marta", "Mrs. Marta"], ["Família Souza", "Souza Family"], ["Mãe", "Mom"], ["Fulano de Tal", "John Doe"], ["Coisas para cozinhar no fim de semana", "Things to cook on the weekend"], ["Projetos e ideias soltas", "Projects and loose ideas"], ["Bolo de cenoura\\nCenoura, ovos, óleo e açúcar; cobertura de chocolate. https://example.com/bolo-de-cenoura", "Carrot cake\\nCarrots, eggs, oil and sugar; chocolate frosting. https://example.com/carrot-cake"], ["Risoto de limão siciliano\\nArroz arbóreo, caldo de legumes, limão e parmesão.", "Lemon risotto\\nArborio rice, vegetable stock, lemon and parmesan."], ["App para dividir a conta do bar\\nUsar o Pix copia-e-cola e um QR Code por pessoa.", "App to split the bar tab\\nUse the Pix copy-and-paste and one QR Code per person."], ["Automatizar o relatório mensal com o /cron", "Automate the monthly report with /cron"], ["Renovar o seguro do carro até dia 30", "Renew the car insurance by the 30th"], ["Senha do wifi da casa: exemplo-1234", "House wifi password: example-1234"], ["PIN do cartão (exemplo): 0000", "Card PIN (example): 0000"], ["Cotação do dólar", "Dollar quote"], ["Bitcoin em uma linha", "Bitcoin in one line"], ["Abre a tag protegida #cofre", "Opens the protected tag #vault"], ["Texto respondido, falado com uma batida", "A replied text, spoken over a beat"], ["Hora de vender?", "Time to sell?"], ["Bom dia! ☀️", "Good morning! ☀️"], ["Bom domingo, família! ☀️", "Happy Sunday, family! ☀️"], ["Pagar o condomínio", "Pay the building fee"], ["chatstate offline (confirmar no aplicativo)", "chatstate offline (confirm in the app)"], ["/pix|ted/i", "/pix|wire/i"], ["#cofre", "#vault"], ["#receitas", "#recipes"], ["Bom dia", "Good morning"], ["esquece o que eu falei", "forget what I said"], ["Vou atrasar uns 20 minutos", "I will be about 20 minutes late"], ["Roteiros e lugares para conhecer", "Itineraries and places to visit"], ["Lisboa em maio: Alfama, Belém e um pastel de nata por dia", "Lisbon in May: Alfama, Belém and one custard tart a day"], ["receitas", "recipes"], ["ideias", "ideas"], ["cofre", "vault"], ["boleto", "invoice"], ["promoção", "sale"], ["viagens", "travel"], ["/dolar", "/dollar"], ["sem horário (privacidade)", "no time (privacy)"]];

// The pictures are made in English by default: the invented data is written in Portuguese below and translated here
// (to the database and to the page) unless LANG_UI=pt
const tr = (text) => (EN && typeof text === 'string' ? PAIRS.reduce((acc, [pt, en]) => acc.split(pt).join(en), text) : text);
const trParams = (params) => (Array.isArray(params) ? params.map(tr) : params);


const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// A small PNG made by hand (a gradient): no image library needed
function png(width, height, color) {
    const crc = (buf) => {
        let c;
        let crcValue = 0xffffffff;
        for (const byte of buf) {
            c = (crcValue ^ byte) & 0xff;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcValue = (crcValue >>> 8) ^ c;
        }
        return (crcValue ^ 0xffffffff) >>> 0;
    };
    const chunk = (type, data) => {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type), data]);
        const sum = Buffer.alloc(4);
        sum.writeUInt32BE(crc(body));
        return Buffer.concat([length, body, sum]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.set([8, 2, 0, 0, 0], 8);
    const rows = [];
    for (let y = 0; y < height; y++) {
        const row = Buffer.alloc(1 + width * 3);
        for (let x = 0; x < width; x++) {
            const t = (x / width + y / height) / 2;
            row[1 + x * 3] = Math.round(color[0] * (1 - t) + 255 * t * 0.35);
            row[2 + x * 3] = Math.round(color[1] * (1 - t) + 255 * t * 0.35);
            row[3 + x * 3] = Math.round(color[2] * (1 - t) + 255 * t * 0.35);
        }
        rows.push(row);
    }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

async function seed() {
    const { MEDIA_DIR, NOTES_DIR } = bot.src('constants');
    const now = Date.now();
    const insert = (id, chat, o) => bot.dbRun(
        `INSERT INTO messages (id, chat_id, chat_name, is_group, sender_name, sender_number, body, type, timestamp, has_media, media_path, revoked, revoked_at, from_me, quoted_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, chat, o.chatName, o.group ? 1 : 0, o.sender ?? null, o.number ?? null, o.body ?? '', o.type ?? 'chat', o.at, o.media ? 1 : 0, o.media ?? null, o.deleted ? 1 : 0, o.deletedAt ?? null, o.fromMe ? 1 : 0, o.quoted ?? null]);

    fs.mkdirSync(path.join(MEDIA_DIR, 'demo'), { recursive: true });
    fs.mkdirSync(NOTES_DIR, { recursive: true });
    const photo = path.join(MEDIA_DIR, 'demo', 'praia.png');
    fs.writeFileSync(photo, png(480, 320, [40, 120, 190]));
    const sticker = path.join(MEDIA_DIR, 'demo', 'figurinha.webp');
    fs.writeFileSync(sticker, png(256, 256, [230, 150, 40]));
    // The gallery: more pictures (each with its own color), a video, a voice note and a document
    const galleryFile = (name, data) => { const file = path.join(MEDIA_DIR, 'demo', name); fs.writeFileSync(file, data); return file; };
    const gallery = [
        ['pordosol.png', png(640, 420, [230, 110, 60])], ['montanha.png', png(420, 640, [70, 140, 90])], ['bolo.png', png(500, 500, [200, 160, 110])],
        ['cachorro.png', png(480, 360, [150, 120, 90])], ['festa.png', png(600, 400, [170, 60, 140])], ['ceu.png', png(520, 360, [60, 110, 200])],
        ['viagem.mp4', Buffer.alloc(2_400_000, 7)], ['audio.ogg', Buffer.alloc(48_000, 3)], ['boleto-novembro.pdf', Buffer.alloc(180_000, 5)],
        ['contrato-aluguel.docx', Buffer.alloc(64_000, 11)], ['orcamento-reforma.xlsx', Buffer.alloc(22_000, 12)], ['apresentacao.pptx', Buffer.alloc(1_200_000, 13)],
        ['fotos-da-festa.zip', Buffer.alloc(3_100_000, 14)], ['bom-dia.png', png(400, 400, [250, 200, 60])], ['bom-dia-copia.png', png(400, 400, [250, 200, 60])],
        ['bom-dia-de-novo.png', png(400, 400, [250, 200, 60])]
    ].map(([name, data]) => galleryFile(name, data));
    const noteImage = path.join(NOTES_DIR, '1_demo_receita.png');
    fs.writeFileSync(noteImage, png(480, 300, [120, 70, 160]));

    const ANA = '5521999990001@c.us';
    const FAMILY = '120363000000000011@g.us';
    const CARLOS = '5521999990002@c.us';

    // Ana: a conversation with a reply, a reaction, a photo, a sticker, a deleted message and an edited one
    const t0 = now - 2 * DAY;
    await insert('a1', ANA, { chatName: 'Ana Souza', sender: 'Ana Souza', number: '5521999990001', body: 'Oi! Vamos no cinema sábado?', at: t0 });
    await insert('a2', ANA, { chatName: 'Ana Souza', body: 'Bora! Qual filme?', at: t0 + 3 * MIN, fromMe: true });
    await insert('a3', ANA, { chatName: 'Ana Souza', sender: 'Ana Souza', number: '5521999990001', body: 'O novo do Villeneuve, sessão das 19h30', at: t0 + 5 * MIN, quoted: 'a2' });
    await insert('a4', ANA, { chatName: 'Ana Souza', body: 'Fechado 🍿', at: t0 + 6 * MIN, fromMe: true });
    await insert('a5', ANA, { chatName: 'Ana Souza', sender: 'Ana Souza', number: '5521999990001', type: 'image', body: 'Olha onde fui hoje!', at: t0 + 2 * HOUR, media: photo });
    await insert('a6', ANA, { chatName: 'Ana Souza', sender: 'Ana Souza', number: '5521999990001', type: 'sticker', at: t0 + 2 * HOUR + MIN, media: sticker });
    // (the last three: the same "good morning" picture forwarded to three chats, for "The same")
    // The thumbnail of the video, ready (the ffmpeg of the test helpers is a fake): a frame and its duration
    const { THUMBS_DIR, keyOf } = bot.src('web/thumbs');
    fs.mkdirSync(THUMBS_DIR, { recursive: true });
    const clip = gallery.find(f => f.endsWith('.mp4'));
    const clipKey = keyOf(clip, fs.statSync(clip));
    fs.writeFileSync(path.join(THUMBS_DIR, `${clipKey}.jpg`), png(360, 202, [30, 90, 140]));
    fs.writeFileSync(path.join(THUMBS_DIR, `${clipKey}.json`), JSON.stringify({ duration: 83 }));
    const galleryTypes = ['image', 'image', 'image', 'image', 'image', 'image', 'video', 'ptt', 'document', 'document', 'document', 'document', 'document', 'image', 'image', 'image'];
    for (const [i, file] of gallery.entries()) {
        const family = i % 3 === 1;
        await insert(`m${i}`, family ? FAMILY : ANA, { chatName: family ? 'Família Souza' : 'Ana Souza', group: family, sender: family ? 'Mãe' : 'Ana Souza', number: '5521999990001', type: galleryTypes[i], at: now - (i + 1) * 5 * HOUR, media: file, fromMe: i === 4 });
    }
    await insert('a7', ANA, { chatName: 'Ana Souza', sender: 'Ana Souza', number: '5521999990001', body: 'o código do wifi é 8842-1190, não passa pra ninguém', at: t0 + 3 * HOUR, deleted: true, deletedAt: t0 + 3 * HOUR + 2 * MIN });
    await insert('a0', ANA, { chatName: 'Ana Souza', sender: 'Ana Souza', number: '5521999990001', body: 'esquece o que eu falei', at: t0 - DAY, deleted: true, deletedAt: t0 - DAY + MIN });
    await insert('a8', ANA, { chatName: 'Ana Souza', body: 'Chego às 19h15 na porta do cinema, ok?', at: t0 + 20 * HOUR, fromMe: true });
    await bot.dbRun("INSERT INTO message_edits (message_id, chat_id, old_body, new_body, edited_at) VALUES ('a8', ?, 'Chego às 19h na porta do cinema', 'Chego às 19h15 na porta do cinema, ok?', ?)", [ANA, t0 + 20 * HOUR + 2 * MIN]);
    await bot.dbRun("INSERT INTO reactions VALUES ('a3', ?, ?, '👍', ?)", [ANA, ANA, t0 + 7 * MIN]);
    await bot.dbRun("INSERT INTO reaction_changes (message_id, chat_id, sender_name, old_reaction, new_reaction, changed_at) VALUES ('a5', ?, 'Ana Souza', '😍', '🔥', ?)", [ANA, t0 + 2 * HOUR + 5 * MIN]);

    // The family group and Carlos
    await insert('f1', FAMILY, { chatName: 'Família Souza', group: true, sender: 'Mãe', number: '5521999990003', body: 'Almoço domingo na casa da vovó, 13h!', at: now - 5 * HOUR });
    await insert('f2', FAMILY, { chatName: 'Família Souza', group: true, sender: 'Carlos Lima', number: '5521999990002', body: 'Levo a sobremesa', at: now - 4 * HOUR });
    await insert('f3', FAMILY, { chatName: 'Família Souza', group: true, body: 'Eu levo o refri 🥤', at: now - 3 * HOUR, fromMe: true });
    await insert('f0', FAMILY, { chatName: 'Família Souza', group: true, sender: 'Carlos Lima', number: '5521999990002', body: 'Vou atrasar uns 20 minutos', at: now - 6 * HOUR, deleted: true, deletedAt: now - 6 * HOUR + MIN });
    await insert('c1', CARLOS, { chatName: 'Carlos Lima', sender: 'Carlos Lima', number: '5521999990002', body: 'Mandei o contrato por e-mail', at: now - 30 * HOUR });
    await insert('c2', CARLOS, { chatName: 'Carlos Lima', body: 'Recebi, valeu!', at: now - 29 * HOUR, fromMe: true });

    // The address book (for the contact picker) and a group
    bot.createContact(ANA, 'Ana Souza');
    bot.createContact(CARLOS, 'Carlos Lima');
    bot.createContact('5521999990003@c.us', 'Mãe');
    bot.createContact('5521999990004@c.us', 'Lourival Vieira Neto');
    bot.createGroup(FAMILY, 'Família Souza', [bot.OWNER.jid, ANA, CARLOS]);

    // A building group where the /watch rule "boleto" matched (the history of a rule opens each match in its chat)
    const BUILDING = '120363000000000022@g.us';
    await insert('b1', BUILDING, { chatName: 'Condomínio Solar', group: true, sender: 'Síndico Paulo', number: '5521999990005', body: 'Bom dia, pessoal! Reunião do condomínio na quinta, 19h.', at: now - 3 * HOUR });
    await insert('b2', BUILDING, { chatName: 'Condomínio Solar', group: true, sender: 'Administração', number: '5521999990006', body: 'Lembrete: o boleto de novembro vence dia 28 e já está no portal.', at: now - 2 * HOUR });
    await insert('b3', BUILDING, { chatName: 'Condomínio Solar', group: true, sender: 'Dona Marta', number: '5521999990007', body: 'Obrigada! Alguém sabe se o boleto aceita pix?', at: now - 2 * HOUR + 5 * MIN });
    await insert('b4', BUILDING, { chatName: 'Condomínio Solar', group: true, sender: 'Síndico Paulo', number: '5521999990005', body: 'Aceita sim, é só usar o pix copia e cola do portal.', at: now - 2 * HOUR + 9 * MIN });
    await bot.dbRun("INSERT INTO watch_hits (rule, message_id, chat_id, chat_name, is_group, sender_name, sender_number, body, timestamp) VALUES ('boleto', 'b2', ?, 'Condomínio Solar', 1, 'Administração', '5521999990006', 'Lembrete: o boleto de novembro vence dia 28 e já está no portal.', ?), ('boleto', 'b3', ?, 'Condomínio Solar', 1, 'Dona Marta', '5521999990007', 'Obrigada! Alguém sabe se o boleto aceita pix?', ?), ('/pix|ted/i', 'b3', ?, 'Condomínio Solar', 1, 'Dona Marta', '5521999990007', 'Obrigada! Alguém sabe se o boleto aceita pix?', ?), ('/pix|ted/i', 'b4', ?, 'Condomínio Solar', 1, 'Síndico Paulo', '5521999990005', 'Aceita sim, é só usar o pix copia e cola do portal.', ?)",
        [BUILDING, now - 2 * HOUR, BUILDING, now - 2 * HOUR + 5 * MIN, BUILDING, now - 2 * HOUR + 5 * MIN, BUILDING, now - 2 * HOUR + 9 * MIN]);

    // Security code notices (someone changed phone): a line in the chat, never a chat of their own
    await bot.dbRun("INSERT INTO messages (id, chat_id, chat_name, is_group, sender_name, sender_jid, body, type, timestamp, has_media, from_me, revoked) VALUES ('n1', ?, 'Ana Souza', 0, 'Ana Souza', 'UNKNOWN', '5521999990001@c.us', 'e2e_notification', ?, 0, 0, 0)", [ANA, t0 + 21 * HOUR]);
    await bot.dbRun("INSERT INTO messages (id, chat_id, chat_name, is_group, sender_name, sender_jid, body, type, timestamp, has_media, from_me, revoked) VALUES ('n2', ?, 'Fulano de Tal', 0, 'Fulano de Tal', 'UNKNOWN', '', 'e2e_notification', ?, 0, 0, 0)", ['5521999990099@c.us', now - HOUR]);

    // Stats of 45 days
    const fmt = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false });
    for (let d = 0; d < 45; d++) {
        for (const [chat, name, base] of [[ANA, 'Ana Souza', 40], [FAMILY, 'Família Souza', 70], [CARLOS, 'Carlos Lima', 15]]) {
            for (const hour of [8, 9, 12, 13, 18, 19, 20, 21, 22]) {
                const wave = 0.5 + 0.5 * Math.sin((d + hour) / 3);
                const msgs = Math.round((base * wave * (hour >= 18 ? 1.8 : 0.7) * (d % 7 === 0 ? 1.6 : 1)) / 3);
                if (msgs <= 0) continue;
                await bot.dbRun('INSERT INTO stats (chat_id, chat_name, is_group, day, hour, sender_id, sender_name, msgs, media, deleted, edited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [chat, name, chat === FAMILY ? 1 : 0, fmt(now - d * DAY).slice(0, 10), hour, `${chat}-p1`, name, msgs, Math.floor(msgs / 6), d % 9 === 0 ? 1 : 0, d % 11 === 0 ? 1 : 0]);
            }
        }
    }

    // Notes (one protected), shortcuts, alerts, schedule
    await bot.dbRun("INSERT INTO note_tags VALUES ('receitas', 'Coisas para cozinhar no fim de semana')");
    await bot.dbRun("INSERT INTO note_tags VALUES ('ideias', 'Projetos e ideias soltas')");
    const note = (id, tag, text, extra = {}) => bot.dbRun('INSERT INTO notes (id, text, created_at, tag, media_path, media_mime, alert_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, text, now - id * 3 * HOUR, tag, extra.media ?? null, extra.mime ?? null, extra.alert ?? null]);
    await note(1, 'receitas', 'Bolo de cenoura\nCenoura, ovos, óleo e açúcar; cobertura de chocolate. https://example.com/bolo-de-cenoura', { media: noteImage, mime: 'image/png' });
    await note(2, 'receitas', 'Risoto de limão siciliano\nArroz arbóreo, caldo de legumes, limão e parmesão.');
    await note(3, 'ideias', 'App para dividir a conta do bar\nUsar o Pix copia-e-cola e um QR Code por pessoa.', { alert: now + 2 * DAY });
    await note(4, 'ideias', 'Automatizar o relatório mensal com o /cron');
    await note(5, null, 'Renovar o seguro do carro até dia 30');
    const crypto = require('node:crypto');
    const salt = crypto.randomBytes(8);
    const key = crypto.scryptSync('demo-secret', salt, 32);
    const sealed = (text) => {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const body = Buffer.concat([cipher.update(Buffer.from(tr(text))), cipher.final()]);
        return `enc:v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
    };
    await bot.dbRun('INSERT INTO note_locks (tag, salt, verifier, created_at) VALUES (?, ?, ?, 1)', ['cofre', salt.toString('hex'), sealed('ok')]);
    await note(6, 'cofre', sealed('Senha do wifi da casa: exemplo-1234'));
    await note(7, 'cofre', sealed('PIN do cartão (exemplo): 0000'));

    for (const [name, description, command, quiet, owner] of [
        ['/dolar', 'Cotação do dólar', '/stocks USD', 0, 0], ['/btc', 'Bitcoin em uma linha', '/crypto -q BTC', 1, 0],
        ['/stash.view', 'Abre a tag protegida #cofre', '/notes -v -lock $1 #cofre', 1, 1], ['/rap', 'Texto respondido, falado com uma batida', '/tts -l -v tugão -sp 65 -b 95 $@', 0, 0]
    ]) await bot.dbRun('INSERT INTO command_aliases (name, description, command, quiet, owner_only) VALUES (?, ?, ?, ?, ?)', [name, description, command, quiet, owner]);
    await bot.dbRun("INSERT INTO price_alerts (kind, symbol, op, target, created_at, dest_id, dest_name, message) VALUES ('crypto', 'BTC', '>', 120000, ?, '5521999990001@c.us', 'Ana Souza', 'Hora de vender?')", [now - 3 * DAY]);
    // paused (-alert -pause): the ⏸️ and the struck-through row
    await bot.dbRun("INSERT INTO price_alerts (kind, symbol, op, target, created_at, paused) VALUES ('acao', 'USD', '<', 5, ?, 1)", [now - DAY]);
    await bot.setSetting('watch.rules', ['boleto', '/pix|ted/i', 'promoção']);
    await bot.dbRun("INSERT INTO monitor_contacts (contact_id, contact_name, created_at, last_status, last_seen, last_checked_at, alert_enabled) VALUES ('5521999990002@c.us', 'Carlos Lima', 1, 'offline', ?, ?, 1)", [Math.floor((now - 40 * MIN) / 1000), now - MIN]); // (the monitor keeps the last seen in seconds)
    await bot.dbRun("INSERT INTO watch_destinations (rule, dest_id, dest_name, dest_is_group) VALUES ('boleto', '5521999990001@c.us', 'Ana Souza', 0)");
    await bot.dbRun("INSERT INTO watch_destinations (rule, dest_id, dest_name, dest_is_group, recipients) VALUES ('/pix|ted/i', '5521999990004@c.us', 'Lourival Vieira Neto', 0, ?)", [JSON.stringify([{ id: '5521999990004@c.us', name: 'Lourival Vieira Neto', group: false }, { id: FAMILY, name: 'Família Souza', group: true }])]);
    await bot.dbRun("INSERT INTO watch_muted (rule) VALUES ('promoção')");
    const monitorId = (await bot.dbGet('SELECT id FROM monitor_contacts')).id;
    // Two weeks of habits: early in the morning and in the evening (the heatmap of the Monitor tab), latest first
    const seenAgo = [40 * MIN, 5 * HOUR];
    for (let day = 1; day < 14 && seenAgo.length < 30; day++) seenAgo.push(day * DAY + ((day * 7) % 5) * 20 * MIN, day * DAY + 13 * HOUR + ((day * 3) % 4) * 25 * MIN);
    for (const [i, ago] of seenAgo.entries()) {
        await bot.dbRun("INSERT INTO monitor_history (contact_id, last_seen, observed_at, source, kind) VALUES (?, ?, ?, 'WAWebCollections.Presence(…).chatstate.attributes.t', 'chatstate offline (confirmar no aplicativo)')", [monitorId, Math.floor((now - ago) / 1000) - i, now - ago + MIN]);
    }
    await bot.dbRun('UPDATE monitor_contacts SET online_state = 0, last_attempt_at = ? WHERE id = ?', [now - MIN, monitorId]);
    await bot.dbRun("INSERT INTO monitor_contacts (contact_id, contact_name, created_at, last_status, last_seen, last_checked_at, last_attempt_at, alert_enabled, online_state) VALUES ('5521999990004@c.us', 'Lourival Vieira Neto', 2, 'online', ?, ?, ?, 0, 1)", [Math.floor((now - 2 * MIN) / 1000), now - MIN, now - MIN]);
    await bot.dbRun("INSERT INTO monitor_contacts (contact_id, contact_name, created_at, last_status, last_checked_at, last_attempt_at, alert_enabled) VALUES ('5521999990007@c.us', 'Dona Marta', 3, 'sem horário (privacidade)', ?, ?, 1)", [now - 3 * MIN, now - 3 * MIN]);
    // The online sessions of the last 7 days (the timeline and "online together"): Carlos in the morning and in the
    // evening, Lourival in the evening (online right now); they meet most evenings
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const lourivalId = (await bot.dbGet("SELECT id FROM monitor_contacts WHERE contact_id = '5521999990004@c.us'")).id;
    const session = (id, start, end, open = false) => bot.dbRun('INSERT INTO monitor_sessions (contact_id, started_at, last_at, ended_at) VALUES (?, ?, ?, ?)', [id, start, end, open ? null : end]);
    for (let day = 0; day < 7; day++) {
        const d = midnight.getTime() - day * DAY;
        const shift = ((day * 7) % 5) * 6 * MIN;
        if (d + 8 * HOUR < now) await session(monitorId, d + 7 * HOUR + 40 * MIN + shift, d + 8 * HOUR + 15 * MIN + shift);
        if (d + 20 * HOUR < now) await session(monitorId, d + 19 * HOUR + shift, d + 20 * HOUR + 10 * MIN + shift);
        if (day % 3 !== 1 && d + 21 * HOUR < now) await session(lourivalId, d + 19 * HOUR + 35 * MIN - shift, d + 21 * HOUR - shift);
        if (day % 2 === 0 && d + 13 * HOUR < now) await session(lourivalId, d + 12 * HOUR + 10 * MIN, d + 12 * HOUR + 50 * MIN);
    }
    await session(lourivalId, now - 25 * MIN, now - MIN, true);
    // The quote the ▶️ of the /dolar shortcut reads (no internet: the test network of the helpers), and a bot that is
    // connected, with a couple of errors in its log (the health page)
    bot.network.responder('get', 'query1.finance.yahoo.com', () => ({ chart: { result: [{ meta: { symbol: 'USDBRL=X', longName: 'USD/BRL', fullExchangeName: 'CCY', currency: 'BRL', regularMarketPrice: 5.43, regularMarketDayHigh: 5.47, regularMarketDayLow: 5.39, regularMarketVolume: 0, fiftyTwoWeekHigh: 6.3, fiftyTwoWeekLow: 5.1 }, indicators: { quote: [{ open: [5.41], close: [5.43], high: [5.47], low: [5.39] }] } }] } }));
    Object.assign(bot.state, { ready: true, restarting: false, authenticatedAt: now - 3 * DAY - 4 * HOUR });
    bot.src('log').printError('Price alert: failed to notify:', 'timeout of 15000ms exceeded');
    await bot.dbRun("INSERT INTO schedules (kind, chat_id, chat_name, text, due_at, repeat, created_at) VALUES ('agendar', ?, 'Você', 'Bom dia! ☀️', ?, 'daily', 1)", ['5521999999999@c.us', now + 14 * HOUR]);
    await bot.dbRun("INSERT INTO schedules (kind, chat_id, chat_name, is_group, text, due_at, repeat, created_at, paused) VALUES ('agendar', ?, 'Família Souza', 1, 'Bom domingo, família! ☀️', ?, 'weekly', 1, 1)", [FAMILY, now + 5 * DAY]);
    await bot.dbRun("INSERT INTO schedules (kind, chat_id, chat_name, text, due_at, repeat, created_at) VALUES ('lembrete', ?, 'Você', 'Pagar o condomínio', ?, 'monthly', 1)", ['5521999999999@c.us', now + 3 * DAY]);
    // with a {/command}: the 🧪 test runs it, as at the scheduled time
    await bot.dbRun("INSERT INTO schedules (kind, chat_id, chat_name, is_group, text, due_at, repeat, created_at) VALUES ('agendar', ?, 'Família Souza', 1, 'Bom dia, família! ☀️ {/stocks -q USD}', ?, 'daily', 1)", [FAMILY, now + 20 * HOUR]);

    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    return { ANA };
}

async function main() {
    const puppeteer = require('puppeteer-core');
    await bot.restart();
    // everything the seed writes goes through tr(): the invented data comes out in English (or in Portuguese with LANG_UI=pt)
    const { dbRun, setSetting, createContact, createGroup } = bot;
    bot.dbRun = (sql, params) => dbRun(tr(sql), trParams(params));
    bot.setSetting = (key, value) => setSetting(key, Array.isArray(value) ? value.map(tr) : tr(value));
    bot.createContact = (jid, name) => createContact(jid, tr(name));
    bot.createGroup = (id, name, members) => createGroup(id, tr(name), members);
    await bot.setSetting('zapbot.lang', EN ? 'en_US' : 'pt_BR');
    await bot.setSetting('zapbot.web.login', USER);
    await bot.setSetting('zapbot.web.password', PASSWORD);
    await bot.setSetting('zapbot.web.url', 'http://192.168.1.253:3200');
    process.env.ZAPBOT_WEB_ENABLED = 'true'; // the Settings page shows it as decided by the variable (🔧)
    bot.client.info = { wid: { _serialized: bot.OWNER.jid }, pushname: tr('Você') };
    await seed();

    const { createServer } = bot.src('web/server');
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    fs.mkdirSync(OUT, { recursive: true });
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1360, height: 860, deviceScaleFactor: 1 });
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const shot = async (name, height = 860, width = 1360) => {
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.waitForFunction(() => !document.querySelector('.progress-overlay'), { timeout: 15000 });
        await wait(350);
        await page.screenshot({ path: path.join(OUT, `${name}.png`) });
        console.log('→', `docs/assets/web/${name}.png`);
    };
    const view = async (name) => {
        await page.evaluate((v) => document.querySelector(`.rail-btn[data-view="${v}"]`).click(), name);
        await wait(450);
    };
    // Clicks the first element of a selector whose text includes a word
    const clickText = (selector, word, nth = 0) => page.evaluate((sel, w, n) => {
        const found = [...document.querySelectorAll(sel)].filter(b => b.textContent.includes(w));
        found[n]?.click();
        return Boolean(found[n]);
    }, selector, tr(word), nth);
    // The ✏️ / 📜 / 🗑️ button of the row that has a word, inside the section number `section` (0 based)
    const rowButton = (section, word, icon) => page.evaluate((sec, w, ic) => {
        const row = [...document.querySelectorAll('.section')[sec].querySelectorAll('tbody tr')].find(r => r.textContent.includes(w));
        [...row.querySelectorAll('.icon-btn')].find(b => b.textContent.includes(ic)).click();
    }, section, tr(word), icon);
    const closeModal = async () => { await page.evaluate(() => document.querySelector('.modal .modal-actions .btn:not(.on)')?.click()); await wait(200); };

    // An error of the page shows in the output (a screen that does not draw is easier to find)
    // (on stderr: the helpers of the tests silence the console)
    page.on('pageerror', (err) => process.stderr.write(`page error: ${err.message}\n`));
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.evaluateOnNewDocument(() => localStorage.setItem('zb_order', 'start')); // the conversation from its start
    // (the first steps of Home have their own picture: hidden in the others)
    await page.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('zb_show_onboarding')) localStorage.setItem('zb_onboarding_hidden', '1'); });

    /* the first setup: the single-use link of the log opens this page (the password half typed, for the meter) */
    const { token } = bot.src('web/setup').issueSetupLink(base);
    await page.goto(`${base}/setup#${token}`);
    await page.waitForSelector('.setup-card');
    await page.type('.setup-card input[autocomplete=new-password]', 'Cafe-com-pao-2026!');
    await shot('setup', 900);
    bot.src('web/setup').reset();

    await page.goto(base);
    await page.waitForSelector('.login input');
    await shot('login');
    await page.type('input[autocomplete=username]', USER);
    await page.type('input[type=password]', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForSelector('.rail');

    /* the email step of the first setup, right after the access: Gmail picked, the login and who receives typed */
    await page.evaluate(() => window.setupMailStep());
    await page.waitForSelector('.setup-card .chip-btn');
    await page.evaluate(() => [...document.querySelectorAll('.setup-card .chip-btn')].find(b => b.textContent === 'Gmail').click());
    await page.type('.setup-card input[autocomplete=email]', 'meu.bot@gmail.com');
    await page.type('.setup-card input[autocomplete=new-password]', 'abcd efgh ijkl mnop');
    await page.type('.setup-card input[placeholder="voce@exemplo.com"]', 'jorge@exemplo.com');
    await shot('setup-mail', 1000);
    await page.reload();
    await page.waitForSelector('.rail');

    /* home */
    await shot('home', 1480);
    // the first steps, as right after the setup (WhatsApp paired; the email, the 2FA and the rest still to do)
    await page.evaluate(() => { sessionStorage.setItem('zb_show_onboarding', '1'); localStorage.removeItem('zb_onboarding_hidden'); });
    await page.reload();
    await page.waitForSelector('.onboarding');
    await shot('onboarding', 860);
    await page.evaluate(() => { sessionStorage.removeItem('zb_show_onboarding'); localStorage.setItem('zb_onboarding_hidden', '1'); });
    await page.reload();
    await page.waitForSelector('.storage-head .btn');
    // the /cache of the storage: each part with its size, and everything with the warning
    await page.evaluate(() => [...document.querySelectorAll('.storage-head .btn')].find(b => b.textContent.includes('🧹')).click());
    await page.waitForSelector('.modal');
    await shot('home-clean', 860);
    await closeModal();

    /* history */
    await view('history');
    await page.waitForSelector('.chat');
    await shot('history-chats', 700);
    await clickText('.chat', 'Ana Souza');
    await page.waitForSelector('.msg');
    await shot('history', 1180);
    await page.evaluate(() => { [...document.querySelectorAll('.toolbar .btn')].find(b => b.textContent.includes('☑')).click(); });
    await wait(500);
    await page.evaluate(() => { [...document.querySelectorAll('.msg')].slice(0, 3).forEach(m => m.click()); });
    await shot('history-select', 1180);
    await page.evaluate(() => { [...document.querySelectorAll('.toolbar .btn')].find(b => b.textContent.includes('☑')).click(); });
    await wait(300);
    // clear the history of the chat: how many go and stay, and the box that deletes everything
    await page.evaluate(() => { [...document.querySelectorAll('.main-head .btn')].find(b => b.textContent.includes('🧹')).click(); });
    await page.waitForSelector('.modal');
    await shot('history-clear', 860);
    await closeModal();
    // the big flush: the 🧹 next to "Chats", for every chat
    await page.evaluate(() => document.querySelector('.side-head .btn').click());
    await page.waitForSelector('.modal');
    await shot('history-flush', 860);
    await closeModal();

    /* notes */
    await view('notes');
    await page.waitForSelector('.chat');
    await clickText('.chat', '#receitas');
    await page.waitForSelector('.note');
    await shot('notes');
    await page.evaluate(() => document.querySelector('.side-head .btn.on').click());
    await page.waitForSelector('.modal');
    const fields = await page.$$('.modal input[type=text]');
    await fields[0].type(tr('viagens'));
    await fields[1].type(tr('Roteiros e lugares para conhecer'));
    await shot('notes-new-tag', 860);
    await closeModal();
    await clickText('.main-head .btn', EN ? 'New note' : 'Nova nota');
    await page.waitForSelector('.modal');
    await page.type('.modal textarea', tr('Lisboa em maio: Alfama, Belém e um pastel de nata por dia'));
    await shot('notes-new-note', 860);
    await closeModal();
    // ↪️ on a note: the tag comes from the list of tags (the current one and the protected stay out)
    await page.evaluate(() => [...document.querySelectorAll('.note .icon-btn')].find(b => b.textContent === '↪️').click());
    await page.waitForSelector('.modal select');
    const tagOptions = await page.$$eval('.modal select option', (o) => o.map(x => x.textContent));
    if (!tagOptions.includes(tr('#ideias')) || tagOptions.includes(tr('#receitas')) || tagOptions.includes(tr('#cofre'))) throw new Error(`move: the tag list is ${tagOptions}`);
    await page.select('.modal select', tr('ideias'));
    await shot('notes-move', 860);
    await closeModal();
    await clickText('.chat', '#cofre');
    await page.waitForSelector('.lockpanel');
    await shot('notes-locked');

    /* alerts */
    await view('alerts');
    await page.waitForSelector('table');
    await shot('alerts', 940);
    await rowButton(0, 'BTC', '✏️');
    await page.waitForSelector('.modal');
    await page.type('.people input[type=text]', 'lou');
    await page.waitForSelector('.result');
    await shot('alerts-edit', 860);
    await closeModal();
    await page.click('.section .btn.on');
    await page.waitForSelector('.modal');
    await shot('form-add');
    await closeModal();
    await rowButton(1, 'boleto', '📜');
    await page.waitForSelector('.modal.wide table');
    await shot('alerts-watch-history', 860);
    await closeModal();
    // ✏️ on a /watch rule: it is tried on the last messages, with the part that matched
    await rowButton(1, 'boleto', '✏️');
    await page.waitForSelector('.try-sample', { timeout: 15000 });
    await shot('alerts-watch-test', 900);
    await closeModal();
    await rowButton(1, 'boleto', '📜');
    await page.waitForSelector('.modal.wide table');
    // a click on a match opens its chat at the message, outlined, with the rule and the part that matched
    await page.evaluate(() => document.querySelector('.modal.wide a.link').click());
    await page.waitForSelector('.bubble.watched');
    await wait(600);
    await shot('history-watch', 940);

    /* the monitor: a card per contact, with the habits of one open */
    await view('monitor');
    await page.waitForSelector('.mon-card');
    await page.evaluate((w) => [...document.querySelectorAll('.mon-card')].find(c => c.textContent.includes(w)).querySelector('summary').click(), tr('Carlos'));
    await shot('monitor', 900);
    await page.evaluate((w) => [...[...document.querySelectorAll('.mon-card')].find(c => c.textContent.includes(w)).querySelectorAll('.icon-btn')].find(b => b.textContent.includes('📜')).click(), tr('Carlos'));
    await page.waitForSelector('.modal.wide table');
    await shot('monitor-history', 760);
    await closeModal();
    // the habits of the same contact (weekday × hour), under its online time
    await page.evaluate((w) => [...[...document.querySelectorAll('.mon-card')].find(c => c.textContent.includes(w)).querySelectorAll('summary')].at(-1).click(), tr('Carlos'));
    await page.evaluate(() => { document.querySelector('#content .page').scrollTop = document.querySelector('.mon-grid').offsetTop - 20; });
    await shot('monitor-habits', 900);

    /* shortcuts, schedule */
    await view('aliases');
    await page.waitForSelector('table');
    await shot('aliases', 760);
    // ✏️ on a shortcut: the command checked stage by stage, and ▶️ shows what it would answer (nothing is sent)
    await rowButton(0, '/dolar', '✏️');
    await page.waitForSelector('.try-stage');
    await page.evaluate(() => [...document.querySelectorAll('.try-box button')].find(b => b.textContent.includes('▶️')).click());
    await page.waitForSelector('.try-bubble', { timeout: 15000 });
    await shot('aliases-test', 860);
    await closeModal();
    await view('schedule');
    await page.waitForSelector('table');
    await shot('schedule', 760);
    await rowButton(0, 'Bom dia', '✏️');
    await page.waitForSelector('.modal');
    await shot('schedule-edit', 900);
    await closeModal();
    // 🧪 on the one with a {/command}: what goes out, built now, without sending
    await rowButton(0, 'Bom dia, família', '🧪');
    await page.waitForSelector('.sched-note', { timeout: 15000 });
    await shot('schedule-test', 760);
    await page.evaluate(() => document.querySelector('dialog .modal-actions .btn.on').click());
    await wait(200);

    /* Show: what /show keeps */
    await view('show');
    await page.waitForSelector('.spy-feed');
    await wait(400);
    // "All" picks every card of the list (and unpicks them again)
    await page.click('.spy-all input');
    const counts = await page.evaluate(() => [document.querySelectorAll('.spy-card').length, document.querySelectorAll('.spy-card.picked').length]);
    if (counts[0] < 3 || counts[0] !== counts[1]) throw new Error(`Show: "All" picked ${counts[1]} of ${counts[0]} cards`);
    await page.click('.spy-all input');
    // Shift+click: the first card and then the third pick the three
    const texts = await page.$$('.spy-card .spy-text');
    await texts[0].click();
    await page.keyboard.down('Shift');
    await texts[2].click();
    await page.keyboard.up('Shift');
    const range = await page.evaluate(() => document.querySelectorAll('.spy-card.picked').length);
    if (range !== 3) throw new Error(`Show: Shift+click picked ${range} of 3 cards`);
    await page.click('.spy-all input');
    await page.click('.spy-all input');
    // The person picked on the right (highlighted) and two cards selected for the 🧹
    await page.click('.spy-person');
    await wait(500);
    for (const card of (await page.$$('.spy-card .spy-text')).slice(0, 2)) await card.click();
    await shot('show', 1000);

    /* statistics */
    await view('stats');
    await page.waitForSelector('.chartcard');
    await shot('stats', 1750);

    /* the media gallery, and its viewer */
    await view('gallery');
    await page.waitForSelector('.gal-tile');
    await wait(500);
    await shot('gallery', 900);
    await page.click('.gal-tile');
    await page.waitForSelector('.gal-viewer');
    await wait(300);
    await shot('gallery-viewer', 860);
    await page.keyboard.press('Escape');
    await wait(200);
    // the list (sorted by size) and the same files grouped
    await page.evaluate(() => [...document.querySelectorAll('.gal-switch .btn')][1].click());
    await page.waitForSelector('.gal-table');
    await page.evaluate(() => [...document.querySelectorAll('.gal-table th.sortable')].find(th => th.textContent.match(/Size|Tamanho/)).click());
    await page.waitForSelector('.gal-table');
    await wait(500);
    await shot('gallery-list', 900);
    await page.evaluate(() => [...document.querySelectorAll('.gal-switch .btn')][2].click());
    await page.waitForSelector('.gal-group');
    await wait(400);
    await shot('gallery-same', 760);
    await page.evaluate(() => [...document.querySelectorAll('.gal-switch .btn')][0].click());
    await page.waitForSelector('.gal-tile');

    /* health */
    await view('health');
    await page.waitForSelector('.health-verdict');
    await shot('health', 1100);
    // WhatsApp waiting to be paired: the QR Code in Health (a made-up code), and the bar on the other pages
    Object.assign(bot.state, { ready: false, waitingQr: true, qr: { code: '2@ZapBotDemoQrCodeNotARealSession,AbCdEfGhIjKl==,MnOpQrStUv==', at: Date.now() - 4000, count: 2 } });
    await view('home');
    await view('health');
    await page.waitForSelector('.pair-card img');
    await page.waitForFunction(() => document.querySelector('.pair-card img').complete);
    await shot('health-qr', 900);
    Object.assign(bot.state, { ready: true, waitingQr: false, qr: null });

    /* settings: the panel of the web interface on top, then the rest */
    await view('settings');
    await page.waitForSelector('.webpanel');
    await shot('settings', 900);
    // the email: the buttons that fill in a provider, the SMTP and the IMAP, and the test
    await page.evaluate(() => { const panel = document.getElementById('mailpanel'); document.querySelector('#content .page').scrollTop = panel.offsetTop - 20; });
    await wait(300);
    await shot('settings-mail', 900);
    // 2FA from the page: the QR Code of the authenticator app and the code to turn it on
    await page.evaluate(() => [...document.querySelectorAll('#accesspanel .btn')].find(b => /Turn it on|Ligar/.test(b.textContent)).click());
    await page.waitForSelector('dialog .totp-qr');
    await wait(300);
    await shot('totp', 860);
    await page.evaluate(() => document.querySelector('dialog .modal-actions .btn:not(.on)').click());
    await wait(200);
    await page.evaluate(() => { document.querySelector('#content .page').scrollTop = 0; });
    await page.evaluate(() => { document.querySelector('#content .page').scrollTop = document.querySelector('.webpanel').offsetHeight + 120; });
    await wait(300);
    await shot('settings-table', 760);

    /* the light theme */
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await view('home');
    await shot('home-light', 1480);
    await page.evaluate(() => { document.querySelector('.rail-btn[data-view="history"]').click(); });
    await wait(400);
    await clickText('.chat', 'Ana Souza');
    await page.waitForSelector('.msg');
    await shot('history-light', 1180);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);

    /* a phone: the same page, narrow */
    await page.setViewport({ width: 390, height: 780, deviceScaleFactor: 2, isMobile: true });
    await page.goto(base);
    await page.waitForSelector('.rail');
    await page.evaluate(() => document.querySelector('.rail-btn[data-view="history"]').click());
    await wait(600);
    await page.waitForSelector('.chat');
    await wait(300);
    await page.screenshot({ path: path.join(OUT, 'mobile-chats.png') });
    console.log('→ docs/assets/web/mobile-chats.png');
    await clickText('.chat', 'Ana Souza');
    await page.waitForSelector('.msg');
    await wait(500);
    await page.screenshot({ path: path.join(OUT, 'mobile-chat.png') });
    console.log('→ docs/assets/web/mobile-chat.png');
    for (const name of ['monitor', 'gallery']) {
        await page.evaluate((v) => document.querySelector(`.rail-btn[data-view="${v}"]`).click(), name);
        await page.waitForSelector(name === 'monitor' ? '.mon-card' : '.gal-tile');
        await wait(600);
        await page.screenshot({ path: path.join(OUT, `mobile-${name}.png`) });
        console.log(`→ docs/assets/web/mobile-${name}.png`);
    }

    // The QR code the bot sends for the 2FA (a sample: the secret is invented)
    await require('qrcode').toFile(path.join(OUT, '2fa-qr.png'), 'otpauth://totp/ZapBot:demo?secret=JBSWY3DPEHPK3PXP&issuer=ZapBot&digits=6&period=30', { width: 360, margin: 2 });
    console.log('→ 2fa-qr.png');

    await browser.close();
    await new Promise(resolve => server.close(resolve));
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
