/*
 * Who uses the common commands, and which ones: bot.users (the people, the groups and
 * the people only in a group) and bot.users.cmds (each one's rule, from /bot
 * +cmd|-cmd). Without a rule, all the common ones; with a rule, only those on the list ("Only")
 * or all except those on the list ("All, except"). /help, /whois and /usage always pass.
 *
 * Users (+u) use the `role: USER` commands. A `role: ADMIN` with `isDelegable: true` only reaches
 * to a user cited in an "Only" (/bot +cmd): an "All, except" or bot.users = true does not
 * allow. The rest (admin without isDelegable, owner) belongs only to whoever has the level (src/roles.js).
 */

const { botConfig } = require('./botConfig');
const { groupCommands } = require('./commands/groupNamespace');
const { t } = require('./i18n');
const { ROLES } = require('./roles');
const { getSetting, setSetting } = require('./settings');

const KEY = 'bot.users.cmds';
const ALWAYS_RELEASED = ['/help', '/whois', '/usage'];

const command = (cmd) => (cmd?.startsWith('/g.') ? groupCommands(botConfig.commands) : botConfig.commands)
    .find(c => c.cmd === cmd);

// A user can receive the command through a +cmd: admin and delegable
const isDelegable = (cmd) => {
    const c = command(cmd);
    return c?.role === ROLES.ADMIN && Boolean(c.isDelegable);
};

// "5521...=/a,/b" → { only: true, commands: ['/a', '/b'] }; "...=!/a" → { only: false }
function readLine(line) {
    const i = line.lastIndexOf('=');
    const valueAlt = line.slice(i + 1);
    const only = !valueAlt.startsWith('!');
    return [line.slice(0, i), { only, commands: (only ? valueAlt : valueAlt.slice(1)).split(',') }];
}

// item → the rule; without a rule: null (all the common ones)
const rules = () => new Map(getSetting(KEY).map(readLine));
const ruleOf = (item) => rules().get(item) ?? null;

/**
 * Saves (or deletes, with null) the item's rule.
 * @param {string} item
 * @param {{ only: boolean, commands: string[] } | null} rule
 */
async function recordRule(item, rule) {
    const other = getSetting(KEY).filter(l => readLine(l)[0] !== item);
    const line = rule ? [`${item}=${rule.only ? '' : '!'}${rule.commands.join(',')}`] : [];
    await setSetting(KEY, [...other, ...line]);
}

// A rule deixa usar o command?
const allows = (rule, cmd) => !rule || ALWAYS_RELEASED.includes(cmd) ||
    (rule.only ? rule.commands.includes(cmd) : !rule.commands.includes(cmd));

// "Only: /a, /b" or "All, except: /a"
const describeRule = (rule) =>
    `${t(rule.only ? 'grp.perm.only' : 'grp.perm.allBut')}: ${rule.commands.join(', ')}`;

/**
 * What whoever sent can do in this chat: the bot.users entries that allow it
 * here (the phone, "phone:group" and the group) and their rules. The most
 * broad: an entry with no rule lets all the common ones in.
 * @returns {{ allowed: boolean, onlyInGroups: string[], rules: object[], can: Function }}
 * soInGroups: the groups where the person only has permission there (the private chat notice)
 * rules: those that limit here ([] = all the common ones)
 */
function permissionHere({ number: numberAlt, chatId, isGroup }) {
    const users = getSetting('bot.users');
    const soInGroups = numberAlt
        ? users.filter(u => u.startsWith(`${numberAlt}:`)).map(u => u.slice(u.indexOf(':') + 1))
        : [];

    if (users.includes('all')) {
        return { allowed: true, onlyInGroups: soInGroups, rules: [], can: (cmd) => (command(cmd)?.role ?? ROLES.USER) === ROLES.USER };
    }

    const inputs = [numberAlt, isGroup && `${numberAlt}:${chatId}`, isGroup && chatId]
        .filter(e => e && users.includes(e));
    if (!inputs.length) return { allowed: false, onlyInGroups: soInGroups, rules: [], can: () => false };

    const allAlt = inputs.map(ruleOf);
    const limit = allAlt.some(r => !r) ? [] : allAlt;
    return {
        allowed: true,
        onlyInGroups: soInGroups,
        rules: limit,
        can: (cmd) => {
            const entry = command(cmd);
            const role = entry?.role ?? ROLES.USER;
            if (role === ROLES.OWNER || (role === ROLES.ADMIN && !isDelegable(cmd))) return false;
            // delegable: only if some rule cites it (+cmd); without a rule or an "All, except" is not enough
            if (role === ROLES.ADMIN) return allAlt.some(r => r?.only
                && (r.commands.includes(cmd) || r.commands.includes(entry.groupAction?.source.cmd)));
            return !limit.length || limit.some(r => allows(r, cmd));
        }
    };
}

/**
 * The typist's level: owner (the bot account), admin (bot.admins), user (bot.users, here) or
 * null (nobody: the bot ignores).
 */
function levelAlt({ fromMe, number: numberAlt, permission }) {
    if (fromMe) return ROLES.OWNER;
    if (numberAlt && getSetting('bot.admins').includes(numberAlt)) return ROLES.ADMIN;
    return permission.allowed ? ROLES.USER : null;
}

// The notice for whoever used a command outside the rule
function limitNotice(rulesThatLimit, cmd) {
    if (rulesThatLimit.every(r => r.only)) {
        const commands = [...new Set(rulesThatLimit.flatMap(r => r.commands))];
        return t('grp.perm.limited', { list: commands.join(', ') });
    }
    return t('grp.perm.notAllowed', { cmd });
}

module.exports = {
    ALWAYS_RELEASED,
    isDelegable,
    levelAlt,
    limitNotice,
    describeRule,
    recordRule,
    permissionHere,
    allows,
    ruleOf
};
