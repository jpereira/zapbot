/*
 * /cotacao: Currency quotes against the real
 */

const { ADMIN, USER } = require('../../roles').ROLES;
const { OPTION_ALERT_MSG, OPTION_ALERT_RM, OPTION_ALERT_TO } = require('./_options');

module.exports = {
    cmd: '/cotacao',
    usage: '/cotacao [OPÇÃO] [MOEDA...]  ou  /cotacao [MOEDA] -alerta [regra] [-to <destino>]... [-msg <texto>]  ou  /cotacao -alerta -rm <nº...|all>',
    aliases: ['/cambio'],
    summary: 'Cotação das moedas contra o real',
    help: 'Cotação contra o real das moedas habilitadas (padrão: EUR e USDT): atual, abertura, fechamento anterior, máx./mín. e variação.',
    cmd_opts: [
        {
            opts: ['add', 'a'],
            values: ['<MOEDA>'],
            desc: 'Habilita uma moeda suportada. Só o dono (ou um admin).',
            cron: false,
            role: ADMIN
        },
        {
            opts: ['alerta'],
            values: [],
            desc: 'Sem regra: lista os alertas. Com regra (ex.: USD > 5.30): avisa no seu privado (ou nos destinos do -to) quando o preço passar do valor. A moeda também pode vir antes: /cotacao USD -alerta > 5.30. Só o dono (ou um admin).',
            cron: false
        },
        {
            opts: ['del', 'd'],
            values: ['<MOEDA>'],
            desc: 'Desabilita uma moeda. Só o dono (ou um admin).',
            cron: false,
            role: ADMIN
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lista as moedas suportadas e quais estão habilitadas.'
        },
        OPTION_ALERT_MSG,
        OPTION_ALERT_RM,
        OPTION_ALERT_TO
    ],
    role: USER,
    cron: true
};
