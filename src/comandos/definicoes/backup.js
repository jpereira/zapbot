/*
 * /backup: Backup do banco: lista, detalha, restaura, envia ou apaga
 */

const { BACKUP_DIR } = require('../../constantes');
const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/backup',
    usage: '/backup [OPTION]',
    aliases: ['/bkp'],
    summary: 'Database backup: lists, details, restores, sends or deletes',
    help: `Database backup in ${BACKUP_DIR}: one automatic per day, and you can list, detail, restore, send or delete. The daily backup is also sent to the destination in the backup.to setting (contact, group, number or email, as in -to), without asking for -sim; if empty, it only saves locally. With no option, shows the current database and the backups.`,
    cmd_opts: [
        {
            opts: ['info', 'i'],
            values: ['<no.>'],
            desc: 'Details of backup no. N: date, reason, version and the entries of each table, compared with the current database.'
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the backups, from newest to oldest.'
        },
        {
            opts: ['now', 'n'],
            values: [],
            desc: 'Creates a backup now (manual: kept until deleted).'
        },
        {
            opts: ['restore', 'r'],
            values: ['<no.|name>'],
            desc: 'Restores the backup (asks for confirmation with -sim). First, backs up the current state.'
        },
        { opts: ['rm'], values: ['<no.|all>'], desc: 'Deletes backup no. N (or all).' },
        {
            opts: ['send', 's'],
            values: ['[no.]'],
            desc: 'Sends the backup file (without a no.: the latest) to your private chat or to the -to destinations.'
        },
        {
            opts: ['sim'],
            values: [],
            desc: 'Confirms: with -restore, the restore; with -send -to another chat, the sending (the database has the messages of all chats).'
        },
        {
            opts: ['to'],
            values: ['<destination>'],
            desc: 'With -send: by email, as an attachment (email = the QRCODE_EMAIL_SMTP_TO), or to another chat: a contact, a mention, a group or a number (asks for -sim). Repeat for several.',
            ex: [
                '-to email',
                '-to you@example.com',
                '-to /Jorge Pereira/',
                '-to @John (mention)',
                '-to /Grupo L200/',
                '-to +5521999999999'
            ]
        }
    ],
    role: ADMIN // mexe no banco inteiro
};
