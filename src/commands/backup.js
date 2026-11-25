/*
 * Comando /backup.
 */

const fs = require('fs');

const {
    MAX_ATTACHMENT_BYTES, REASONS, countInputs, createBackup, sendBackupOnChat,
    sendBackupPerEmail, listBackups, reasonText, nextBackupDaily, removeBackup, restoreBackup
} = require('../backup');
const { findCommand } = require('./base');
const { client } = require('../client');
const { BACKUP_DIR, DB_PATH } = require('../constants');
const {
    describeDestinations, emailsOfSmtpTo, extractDestinations, resolveDestinations
} = require('../destinations');
const { printError } = require('../log');
const { GetOptFromCommand } = require('../options');
const { getSetting } = require('../settings');
const { humanSize } = require('../util/files');
const { fmtInA } = require('../util/format');
const { t } = require('../i18n');
const { fmtWhen, partsInBrasilia } = require('../util/when');

/*
 * /backup               → current database (size and entries), last backup and the next automatic one
 * /backup -now          → creates a backup now
 * /backup -l            → lists the backups, numbered from newest to oldest
 * /backup -i <no.>       → details: date, reason, version and entries (compared with the current database)
 * /backup -r <no.|name>  → shows what will happen; with -yes, restores
 * /backup -s [no.] [-to <destination>]... → sends the file (without no.: the most recent) in
 * your private chat or in the -to destinations: by email, as an attachment through the
 * The bot's SMTP ("email" = QRCODE_EMAIL_SMTP_TO), or in another chat
 * (contact, group or number: asks for -yes, since the database has the
 * messages of all chats). Repeat -to for several. The form
 * old, with the emails straight in -s (/backup -s 2 email), counts
 * /backup -rm <nº|all>  → apaga
 */
const inputsInLine = (inputs) => Object.entries(inputs)
    .map(([table, n]) => `${table} ${fmtInA(n)}`).join(' · ');

const backupLine = (b, i) => `${i + 1}. *${fmtWhen(b.createdAt)}* · ${humanSize(b.bytes)}` +
    `${b.notesBytes ? ` + 🖼️ ${humanSize(b.notesBytes)}` : ''}${b.contactsBytes ? ` + 📇 ${humanSize(b.contactsBytes)}` : ''} · ${reasonText(b.reason)}`;

// "2" (list number) or the file name (with or without .db.gz)
function findBackup(list, valueAlt) {
    const v = String(valueAlt ?? '').trim();
    if (/^\d+$/.test(v)) return list[Number(v) - 1] ?? null;
    return list.find(b => b.name === v.replace(/\.db\.gz$/, '')) ?? null;
}

async function status(msg) {
    const list = await listBackups();
    const inputs = await countInputs();
    const db = DB_PATH;
    const bytesDb = fs.existsSync(db) ? fs.statSync(db).size : null;
    const total = list.reduce((s, b) => s + b.bytes + (b.notesBytes ?? 0) + (b.contactsBytes ?? 0), 0);
    const [last] = list;

    const today = partsInBrasilia(Date.now());
    const doneToday = list.some(b => {
        const p = partsInBrasilia(b.createdAt);
        return b.reason === REASONS.automatic && p.year === today.year && p.mes === today.mes && p.day === today.day;
    });

    // One item per bullet; the database entries, a sub-bullet per table
    const items = [
        t('adm.backup.dbNow', { size: bytesDb === null ? '—' : humanSize(bytesDb) }) + '\n' +
            Object.entries(inputs).map(([table, n]) => `   ◦ ${table}: ${fmtInA(n)}`).join('\n'),
        t('adm.backup.count', { n: list.length, total: list.length ? ` (${humanSize(total)})` : '', dir: BACKUP_DIR }),
        t('adm.backup.last', {
            value: last
                ? t('adm.backup.lastValue', { when: fmtWhen(last.createdAt), reason: reasonText(last.reason), size: humanSize(last.bytes) })
                : t('adm.backup.none')
        }),
        getSetting('backup.enabled')
            ? t('adm.backup.next', {
                when: fmtWhen(nextBackupDaily(Date.now(), doneToday)),
                hour: getSetting('backup.hour'),
                keep: getSetting('backup.keep')
            })
            : t('adm.backup.autoOff'),
        t('adm.backup.autoTo', { value: getSetting('backup.to') || t('adm.backup.localOnly') })
    ];
    const textAlt = `${t('adm.backup.title')}\n\n${items.map(i => `• ${i}`).join('\n')}\n`;

    await msg.reply(`${textAlt}\n${t('adm.backup.tips')}`, null, { linkPreview: false });
}

