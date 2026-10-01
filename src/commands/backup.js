/*
 * Comando /backup.
 */

const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

const { REASONS, countInputs, createBackup, listBackups, nextBackupDaily, removeBackup, restoreBackup } = require('../backup');
const { client } = require('../client');
const { BACKUP_DIR, CACHE_DIR } = require('../constants');
const { sendFilePerEmail } = require('../email');
const { printError } = require('../log');
const { getSetting } = require('../settings');
const { humanSize } = require('../util/files');
const { fmtInA, plural } = require('../util/format');
const { fmtWhen, partsInBrasilia } = require('../util/when');

/*
 * /backup               → current database (size and entries), last backup and the next automatic one
 * /backup -now          → creates a backup now
 * /backup -l            → lists the backups, numbered from newest to oldest
 * /backup -i <no.>       → details: date, reason, version and entries (compared with the current database)
 * /backup -r <no.|name>  → shows what will happen; with -sim, restores
 * /backup -s [no.] [email...] → sends the file to your private chat or, with emails, as
 * attachment through the bot's SMTP ("email" = QRCODE_EMAIL_SMTP_TO). Without a no.: the most recent
 * /backup -rm <nº|all>  → apaga
 */
// An attachment that is too big is refused by most providers (Gmail: 25 MB)
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const HELP = '💡 _-now cria um agora · -l lista · -i <nº> detalha · -r <nº> restaura · -s [nº] [e-mail] envia o arquivo · -rm <nº|all> apaga_';

const inputsInLine = (inputs) => Object.entries(inputs)
    .map(([t, n]) => `${t} ${fmtInA(n)}`).join(' · ');

const backupLine = (b, i) => `${i + 1}. *${fmtWhen(b.criadoEm)}* · ${humanSize(b.bytes)} · ${b.motivo}`;

// "2" (list number) or the file name (with or without .db.gz)
function findBackup(list, valueAlt) {
    const v = String(valueAlt ?? '').trim();
    if (/^\d+$/.test(v)) return list[Number(v) - 1] ?? null;
    return list.find(b => b.nome === v.replace(/\.db\.gz$/, '')) ?? null;
}

async function status(msg) {
    const list = await listBackups();
    const inputs = await countInputs();
    const db = path.join(CACHE_DIR, 'bot_database.db');
    const bytesDb = fs.existsSync(db) ? fs.statSync(db).size : null;
    const total = list.reduce((s, b) => s + b.bytes, 0);
    const [last] = list;

    const today = partsInBrasilia(Date.now());
    const doneToday = list.some(b => {
        const p = partsInBrasilia(b.criadoEm);
        return b.motivo === REASONS.automatico && p.ano === today.ano && p.mes === today.mes && p.dia === today.dia;
    });

    let textAlt = '💾 *Backup*\n\n' +
        `🗄️ *Banco atual:* ${bytesDb === null ? '—' : humanSize(bytesDb)}\n` +
        `   _${inputsInLine(inputs)}_\n` +
        `📦 *Backups:* ${list.length}${list.length ? ` (${humanSize(total)})` : ''} em ${BACKUP_DIR}\n` +
        `🕐 *Último:* ${last ? `${fmtWhen(last.criadoEm)} (${last.motivo}, ${humanSize(last.bytes)})` : 'nenhum'}\n`;

    textAlt += getSetting('backup.enabled')
        ? `⏭️ *Próximo automático:* ${fmtWhen(nextBackupDaily(Date.now(), doneToday))} ` +
          `_(todo dia às ${getSetting('backup.hour')}h, guarda ${getSetting('backup.keep')})_\n`
        : '⏭️ Backup automático desligado _(setting backup.enabled)_\n';

    await msg.reply(`${textAlt}\n${HELP}`, null, { linkPreview: false });
}

