/*
 * Comando /help.
 */

const { listAliases } = require('../aliases');
const { ROLES, answer } = require('../roles');
const { activeCommands, findCommand, formatCommandHelp, helpProtocol } = require('./base');
const { locate } = require('./localize');
const { t } = require('../i18n');

// The /help -full order: from the most restricted to the common
const ROLES_IN_HELP = [ROLES.OWNER, ROLES.ADMIN, ROLES.USER];

/*
 * Each sees only what their level reaches (src/roles.js): the owner, everything; an admin (bot.admins), what
 * is not role owner; users (bot.users), only the role user ones, plus the admin ones the owner allowed with
 * /bot +cmd. Showing /backup to whoever cannot use it is like showing the kitchen menu.
 */
async function cmdHelp({ msg, args: typed, opts, nivel: level, admin,
    podeUsar: canUse = (cmd) => findCommand(cmd)?.role === ROLES.USER }) {
    const who = level ?? (admin ? ROLES.ADMIN : ROLES.USER);
    // Admins and the owner: by level; users: by their rule (/bot +cmd)
    const can = (command) => (answer(who, ROLES.ADMIN) ? answer(who, command.role) : canUse(command.cmd));

    // Without the options (-role), what is left is the command and the protocol
    const args = opts ? opts.argv.join(' ') : typed;

    // Reads the requested command and protocol directly, preserving the name with or without "/".
    const [first, ...rest] = args.split(/\s+/);
    let requestedCommand = first;

    // /help /get  |  /help get  |  /help defi orca (only the help for that protocol)
    if (requestedCommand) {
        if (!requestedCommand.startsWith('/')) {
            requestedCommand = `/${requestedCommand}`;
        }

        if (requestedCommand === '/alias') {
            return listAliases(msg, c => can(c) && (admin || Boolean(findCommand(c.cmd))));
        }

        const command = findCommand(requestedCommand);

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
        await msg.reply(`${t('help.title')}\n\n\`\`\`${formatCommandHelp(command, { protocolo: protocol })}\n\`\`\``);
        return;
    }

    // /help alone: one command per line, only with what it does: the command in bold and the description in italics.
    // Outside a code block the line wraps by itself, at the phone width. The formatting symbols
    // from WhatsApp that came in the description are removed, so as not to break the italics.
    const visible = activeCommands().filter(can);
    const line = (c) => {
        const l = locate(c);
        const description = String(l.summary ?? l.help ?? '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
        return `*${c.cmd}* - _${description}_`;
    };
    const list = opts?.opt?.role
        ? ROLES_IN_HELP.map(g => [g, visible.filter(c => c.role === g)]).filter(([, cs]) => cs.length)
            .map(([g, cs]) => `🔸 Role: ${g}\n${cs.map(line).join('\n')}`).join('\n\n')
        : visible.map(line).join('\n');
    const helpText =
        t('help.menuTitle') + (admin ? '' : ` ${t('help.menuUserNote')}`) + '\n\n' +
        list +
        `\n\n${t('help.menuFooter')}`;

    await msg.reply(helpText);
}

module.exports = {
    cmdHelp
};
