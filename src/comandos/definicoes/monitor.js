/*
 * /monitor: Monitora contatos, um por vez
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/monitor',
    usage: '/monitor [-add <contact> [-alerta] | -alerta <contact> | -rm <id, contact or all> | -list [contact]]',
    summary: 'Monitors contacts, one at a time',
    help: '👀 Monitors up to monitor.max contacts, one at a time, in random order and waiting 1 to 15 s between checks. The minimum interval per contact is monitor.pool seconds (default: 300 s). Keeps up to monitor.maxRecords distinct times per contact (default: 30), without guaranteeing every access or a cache update. More contacts and short intervals may contribute to a WhatsApp block; no interval guarantees safety. /set monitor.enabled false pauses without deleting.',
    ex: ['/monitor -a /Jorge Chip L200/', '/monitor -r 1', '/monitor -l.'],
    cmd_opts: [
        {
            opts: ['add', 'a'],
            values: ['<contact>'],
            desc: 'Registers a person by address book name, /name with spaces/, real mention or number with country and area code. Ambiguous names offer a choice; groups and emails are not accepted.',
            ex: ['-a /Jorge Chip L200/', '-a @Fulano', '-a +5521999999999']
        },
        {
            opts: ['alerta'],
            values: [],
            desc: 'Alerts you when the contact comes online (with -add, or alone on a registered one).',
            ex: [
                '-add /Maria/ -alerta',
                '-alerta /Maria/. Alerts once per observed transition; does not guarantee every access.'
            ]
        },
        {
            opts: ['rm', 'r'],
            values: ['<id, contact or all>'],
            desc: 'Removes by the id shown in /monitor or /monitor -list, or by the same parser as registration: address book name, /name with spaces/, real mention or phone. Use -rm all or -r all to delete all registrations and local histories. Deletes the registration\'s local history; the other ids are not renumbered.',
            ex: ['-rm all', '-r 1', '-rm /Jorge Chip L200/', '-r @Fulano', '-r +5521999999999']
        },
        {
            opts: ['list', 'l'],
            values: ['[contact]'],
            desc: 'Filters only the monitored list, without searching the address book. Name or /name/ searches fragments, case- and accent-insensitive; shows all matching registrations. Also accepts a mention, phone or id. Without a filter, lists all. Shows interval, online alert, last check and up to monitor.maxRecords times per contact. A long history is sent as a text file.',
            ex: ['-l Maria', '-l /Maria/', '-l +5521999999999']
        }
    ],
    role: ADMIN, // vigia contatos
    cron: false
};
