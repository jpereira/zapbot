// Aliases for the current group use only the options relevant to the selected action.
const ACTIONS = {
    info: ['/group', 'info'],
    name: ['/group', 'name', '<text>'],
    desc: ['/group', 'desc', '[text]'],
    photo: ['/group', 'pic'],
    'remove-photo': ['/group', 'rmpic'],
    admins: ['/group', 'admins'],
    send: ['/group', 'send', '<admins|all>'],
    edit: ['/group', 'edit', '<admins|all>'],
    add: ['/group', 'add', '<admins|all>'],
    members: ['/members'],
    invite: ['/invite'],
    promote: ['/promote'],
    demote: ['/demote'],
    warn: ['/warn'],
    antilink: ['/antilink'],
    antibadword: ['/antibadword'],
    antitag: ['/antitag'],
    welcome: ['/welcome'],
    goodbye: ['/goodbye'],
    'mention-all': ['/everybody'],
    join: ['/join'],
    leave: ['/leave'],
    list: ['/leave', 'list']
};

function groupCommands(commands) {
    const existing = new Map(commands.map(command => [command.cmd, command]));
    return Object.entries(ACTIONS).flatMap(([name, [target, option, value]]) => {
        const source = existing.get(target);
        if (!source) return [];
        const cmd = `/g.${name}`;
        const groupAction = { source, option, value };
        if (!option) return [{ ...source, cmd, aliases: [], groupAction }];
        const config = source.cmd_opts.find(item => item.opts?.[0] === option);
        const cmdOpts = name === 'send' ? source.cmd_opts.filter(item => item.opts?.[0] === 'for') : [];
        return [{
            cmd, role: source.role, isDelegable: source.isDelegable,
            typing: source.typing, cron: source.cron, aliases: [], strict: true, groupAction,
            usage: [cmd, value, name === 'send' ? '[-for <time>]' : null].filter(Boolean).join(' '),
            summary: config.desc, cmd_opts: cmdOpts
        }];
    });
}

function groupInput(line) {
    const [caller] = line.trim().split(/\s+/);
    const args = line.trim().slice(caller.length).trim();
    const prefix = caller.toLowerCase();
    if (prefix.startsWith('/g.') || prefix.startsWith('/group.')) {
        return { action: prefix.slice(prefix.indexOf('.') + 1), args };
    }
    if (prefix !== '/g' && prefix !== '/group') return null;
    if (prefix === '/group' && args.startsWith('-')) return null;
    if (/^-h(?:elp)?$/i.test(args)) return { menu: true };
    if (!args) return { action: 'info', args: '' };
    const [action] = args.split(/\s+/, 1);
    return { action: action.toLowerCase(), args: args.slice(action.length).trim() };
}

const GROUP_TARGETS = new Set(Object.values(ACTIONS).map(([target]) => target));

module.exports = { GROUP_TARGETS, groupCommands, groupInput };
