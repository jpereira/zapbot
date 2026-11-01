/*
 * Comandos /block e /unblock.
 */

const { client, completeNotice } = require('../client');
const { scheduleName, contactName, resolveLidToPhone } = require('../contacts');
const { resolverOrChoose } = require('../destinations');
const { printError, printInfo } = require('../log');
const { textItems } = require('./set');
const { wait, plural } = require('../util/format');

/*
 * /block <person>       → blocks on your WhatsApp account (/contact/, @mention
 * or +number; replying to a message, whoever wrote it)
 * /block (or -l)        → the blocked ones, numbered for /unblock <no.>
 * /unblock <person|no.>  → unblocks (the person as in /block, or the list no.)
 * /unblock -all (-a)    → desbloqueia todos
 * The list comes from WhatsApp: whoever you blocked on the phone also shows up.
 * Groups cannot be blocked.
 */
const EXAMPLES = '/Fulano/, @menção ou +5521999999999';

/*
 * The last -l ({ id, phone, name }): the "no. 2" of /unblock 2 is the list's
 * that you saw, even if someone was blocked on the phone in the meantime.
 */
let lastList = [];

// "/Fulano de Tal/" or "'Fulano de Tal'" → "Fulano de Tal" (as in /mute)
const withoutDelimiters = (textAlt) => textAlt.trim()
    .replace(/^\/(.*)\/$/s, '$1')
    .replace(/^(["'])(.*)\1$/s, '$2')
    .trim();

// A contact's name; the number of a @lid is the lid itself (not the phone), so it does not work
const nameAltAlt = (c) => {
    const id = String(c.id?._serialized ?? '');
    return contactName(c) || (c.number && !id.endsWith('@lid') ? `+${c.number}` : id.split('@')[0]);
};

/*
 * A blocked one: { id, phone, name }. WhatsApp stores blocks by the
 * internal id (@lid), and the number of a @lid contact is the lid itself, not the
 * phone: the phone comes from the LID (when WhatsApp knows it), and the name, from the
 * contact of the phone (the one in your address book), otherwise of the @lid itself.
 */
async function blocked(c) {
    const id = c.id._serialized;
    const jid = id.endsWith('@lid') ? await resolveLidToPhone(id) : id;
    const phoneAlt = jid?.endsWith('@c.us') ? jid.split('@')[0] : null;
    const phoneAlt2 = jid && jid !== id ? await client.getContactById(jid).catch(() => null) : null;
    const nameAlt = scheduleName(phoneAlt2) || scheduleName(c) || contactName(phoneAlt2) || contactName(c);
    return { id, telefone: phoneAlt, nome: nameAlt };
}

// "Fulano · +5521...", "+5521..." or, with no known name or phone, the internal id
const describe = (b) => (b.nome ? `${b.nome}${b.telefone ? ` · +${b.telefone}` : ''}`
    : b.telefone ? `+${b.telefone}` : `${b.id.split('@')[0]} _(id interno, sem telefone conhecido)_`);

/*
 * The blocked ones: with a name (in order), then only with a phone, then only with the
 * id. whatsapp-web.js' getBlockedContacts creates the contacts without the client
 * (their methods do not work): only the fields count.
 */
async function blockedAlt() {
    const list = await Promise.all((await client.getBlockedContacts()).map(blocked));
    const group = (b) => (b.nome ? 0 : b.telefone ? 1 : 2);
    return list.sort((a, b) => group(a) - group(b) ||
        (a.nome ?? a.telefone ?? a.id).localeCompare(b.nome ?? b.telefone ?? b.id, 'pt-BR'));
}

async function listAlt(msg) {
    const list = await blockedAlt();
    lastList = list;

    if (!list.length) {
        await msg.reply(`🚫 Ninguém bloqueado.\n💡 _Ex.: /block ${EXAMPLES}, ou responda uma mensagem com /block._`);
        return;
    }

    const linesAlt = list.map((b, i) => `${i + 1}. 👤 ${describe(b)}`);

    await msg.reply(`🚫 *Bloqueados* (${list.length})\n\n${linesAlt.join('\n')}\n\n` +
        '💡 _Desbloqueie com /unblock <nº|nome>._');
}

/**
 * The person: the one from the text (looked up as in -to, contacts only) or, without it, whoever
 * escreveu a mensagem respondida.
 * @returns {Promise<{ id: string, nome: string } | null>} null: already replied the error
 */
async function readPerson(msg, textAlt, quotedMsg, cmd) {
    if (textAlt) {
        const d = await resolverOrChoose(msg, textAlt, {
            tipo: 'contato',
            semEmail: `❌ O ${cmd} é de pessoas: informe um contato, uma menção ou um número, não um e-mail.`
        });
        if (!d) return null;
        if (d.grupo) {
            await msg.reply(`❌ ${d.nome} é um grupo: o ${cmd} é de pessoas.`);
            return null;
        }
        return d;
    }

    if (quotedMsg.fromMe) return { id: client.info.wid._serialized, nome: 'você' };

    const id = quotedMsg.author || quotedMsg.from;
    const contactAlt = await client.getContactById(id).catch(() => null);
    return { id, nome: contactAlt ? nameAltAlt(contactAlt) : id.split('@')[0] };
}

/*
 * The people in the text: "/Fulano de Tal/", "name in quotes", +number,
 * @mention or one word each (as in /whois). Only loose words, without
 * none of those, they are a single name: /block Fulano Silva is one person, not two.
 */
function textPeople(textAlt) {
    if (!/[/"'@+]|\d{8,}/.test(textAlt)) return textAlt.trim() ? [textAlt.trim()] : [];
    return textItems(textAlt);
}

/*
 * WhatsApp Web updates the blocked list right after the block (or the
 * unblock), but not right away: the check waits a bit before
 * count as a failure.
 */
const WAIT_CHECK_MS = 1500;

/*
 * The @lid of an id (null: WhatsApp did not report it). The block() of the
 * whatsapp-web.js swaps the phone for the @lid with what WhatsApp Web already knows
 * and, on a number it does not know, blocks without an id (the internal "t" error).
 * getContactLidAndPhone asks WhatsApp when it does not know.
 */
async function lidDe(id) {
    if (id.endsWith('@lid')) return id;
    const [r] = await client.getContactLidAndPhone([id]).catch(() => []);
    return r?.lid?.endsWith('@lid') ? r.lid : null;
}

// Is any of the ids in WhatsApp's blocked list? Waits a bit before the no (as in /unblock)
async function inList(ids, { esperarSeNao: waitSeNot = false } = {}) {
    const is = async () => (await client.getBlockedContacts()).some(c => ids.includes(c.id._serialized));
    if (await is() || !waitSeNot) return is();
    await wait(WAIT_CHECK_MS);
    return is();
}

/**
 * Blocks an already resolved person. An error does not take down the others: it becomes the reason.
 * @returns {Promise<'bloqueado'|'ja'|string>} what happened, or the reason for not blocking
 */
async function blockA(person) {
    if (person.id === client.info.wid._serialized) return 'é a conta do próprio bot';

    try {
        const lid = await lidDe(person.id);
        const ids = [person.id, lid].filter(Boolean);
        if (await inList(ids)) return 'ja';

        // By the @lid, when WhatsApp reported it: block() does not need to swap the phone
        const contactAlt = await client.getContactById(lid ?? person.id);
        await contactAlt.block();

        if (!(await inList(ids, { esperarSeNao: true }))) return 'o WhatsApp não bloqueou (não entrou na lista)';
    } catch (err) {
        printError(`/block: ${person.nome} (${person.id}):`, err.message);
        return `o WhatsApp recusou o bloqueio (erro "${err.message}")`;
    }

    printInfo(`/block: ${person.nome} (${person.id}) bloqueado`);
    return 'bloqueado';
}

const TIP_BLOCK = '💡 _Desfaça com /unblock; veja a lista com /block._';

// One person: the usual reply
async function replyA(msg, person, r) {
    await msg.reply(r === 'bloqueado' ? `🚫 *Bloqueado:* 👤 ${person.nome}\n${TIP_BLOCK}`
        : r === 'ja' ? `ℹ️ 👤 ${person.nome} já está bloqueado.\n💡 _Veja a lista com /block_`
            : r === 'é a conta do próprio bot' ? '❌ Não dá para bloquear a conta do próprio bot.'
                : `⚠️ Não consegui bloquear 👤 ${person.nome}: ${r}.`);
}

// Several: a single summary, per result
async function replySeveral(msg, results) {
    const group = (title, list, withReason = false) => (list.length
        ? `${title} (${list.length}):*\n${list.map(({ pessoa: person, r }) => `👤 ${person.nome}${withReason ? `: ${r}` : ''}`).join('\n')}`
        : null);

    const partsAlt = [
        group('🚫 *Bloqueados', results.filter(x => x.r === 'bloqueado')),
        group('ℹ️ *Já estavam bloqueados', results.filter(x => x.r === 'ja')),
        group('❌ *Não bloqueados', results.filter(x => x.r !== 'bloqueado' && x.r !== 'ja'), true)
    ].filter(Boolean);

    await msg.reply(`${partsAlt.join('\n\n')}\n\n${TIP_BLOCK}`);
}

async function cmdBlock({ msg, opts, quotedMsg }) {
    // argv comes without the options (-l, -mask): only the people
    const textAlt = opts.argv.join(' ').trim();

    if (opts.opt.list || (!textAlt && !quotedMsg)) {
        await listAlt(msg);
        return;
    }

    // Replying to a message, with nobody in the text: whoever wrote it
    const items = textAlt ? textPeople(textAlt) : [null];

    if (items.length === 1) {
        const person = await readPerson(msg, items[0] && withoutDelimiters(items[0]), quotedMsg, '/block');
        if (person) await replyA(msg, person, await blockA(person));
        return;
    }

    // Several: one at a time (each may ask for the choice from the list); whoever was not found already got the error reply
    const results = [];
    for (const item of items) {
        const person = await readPerson(msg, item, null, '/block');
        if (!person || results.some(x => x.pessoa.id === person.id)) continue;
        results.push({ pessoa: person, r: await blockA(person) });
    }
    if (results.length) await replySeveral(msg, results);
}

// Those on the list that WhatsApp still has as blocked (by the list's exact id)
async function stillBlocked(list) {
    if (!list.length) return [];
    const stayed = async () => {
        const ids = new Set((await client.getBlockedContacts()).map(c => c.id._serialized));
        return list.filter(b => ids.has(b.id));
    };

    const nowAlt = await stayed();
    if (!nowAlt.length) return nowAlt;
    await wait(WAIT_CHECK_MS);
    return stayed();
}

// Unblocks by the exact id from the blocked list, without whatsapp-web.js' swap to @lid
async function unblockById(id) {
    if (!client.pupPage) throw new Error('sem a página do WhatsApp Web');
    await client.pupPage.evaluate(async (contactId) => {
        const contactAlt = await window.require('WAWebCollections').Contact.find(contactId);
        await window.require('WAWebBlockContactAction').unblockContact(contactAlt, 'ChatListBlock');
    }, id);
}

/*
 * whatsapp-web.js' unblock() checks nothing: it swaps the contact for the @lid,
 * unblocks and returns true. A block stored by phone (from the old ones)
 * stays on the list, and the bot would count it as unblocked. So: unblocks,
 * checks WhatsApp's list, unblocks again whoever remained (by the exact id
 * of the list) and checks again; whoever still remains is a failure.
 * @param {object[]} lista  the blocked ones ({ id, telefone, nome }, from bloqueados())
 * @returns {Promise<Array<{ b: object, motivo: string }>>} the failures
 */
async function unblock(list) {
    const failures = new Map();  // id → motivo
    for (const b of list) {
        try {
            const contactAlt = await client.getContactById(b.id);
            await contactAlt.unblock();
        } catch (err) {
            failures.set(b.id, err.message);
        }
    }

    let stayed = await stillBlocked(list.filter(b => !failures.has(b.id)));
    for (const b of stayed) {
        printInfo(`/unblock: ${describe(b)} (${b.id}) continua bloqueado; desbloqueando pelo id da lista`);
        await unblockById(b.id).catch(err => printError(`/unblock: ${b.id} pelo id da lista:`, err.message));
    }
    stayed = await stillBlocked(stayed);
    for (const b of stayed) failures.set(b.id, 'o WhatsApp não desbloqueou (continua na lista)');

    return list.filter(b => failures.has(b.id)).map(b => ({ b, motivo: failures.get(b.id) }));
}

/*
 * /unblock -all: one by one; whoever fails does not hold up the others. As in /get, the
 * "⏳ Desbloqueando…" vira o resultado (o WhatsApp edita a mensagem).
 */
async function unblockAll(msg) {
    const list = await blockedAlt();
    lastList = [];

    if (!list.length) {
        await msg.reply('🚫 Ninguém bloqueado.');
        return;
    }

    const notice = await msg.reply(`⏳ Desbloqueando ${plural(list.length, 'contato', 'contatos')}, aguarde.`);
    const failures = await unblock(list);

    const ok = list.length - failures.length;
    printInfo(`/unblock -all: ${ok} desbloqueados, ${failures.length} falhas`);
    await completeNotice(msg, notice, `✅ ${plural(ok, 'desbloqueado', 'desbloqueados')}.` +
        (failures.length ? `\n\n⚠️ Não consegui desbloquear (${failures.length}):\n` +
            failures.map(f => `• ${describe(f.b)}: ${f.motivo}`).join('\n') : ''));
}

// The phone of an id (the @lid becomes the phone, if WhatsApp knows); null: I do not know
async function phoneAlt3(id) {
    const jid = id.endsWith('@lid') ? await resolveLidToPhone(id) : id;
    return jid?.endsWith('@c.us') ? jid.split('@')[0] : null;
}

async function cmdUnblock({ msg, opts, quotedMsg }) {
    if (opts.opt.all) {
        await unblockAll(msg);
        return;
    }

    // argv comes without the options: only the person (or the no.)
    const textAlt = withoutDelimiters(opts.argv.join(' '));

    if (!textAlt && !quotedMsg) {
        await listAlt(msg);
        return;
    }

    /*
     * Whoever is unblocked leaves WhatsApp's list (the contact's isBlocked does not
     * works: the block may be on the @lid or on the phone). The no. is the list's
     * that you saw; the person is found by id or by phone.
     */
    const current = await blockedAlt();
    let nameAlt;
    let target;
    if (/^\d{1,3}$/.test(textAlt)) {
        const b = (lastList.length ? lastList : current)[Number(textAlt) - 1];
        if (!b) {
            await msg.reply(`❌ Nº ${textAlt} não existe. Veja a lista com /block`);
            return;
        }
        nameAlt = describe(b);
        target = current.find(x => x.id === b.id || (b.telefone && x.telefone === b.telefone));
    } else {
        const person = await readPerson(msg, textAlt, quotedMsg, '/unblock');
        if (!person) return;
        const phoneAlt = await phoneAlt3(person.id);
        nameAlt = person.nome;
        target = current.find(x => x.id === person.id || (phoneAlt && x.telefone === phoneAlt));
    }

    if (!target) {
        await msg.reply(`ℹ️ 👤 ${nameAlt} não está bloqueado.\n💡 _Veja a lista com /block_`);
        return;
    }

    const [failure] = await unblock([target]);
    if (failure) {
        await msg.reply(`⚠️ Não consegui desbloquear 👤 ${nameAlt}: ${failure.motivo}.`);
        return;
    }
    printInfo(`/unblock: ${nameAlt} (${target.id}) desbloqueado`);
    await msg.reply(`✅ *Desbloqueado:* 👤 ${nameAlt}`);
}

module.exports = {
    cmdBlock,
    cmdUnblock
};
