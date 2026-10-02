/*
 * /backup (/bkp): criação, lista, detalhes, restauração, envio, remoção e o backup diário.
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, MessageMedia, emails, nodemailer } = bot;
const { BACKUP_DIR } = bot.src('constantes');
const { criarBackup, listarBackups, verificarBackupDiario } = bot.src('backup');
const { instanteEmBrasilia } = bot.src('util/quando');

beforeEach(async () => {
    await bot.reiniciar();
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
});

const contar = async (tabela) => (await bot.dbGet(`SELECT COUNT(*) AS n FROM ${tabela}`)).n;
const nomes = async () => (await listarBackups()).map(b => b.nome);

describe('/backup (/bkp)', () => {
    test('-now: banco compactado em cache/backups, com o .json das entradas', async () => {
        await bot.setSetting('watch.rules', 'promoção');
        await bot.entregar(bot.criarMensagem({ texto: 'oi', de: bot.OUTRO.jid }));

        const [r] = await bot.responder('/backup -now');
        assert.match(r, /^💾 \*Backup criado\*\n📄 zapbot-\d{8}-\d{6}\n📦 [\d,.]+ \w+\n_.*messages 2.*settings \d+/);

        const [b] = await listarBackups();
        assert.ok(fs.existsSync(b.arquivo));
        // É um SQLite de verdade, compactado
        assert.equal(zlib.gunzipSync(fs.readFileSync(b.arquivo)).subarray(0, 15).toString(), 'SQLite format 3');

        const meta = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, `${b.nome}.json`), 'utf8'));
        assert.equal(meta.motivo, 'manual');
        // A versão com o commit e a tag que criaram o backup: "2.0 (git+9029cfb/release-2.0)"
        assert.match(meta.versao, new RegExp(`^${require('../package.json').version.replace('.', '\\.')}(?: \\(devel\\))? \\(git\\+[0-9a-f]{7}/[\\w.-]+\\)$`));
        assert.equal(meta.entradas.messages, 2);
    });

    test('sem opção: banco atual, último backup e o próximo automático', async () => {
        let [r] = await bot.responder('/bkp');
        assert.match(r, /💾 \*Backup\*\n\n🗄️ \*Banco atual:\* .*\n   _.*messages \d+.*_\n📦 \*Backups:\* 0 em .*backups\n🕐 \*Último:\* nenhum\n⏭️ \*Próximo automático:\* .* _\(todo dia às 3h, guarda 7\)_/);

        await criarBackup();
        [r] = await bot.responder('/backup');
        assert.match(r, /📦 \*Backups:\* 1 \(/);
        assert.match(r, /🕐 \*Último:\* [a-zá]{3} \d\d\/\d\d \d\d:\d\d \(manual, /);

        await bot.setSetting('backup.enabled', false);
        assert.match((await bot.responder('/backup'))[0], /⏭️ Backup automático desligado/);
    });

    test('-l numera do mais novo para o mais antigo; -i compara com o banco atual', async () => {
        await criarBackup('manual', Date.now() - 3600_000);
        await bot.entregar(bot.criarMensagem({ texto: 'depois', de: bot.OUTRO.jid }));
        await criarBackup('automático');

        const [lista] = await bot.responder('/backup -l');
        assert.match(lista, /💾 \*Backups\* \(2\)\n\n1\. \*[^*]+\* · [^·]+ · automático\n2\. \*[^*]+\* · [^·]+ · manual/);

        await bot.entregar(bot.criarMensagem({ texto: 'mais uma', de: bot.OUTRO.jid }));
        const [info] = await bot.responder('/backup -i 2');
        assert.match(info, /💾 \*Backup 2\*\n📄 zapbot-\d{8}-\d{6}\n🕐 .* · manual · ZapBot [\d.]+(?: \(devel\))? \(git\+[0-9a-f]{7}\/[\w.-]+\)\n/);
        assert.match(info, /messages: 0 → 4/); // 2 recebidas + os 2 comandos /backup

        assert.match((await bot.responder('/backup -i 9'))[0], /❌ Backup 9 não existe/);
    });

    test('-r pede confirmação; com -sim restaura tudo e guarda o estado de antes', async () => {
        await bot.setSetting('watch.rules', 'promoção');
        await bot.setSetting('tempo.city', 'Recife');
        await bot.responder('/lembrete +2h antes do backup');
        const b = await criarBackup();

        // Depois do backup
        await bot.setSetting('watch.rules', 'outra');
        await bot.setSetting('tempo.city', 'Lisboa');
        await bot.dbRun('DELETE FROM schedules');

        const [pergunta] = await bot.responder('/backup -r 1');
        assert.match(pergunta, /⚠️ \*Restaurar o backup de [^?]+\?\*[\s\S]*Para confirmar: \/backup -r zapbot-\d{8}-\d{6} -sim$/);
        assert.equal(bot.getSetting('tempo.city'), 'Lisboa', 'sem -sim nada muda');

        const [r] = await bot.responder(`/backup -r ${b.nome} -sim`);
        assert.match(r, /♻️ \*Backup restaurado:\*[\s\S]*💾 O estado anterior ficou no backup (zapbot-\S+): para desfazer, \/backup -r \1 -sim/);

        // Settings recarregados na memória, e as tabelas de volta
        assert.equal(bot.getSetting('tempo.city'), 'Recife');
        assert.deepEqual(bot.getSetting('watch.rules'), ['promoção']);
        assert.equal(await contar('schedules'), 1);

        const lista = await listarBackups();
        assert.equal(lista.length, 2);
        assert.ok(lista.some(x => x.motivo === 'antes de restaurar'));
    });

    test('restaura um backup de uma versão anterior (sem uma tabela e sem uma coluna)', async () => {
        await bot.entregar(bot.criarMensagem({ texto: 'velha', de: bot.OUTRO.jid }));
        const b = await criarBackup();

        await bot.dbRun('CREATE TABLE teste_nova (id INTEGER PRIMARY KEY, x TEXT)');
        await bot.dbRun("INSERT INTO teste_nova (x) VALUES ('nova')");
        await bot.dbRun('ALTER TABLE messages ADD COLUMN teste_extra TEXT');
        try {
            await bot.responder(`/backup -r ${b.nome} -sim`);
            assert.equal(await contar('teste_nova'), 0, 'tabela que não existia no backup fica vazia');
            assert.deepEqual((await bot.dbAll('SELECT body, teste_extra FROM messages')).map(m => [m.body, m.teste_extra]), [['velha', null]]);
        } finally {
            await bot.dbRun('DROP TABLE teste_nova');
            await bot.dbRun('ALTER TABLE messages DROP COLUMN teste_extra');
        }
    });

    test('-s envia o arquivo no seu privado; -rm N e -rm all', async () => {
        await criarBackup('manual', Date.now() - 60_000);
        await criarBackup();

        const r = await bot.executar('/backup -s');
        assert.equal(r[0].chatId, DONO.jid);
        assert.ok(r[0].content instanceof MessageMedia);
        assert.match(r[0].content.filename, /^zapbot-\d{8}-\d{6}\.db\.gz$/);
        assert.equal(r[0].options.sendMediaAsDocument, true);
        assert.equal(r[1].texto, '💾 Backup enviado no seu privado.');

        assert.match((await bot.responder('/backup -rm 1'))[0], /🗑️ Backup removido:/);
        assert.equal((await listarBackups()).length, 1);
        assert.deepEqual(await bot.responder('/backup -rm all'), ['🗑️ 1 backup removido.']);
        assert.equal((await nomes()).length, 0);
        assert.deepEqual(await bot.responder('/backup -l'), ['💾 Nenhum backup ainda. Crie um com /backup -now']);
    });

    test('-s -to e-mails: anexo pelo SMTP do bot; "email" usa o QRCODE_EMAIL_SMTP_TO; a forma antiga vale', async () => {
        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com',
            QRCODE_EMAIL_SMTP_FROM: 'ZapBot <bot@exemplo.com>', QRCODE_EMAIL_SMTP_TO: 'Eu <eu@exemplo.com>', QRCODE_EMAIL_SMTP_ANTIPHISHING: 'Frase42' };
        Object.assign(process.env, env);
        try {
            await criarBackup('manual', Date.now() - 60_000);
            const b = await criarBackup();

            assert.match((await bot.responder('/backup -s -to "fulano@x.com, ciclano@y.com"'))[0], /^📧 Backup de .* enviado para fulano@x\.com, ciclano@y\.com\.$/);
            const [m] = emails;
            assert.equal(m.to, 'fulano@x.com, ciclano@y.com');
            assert.equal(m.from, 'ZapBot <bot@exemplo.com>');
            assert.match(m.subject, /^\[ZapBot\] 💾 Backup de /);
            assert.match(m.text, /Anti-Phishing Code: Frase42/);
            assert.deepEqual(m.attachments, [{ filename: `${b.nome}.db.gz`, path: b.arquivo }]);

            await bot.responder('/backup -s 2 -to email');
            assert.equal(emails[1].to, 'eu@exemplo.com');
            assert.notEqual(emails[1].attachments[0].filename, `${b.nome}.db.gz`, 'o nº 2 é o mais antigo');

            // A forma antiga: os e-mails direto no -s
            await bot.responder('/backup -s 2 email');
            assert.equal(emails[2].to, 'eu@exemplo.com');
            assert.match((await bot.responder('/backup -s fulano@'))[0], /❌ E-mail inválido: fulano@/);
            assert.match((await bot.responder('/backup -s a@b.com -to email'))[0], /❌ Informe o destino só no -to/);

            nodemailer.falhar = true;
            assert.match((await bot.responder('/backup -s a@b.com', { erroEsperado: true }))[0], /❌ Não consegui enviar o e-mail: SMTP fora do ar/);
        } finally {
            nodemailer.falhar = false;
            for (const k of Object.keys(env)) delete process.env[k];
        }

        await criarBackup();
        assert.match((await bot.responder('/backup -s a@b.com', { erroEsperado: true }))[0], /❌ Não consegui enviar o e-mail: SMTP não configurado/);
    });

    test('-s -to outro chat: pede -sim (o banco tem as mensagens de todos os chats)', async () => {
        await criarBackup();

        const [aviso] = await bot.responder('/backup -s -to /Fulano/');
        assert.match(aviso, /^⚠️ O backup tem o banco inteiro: .*\nPara enviar mesmo em 👤 Fulano, repita com -sim: \/backup -send -to Fulano -sim$/);

        const r = await bot.executar('/backup -s 1 -to +5521911111111 -sim');
        assert.equal(r[0].chatId, bot.OUTRO.jid);
        assert.ok(r[0].content instanceof MessageMedia);
        assert.equal(r[1].texto, '💾 Backup enviado em 👤 Fulano.');

        // Para você mesmo não precisa de -sim; -to sem -send é erro
        bot.criarContato(DONO.jid, DONO.nome);
        const eu = await bot.executar('/backup -s -to +5521900000000');
        assert.equal(eu[0].chatId, DONO.jid);
        assert.equal(eu[1].texto, '💾 Backup enviado no seu privado.');
        assert.match((await bot.responder('/backup -to email'))[0], /❌ O -to é do -send/);
    });

    test('-s com vários -to: o -sim repete todos; os chats, um a um, e os e-mails num e-mail só', async () => {
        const L200 = '120363000000000200@g.us';
        bot.criarGrupo(L200, 'Grupo sobre L200', [DONO.jid]);
        await criarBackup();

        const [aviso] = await bot.responder('/backup -s -to /Fulano/ -to /Grupo L200/ -to /Fulano/');
        assert.match(aviso, /\nPara enviar mesmo em 👤 Fulano, 👥 Grupo sobre L200, repita com -sim: \/backup -send -to Fulano -to \/Grupo L200\/ -to Fulano -sim$/);

        const r = await bot.executar('/backup -s -to Fulano -to /Grupo L200/ -sim');
        assert.deepEqual(r.slice(0, 2).map(e => e.chatId), [bot.OUTRO.jid, L200]);
        assert.ok(r.slice(0, 2).every(e => e.content instanceof MessageMedia));
        assert.equal(r[2].texto, '💾 Backup enviado em 👤 Fulano, 👥 Grupo sobre L200.');

        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'eu@exemplo.com' };
        Object.assign(process.env, env);
        try {
            const m = await bot.executar('/backup -s -to email -to outro@x.com -to /Fulano/ -sim');
            assert.equal(emails.at(-1).to, 'eu@exemplo.com, outro@x.com');
            assert.match(m[0].texto, /^📧 Backup de .* enviado para eu@exemplo\.com, outro@x\.com\.$/);
            assert.equal(m[1].chatId, bot.OUTRO.jid);
            assert.equal(m[2].texto, '💾 Backup enviado em 👤 Fulano.');
        } finally {
            for (const k of Object.keys(env)) delete process.env[k];
        }

        // Um chat que falha não segura os outros: o bot diz qual falhou
        const enviar = bot.client.sendMessage;
        bot.client.sendMessage = (chatId, ...resto) => (chatId === L200
            ? Promise.reject(new Error('fora do ar'))
            : enviar.call(bot.client, chatId, ...resto));
        try {
            const linha = '/backup -s -to /Grupo L200/ -to Fulano -sim';
            const f = await bot.executar(linha, { erroEsperado: true });
            assert.equal(f[0].texto, '❌ Não consegui enviar o backup em 👥 Grupo sobre L200: fora do ar');
            assert.equal(f[1].chatId, bot.OUTRO.jid);
            assert.ok(f[1].content instanceof MessageMedia);
            assert.equal(f[2].texto, '💾 Backup enviado em 👤 Fulano.');
        } finally {
            bot.client.sendMessage = enviar;
        }
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.responder('/backup -now', { de: bot.OUTRO.jid }), []);
    });
});

describe('backup diário', () => {
    const dia = (d, h) => instanteEmBrasilia(2026, 10, d, h, 0);

    test('um por dia, depois do backup.hour', async () => {
        assert.equal(await verificarBackupDiario(dia(1, 2)), null, 'antes das 3h');

        const b = await verificarBackupDiario(dia(1, 3));
        assert.equal(b.motivo, 'automático');
        assert.equal(await verificarBackupDiario(dia(1, 15)), null, 'já feito hoje');
        assert.ok(await verificarBackupDiario(dia(2, 9)), 'outro dia (bot fora do ar às 3h: sai quando volta)');

        await bot.setSetting('backup.enabled', false);
        assert.equal(await verificarBackupDiario(dia(3, 9)), null);
    });

    test('retenção: backup.keep vale para os automáticos; os manuais ficam', async () => {
        await bot.setSetting('backup.keep', 2);
        await criarBackup('manual', dia(1, 1));
        for (const d of [1, 2, 3, 4]) await verificarBackupDiario(dia(d, 4));

        const lista = await listarBackups();
        assert.deepEqual(lista.map(b => b.motivo), ['automático', 'automático', 'manual']);
        assert.equal(new Date(lista[0].criadoEm).getTime(), dia(4, 4));
    });

    test('falha: fica no log', async () => {
        fs.writeFileSync(BACKUP_DIR, 'não é uma pasta');
        try {
            const logAntes = bot.logs.length;
            assert.equal(await verificarBackupDiario(dia(1, 4)), null);
            assert.match(bot.errosNoLog(logAntes).join('\n'), /Backup diário falhou/);
        } finally {
            fs.rmSync(BACKUP_DIR, { force: true });
        }
    });
});
