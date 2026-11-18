/*
 * /call: Rejects voice and video calls and replies with a message
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/call',
    usage: '/call [-on|-off] [-msg <text|off|reset>] [-allow|-deny|-rm <person...>]',
    summary: 'Rejects voice and video calls and replies with a message',
    help: 'Rejects the voice and video calls that reach the bot account and replies once with a message (at most one every 10 minutes per person). Without an option, shows how it is: on or off, the message, who always rings and who is always rejected. The calls of the bot admins and of the people in the allowed list always ring; the ones of the people in the denied list (-deny) are always rejected, even with the rejection off, with a message of their own. Same as the settings call.reject, call.message and call.allow.',
    cmd_opts: [
        { opts: ['on'], values: [], desc: 'Turns the rejection on (setting call.reject).', cron: false },
        { opts: ['off'], values: [], desc: 'Turns the rejection off: the calls ring again.', cron: false },
        {
            opts: ['msg', 'm'],
            values: ['<text|off|reset>'],
            desc: 'The message sent to whoever had the call rejected (setting call.message). With off, it rejects in silence; with reset, it brings back the default text. Together with -deny, it is the message of those people only.',
            ex: ['/call -msg I do not take calls here, send a message or an audio', '/call -msg off'],
            cron: false
        },
        {
            opts: ['allow', 'a'],
            values: ['<person...>'],
            desc: 'People whose calls always ring (setting call.allow): /name/, @mention or +number.',
            ex: ['/call -allow /Maria Lucia/'],
            cron: false
        },
        {
            opts: ['deny', 'd'],
            values: ['<person...>'],
            desc: 'People whose calls are always rejected, even with the rejection off: /name/, @mention or +number. With -msg, the message is theirs; without it, a default text for the denied ones.',
            ex: ['/call -deny /Fulano/ +5521977777777', '/call -deny /Fulano/ -msg "I do not want to talk now!"'],
            cron: false
        },
        {
            opts: ['rm', 'r'],
            values: ['<person...>'],
            desc: 'Takes the people off the two lists (the ones whose calls always ring and the ones always rejected).',
            ex: ['/call -rm /Maria Lucia/'],
            cron: false
        }
    ],
    role: ADMIN // the bot account is the owner's
};
