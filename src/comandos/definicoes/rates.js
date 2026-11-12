/*
 * /rates: Currency exchange rates against the real
 */

const { ADMIN, USER } = require('../../roles').ROLES;
const { OPCAO_ALERTA_MSG, OPCAO_ALERTA_RM, OPCAO_ALERTA_TO } = require('./_opcoes');

module.exports = {
    cmd: '/rates',
    usage: '/rates [OPTION] [CURRENCY...]  or  /rates [CURRENCY] -alerta [rule] [-to <target>]... [-msg <text>]  or  /rates -alerta -rm <num...|all>',
    aliases: ['/cotacao', '/cambio'],
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
            opts: ['alerta'],
            values: [],
            desc: 'Without a rule: lists the alerts. With a rule (e.g. USD > 5.30): notifies you in your private chat (or at the -to targets) when the price crosses the value. The currency can also come first: /rates USD -alerta > 5.30. Owner (or an admin) only.',
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
        OPCAO_ALERTA_MSG,
        OPCAO_ALERTA_RM,
        OPCAO_ALERTA_TO
    ],
    role: USER,
    cron: true
};
