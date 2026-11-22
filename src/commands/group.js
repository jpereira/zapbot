/*
 * /group command: view and change the group where it was typed.
 * /group                 → the group information (the same as -info)
 * /group -admins         → the admins
 * /group -name <text>   → changes the name            /group -desc [text] → changes the description (without text: deletes)
 * /group -pic            → the group photo, from the replied image or from the message itself
 *   /group -rmpic          → tira a photo
 * /group -send admins|all [-for 30m]  → who can send messages (with -for, reopens by itself)
 * /group -edit admins|all             → who can change name, description and photo
 * /group -add admins|all              → who can add people
 * Changing the group requires the bot account to be an admin of it. The invite link stays in /invite.
 */

const { MessageMedia } = require('whatsapp-web.js');

const { client } = require('../client');
const { scheduleReopening, cancelReopening } = require('../groupReopen');
const { contactName, removeDeviceSuffix, resolveLidToPhone } = require('../contacts');
const { t } = require('../i18n');
const { printError } = require('../log');
const { fmtWhen, readDuration } = require('../util/when');

const isAdmin = (p) => Boolean(p?.isAdmin || p?.isSuperAdmin);
const TEXT_NAMES = ['name', 'desc'];

// "admins" | "all" (also accepts "all" and "admin", as people say) → true = admins only; another value: null
function readWho(valueAlt) {
    const v = String(valueAlt ?? '').trim().toLowerCase();
    if (['admins', 'admin'].includes(v)) return true;
    if (['all', 'todos', 'everyone'].includes(v)) return false;
    return null;
}

// The name and the description may have spaces: the 1st piece is the option value, the rest falls into argv
const text = (opts, nameAlt) => [opts.opt[nameAlt], ...opts.argv].filter((p) => p != null && p !== '').join(' ').trim();

async function participantName(p) {
    const jid = removeDeviceSuffix(p.id._serialized);
    const phoneAlt = jid.endsWith('@lid') ? await resolveLidToPhone(jid) : jid;
    const contactAlt = await client.getContactById(phoneAlt || jid).catch(() => null);
    const nameAlt = contactName(contactAlt) || t('grp.unknown');
    const numberAlt = phoneAlt?.endsWith('@c.us') ? `+${phoneAlt.split('@')[0]}` : t('grp.hiddenNumber');
    return `${numberAlt} - ${nameAlt}`;
}

const who = (soAdmins) => t(soAdmins ? 'grp.group.admins' : 'grp.group.all');

async function showInfo(msg, group) {
    const meta = group.groupMetadata ?? {};
    const eu = group.participants.find((p) => p.id._serialized === client.info.wid._serialized || p.id.user === client.info.wid.user);
    const owner = group.participants.find((p) => p.isSuperAdmin);
    await msg.reply(t('grp.group.info', {
        name: group.name,
        members: group.participants.length,
        admins: group.participants.filter(isAdmin).length,
        owner: owner ? await participantName(owner) : t('grp.unknown'),
        created: group.createdAt ? fmtWhen(group.createdAt.getTime()) : t('grp.unknown'),
        desc: group.description || t('grp.group.noDesc'),
        send: who(Boolean(meta.announce)),
        edit: who(Boolean(meta.restrict)),
        add: who(meta.memberAddMode === 'admin_add'),
        bot: t(isAdmin(eu) ? 'grp.group.botAdmin' : 'grp.group.botNotAdmin')
    }), null, { linkPreview: false });
}

async function showAdmins(msg, group) {
    const admins = group.participants.filter(isAdmin);
    const linesAlt = [];
    for (const p of admins) linesAlt.push(`${p.isSuperAdmin ? '👑' : '⭐'} ${await participantName(p)}`);
    await msg.reply(t('grp.group.adminList', { name: group.name, n: admins.length, list: linesAlt.join('\n') }));
}

// The photo image: the replied one or the message's own (command in the caption)
async function photoImage(msg, quotedMsg) {
    const origin = quotedMsg?.hasMedia ? quotedMsg : msg.hasMedia ? msg : null;
    const media = await origin?.downloadMedia().catch(() => null);
    return media?.data && String(media.mimetype).startsWith('image/') ? media : null;
}

