/*
 * Comando /help.
 */

const { aliasesFor, listAliases } = require('../aliases');
const { ROLES, answer } = require('../roles');
const { activeCommands, activeGroupCommands, findCommand, formatCommandHelp, helpProtocol, resolveGroupInput } = require('./base');
const { GROUP_TARGETS } = require('./groupNamespace');
const { locate } = require('./localize');
const { t } = require('../i18n');

// Role view order, from the most restricted to the common.
const ROLES_IN_HELP = [ROLES.OWNER, ROLES.ADMIN, ROLES.USER];

const CATEGORIES = {
    media: 'ascii carbon get giphy meme pixelart screenshot sticker stt tts',
    ai: 'draw gpt ocr tldr translate',
    finance: 'bills crypto defi stocks',
    admin: 'alias backup batch block bot cache call contacts cron debug forward monitor mute search set show status unblock unmute watch web'
};
const GROUP_SECTIONS = {
    configuration: 'info name desc photo remove-photo admins send edit add',
    participants: 'members invite promote demote mention-all',
    moderation: 'warn antilink antibadword antitag',
    greetings: 'welcome goodbye',
    participation: 'join leave list'
};
const CATEGORY_NAMES = ['groups', 'media', 'ai', 'finance', 'tools', 'admin', 'aliases'];
const CATEGORY_ALIASES = { g: 'groups', group: 'groups', mod: 'moderation' };

