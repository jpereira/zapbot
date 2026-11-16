/*
 * /status: Posts on your WhatsApp Status
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/status',
    usage: '/status <text>  or  send/reply to a photo or video with /status [caption]',
    aliases: [],
    summary: 'Posts on your WhatsApp Status (text, photo or video)',
    help: 'Posts on the WhatsApp Status of the bot\'s account: a text (up to 700 characters) or, replying to a photo or video (or sending it with /status in the caption), the media with the text as caption. ⚠️ Risk: posting too many times in a row is what WhatsApp punishes with a ban; from status.warnAfter posts in 24 hours the bot warns you. To schedule: /cron 8h -r d -status Good morning! {/weather}.',
    ex: ['/status Good morning!', '/status (replying to a photo) Weekend!', '/cron 8h -r d -status Good morning! {/weather}'],
    cmd_opts: [
        {
            argv: ['<text>'],
            desc: 'The text of the Status (up to 700 characters) or the caption of the photo/video.',
            ex: ['/status Good morning!'],
            cron: false
        }
    ],
    role: ADMIN,
    cron: false
};
