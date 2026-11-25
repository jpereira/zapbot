/*
 * /batch: several commands from a single message, run one after the other.
 *
 * A line that starts with a command (or alias) opens a block; what comes after,
 * blank lines included, is from the same block. A line with "/" that is not a command
 * (e.g. /etc/hosts) remains block text. Each block goes through the same
 * path of a normal message (alias, $1, options) and the reply is a single summary.
 */
const { isCommandOrAlias, textRunAlias, resolveAlias } = require('../aliases');
const { readOptions: commandReadOptions } = require('../execute');
const { printError, printInfo } = require('../log');
const { summarizeText } = require('../util/format');
const { t } = require('../i18n');
const { commandUsage } = require('./base');

const MAX_BLOCKS = 50;
const MAX_REPLY = 300;
const WITHOUT_PREVIEW = { linkPreview: false };

// The text becomes { line } blocks; whatever comes before the first command is ignored (left over)
async function separateBlocks(textAlt) {
    const blocks = [];
    let leftOver = false;

    for (const line of textAlt.split('\n')) {
        const nameAlt = line.trimStart().startsWith('/') ? line.trim().split(/\s+/, 1)[0] : null;
        if (nameAlt && await isCommandOrAlias(nameAlt)) {
            blocks.push(line.trim());
        } else if (blocks.length) {
            blocks[blocks.length - 1] += `\n${line}`;
        } else if (line.trim()) {
            leftOver = true;
        }
    }

    return { blocks: blocks.map(b => b.replace(/\s+$/, '')), leftover: leftOver };
}

// Reads -stop (-s) / -dry (-d) / -quiet (-q) only from the 1st line, before the commands (the rest belongs to the blocks)
function readOptions(args) {
    const optionsAlt = { stop: false, dry: false, quiet: false };
    let rest = args.trim();
    for (let m; (m = rest.match(/^-(stop|s|dry|d|quiet|q)(?=\s|$)\s*/i));) {
        const nameAlt = m[1].toLowerCase();
        optionsAlt[nameAlt === 'stop' || nameAlt === 's' ? 'stop' : nameAlt === 'quiet' || nameAlt === 'q' ? 'quiet' : 'dry'] = true;
        rest = rest.slice(m[0].length);
    }
    return { options: optionsAlt, text: rest };
}

// The block's msg: the same, but the texts the command replies are stored for the summary
function blockMsg(msg, line, replies) {
    const child = Object.create(msg);
    Object.assign(child, { body: line, hasMedia: false, hasQuotedMsg: false });
    child.reply = async (content, ...rest) => {
        if (typeof content !== 'string') return msg.reply(content, ...rest);
        replies.push(content);
        return { id: msg.id, body: content };
    };
    return child;
}

async function runBlock(line, context) {
    const { handlerFor } = require('./index'); // in here: index imports this file
    const replies = [];
    const resolved = await resolveAlias(line);
    const command = resolved?.command;

    if (!command) return { ok: false, answers: [t('adm.batch.unknown')] };
    if (command.cmd === '/batch') return { ok: false, answers: [t('adm.batch.nested')] };

    const msg = blockMsg(context.msg, line, replies);
    const args = resolved.args ?? line.slice(line.split(/\s+/, 1)[0].length).trim();

    if (resolved.text) {
        await textRunAlias(msg, { ...resolved, quiet: true }, {
            chatId: context.chatId, chatName: context.chatName, isGroup: context.isGroup,
            who: {
                level: context.level, admin: true, canUse: () => true, senderContact: context.senderContact,
                senderName: context.senderName, senderNumber: context.senderNumber
            }
        });
    } else {
        const handler = handlerFor(command);
        if (!handler) return { ok: false, answers: [t('adm.batch.notImplemented', { cmd: command.cmd })] };
        await handler({ ...context, msg, args, opts: commandReadOptions(command, args), quotedMsg: null });
    }

    return { ok: !replies.some(r => r.startsWith('❌') || r.startsWith('⚠️')), answers: replies };
}

const top = (line) => summarizeText(line.replace(/\s+/g, ' '), 50);

async function cmdBatch(context) {
    const { msg, args, quotedMsg } = context;
    const { options: optionsAlt, text: typed } = readOptions(args);
    const textAlt = typed || (quotedMsg?.body ?? '').trim();

    if (!textAlt) {
        await msg.reply(commandUsage('/batch'));
        return;
    }

    const { blocks, leftover: leftOver } = await separateBlocks(textAlt);
    if (!blocks.length) {
        await msg.reply(t('adm.batch.noCommand'));
        return;
    }
    if (blocks.length > MAX_BLOCKS) {
        await msg.reply(t('adm.batch.tooMany', { n: blocks.length, max: MAX_BLOCKS }));
        return;
    }

    const notice = leftOver ? t('adm.batch.ignored') : '';

    if (optionsAlt.dry) {
        const linesAlt = blocks.map((b, i) => `${i + 1}. ${top(b)}${b.includes('\n') ? t('adm.batch.extraLines', { n: b.split('\n').length - 1 }) : ''}`);
        await msg.reply(t('adm.batch.dry', { n: blocks.length, lines: linesAlt.join('\n'), notice }), undefined, WITHOUT_PREVIEW);
        return;
    }

    const linesAlt = [];
    const contents = []; // replies with a code block (e.g.: /ascii) come out whole, outside the summary
    let failures = 0;

    for (const [i, block] of blocks.entries()) {
        let r;
        try {
            r = await runBlock(block, context);
        } catch (err) {
            printError(`/batch: error in block ${i + 1}:`, err?.message || err);
            r = { ok: false, answers: [err?.message || String(err)] };
        }

        if (!r.ok) failures++;
        if (!r.ok && optionsAlt.quiet) printInfo(`/batch -quiet: block ${i + 1} failed (${top(block)}):`, r.answers.join(' | '));
        const reply = r.answers.filter(x => !x.includes('```')).join('\n').trim();
        contents.push(...r.answers.filter(x => x.includes('```')));
        const detail = reply ? `\n   ↳ ${summarizeText(reply.replace(/\n+/g, ' · '), MAX_REPLY)}` : '';
        linesAlt.push(`${r.ok ? '✅' : '❌'} ${i + 1} · ${top(block)}${detail}`);

        if (!r.ok && optionsAlt.stop) {
            if (i + 1 < blocks.length) linesAlt.push(t('adm.batch.stopped', { i: i + 1, rest: blocks.length - i - 1 }));
            break;
        }
    }

    // -quiet: without the summary (what the commands send outside the summary, like media, goes out the same)
    if (!optionsAlt.quiet) {
        const ok = blocks.length - failures;
        await msg.reply(t('adm.batch.summary', { ok, n: blocks.length, lines: linesAlt.join('\n'), notice }), undefined, WITHOUT_PREVIEW);
    }
    for (const c of contents) await msg.reply(c);
}

module.exports = { cmdBatch, separateBlocks };
