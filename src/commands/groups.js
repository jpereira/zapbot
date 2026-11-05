/*
 * /join and /leave commands: joining a group through an invite link and leaving a group.
 */

const { client } = require('../client');
const { resolverOrChoose } = require('../destinations');
const { printError, printInfo } = require('../log');
const { plural } = require('../util/format');
const { textItems } = require('./set');

/*
 * /join <link|code>    → joins the invite's group (chat.whatsapp.com/<code>)
 * /join -info <link>     → shows the invite's group (name, participants, description) without joining
 * /join -l               → the groups you are in (the same as /leave -l)
 * /leave <group|no.>...  → leaves the groups: the name as in -to (several that match: you choose
 * on the list) or the -l list no.; can be more than one (/leave 3 1 /Família/)
 * /leave -l              → the numbered groups
 */

/*
 * The last list shown ({ id, name }): the "no. 2" of /leave 2 is the one from the list you saw,
 * even if you joined another group in the meantime.
 */
let lastList = [];

// "/Grupo L200/" or "'Grupo L200'" → "Grupo L200" (as in /mute)
const withoutDelimiters = (textAlt) => textAlt.trim()
    .replace(/^\/(.*)\/$/s, '$1')
    .replace(/^(["'])(.*)\1$/s, '$2')
    .trim();

// "https://chat.whatsapp.com/AbC...", "chat.whatsapp.com/invite/AbC..." or just the code → the code
function inviteCode(textAlt) {
    const t = textAlt.trim();
    return t.match(/^(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([\w-]{16,32})(?:[/?#]\S*)?$/i)?.[1]
        ?? t.match(/^([\w-]{20,24})$/)?.[1] ?? null;
}

async function listAlt(msg) {
    const chats = (await client.getChats()).filter(c => c.isGroup && c.name);
    chats.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    lastList = chats.map(c => ({ id: c.id._serialized, nome: c.name }));

    if (!chats.length) {
        await msg.reply('👥 Você não está em nenhum grupo.\n\n💡 _Entre com /join <link do convite>._');
        return;
    }
    const linesAlt = chats.map((c, i) => {
        const n = c.participants?.length;
        return `${i + 1}. ${c.name}${n ? ` · ${plural(n, 'participante', 'participantes')}` : ''}`;
    });
    await msg.reply(`👥 *GRUPOS* (${chats.length})\n\n${linesAlt.join('\n')}\n\n` +
        '💡 *Dicas*\n/join <link> entra\n/leave <nº|nome> sai');
}

async function cmdJoin({ msg, opts }) {
    if (opts.opt.list) return listAlt(msg);

    const textAlt = opts.argv.join(' ').trim();
    if (!textAlt) return msg.reply('❌ Use: /join [-info] <link do convite (chat.whatsapp.com/...)> ou /join -l');

    const codeAlt = inviteCode(textAlt);
    if (!codeAlt) return msg.reply('❌ Link de convite inválido. Ex.: https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv');

    let info;
    try {
        info = await client.getInviteInfo(codeAlt);
    } catch (e) {
        printInfo(`[JOIN] convite ${codeAlt} não resolvido:`, e.message);
        return msg.reply('❌ Convite inválido, expirado ou revogado.');
    }
    const nameAlt = info?.subject || 'grupo sem nome';

    if (opts.opt.info) {
        const n = info?.size ?? info?.participants?.length;
        return msg.reply([
            `👥 *${nameAlt}*`,
            n && `👤 ${plural(n, 'participante', 'participantes')}`,
            info?.desc && `📝 ${info.desc}`,
            `💡 _Entre com /join ${textAlt.replace(/^-\w+\s+/, '')}_`
        ].filter(Boolean).join('\n'), undefined, { linkPreview: false });
    }

    try {
        await client.acceptInvite(codeAlt);
    } catch (e) {
        printError(`[JOIN] não entrou em "${nameAlt}":`, e.message);
        return msg.reply(`❌ Não consegui entrar em 👥 ${nameAlt}: ${e.message || 'o WhatsApp recusou'}.`);
    }
    printInfo(`[JOIN] entrou em "${nameAlt}"`);
    await msg.reply(`✅ Entrei em 👥 ${nameAlt}`);
}

// Leaves a group; returns the error (text) or null
async function leave(target) {
    const chat = await client.getChatById(target.id).catch(() => null);
    if (!chat?.isGroup || typeof chat.leave !== 'function') return 'não é um grupo em que você está';
    try {
        await chat.leave();
    } catch (e) {
        printError(`[LEAVE] não saiu de "${target.nome}":`, e.message);
        return e.message || 'o WhatsApp recusou';
    }
    printInfo(`[LEAVE] saiu de "${target.nome}"`);
    return null;
}

/*
 * The text's groups: list no., /name with space/, "quotes" or one word each. Only words
 * loose (no no., slashes or quotes) are a single name: /leave Grupo Família is one group, not two.
 */
function leaveItems(textAlt) {
    const loose = textAlt.split(/\s+/);
    if (!/[/"',]/.test(textAlt) && !loose.every(p => /^\d{1,4}$/.test(p))) return [withoutDelimiters(textAlt)];
    return textItems(textAlt);
}

async function cmdLeave({ msg, opts }) {
    const textAlt = opts.argv.join(' ').trim();
    if (opts.opt.list || !textAlt) return listAlt(msg);

    // The nos. apply to the list you saw, even if it changes in the middle of the command
    const list = lastList;
    const targets = [];
    const errors = [];
    for (const item of leaveItems(textAlt)) {
        let target;
        if (/^\d{1,4}$/.test(item)) {
            target = list[Number(item) - 1];
            if (!target) {
                errors.push(`❌ Nº ${item} fora da lista; veja os grupos com /leave -l.`);
                continue;
            }
        } else {
            target = await resolverOrChoose(msg, item, { tipo: 'grupo' });
            if (!target) continue;  // the error was already replied
        }
        if (!targets.some(a => a.id === target.id)) targets.push(target);
    }

    const left = [];
    for (const target of targets) {
        const errorAlt = await leave(target);
        if (errorAlt) errors.push(`❌ Não consegui sair de 👥 ${target.nome}: ${errorAlt}.`);
        else left.push(target);
    }

    const linesAlt = [
        left.length === 1 && targets.length === 1 ? `👋 Saí de 👥 ${left[0].nome}`
            : left.length && `👋 Saí de ${plural(left.length, 'grupo', 'grupos')}:\n${left.map(g => `👥 ${g.nome}`).join('\n')}`,
        ...errors
    ].filter(Boolean);
    // When leaving the group where the command was given, the reply may have nowhere left to go
    if (linesAlt.length) await msg.reply(linesAlt.join('\n\n')).catch(e => printInfo(`[LEAVE] sem resposta: ${e.message}`));
}

module.exports = { cmdJoin, cmdLeave, inviteCode };