const oneLine = value => String(value).replace(/\s+/g, ' ').trim();
const description = command => {
    const localized = locate(command);
    return oneLine(String(localized.summary ?? localized.help ?? '').replace(/[*_~`]/g, ''));
};
const listLine = command => `${command.cmd} · ${description(command)}`;
const heading = key => `*${t(`help.category.${key}`)}*`;
const section = (title, entries) => entries.length
    ? `${title}\n${entries.join('\n')}`
    : '';

function commandCategories(can) {
    const groups = activeGroupCommands().filter(can);
    const lists = { groups, media: [], ai: [], finance: [], tools: [], admin: [] };
    for (const cmd of activeCommands().filter(can)) {
        if (GROUP_TARGETS.has(cmd.cmd)) continue;
        const kind = Object.keys(CATEGORIES).find(key => CATEGORIES[key].split(' ').includes(cmd.cmd.slice(1)));
        lists[kind ?? 'tools'].push(cmd);
    }
    return lists;
}

function groupSection(commands, onlyModeration = false) {
    const sections = Object.entries(GROUP_SECTIONS)
        .filter(([key]) => !onlyModeration || key === 'moderation')
        .map(([key, names]) => section(heading(key), commands
            .filter(cmd => names.split(' ').includes(cmd.cmd.slice(3))).map(listLine)))
        .filter(Boolean);
    if (!sections.length) return '';
    return [onlyModeration ? null : heading('groups'), ...sections, t('help.groupActionTip')]
        .filter(Boolean).join('\n\n');
}

async function cmdHelp({ msg, args: typed, opts, level, admin,
    canUse = (cmd) => findCommand(cmd)?.role === ROLES.USER }) {
    const who = level ?? (admin ? ROLES.ADMIN : ROLES.USER);
    // Admins and the owner: by level; users: by their rule (/bot +cmd)
    const can = (command) => (answer(who, ROLES.ADMIN) ? answer(who, command.role) : canUse(command.cmd));

    // Without the options (-role), what is left is the command and the protocol
    const args = opts ? opts.argv.join(' ') : typed;

    // Reads the requested command and protocol directly, preserving the name with or without "/".
    const [first, ...rest] = args.split(/\s+/);
    let requestedCommand = first;

    const requestedCategory = !rest.length && (CATEGORY_ALIASES[first] ?? first);
    const isCategory = CATEGORY_NAMES.includes(requestedCategory) || requestedCategory === 'moderation';
    if (isCategory && requestedCategory === 'aliases') {
        return listAliases(msg, c => can(c) && Boolean(findCommand(c.cmd)));
    }
    if (isCategory) {
        const categories = commandCategories(can);
        const text = requestedCategory === 'groups' || requestedCategory === 'moderation'
            ? groupSection(categories.groups, requestedCategory === 'moderation')
            : section(heading(requestedCategory), categories[requestedCategory].map(listLine));
        return msg.reply(text || t('help.emptyCategory'));
    }

    // /help /get  |  /help get  |  /help defi orca (only the help for that protocol)
    if (requestedCommand) {
        if (!requestedCommand.startsWith('/')) {
            requestedCommand = `/${requestedCommand}`;
        }

        if (requestedCommand === '/alias') {
            return listAliases(msg, c => can(c) && (admin || Boolean(findCommand(c.cmd))));
        }

        if (['/g', '/group'].includes(requestedCommand) && !rest.length) {
            return msg.reply(groupSection(activeGroupCommands().filter(can)) || t('help.emptyCategory'));
        }

        const grouped = resolveGroupInput([requestedCommand, ...rest].join(' '));
        if (grouped?.candidates) {
            const possible = grouped.candidates.filter(can).map(entry => entry.cmd);
            return msg.reply(possible.length
                ? t('mensagens.ambiguo', { caller: requestedCommand, list: possible.join(', ') })
                : t('help.notFound', { cmd: requestedCommand }));
        }
        const command = grouped?.command ?? findCommand(requestedCommand);

        if (!command) {
            await msg.reply(t('help.notFound', { cmd: requestedCommand }));
            return;
        }

        if (!can(command)) {
            await msg.reply((command.role !== ROLES.USER
                ? t('help.restricted', { cmd: command.cmd, e: command.role === ROLES.OWNER ? '' : t('help.andAdmins') })
                : t('help.notAllowed', { cmd: command.cmd })) +
                `\n${t('help.seeAllowed')}`);
            return;
        }

        const protocol = helpProtocol(command, rest);
        await msg.reply(`${t('help.title')}\n\n\`\`\`${formatCommandHelp(command, { protocol })}\n\`\`\``);
        return;
    }

    const categories = commandCategories(can);
    const title = t('help.menuTitle') + (admin ? '' : ` ${t('help.menuUserNote')}`);
    if (opts?.opt?.role) {
        const commands = Object.values(categories).flat();
        const list = ROLES_IN_HELP.map(role => {
            const entries = commands.filter(command => command.role === role)
                .sort((a, b) => a.cmd.localeCompare(b.cmd));
            return section(`🔸 Role: ${role}`, entries.map(listLine));
        }).filter(Boolean);
        return msg.reply([title, ...list, t('help.menuFooter')].join('\n\n'));
    }

    if (opts?.opt?.full) {
        const blocks = CATEGORY_NAMES.map(key => {
            if (key === 'groups') return groupSection(categories.groups);
            if (key === 'aliases') {
                const command = findCommand('/alias');
                return command && can(command) ? section(heading(key), [
                    `${t('help.aliasesHint')} */alias -l*`
                ]) : '';
            }
            return section(heading(key), categories[key].map(listLine));
        }).filter(Boolean);
        return msg.reply([title, ...blocks, t('help.menuFooter')].join('\n\n'));
    }

    const aliases = await aliasesFor(c => can(c) && Boolean(findCommand(c.cmd)), { owner: Boolean(msg.fromMe) });
    const menu = CATEGORY_NAMES.filter(key => key === 'aliases' ? aliases.length : categories[key].length)
        .map(key => `/help ${key} · ${t(`help.categoryHint.${key}`)}`);
    const exampleGroup = categories.groups.find(cmd => cmd.cmd === '/g.warn') ?? categories.groups[0];
    const examples = [
        categories.groups.some(cmd => GROUP_SECTIONS.moderation.split(' ').includes(cmd.cmd.slice(3)))
            ? '/help mod' : null,
        exampleGroup ? `/help ${exampleGroup.cmd}` : null,
        categories.tools.some(cmd => cmd.cmd === '/calendar') ? '/help /calendar' : null
    ].filter(Boolean);
    return msg.reply([
        title, menu.join('\n'), t('help.views'),
        examples.length ? section(heading('examples'), examples) : null,
        t('help.menuFooter')
    ].filter(Boolean).join('\n\n'));
}

module.exports = {
    cmdHelp
};
