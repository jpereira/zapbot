/*
 * /screenshot: A picture of a web page
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/screenshot',
    usage: '/screenshot [-full] [-mobile] [-wait <seconds>] [-pdf] <url>',
    aliases: ['/ss'],
    summary: 'A picture of a web page',
    help: 'Opens the page in the bot\'s own browser and sends a picture of it (the first screen). The address may come without http://, and with no address it uses the first link of the replied message. Only public pages: addresses of the local network are refused, and so is everything the page requests from there. The browser shares nothing with WhatsApp Web (no cookies, no cache). The User-Agent is the screenshot.userAgent setting (empty: the same as the Chromium\'s, without the "Headless").',
    ex: ['/screenshot https://example.com', '/ss -full -mobile example.com', '/ss -pdf -wait 5 https://example.com/report'],
    cmd_opts: [
        {
            opts: ['full', 'f'],
            values: [],
            desc: 'The whole page instead of the first screen (up to 16000 px of height).',
            ex: ['/screenshot -full https://example.com']
        },
        {
            opts: ['mobile', 'm'],
            values: [],
            desc: 'Phone-sized screen (390 x 844), so the site shows its mobile version.',
            ex: ['/screenshot -mobile https://example.com']
        },
        {
            opts: ['wait', 'w'],
            values: ['<seconds>'],
            desc: 'Waits N seconds after the page loads (0 to 30), for animations and content that comes late.',
            ex: ['/screenshot -wait 5 https://example.com']
        },
        {
            opts: ['pdf', 'p'],
            values: [],
            desc: 'Sends a PDF of the page instead of an image.',
            ex: ['/screenshot -pdf https://example.com']
        },
        {
            argv: ['[<url>]'],
            desc: 'The page address, with or without http(s):// (without it, the first link of the replied message).'
        }
    ],
    isDelegable: true,
    role: ADMIN // delegable: opens pages from the owner's server, so it is not for everyone by default
};
