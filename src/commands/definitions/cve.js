/*
 * /cve: Recent CVEs from the NVD
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/cve',
    usage: '/cve [<id>|<text>] [-highscore [max]]',
    summary: 'Recent CVEs from the NVD',
    help: 'CVEs published in the last two days on the NVD, newest first (count: cve.max). With -highscore, the window is cve.maxDays. With an id, looks up that CVE; with a text, searches the most recent ones that mention it.',
    ex: ['/cve CVE-2026-1234', '/cve 2026-1234', '/cve kernel 2.4.5', '/cve -high 3'],
    cmd_opts: [
        {
            opts: ['highscore', 'high'],
            values: ['[max]'],
            desc: 'Only critical ones with CVSS v3 severity CRITICAL (score ≥ 9), from the last cve.maxDays days. Count from 1 to 20, default cve.max. CVEs with only v4 or v2 metrics are left out of the filter.',
            ex: ['/cve -high 5']
        },
        {
            argv: ['<id|text>'],
            desc: 'An id looks up that CVE on the NVD (with or without the CVE- prefix); any other text searches the descriptions and lists up to cve.max, newest first.',
            ex: ['/cve CVE-2026-1234', '/cve 2026-1234', '/cve PHP longjmp']
        }
    ],
    role: USER,
    cron: true
};
