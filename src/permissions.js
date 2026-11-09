/*
 * Who uses the common commands, and which ones: bot.users (the people, the groups and
 * the people only in a group) and bot.users.cmds (each one's rule, from /bot
 * +cmd|-cmd). Without a rule, all the common ones; with a rule, only those on the list ("Only")
 * or all except those on the list ("All, except"). /help and /whois always pass.
 *
 * The commands' role (the "role" in commands.json): user (common), admin (only the owner
 * and bot.admins, but delegable: it must be cited in an "Only", /bot +cmd) and
 * owner (never delegable). An "All, except" or bot.users = true do not allow admin.
 */

const { botConfig } = require('./botConfig');
const { getSetting, setSetting } = require('./settings');

const KEY = 'bot.users.cmds';
const ALWAYS_RELEASED = ['/help', '/whois'];

// Delegated (admin role) operates only in the current chat: seeing other chats belongs to the owner and the admins
const SO_OWNER_OTHER_CHATS = '⛔ Apenas o dono do bot (ou um admin) pode ver outros chats.';

const roleDe = (cmd) => botConfig.commands.find(c => c.cmd === cmd)?.role ?? 'user';

// "5521...=/a,/b" → { apenas: true, comandos: ['/a', '/b'] }; "...=!/a" → { apenas: false }
function readLine(line) {
    const i = line.lastIndexOf('=');
    const valueAlt = line.slice(i + 1);
    const only = !valueAlt.startsWith('!');
    return [line.slice(0, i), { apenas: only, comandos: (only ? valueAlt : valueAlt.slice(1)).split(',') }];
}

// item → the rule; without a rule: null (all the common ones)
const rules = () => new Map(getSetting(KEY).map(readLine));
const regraDe = (item) => rules().get(item) ?? null;

/**
 * Saves (or deletes, with null) the item's rule.
 * @param {string} item
 * @param {{ apenas: boolean, comandos: string[] } | null} regra
 */
async function recordRule(item, rule) {
    const other = getSetting(KEY).filter(l => readLine(l)[0] !== item);
    const line = rule ? [`${item}=${rule.apenas ? '' : '!'}${rule.comandos.join(',')}`] : [];
    await setSetting(KEY, [...other, ...line]);
}

// A regra deixa usar o comando?
const allows = (rule, cmd) => !rule || ALWAYS_RELEASED.includes(cmd) ||
    (rule.apenas ? rule.comandos.includes(cmd) : !rule.comandos.includes(cmd));

// "Only: /a, /b" or "All, except: /a"
const describeRule = (rule) =>
    `${rule.apenas ? 'Apenas' : 'Todos, menos'}: ${rule.comandos.join(', ')}`;

/**
 * What whoever sent can do in this chat: the bot.users entries that allow it
 * here (the phone, "phone:group" and the group) and their rules. The most
 * broad: an entry with no rule lets all the common ones in.
 * @returns {{ liberado: boolean, soNosGrupos: string[], regras: object[], pode: Function }}
 * soInGroups: the groups where the person only has permission there (the private chat notice)
 * rules: those that limit here ([] = all the common ones)
 */
function permissionHere({ numero: numberAlt, chatId, isGroup }) {
    const users = getSetting('bot.users');
    const soInGroups = numberAlt
        ? users.filter(u => u.startsWith(`${numberAlt}:`)).map(u => u.slice(u.indexOf(':') + 1))
        : [];

    if (users.includes('all')) {
        return { liberado: true, soNosGrupos: soInGroups, regras: [], pode: (cmd) => roleDe(cmd) === 'user' };
    }

    const inputs = [numberAlt, isGroup && `${numberAlt}:${chatId}`, isGroup && chatId]
        .filter(e => e && users.includes(e));
    if (!inputs.length) return { liberado: false, soNosGrupos: soInGroups, regras: [], pode: () => false };

    const allAlt = inputs.map(regraDe);
    const limit = allAlt.some(r => !r) ? [] : allAlt;
    return {
        liberado: true,
        soNosGrupos: soInGroups,
        regras: limit,
        pode: (cmd) => {
            const role = roleDe(cmd);
            if (role === 'owner') return false;
            // admin: only if some rule cites it (+cmd); a missing rule or an "All, except" is not enough
            if (role === 'admin') return allAlt.some(r => r?.apenas && r.comandos.includes(cmd));
            return !limit.length || limit.some(r => allows(r, cmd));
        }
    };
}

// The notice for whoever used a command outside the rule
function limitNotice(rulesThatLimit, cmd) {
    if (rulesThatLimit.every(r => r.apenas)) {
        const commands = [...new Set(rulesThatLimit.flatMap(r => r.comandos))];
        return `🚫 Limitado aos comandos: ${commands.join(', ')}.`;
    }
    return `🚫 O ${cmd} não está liberado para você.`;
}

module.exports = {
    ALWAYS_RELEASED,
    SO_OWNER_OTHER_CHATS,
    roleDe,
    limitNotice,
    describeRule,
    recordRule,
    permissionHere,
    allows,
    regraDe
};
