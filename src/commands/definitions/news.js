/*
 * /news: Latest headlines from the RSS feeds
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/news',
    usage: '/news <-hack|-g1|-gazeta|-brasil> [count]',
    aliases: ['/noticias'],
    summary: 'Latest headlines from the RSS feeds',
    help: 'Latest headlines from the RSS feeds, with source, date and link. Categories can be combined: /news -g1 -gazeta. Feeds for each one in the setting news.<category>.',
    cmd_opts: [
        {
            opts: ['hack', 'hacknews'],
            values: [],
            desc: 'Hacking/security: The Hacker News, BleepingComputer, Krebs.'
        },
        { opts: ['g1'], values: [], desc: 'g1 (latest news).' },
        { opts: ['gazeta', 'gaz'], values: [], desc: 'Gazeta do Povo (Brazil).' },
        {
            opts: ['brasil', 'br'],
            values: [],
            desc: 'Blogs about Brazil listed on feedspot (mostly in English).'
        },
        {
            argv: ['count'],
            desc: 'Headlines, from 1 to 10 (default: setting news.max, 5).',
            ex: ['/news -hack 3']
        }
    ],
    role: USER,
    cron: true
};
