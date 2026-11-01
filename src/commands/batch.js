/*
 * /batch: several commands from a single message, run one after the other.
 *
 * A line that starts with a command (or alias) opens a block; what comes after,
 * blank lines included, is from the same block. A line with "/" that is not a command
 * (e.g. /etc/hosts) remains block text. Each block goes through the same
 * path of a normal message (alias, $1, options) and the reply is a single summary.
 */
const { isCommandOrAlias, textRunAlias, resolverAlias } = require('../aliases');
const { GetOptFromCommand } = require('../options');
const { printError } = require('../log');
const { summarizeText } = require('../util/format');

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

    return { blocos: blocks.map(b => b.replace(/\s+$/, '')), sobra: leftOver };
}

// Reads -stop / -dry (-d) only from the 1st line, before the commands (the rest belongs to the blocks)
function readOptions(args) {
    const optionsAlt = { stop: false, dry: false };
    let rest = args.trim();
    for (let m; (m = rest.match(/^-(stop|dry|d)(?=\s|$)\s*/i));) {
        optionsAlt[m[1].toLowerCase() === 'stop' ? 'stop' : 'dry'] = true;
        rest = rest.slice(m[0].length);
    }
    return { opcoes: optionsAlt, texto: rest };
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
    const { HANDLERS } = require('./index'); // in here: index imports this file
    const replies = [];
    const resolved = await resolverAlias(line);
    const command = resolved?.command;

    if (!command) return { ok: false, respostas: ['comando desconhecido'] };
    if (command.cmd === '/batch') return { ok: false, respostas: ['/batch dentro de /batch não vale'] };

    const msg = blockMsg(context.msg, line, replies);
    const args = resolved.args ?? line.slice(line.split(/\s+/, 1)[0].length).trim();

    if (resolved.texto) {
        await textRunAlias(msg, { ...resolved, quiet: true }, {
            chatId: context.chatId, chatName: context.chatName, isGroup: context.isGroup,
            quem: {
                admin: true, podeUsar: () => true, senderContact: context.senderContact,
                senderName: context.senderName, senderNumber: context.senderNumber
            }
        });
    } else {
        const handler = HANDLERS[command.cmd];
        if (!handler) return { ok: false, respostas: [`${command.cmd} ainda não foi implementado`] };
        const paraParser = command.cmd === '/alias' ? '' : args;
        await handler({ ...context, msg, args, opts: GetOptFromCommand(paraParser, command), quotedMsg: null });
    }

    return { ok: !replies.some(r => r.startsWith('❌') || r.startsWith('⚠️')), respostas: replies };
}

const top = (line) => summarizeText(line.replace(/\s+/g, ' '), 50);

async function cmdBatch(context) {
    const { msg, args, quotedMsg } = context;
    const { opcoes: optionsAlt, texto: typed } = readOptions(args);
    const textAlt = typed || (quotedMsg?.body ?? '').trim();

    if (!textAlt) {
        await msg.reply('❌ Use: /batch [-stop] [-dry|-d] e, nas linhas de baixo, os comandos (ou responda uma mensagem com eles)');
        return;
    }

    const { blocos: blocks, sobra: leftOver } = await separateBlocks(textAlt);
    if (!blocks.length) {
        await msg.reply('❌ Nenhum comando encontrado. Cada bloco começa com um comando ou alias, ex: /ideia ver isso');
        return;
    }
    if (blocks.length > MAX_BLOCKS) {
        await msg.reply(`❌ São ${blocks.length} blocos; o máximo é ${MAX_BLOCKS}. Nada foi executado.`);
        return;
    }

    const notice = leftOver ? '\n⚠️ _O texto antes do primeiro comando foi ignorado._' : '';

    if (optionsAlt.dry) {
        const linesAlt = blocks.map((b, i) => `${i + 1}. ${top(b)}${b.includes('\n') ? ` (+${b.split('\n').length - 1} linhas)` : ''}`);
        await msg.reply(`📦 *BATCH* (${blocks.length}) · só a separação, nada executado\n\n${linesAlt.join('\n')}${notice}`, undefined, WITHOUT_PREVIEW);
        return;
    }

    const linesAlt = [];
    let failures = 0;

    for (const [i, block] of blocks.entries()) {
        let r;
        try {
            r = await runBlock(block, context);
        } catch (err) {
            printError(`/batch: erro no bloco ${i + 1}:`, err?.message || err);
            r = { ok: false, respostas: [err?.message || String(err)] };
        }

        if (!r.ok) failures++;
        const reply = r.respostas.join('\n').trim();
        const detail = reply ? `\n   ↳ ${summarizeText(reply.replace(/\n+/g, ' · '), MAX_REPLY)}` : '';
        linesAlt.push(`${r.ok ? '✅' : '❌'} ${i + 1} · ${top(block)}${detail}`);

        if (!r.ok && optionsAlt.stop) {
            if (i + 1 < blocks.length) linesAlt.push(`⏹️ Parou no bloco ${i + 1}; ${blocks.length - i - 1} não rodaram.`);
            break;
        }
    }

    const ok = blocks.length - failures;
    await msg.reply(`📦 *BATCH* · ${ok}/${blocks.length} ok\n\n${linesAlt.join('\n')}${notice}`, undefined, WITHOUT_PREVIEW);
}

module.exports = { cmdBatch, separateBlocks };
