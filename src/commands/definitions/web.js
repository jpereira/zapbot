const { OWNER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/web',
    aliases: [],
    usage: '/web [OPTION]',
    summary: 'Manage the web interface and its sessions',
    help: 'In your private chat, manage web access, revoke sessions and set up two-factor login.',
    role: OWNER,
    typing: false,
    strict: true,
    cmd_opts: [
        { opts: ['list', 'l'], values: [], desc: 'List active sessions and their expiration.', cron: false },
        { opts: ['destroy', 'd'], values: ['[id]'], desc: 'Revoke one session or all without an ID.', cron: false },
        { opts: ['enable', 'e'], values: [], desc: 'Enable and start the web interface.', cron: false },
        { opts: ['disable', 'off'], values: [], desc: 'Stop the web interface and revoke sessions.', cron: false },
        { opts: ['pass', 'p'], values: ['<password...>'], desc: 'Set the web password.', cron: false },
        { opts: ['login'], values: ['<name>'], desc: 'Set the web login name.', cron: false },
        { opts: ['2fa', 'totp'], values: ['<new|qr|code|off>'], desc: 'Set up, show, confirm or disable 2FA.', cron: false }
    ]
};