async function cmdBackup({ msg, opts }) {
    const o = opts.opt;
    const list = await listBackups();
    const withoutBackups = '💾 Nenhum backup ainda. Crie um com /backup -now';

    // -now
    if (o.now) {
        const b = await createBackup(REASONS.manual);
        await msg.reply(`💾 *Backup criado*\n📄 ${b.nome}\n📦 ${humanSize(b.bytes)}\n_${inputsInLine(b.entradas)}_`);
        return;
    }

    // -list
    if (o.list) {
        if (!list.length) {
            await msg.reply(withoutBackups);
            return;
        }
        await msg.reply(`💾 *Backups* (${list.length})\n\n${list.map(backupLine).join('\n')}\n\n` +
            '💡 _/backup -i <nº> mostra as entradas; /backup -r <nº> restaura._');
        return;
    }

    // -info <nº>
    if (opts.given.has('info')) {
        const b = findBackup(list, o.info);
        if (!b) {
            await msg.reply(list.length ? `❌ Backup ${o.info ?? '?'} não existe. Veja a lista com /backup -l` : withoutBackups);
            return;
        }

        const current = await countInputs();
        const names = [...new Set([...Object.keys(b.entradas ?? {}), ...Object.keys(current)])].sort();
        const linesAlt = names.map(t => `${t}: ${fmtInA(b.entradas?.[t] ?? 0)} → ${fmtInA(current[t] ?? 0)}`);

        await msg.reply(`💾 *Backup ${list.indexOf(b) + 1}*\n` +
            `📄 ${b.nome}\n🕐 ${fmtWhen(b.criadoEm)} · ${b.motivo} · ZapBot ${b.versao}\n📦 ${humanSize(b.bytes)}\n\n` +
            `*Entradas* _(backup → atual)_\n\`\`\`${linesAlt.join('\n')}\`\`\``);
        return;
    }

    // -restore <nº|nome> [-sim]
    if (opts.given.has('restore')) {
        const b = findBackup(list, o.restore);
        if (!b) {
            await msg.reply(list.length ? `❌ Backup ${o.restore ?? '?'} não existe. Veja a lista com /backup -l` : withoutBackups);
            return;
        }

        if (!o.sim) {
            await msg.reply(`⚠️ *Restaurar o backup de ${fmtWhen(b.criadoEm)}?*\n` +
                `📄 ${b.nome} (${b.motivo}, ZapBot ${b.versao})\n\n` +
                'O banco inteiro volta a esse momento: mensagens guardadas, apagadas, editadas, settings, ' +
                'regras do /watch, alertas, lembretes, estatísticas... O que entrou depois se perde, mas ' +
                'antes o bot faz um backup do estado atual.\n\n' +
                `Para confirmar: /backup -r ${b.nome} -sim`);
            return;
        }

        const r = await restoreBackup(b);
        await msg.reply(`♻️ *Backup restaurado:* ${fmtWhen(b.criadoEm)}\n` +
            `_${inputsInLine(r.entradas)}_\n\n` +
            `💾 O estado anterior ficou no backup ${r.seguranca.nome}: para desfazer, /backup -r ${r.seguranca.nome} -sim`);
        return;
    }

    // -send [no.] [email...]: in your private chat or, with emails, as an attachment
    if (opts.given.has('send')) {
        const values = [o.send, ...opts.argv].filter(Boolean).flatMap(v => String(v).split(','))
            .map(v => v.trim()).filter(Boolean);
        const numberAlt = values.find(v => /^\d+$/.test(v));
        const emails = values.filter(v => v !== numberAlt).map(v => (/^e-?mail$/i.test(v) ? process.env.QRCODE_EMAIL_SMTP_TO?.trim() : v));
        const invalid = emails.filter(e => !e || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e));

        if (invalid.length) {
            await msg.reply(`❌ E-mail inválido: ${invalid.map(e => e || '(QRCODE_EMAIL_SMTP_TO vazio)').join(', ')}\n` +
                '💡 _/backup -s [nº] [e-mail...]: sem e-mail, vai no seu privado; "email" usa o QRCODE_EMAIL_SMTP_TO._');
            return;
        }

        const b = numberAlt ? findBackup(list, numberAlt) : list[0];
        if (!b) {
            await msg.reply(list.length ? `❌ Backup ${numberAlt} não existe. Veja a lista com /backup -l` : withoutBackups);
            return;
        }

        if (emails.length) {
            if (b.bytes > MAX_ATTACHMENT_BYTES) {
                await msg.reply(`❌ O backup tem ${humanSize(b.bytes)}: grande demais para anexar (máx. ${humanSize(MAX_ATTACHMENT_BYTES)}). Use /backup -s sem e-mail.`);
                return;
            }

            try {
                await sendFilePerEmail({
                    para: emails,
                    assunto: `💾 Backup de ${fmtWhen(b.criadoEm)}`,
                    texto: `Backup do banco do ZapBot de ${fmtWhen(b.criadoEm)} (${b.motivo}, ZapBot ${b.versao}).\n` +
                        `Para restaurar: copie o arquivo para ${BACKUP_DIR} e use /backup -r ${b.nome} -sim.`,
                    arquivo: b.arquivo,
                    nomeArquivo: `${b.nome}.db.gz`
                });
                await msg.reply(`📧 Backup de ${fmtWhen(b.criadoEm)} enviado para ${emails.join(', ')}.`);
            } catch (err) {
                printError('/backup -send por e-mail:', err.message);
                await msg.reply(`❌ Não consegui enviar o e-mail: ${err.message}`);
            }
            return;
        }

        const myId = client.info.wid._serialized;
        await client.sendMessage(myId, MessageMedia.fromFilePath(b.arquivo), {
            sendMediaAsDocument: true,
            caption: `💾 Backup de ${fmtWhen(b.criadoEm)} (${b.motivo})`
        });
        if (msg.id?.remote !== myId) await msg.reply('💾 Backup enviado no seu privado.');
        return;
    }

    // -rm <nº|all>
    if (opts.given.has('rm')) {
        if (String(o.rm ?? '').toLowerCase() === 'all') {
            for (const b of list) await removeBackup(b);
            await msg.reply(`🗑️ ${plural(list.length, 'backup removido', 'backups removidos')}.`);
            return;
        }

        const b = findBackup(list, o.rm);
        if (!b) {
            await msg.reply(list.length ? `❌ Backup ${o.rm ?? '?'} não existe. Veja a lista com /backup -l` : withoutBackups);
            return;
        }

        await removeBackup(b);
        await msg.reply(`🗑️ Backup removido: ${fmtWhen(b.criadoEm)} (${b.motivo})`);
        return;
    }

    await status(msg);
}

module.exports = {
    cmdBackup
};