async function cmdBackup({ msg, opts: commandOpts, args }) {
    /*
     * -to accepts spaces (/Jorge Pereira/), which the option parser
     * would split: goes out of the text first, and the rest is read again.
     */
    const { destinations: destinationsText, given: withDestination, rest } = extractDestinations(args);
    const opts = withDestination ? GetOptFromCommand(rest, findCommand('/backup')) : commandOpts;
    const o = opts.opt;

    if (withDestination && !opts.given.has('send')) {
        await msg.reply(t('adm.backup.toIsSend'));
        return;
    }

    const list = await listBackups();
    const withoutBackups = t('adm.backup.noBackups');

    // -now
    if (o.now) {
        const b = await createBackup(REASONS.manual);
        await msg.reply(t('adm.backup.created', {
            name: b.name,
            size: humanSize(b.bytes),
            notes: (b.notesBytes ? t('adm.backup.createdNotes', { size: humanSize(b.notesBytes) }) : '') +
                (b.contactsBytes ? t('adm.backup.createdContacts', { size: humanSize(b.contactsBytes) }) : ''),
            inputs: inputsInLine(b.inputs)
        }));
        return;
    }

    // -list
    if (o.list) {
        if (!list.length) {
            await msg.reply(withoutBackups);
            return;
        }
        await msg.reply(`${t('adm.backup.listTitle', { n: list.length })}\n\n${list.map(backupLine).join('\n')}\n\n` +
            t('adm.backup.listHints'));
        return;
    }

    // -info <nº>
    if (opts.given.has('info')) {
        const b = findBackup(list, o.info);
        if (!b) {
            await msg.reply(list.length ? t('adm.backup.notFound', { n: o.info ?? '?' }) : withoutBackups);
            return;
        }

        const current = await countInputs();
        const names = [...new Set([...Object.keys(b.inputs ?? {}), ...Object.keys(current)])].sort();
        const linesAlt = names.map(table => `${table}: ${fmtInA(b.inputs?.[table] ?? 0)} → ${fmtInA(current[table] ?? 0)}`);

        await msg.reply(`${t('adm.backup.infoHead', { n: list.indexOf(b) + 1 })}\n` +
            `📄 ${b.name}\n🕐 ${fmtWhen(b.createdAt)} · ${reasonText(b.reason)} · ZapBot ${b.version}\n📦 ${humanSize(b.bytes)}\n` +
            `${b.notesBytes ? t('adm.backup.infoNotes', { size: humanSize(b.notesBytes), images: b.images ? ` (${b.images})` : '' }) : ''}\n` +
            `${t('adm.backup.infoEntries')}\n\`\`\`${linesAlt.join('\n')}\`\`\``);
        return;
    }

    // -restore <nº|name> [-yes]
    if (opts.given.has('restore')) {
        const b = findBackup(list, o.restore);
        if (!b) {
            await msg.reply(list.length ? t('adm.backup.notFound', { n: o.restore ?? '?' }) : withoutBackups);
            return;
        }

        if (!o.yes) {
            await msg.reply(t('adm.backup.restoreAsk', {
                when: fmtWhen(b.createdAt),
                name: b.name,
                reason: reasonText(b.reason),
                version: b.version,
                notes: t(b.notesFile ? 'adm.backup.restoreNotesYes' : 'adm.backup.restoreNotesNo')
            }));
            return;
        }

        const r = await restoreBackup(b);
        await msg.reply(t('adm.backup.restored', {
            when: fmtWhen(b.createdAt),
            inputs: inputsInLine(r.inputs),
            security: r.security.name
        }));
        return;
    }

    // -send [no.] [-to <destination>]...: in your private chat, by email or in other chats
    if (opts.given.has('send')) {
        const values = [o.send, ...opts.argv].filter(Boolean).flatMap(v => String(v).split(','))
            .map(v => v.trim()).filter(Boolean);
        const numberAlt = values.find(v => /^\d+$/.test(v));
        // The old form: the emails straight in -send (/backup -s 2 email)
        const old = values.filter(v => v !== numberAlt);

        if (old.length && withDestination) {
            await msg.reply(t('adm.backup.destOnlyTo'));
            return;
        }

        const emailsOld = old.flatMap(v => (/^e-?mail$/i.test(v) ? emailsOfSmtpTo() : [v]));
        const invalid = emailsOld.filter(e => !e || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e));

        if (invalid.length) {
            await msg.reply(t('adm.backup.badEmail', {
                list: invalid.map(e => e || t('adm.backup.smtpToEmpty')).join(', ')
            }));
            return;
        }

        const b = numberAlt ? findBackup(list, numberAlt) : list[0];
        if (!b) {
            await msg.reply(list.length ? t('adm.backup.notFound', { n: numberAlt }) : withoutBackups);
            return;
        }

        let destinations = emailsOld.length ? [{ email: emailsOld.join(', ') }] : [];
        if (withDestination) {
            // Email or chat (several -to: all); several contacts or groups with the name, waits for you
            // choose from the list
            destinations = await resolveDestinations(msg, destinationsText, { acceptsEmail: true });
            if (!destinations) return;
        }

        const myId = client.info.wid._serialized;
        const otherChats = destinations.filter(d => d.id && d.id !== myId);

        // In another chat: the database has the stored messages of ALL chats, so it asks for -yes
        if (otherChats.length && !o.yes) {
            const tos = destinationsText.map(d => `-to ${/\s/.test(d) ? `/${d}/` : d}`).join(' ');
            await msg.reply(t('adm.backup.sendConfirm', {
                where: describeDestinations(otherChats),
                number: numberAlt ? ` ${numberAlt}` : '',
                tos
            }));
            return;
        }

        // The emails of all the -to in a single email; the chats (without a destination: your private chat), one by one
        const emails = [...new Set(destinations.filter(d => d.email)
            .flatMap(d => d.email.split(/\s*,\s*/)))];
        const chats = destinations.length ? destinations.filter(d => d.id) : [{ id: myId }];

        if (emails.length) {
            if (b.bytes > MAX_ATTACHMENT_BYTES) {
                await msg.reply(t('adm.backup.tooBigAttach', { size: humanSize(b.bytes), max: humanSize(MAX_ATTACHMENT_BYTES) }));
                return;
            }

            try {
                await sendBackupPerEmail(b, emails);
                await msg.reply(t('adm.backup.emailSent', { when: fmtWhen(b.createdAt), emails: emails.join(', ') }));
            } catch (err) {
                printError('/backup -send by e-mail:', err.message);
                await msg.reply(t('adm.backup.emailFail', { error: err.message }));
            }
        }

        // A chat that fails does not hold up the others
        const sentAlt3 = [];
        for (const d of chats) {
            try {
                await sendBackupOnChat(b, d.id);
                sentAlt3.push(d);
            } catch (err) {
                printError(`/backup -send to ${d.id}:`, err.message);
                const whereAlt = d.id === myId ? t('adm.backup.myPrivate') : describeDestinations([d]);
                await msg.reply(t('adm.backup.chatFail', { where: whereAlt, error: err.message }));
            }
        }

        // "in your private chat" only if the command did not come from there (or if it came together with other chats)
        const other = sentAlt3.filter(d => d.id !== myId);
        const inPrivate = sentAlt3.some(d => d.id === myId) && (other.length || msg.id?.remote !== myId);
        const whereAlt = [inPrivate && t('adm.backup.inPrivate'), other.length && t('adm.backup.inChats', { where: describeDestinations(other) })]
            .filter(Boolean);
        if (whereAlt.length) await msg.reply(t('adm.backup.sent', { where: whereAlt.join(t('adm.backup.and')) }));
        return;
    }

    // -rm <nº|all>
    if (opts.given.has('rm')) {
        if (String(o.rm ?? '').toLowerCase() === 'all') {
            for (const b of list) await removeBackup(b);
            await msg.reply(t('adm.backup.removedAll', { n: list.length === 1 ? 1 : 2, total: list.length }));
            return;
        }

        const b = findBackup(list, o.rm);
        if (!b) {
            await msg.reply(list.length ? t('adm.backup.notFound', { n: o.rm ?? '?' }) : withoutBackups);
            return;
        }

        await removeBackup(b);
        await msg.reply(t('adm.backup.removed', { when: fmtWhen(b.createdAt), reason: reasonText(b.reason) }));
        return;
    }

    await status(msg);
}

module.exports = {
    cmdBackup
};
