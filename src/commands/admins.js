/*
 * /promote and /demote commands: gives and takes admin from someone in the group (the bot must be an admin of it).
 * /promote @Fulano            → /Name/, @mention or +number (several: you choose from the list)
 * /promote, replying       → who wrote the replied message
 */

const { readPerson, textPeople, withoutDelimiters } = require('./block');
const { client } = require('../client');
const { resolveLidToPhone } = require('../contacts');
const { t } = require('../i18n');
const { printError } = require('../log');

// The group participant who is this person (the group id may be their @lid)
async function participantAlt(group, id) {
    const user = id.split('@')[0];
    const direct = group.participants.find(p => p.id._serialized === id || p.id.user === user);
    if (direct) return direct;

    for (const p of group.participants.filter(p => p.id._serialized.endsWith('@lid'))) {
        if ((await resolveLidToPhone(p.id._serialized).catch(() => null)) === id) return p;
    }
    return null;
}

async function changeAdmin(promote, { msg, opts, quotedMsg, isGroup }) {
    const cmd = promote ? '/promote' : '/demote';
    const group = isGroup ? await msg.getChat().catch(() => null) : null;
    if (!group?.isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }

    const eu = await participantAlt(group, client.info.wid._serialized);
    if (!eu?.isAdmin && !eu?.isSuperAdmin) {
        await msg.reply(t('grp.admin.botNotAdmin'));
        return;
    }

    const textAlt = opts.argv.join(' ').trim();
    if (!textAlt && !quotedMsg) {
        await msg.reply(t('grp.admin.usage', { cmd }));
        return;
    }

    const items = textAlt ? textPeople(textAlt) : [''];
    const seen = new Set();
    for (const item of items) {
        const person = await readPerson(msg, withoutDelimiters(item), item ? null : quotedMsg, cmd);
        if (!person || seen.has(person.id)) continue;
        seen.add(person.id);

        const target = await participantAlt(group, person.id);
        if (!target) {
            await msg.reply(t('grp.admin.notMember', { name: person.nome }));
            continue;
        }
        if (promote && (target.isAdmin || target.isSuperAdmin)) {
            await msg.reply(t('grp.admin.alreadyAdmin', { name: person.nome }));
            continue;
        }
        if (!promote && !target.isAdmin && !target.isSuperAdmin) {
            await msg.reply(t('grp.admin.notAdmin', { name: person.nome }));
            continue;
        }
        if (!promote && target.isSuperAdmin) {
            await msg.reply(t('grp.admin.creator', { name: person.nome }));
            continue;
        }

        try {
            const r = promote
                ? await group.promoteParticipants([target.id._serialized])
                : await group.demoteParticipants([target.id._serialized]);
            if (r?.status && r.status !== 200) throw new Error(`status ${r.status}`);
            await msg.reply(t(promote ? 'grp.admin.promoted' : 'grp.admin.demoted', { name: person.nome }));
        } catch (err) {
            printError(`${cmd}:`, err.message);
            await msg.reply(t('grp.admin.failed', { name: person.nome, error: err.message }));
        }
    }
}

const cmdPromote = (ctx) => changeAdmin(true, ctx);
const cmdDemote = (ctx) => changeAdmin(false, ctx);

module.exports = { cmdDemote, cmdPromote };
