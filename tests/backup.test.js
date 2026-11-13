/*
 * /backup: creation, list, details, restore, send, removal and the daily backup.
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, MessageMedia, emails, nodemailer } = bot;
const { BACKUP_DIR, NOTES_DIR } = bot.src('constants');
const { createBackup, listBackups, checkBackupDaily } = bot.src('backup');
const { instantInBrasilia } = bot.src('util/when');

beforeEach(async () => {
    await bot.restart();
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
});

const countAlt = async (table) => (await bot.dbGet(`SELECT COUNT(*) AS n FROM ${table}`)).n;
const names = async () => (await listBackups()).map(b => b.nome);

describe('/backup', () => {
    test('-now: banco compactado em cache/backups, com o .json das entradas', async () => {
        await bot.setSetting('watch.rules', 'promoção');
        await bot.deliver(bot.createMessage({ texto: 'oi', de: bot.OTHERAlt.jid }));

        const [r] = await bot.replyAlt('/backup -now');
        assert.match(r, /^💾 \*Backup criado\*\n📄 zapbot-\d{8}-\d{6}\n📦 [\d,.]+ \w+\n_.*messages 2.*settings \d+/);

        const [b] = await listBackups();
        assert.ok(fs.existsSync(b.arquivo));
        // It is a real SQLite, compressed
        assert.equal(zlib.gunzipSync(fs.readFileSync(b.arquivo)).subarray(0, 15).toString(), 'SQLite format 3');

        const meta = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, `${b.nome}.json`), 'utf8'));
        assert.equal(meta.motivo, 'manual');
        // The version with the commit and tag that created the backup: "2.0.0 (git+0c6164f/v2.0.0)"
        assert.match(meta.versao, new RegExp(`^${require('../package.json').version.replaceAll('.', '\\.')}(?: \\(devel\\))? \\(git\\+[0-9a-f]{7}/[\\w.-]+\\)$`));
        assert.equal(meta.entradas.messages, 2);
    });

    test('as imagens do /notes vão num .notes.tar.gz e voltam no -r; sem imagem, não há tar', async () => {
        const [withoutImage] = [await createBackup()];
        assert.equal(withoutImage.arquivoNotas, undefined);

        fs.mkdirSync(NOTES_DIR, { recursive: true });
        const photo = path.join(NOTES_DIR, 'teste_backup.jpg');
        fs.writeFileSync(photo, 'conteudo da imagem');

        try {
            const [r] = await bot.replyAlt('/backup -now');
            assert.match(r, /🖼️ [\d,.]+ \w+ de imagens do \/notes/);
            const [b] = await listBackups();
            assert.ok(fs.existsSync(b.arquivoNotas));
            assert.equal(b.imagens, 1);
            assert.match((await bot.replyAlt('/backup -l'))[0], new RegExp(`1\\. .* \\+ 🖼️ [\\d,.]+ \\w+ · manual`));

            fs.rmSync(photo);
            assert.match((await bot.replyAlt(`/backup -r ${b.nome}`))[0], /imagens do \/notes deste backup voltam/);
            await bot.replyAlt(`/backup -r ${b.nome} -sim`);
            assert.equal(fs.readFileSync(photo, 'utf8'), 'conteudo da imagem');

            await bot.replyAlt(`/backup -rm ${b.nome}`);
            assert.ok(!fs.existsSync(b.arquivoNotas), '-rm leva o tar junto');
        } finally {
            fs.rmSync(photo, { force: true });
        }
    });

    test('sem opção: banco atual, último backup e o próximo automático', async () => {
        let [r] = await bot.replyAlt('/backup');
        assert.match(r, /💾 \*Backup\*\n\n• 🗄️ \*Banco atual:\* .*\n   ◦ .*\n(   ◦ .*\n)*• 📦 \*Backups:\* 0 em .*backups\n• 🕐 \*Último:\* nenhum\n• ⏭️ \*Próximo automático:\* .* _\(todo dia às 3h, guarda 7\)_/);

        await createBackup();
        [r] = await bot.replyAlt('/backup');
        assert.match(r, /📦 \*Backups:\* 1 \(/);
        assert.match(r, /• 🕐 \*Último:\* [a-zá]{3} \d\d\/\d\d \d\d:\d\d \(manual, /);

        await bot.setSetting('backup.enabled', false);
        assert.match((await bot.replyAlt('/backup'))[0], /• ⏭️ \*Backup automático:\* desligado/);
    });

    test('-l numera do mais novo para o mais antigo; -i compara com o banco atual', async () => {
        await createBackup('manual', Date.now() - 3600_000);
        await bot.deliver(bot.createMessage({ texto: 'depois', de: bot.OTHERAlt.jid }));
        await createBackup('automático');

        const [list] = await bot.replyAlt('/backup -l');
        assert.match(list, /💾 \*Backups\* \(2\)\n\n1\. \*[^*]+\* · [^·]+ · automático\n2\. \*[^*]+\* · [^·]+ · manual/);

        await bot.deliver(bot.createMessage({ texto: 'mais uma', de: bot.OTHERAlt.jid }));
        const [info] = await bot.replyAlt('/backup -i 2');
        assert.match(info, /💾 \*Backup 2\*\n📄 zapbot-\d{8}-\d{6}\n🕐 .* · manual · ZapBot [\d.]+(?: \(devel\))? \(git\+[0-9a-f]{7}\/[\w.-]+\)\n/);
        assert.match(info, /messages: 0 → 4/); // 2 received + the 2 /backup commands

        assert.match((await bot.replyAlt('/backup -i 9'))[0], /❌ Backup 9 não existe/);
    });

    test('-r pede confirmação; com -sim restaura tudo e guarda o estado de antes', async () => {
        await bot.setSetting('watch.rules', 'promoção');
        await bot.setSetting('tempo.city', 'Recife');
        await bot.replyAlt('/cron -lembrete +2h antes do backup');
        const b = await createBackup();

        // After the backup
        await bot.setSetting('watch.rules', 'outra');
        await bot.setSetting('tempo.city', 'Lisboa');
        await bot.dbRun('DELETE FROM schedules');

        const [question] = await bot.replyAlt('/backup -r 1');
        assert.match(question, /⚠️ \*Restaurar o backup de [^?]+\?\*[\s\S]*Para confirmar: \/backup -r zapbot-\d{8}-\d{6} -sim$/);
        assert.equal(bot.getSetting('tempo.city'), 'Lisboa', 'sem -sim nada muda');

        const [r] = await bot.replyAlt(`/backup -r ${b.nome} -sim`);
        assert.match(r, /♻️ \*Backup restaurado:\*[\s\S]*💾 O estado anterior ficou no backup (zapbot-\S+): para desfazer, \/backup -r \1 -sim/);

        // Settings reloaded into memory, and the tables back
        assert.equal(bot.getSetting('tempo.city'), 'Recife');
        assert.deepEqual(bot.getSetting('watch.rules'), ['promoção']);
        assert.equal(await countAlt('schedules'), 1);

        const list = await listBackups();
        assert.equal(list.length, 2);
        assert.ok(list.some(x => x.motivo === 'antes de restaurar'));
    });

    test('restaura um backup de uma versão anterior (sem uma tabela e sem uma coluna)', async () => {
        await bot.deliver(bot.createMessage({ texto: 'velha', de: bot.OTHERAlt.jid }));
        const b = await createBackup();

        await bot.dbRun('CREATE TABLE teste_nova (id INTEGER PRIMARY KEY, x TEXT)');
        await bot.dbRun("INSERT INTO teste_nova (x) VALUES ('nova')");
        await bot.dbRun('ALTER TABLE messages ADD COLUMN teste_extra TEXT');
        try {
            await bot.replyAlt(`/backup -r ${b.nome} -sim`);
            assert.equal(await countAlt('teste_nova'), 0, 'tabela que não existia no backup fica vazia');
            assert.deepEqual((await bot.dbAll('SELECT body, teste_extra FROM messages')).map(m => [m.body, m.teste_extra]), [['velha', null]]);
        } finally {
            await bot.dbRun('DROP TABLE teste_nova');
            await bot.dbRun('ALTER TABLE messages DROP COLUMN teste_extra');
        }
    });

    test('-s envia o arquivo no seu privado; -rm N e -rm all', async () => {
        await createBackup('manual', Date.now() - 60_000);
        await createBackup();

        const r = await bot.executar('/backup -s');
        assert.equal(r[0].chatId, OWNER.jid);
        assert.ok(r[0].content instanceof MessageMedia);
        assert.match(r[0].content.filename, /^zapbot-\d{8}-\d{6}\.db\.gz$/);
        assert.equal(r[0].options.sendMediaAsDocument, true);
        assert.equal(r[1].texto, '💾 Backup enviado no seu privado.');

        assert.match((await bot.replyAlt('/backup -rm 1'))[0], /🗑️ Backup removido:/);
        assert.equal((await listBackups()).length, 1);
        assert.deepEqual(await bot.replyAlt('/backup -rm all'), ['🗑️ 1 backup removido.']);
        assert.equal((await names()).length, 0);
        assert.deepEqual(await bot.replyAlt('/backup -l'), ['💾 Nenhum backup ainda. Crie um com /backup -now']);
    });

    test('-s -to e-mails: anexo pelo SMTP do bot; "email" usa o QRCODE_EMAIL_SMTP_TO; a forma antiga vale', async () => {
        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com',
            QRCODE_EMAIL_SMTP_FROM: 'ZapBot <bot@exemplo.com>', QRCODE_EMAIL_SMTP_TO: 'Eu <eu@exemplo.com>', QRCODE_EMAIL_SMTP_ANTIPHISHING: 'Frase42' };
        Object.assign(process.env, env);
        try {
            await createBackup('manual', Date.now() - 60_000);
            const b = await createBackup();

            assert.match((await bot.replyAlt('/backup -s -to "fulano@x.com, ciclano@y.com"'))[0], /^📧 Backup de .* enviado para fulano@x\.com, ciclano@y\.com\.$/);
            const [m] = emails;
            assert.equal(m.to, 'fulano@x.com, ciclano@y.com');
            assert.equal(m.from, 'ZapBot <bot@exemplo.com>');
            assert.match(m.subject, /^\[ZapBot\] 💾 Backup de /);
            assert.match(m.text, /Código antiphishing: Frase42/);
            assert.deepEqual(m.attachments, [{ filename: `${b.nome}.db.gz`, path: b.arquivo }]);

            await bot.replyAlt('/backup -s 2 -to email');
            assert.equal(emails[1].to, 'eu@exemplo.com');
            assert.notEqual(emails[1].attachments[0].filename, `${b.nome}.db.gz`, 'o nº 2 é o mais antigo');

            // The old form: the emails straight in -s
            await bot.replyAlt('/backup -s 2 email');
            assert.equal(emails[2].to, 'eu@exemplo.com');
            assert.match((await bot.replyAlt('/backup -s fulano@'))[0], /❌ E-mail inválido: fulano@/);
            assert.match((await bot.replyAlt('/backup -s a@b.com -to email'))[0], /❌ Informe o destino só no -to/);

            nodemailer.falhar = true;
            assert.match((await bot.replyAlt('/backup -s a@b.com', { erroEsperado: true }))[0], /❌ Não consegui enviar o e-mail: SMTP fora do ar/);
        } finally {
            nodemailer.falhar = false;
            for (const k of Object.keys(env)) delete process.env[k];
        }

        await createBackup();
        assert.match((await bot.replyAlt('/backup -s a@b.com', { erroEsperado: true }))[0], /❌ Não consegui enviar o e-mail: SMTP não configurado/);
    });

    test('-s -to outro chat: pede -sim (o banco tem as mensagens de todos os chats)', async () => {
        await createBackup();

        const [notice] = await bot.replyAlt('/backup -s -to /Fulano/');
        assert.match(notice, /^⚠️ O backup tem o banco inteiro: .*\nPara enviar mesmo em 👤 Fulano, repita com -sim: \/backup -send -to Fulano -sim$/);

        const r = await bot.executar('/backup -s 1 -to +5521911111111 -sim');
        assert.equal(r[0].chatId, bot.OTHERAlt.jid);
        assert.ok(r[0].content instanceof MessageMedia);
        assert.equal(r[1].texto, '💾 Backup enviado em 👤 Fulano.');

        // For yourself it does not need -sim; -to without -send is an error
        bot.createContact(OWNER.jid, OWNER.nome);
        const eu = await bot.executar('/backup -s -to +5521900000000');
        assert.equal(eu[0].chatId, OWNER.jid);
        assert.equal(eu[1].texto, '💾 Backup enviado no seu privado.');
        assert.match((await bot.replyAlt('/backup -to email'))[0], /❌ O -to é do -send/);
    });

    test('-s com vários -to: o -sim repete todos; os chats, um a um, e os e-mails num e-mail só', async () => {
        const L200 = '120363000000000200@g.us';
        bot.createGroup(L200, 'Grupo sobre L200', [OWNER.jid]);
        await createBackup();

        const [notice] = await bot.replyAlt('/backup -s -to /Fulano/ -to /Grupo L200/ -to /Fulano/');
        assert.match(notice, /\nPara enviar mesmo em 👤 Fulano, 👥 Grupo sobre L200, repita com -sim: \/backup -send -to Fulano -to \/Grupo L200\/ -to Fulano -sim$/);

        const r = await bot.executar('/backup -s -to Fulano -to /Grupo L200/ -sim');
        assert.deepEqual(r.slice(0, 2).map(e => e.chatId), [bot.OTHERAlt.jid, L200]);
        assert.ok(r.slice(0, 2).every(e => e.content instanceof MessageMedia));
        assert.equal(r[2].texto, '💾 Backup enviado em 👤 Fulano, 👥 Grupo sobre L200.');

        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'eu@exemplo.com' };
        Object.assign(process.env, env);
        try {
            const m = await bot.executar('/backup -s -to email -to outro@x.com -to /Fulano/ -sim');
            assert.equal(emails.at(-1).to, 'eu@exemplo.com, outro@x.com');
            assert.match(m[0].texto, /^📧 Backup de .* enviado para eu@exemplo\.com, outro@x\.com\.$/);
            assert.equal(m[1].chatId, bot.OTHERAlt.jid);
            assert.equal(m[2].texto, '💾 Backup enviado em 👤 Fulano.');
        } finally {
            for (const k of Object.keys(env)) delete process.env[k];
        }

        // A chat that fails does not hold up the others: the bot says which one failed
        const send = bot.client.sendMessage;
        bot.client.sendMessage = (chatId, ...rest) => (chatId === L200
            ? Promise.reject(new Error('fora do ar'))
            : send.call(bot.client, chatId, ...rest));
        try {
            const line = '/backup -s -to /Grupo L200/ -to Fulano -sim';
            const f = await bot.executar(line, { erroEsperado: true });
            assert.equal(f[0].texto, '❌ Não consegui enviar o backup em 👥 Grupo sobre L200: fora do ar');
            assert.equal(f[1].chatId, bot.OTHERAlt.jid);
            assert.ok(f[1].content instanceof MessageMedia);
            assert.equal(f[2].texto, '💾 Backup enviado em 👤 Fulano.');
        } finally {
            bot.client.sendMessage = send;
        }
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.replyAlt('/backup -now', { de: bot.OTHERAlt.jid }), []);
    });
});

describe('backup diário', () => {
    const day = (d, h) => instantInBrasilia(2026, 10, d, h, 0);

    function smtp(t) {
        const env = {
            QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com',
            QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com',
            QRCODE_EMAIL_SMTP_TO: 'Eu <eu@exemplo.com>'
        };
        Object.assign(process.env, env);
        t.after(() => {
            nodemailer.falhar = false;
            for (const key of Object.keys(env)) delete process.env[key];
        });
    }

    test('um por dia, depois do backup.hour', async () => {
        assert.equal(bot.getSetting('backup.to'), '');
        assert.equal(await checkBackupDaily(day(1, 2)), null, 'antes das 3h');

        const b = await checkBackupDaily(day(1, 3));
        assert.equal(b.motivo, 'automático');
        assert.equal(await checkBackupDaily(day(1, 15)), null, 'já feito hoje');
        assert.ok(await checkBackupDaily(day(2, 9)), 'outro dia (bot fora do ar às 3h: sai quando volta)');

        await bot.setSetting('backup.enabled', false);
        assert.equal(await checkBackupDaily(day(3, 9)), null);
        assert.deepEqual(bot.client.enviadas, []);
        assert.deepEqual(emails, []);
    });

    test('backup.to email: anexo do arquivo local, uma vez por dia', async (t) => {
        smtp(t);
        await bot.replyAlt('/set backup.to email');
        bot.client.enviadas.length = 0;
        const b = await checkBackupDaily(day(1, 3));
        assert.ok(fs.existsSync(b.arquivo));
        assert.equal(emails.length, 1);
        assert.equal(emails[0].to, 'eu@exemplo.com');
        assert.deepEqual(emails[0].attachments, [{
            filename: `${b.nome}.db.gz`, path: b.arquivo
        }]);
        assert.equal(await checkBackupDaily(day(1, 5)), null);
        assert.equal(emails.length, 1);
        await bot.setSetting('backup.to', 'outro@exemplo.com');
        await checkBackupDaily(day(2, 3));
        assert.equal(emails[1].to, 'outro@exemplo.com');
    });

    test('backup.to aparece na ajuda e no status; anexo grande não é enviado por e-mail', async () => {
        assert.match((await bot.replyAlt('/backup -h'))[0], /setting backup\.to/);
        await bot.setSetting('backup.to', 'Fulano');
        assert.match((await bot.replyAlt('/backup'))[0], /• 📤 \*Destino automático:\* Fulano/);
        const { MAX_ATTACHMENT_BYTES, sendBackupPerEmail } = bot.src('backup');
        await assert.rejects(sendBackupPerEmail({ bytes: MAX_ATTACHMENT_BYTES + 1 }, ['eu@x.com']),
            /limite de 20 MB/);
        assert.deepEqual(emails, []);
    });

    test('backup.to: contato, grupo e número recebem o documento sem -sim', async () => {
        const destinations = [
            ['/Fulano/', bot.OTHERAlt.jid],
            ['/Família/', bot.GROUP],
            ['+5521911111111', bot.OTHERAlt.jid]
        ];
        for (const [i, [valueAlt, id]] of destinations.entries()) {
            await bot.replyAlt(`/set backup.to ${valueAlt}`);
            bot.client.enviadas.length = 0;
            const b = await checkBackupDaily(day(i + 1, 3));
            const [sending] = bot.client.enviadas;
            assert.equal(bot.client.enviadas.length, 1);
            assert.equal(sending.chatId, id);
            assert.ok(sending.content instanceof MessageMedia);
            assert.equal(sending.content.data, fs.readFileSync(b.arquivo).toString('base64'));
            assert.equal(sending.options.sendMediaAsDocument, true);
            assert.match(sending.options.caption, /\(automático\)/);
            assert.ok(fs.existsSync(b.arquivo));
        }
    });

    test('vários destinos: deduplica chats e e-mails, mantendo a cópia local', async (t) => {
        smtp(t);
        const valueAlt = '-to email -to eu@exemplo.com -to /Família/ -to /Fulano/ -to Fulano';
        await bot.replyAlt(`/set backup.to "${valueAlt}"`);
        assert.equal(bot.getSetting('backup.to'), valueAlt);
        bot.client.enviadas.length = 0;
        const b = await checkBackupDaily(day(1, 3));
        assert.equal(emails.length, 1);
        assert.equal(emails[0].to, 'eu@exemplo.com');
        assert.deepEqual(bot.client.enviadas.map(e => e.chatId), [bot.GROUP, bot.OTHERAlt.jid]);
        assert.ok(fs.existsSync(b.arquivo));
        assert.equal((await listBackups()).length, 1);
        await bot.replyAlt('/set backup.to ""');
        assert.equal(bot.getSetting('backup.to'), '');
        const sendings = bot.client.enviadas.length;
        await checkBackupDaily(day(2, 3));
        assert.equal(emails.length, 1);
        assert.equal(bot.client.enviadas.length, sendings);
    });

    test('destino ausente ou ambíguo: preserva o backup e não escolhe alguém sozinho', async () => {
        bot.createContact('5521922222222@c.us', 'Fulano Dois');
        for (const [i, valueAlt] of ['Ninguém Aqui', 'Ful', '-to'].entries()) {
            await bot.setSetting('backup.to', valueAlt);
            const beforeAlt = bot.logs.length;
            const b = await checkBackupDaily(day(i + 1, 3));
            assert.ok(fs.existsSync(b.arquivo));
            assert.deepEqual(bot.client.enviadas, []);
            assert.match(bot.errorsInLog(beforeAlt).join('\n'), /Envio do backup diário falhou/);
            assert.equal(await checkBackupDaily(day(i + 1, 4)), null);
        }
    });

    test('envio falha: mantém o arquivo e tenta os demais destinos', async (t) => {
        const send = bot.client.sendMessage;
        t.after(() => { bot.client.sendMessage = send; });
        bot.client.sendMessage = (id, ...rest) => id === bot.GROUP
            ? Promise.reject(new Error('fora do ar'))
            : send.call(bot.client, id, ...rest);
        await bot.setSetting('backup.to', '-to /Família/ -to Fulano');
        const beforeAlt = bot.logs.length;
        const b = await checkBackupDaily(day(1, 3));
        assert.ok(fs.existsSync(b.arquivo));
        assert.equal(bot.client.enviadas[0].chatId, bot.OTHERAlt.jid);
        assert.match(bot.errorsInLog(beforeAlt).join('\n'), /Família: fora do ar/);
        assert.equal(await checkBackupDaily(day(1, 4)), null);
        assert.equal(bot.client.enviadas.length, 1);
    });

    test('SMTP falha: mantém o backup e registra o erro', async (t) => {
        smtp(t);
        nodemailer.falhar = true;
        await bot.setSetting('backup.to', 'email');
        const beforeAlt = bot.logs.length;
        const b = await checkBackupDaily(day(1, 3));
        assert.ok(fs.existsSync(b.arquivo));
        assert.match(bot.errorsInLog(beforeAlt).join('\n'), /e-mail: SMTP fora do ar/);
        assert.equal((await listBackups()).length, 1);
    });

    test('backup.to não envia backups manuais nem antes de restaurar; respeita enabled', async () => {
        await bot.setSetting('backup.to', 'Fulano');
        await createBackup('manual', day(1, 1));
        await createBackup('antes de restaurar', day(1, 2));
        await bot.setSetting('backup.enabled', false);
        assert.equal(await checkBackupDaily(day(1, 3)), null);
        assert.deepEqual(bot.client.enviadas, []);
        assert.deepEqual(emails, []);
    });

    test('retenção: backup.keep vale para os automáticos; os manuais ficam', async () => {
        await bot.setSetting('backup.keep', 2);
        await createBackup('manual', day(1, 1));
        for (const d of [1, 2, 3, 4]) await checkBackupDaily(day(d, 4));

        const list = await listBackups();
        assert.deepEqual(list.map(b => b.motivo), ['automático', 'automático', 'manual']);
        assert.equal(new Date(list[0].criadoEm).getTime(), day(4, 4));
    });

    test('falha: fica no log', async () => {
        fs.writeFileSync(BACKUP_DIR, 'não é uma pasta');
        try {
            const logBefore = bot.logs.length;
            assert.equal(await checkBackupDaily(day(1, 4)), null);
            assert.match(bot.errorsInLog(logBefore).join('\n'), /Backup diário falhou/);
        } finally {
            fs.rmSync(BACKUP_DIR, { force: true });
        }
    });
});

describe('banco renomeado (bot_database.db → zapbot.db)', () => {
    const { dbMigrateName } = bot.src('db');
    const withFolder = (fn) => {
        const dir = fs.mkdtempSync(path.join(bot.CACHE_DIR, 'renome-'));
        try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    };

    test('o banco antigo e os arquivos -wal/-shm/-journal passam a ter o nome novo', () => withFolder(dir => {
        for (const suffix of ['', '-wal', '-shm', '-journal']) fs.writeFileSync(path.join(dir, `bot_database.db${suffix}`), `x${suffix}`);

        assert.equal(dbMigrateName(dir, 'zapbot.db'), true);
        assert.deepEqual(fs.readdirSync(dir).sort(), ['zapbot.db', 'zapbot.db-journal', 'zapbot.db-shm', 'zapbot.db-wal']);
        assert.equal(fs.readFileSync(path.join(dir, 'zapbot.db-wal'), 'utf8'), 'x-wal');
    }));

    test('se o zapbot.db já existe, ou não há banco antigo, nada é mexido', () => withFolder(dir => {
        assert.equal(dbMigrateName(dir, 'zapbot.db'), false);

        fs.writeFileSync(path.join(dir, 'bot_database.db'), 'antigo');
        fs.writeFileSync(path.join(dir, 'zapbot.db'), 'novo');
        assert.equal(dbMigrateName(dir, 'zapbot.db'), false);
        assert.equal(fs.readFileSync(path.join(dir, 'zapbot.db'), 'utf8'), 'novo');
        assert.equal(fs.readFileSync(path.join(dir, 'bot_database.db'), 'utf8'), 'antigo');
    }));

    test('o banco em uso é o zapbot.db', () => {
        assert.equal(path.basename(bot.src('constants').DB_PATH), 'zapbot.db');
    });
});
