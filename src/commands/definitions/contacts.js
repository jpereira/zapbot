/*
 * /contacts: Exports your WhatsApp address book as a vCard with the profile photos
 */

const { CONTACTS_DIR } = require('../../constants');
const { OWNER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/contacts',
    usage: '/contacts [OPTION] [filter...]',
    aliases: [],
    summary: 'Exports the address book as a vCard with profile photos',
    help: `Exports your address book as a single vCard 3.0 file (.vcf) with name, number, company and about of every contact (add -p for the profile photos too), ready to import on Android (Google Contacts) and iPhone. The UID is fixed per number, so importing again updates instead of duplicating, when the phone matches by UID. With -p the photos are kept in ${CONTACTS_DIR} (and in the backup) so the next export does not download them again; see contacts.cache, contacts.cacheDays and contacts.delayMs in /set. Only in your own private chat.`,
    ex: ['/contacts', '/contacts -e', '/contacts -e -p', '/contacts -e /Ana/'],
    cmd_opts: [
        {
            opts: ['export', 'e'],
            values: [],
            desc: 'Generates the .vcf with all the contacts of the address book (or only the ones matching the filter) and sends it here, as text only: name, number, company and about.',
            ex: ['/contacts -e', '/contacts -e Silva']
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the contacts (name and number).',
            ex: ['/contacts -l Ana']
        },
        {
            opts: ['photos', 'p'],
            values: [],
            desc: 'With -e: includes the profile photos (slow: one download per contact, with a pause; cached in cache/contacts).',
            ex: ['/contacts -e -p']
        },
        {
            opts: ['nocache', 'n'],
            values: [],
            desc: 'With -e -p: downloads the photos for this export only, without reading or saving cache/contacts.'
        },
        {
            opts: ['refresh', 'r'],
            values: [],
            desc: 'With -e -p: downloads the photos again, ignoring the cache.'
        },
        {
            opts: ['clear', 'c'],
            values: [],
            desc: 'Deletes the photos saved in cache/contacts.'
        },
        {
            argv: ['[filter...]'],
            desc: 'Part of the name or of the number, to narrow down the contacts; several at once with /Name/ (a contact matching any of them is included). Without it, all of them.',
            ex: ['/contacts -l 5521', '/contacts -e /Jorge Pereira/ /Maria Lucia/']
        }
    ],
    role: OWNER // the whole schedule: owner only, in their own private chat (checked in the command)
};
