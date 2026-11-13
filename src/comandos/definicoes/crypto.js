/*
 * /crypto: Price and 24 h change of cryptocurrencies
 */

const { ADMIN, USER } = require('../../roles').ROLES;
const { OPCAO_ALERTA_MSG, OPCAO_ALERTA_RM, OPCAO_ALERTA_TO } = require('./_opcoes');

module.exports = {
    cmd: '/crypto',
    usage: '/crypto [OPTION] [CURRENCY...]  or  /crypto [CURRENCY] -alerta [rule] [-to <target>]... [-msg <text>]  or  /crypto -alerta -rm <num...|all>',
    aliases: [],
    summary: 'Price and 24 h change of cryptocurrencies',
    help: 'Current price and 24 h change of the enabled cryptocurrencies (Binance) or only the requested ones (e.g. /crypto BTC ETH).',
    cmd_opts: [
        {
            opts: ['add', 'a'],
            values: ['<TOKEN>'],
            desc: 'Enables a supported coin. Owner (or an admin) only.',
            cron: false,
            role: ADMIN
        },
        {
            opts: ['alerta'],
            values: [],
            desc: 'Without a rule: lists the alerts. With a rule (e.g. BTC < 90000): notifies you in your private chat (or at the -to targets) when the price crosses the value. The coin can also come first: /crypto BTC -alerta < 90000. Owner (or an admin) only.',
            cron: false
        },
        {
            opts: ['del', 'd'],
            values: ['<TOKEN>'],
            desc: 'Disables a coin. Owner (or an admin) only.',
            cron: false,
            role: ADMIN
        },
        { opts: ['list', 'l'], values: [], desc: 'Lists the supported coins (* = enabled).' },
        OPCAO_ALERTA_MSG,
        OPCAO_ALERTA_RM,
        OPCAO_ALERTA_TO
    ],
    role: USER,
    cron: true
};
