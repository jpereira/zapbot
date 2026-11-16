/*
 * /rates: Currency exchange rates against the real
 */

const { ADMIN, USER } = require('../../roles').ROLES;
const { OPTION_ALERT_MSG, OPTION_ALERT_RM, OPTION_ALERT_TO } = require('./_options');

module.exports = {
    cmd: '/rates',
    usage: '/rates [OPTION] [CURRENCY...]  or  /rates [CURRENCY] -alert [rule] [-to <target>]... [-msg <text>]  or  /rates -alert -rm <num...|all>',
    aliases: [],
    summary: 'Currency exchange rates against the Brazilian real',
    help: 'Exchange rates against the real for the enabled currencies (default: EUR and USDT): current, open, previous close, high/low and change.',
    cmd_opts: [
        {
            opts: ['add', 'a'],
            values: ['<CURRENCY>'],
            desc: 'Enables a supported currency. Owner (or an admin) only.',
            cron: false,
            role: ADMIN
        },
        {
            opts: ['alert'],
            values: [],
            desc: 'Without a rule: lists the alerts. With a rule (e.g. USD > 5.30): notifies you in your private chat (or at the -to targets) when the price crosses the value. The currency can also come first: /rates USD -alert > 5.30. Owner (or an admin) only.',
            cron: false
        },
        {
            opts: ['del', 'd'],
            values: ['<CURRENCY>'],
            desc: 'Disables a currency. Owner (or an admin) only.',
            cron: false,
            role: ADMIN
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the supported currencies and which ones are enabled.'
        },
        OPTION_ALERT_MSG,
        OPTION_ALERT_RM,
        OPTION_ALERT_TO
    ],
    role: USER,
    cron: true
};
