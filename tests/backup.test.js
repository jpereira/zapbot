/*
 * /backup (/bkp): creation, list, details, restore, send, removal and the daily backup.
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, MessageMedia, emails, nodemailer } = bot;
const { BACKUP_DIR } = bot.src('constants');
const { createBackup, listBackups, checkBackupDaily } = bot.src('backup');
const { instantInBrasilia } = bot.src('util/when');

beforeEach(async () => {
    await bot.restart();
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
});

const countAlt = async (table) => (await bot.dbGet(`SELECT COUNT(*) AS n FROM ${table}`)).n;
const names = async () => (await listBackups()).map(b => b.nome);

describe('/backup (/bkp)', () => {
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
        assert.equal(meta.versao, require('../package.json').version);
        assert.equal(meta.entradas.messages, 2);
    });

    test('sem opção: banco atual, último backup e o próximo automático', async () => {
        let [r] = await bot.replyAlt('/bkp');
        assert.match(r, /💾 \*Backup\*\n\n🗄️ \*Banco atual:\* .*\n   _.*messages \d+.*_\n📦 \*Backups:\* 0 em .*backups\n🕐 \*Último:\* nenhum\n⏭️ \*Próximo automático:\* .* _\(todo dia às 3h, guarda 7\)_/);

        await createBackup();
        [r] = await bot.replyAlt('/backup');
        assert.match(r, /📦 \*Backups:\* 1 \(/);
        assert.match(r, /🕐 \*Último:\* \w{3} \d\d\/\d\d \d\d:\d\d \(manual, /);

        await bot.setSetting('backup.enabled', false);
        assert.match((await bot.replyAlt('/backup'))[0], /⏭️ Backup automático desligado/);
    });

    test('-l numera do mais novo para o mais antigo; -i compara com o banco atual', async () => {
        await createBackup('manual', Date.now() - 3600_000);
        await bot.deliver(bot.createMessage({ texto: 'depois', de: bot.OTHERAlt.jid }));
        await createBackup('automático');

        const [list] = await bot.replyAlt('/backup -l');
        assert.match(list, /💾 \*Backups\* \(2\)\n\n1\. \*[^*]+\* · [^·]+ · automático\n2\. \*[^*]+\* · [^·]+ · manual/);

        await bot.deliver(bot.createMessage({ texto: 'mais uma', de: bot.OTHERAlt.jid }));
        const [info] = await bot.replyAlt('/backup -i 2');
        assert.match(info, /💾 \*Backup 2\*\n📄 zapbot-\d{8}-\d{6}\n🕐 .* · manual · ZapBot [\d.]+\n/);
        assert.match(info, /messages: 0 → 4/); // 2 received + the 2 /backup commands

        assert.match((await bot.replyAlt('/backup -i 9'))[0], /❌ Backup 9 não existe/);
    });

    test('-r pede confirmação; com -sim restaura tudo e guarda o estado de antes', async () => {
        await bot.setSetting('watch.rules', 'promoção');
        await bot.setSetting('tempo.city', 'Recife');
        await bot.replyAlt('/lembrete 2h antes do backup');
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
            assert.match(m.text, /Anti-Phishing Code: Frase42/);
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

    test('só o dono', async () => {
        assert.deepEqual(await bot.replyAlt('/backup -now', { de: bot.OTHERAlt.jid }), []);
    });
});

describe('backup diário', () => {
    const day = (d, h) => instantInBrasilia(2026, 10, d, h, 0);

    test('um por dia, depois do backup.hour', async () => {
        assert.equal(await checkBackupDaily(day(1, 2)), null, 'antes das 3h');

        const b = await checkBackupDaily(day(1, 3));
        assert.equal(b.motivo, 'automático');
        assert.equal(await checkBackupDaily(day(1, 15)), null, 'já feito hoje');
        assert.ok(await checkBackupDaily(day(2, 9)), 'outro dia (bot fora do ar às 3h: sai quando volta)');

        await bot.setSetting('backup.enabled', false);
        assert.equal(await checkBackupDaily(day(3, 9)), null);
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
