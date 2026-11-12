/*
 * /rates: Cotação das moedas contra o real
 */

const { ADMIN, USER } = require('../../roles').ROLES;
const { OPCAO_ALERTA_MSG, OPCAO_ALERTA_RM, OPCAO_ALERTA_TO } = require('./_opcoes');

module.exports = {
    cmd: '/rates',
    usage: '/rates [OPÇÃO] [MOEDA...]  ou  /rates [MOEDA] -alerta [regra] [-to <destino>]... [-msg <texto>]  ou  /rates -alerta -rm <nº...|all>',
    aliases: ['/cotacao', '/cambio'],
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
            desc: 'Sem regra: lista os alertas. Com regra (ex.: USD > 5.30): avisa no seu privado (ou nos destinos do -to) quando o preço passar do valor. A moeda também pode vir antes: /rates USD -alerta > 5.30. Só o dono (ou um admin).',
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
        OPCAO_ALERTA_MSG,
        OPCAO_ALERTA_RM,
        OPCAO_ALERTA_TO
    ],
    role: USER,
    cron: true
};