async function cmdGroup({ msg, opts, quotedMsg, isGroup }) {
    const group = isGroup ? await msg.getChat().catch(() => null) : null;
    if (!group?.isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }

    // The name and the description take the rest of the text: only one of them at a time
    const texts = TEXT_NAMES.filter((n) => opts.given.has(n));
    if (texts.length > 1) {
        await msg.reply(t('grp.group.oneText'));
        return;
    }

    // The values of -send, -edit and -add (admins|all) and of -for
    const actions = [];
    for (const nameAlt of ['send', 'edit', 'add']) {
        if (!opts.given.has(nameAlt)) continue;
        const soAdmins = readWho(opts.opt[nameAlt]);
        if (soAdmins === null) {
            await msg.reply(t('grp.group.badWho', { name: nameAlt, value: opts.opt[nameAlt] ?? '' }));
            return;
        }
        actions.push({ name: nameAlt, soAdmins });
    }
    let ms = null;
    if (opts.given.has('for')) {
        ms = readDuration(opts.opt.for ?? '');
        if (!ms) {
            await msg.reply(t('grp.group.badTime', { value: opts.opt.for ?? '' }));
            return;
        }
        if (!actions.some((a) => a.name === 'send' && a.soAdmins)) {
            await msg.reply(t('grp.group.forNeedsSend'));
            return;
        }
    }

    const changes = actions.length > 0 || opts.given.has('pic') || opts.given.has('rmpic') || texts.length > 0;
    if (!changes && !opts.given.has('admins')) {
        await showInfo(msg, group);
        return;
    }
    if (!changes) {
        await showAdmins(msg, group);
        return;
    }

    const eu = group.participants.find((p) => p.id._serialized === client.info.wid._serialized || p.id.user === client.info.wid.user);
    if (!isAdmin(eu)) {
        await msg.reply(t('grp.group.needAdmin'));
        return;
    }

    const replies = [];
    const attempt = async (label, fn) => {
        try {
            const ok = await fn();
            replies.push(ok === false ? t('grp.group.refused', { what: label }) : null);
            return ok !== false;
        } catch (err) {
            printError(`/group ${label}:`, err.message);
            replies.push(t('grp.group.failed', { what: label, error: err.message }));
            return false;
        }
    };

    if (opts.given.has('name')) {
        const nameAlt = text(opts, 'name');
        if (!nameAlt) {
            await msg.reply(t('grp.group.needText', { name: 'name' }));
            return;
        }
        if (await attempt('name', () => group.setSubject(nameAlt))) replies.push(t('grp.group.nameDone', { name: nameAlt }));
    }
    if (opts.given.has('desc')) {
        // Without text, deletes the description
        const desc = text(opts, 'desc');
        if (await attempt('desc', () => group.setDescription(desc))) replies.push(t(desc ? 'grp.group.descDone' : 'grp.group.descCleared'));
    }
    if (opts.given.has('pic')) {
        const image = await photoImage(msg, quotedMsg);
        if (!image) {
            replies.push(t('grp.group.needImage'));
        } else {
            if (await attempt('pic', () => group.setPicture(new MessageMedia(image.mimetype, image.data)))) replies.push(t('grp.group.picDone'));
        }
    }
    if (opts.given.has('rmpic') && await attempt('rmpic', () => group.deletePicture())) replies.push(t('grp.group.picRemoved'));

    for (const { name: nameAlt, soAdmins } of actions) {
        const fn = { send: 'setMessagesAdminsOnly', edit: 'setInfoAdminsOnly', add: 'setAddMembersAdminsOnly' }[nameAlt];
        if (!(await attempt(nameAlt, () => group[fn](soAdmins)))) continue;

        if (nameAlt === 'send' && soAdmins && ms) {
            await scheduleReopening(group.id._serialized, ms);
            replies.push(t('grp.group.sendLockedFor', { until: fmtWhen(Date.now() + ms) }));
        } else {
            if (nameAlt === 'send') await cancelReopening(group.id._serialized);
            replies.push(t(`grp.group.${nameAlt}Done`, { who: who(soAdmins) }));
        }
    }

    await msg.reply(replies.filter(Boolean).join('\n'));
}

module.exports = { cmdGroup };
