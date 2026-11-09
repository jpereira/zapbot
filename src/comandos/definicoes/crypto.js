/*
 * /crypto: Preço e variação de 24 h das criptomoedas
 */

const { ADMIN, USER } = require('../../roles').ROLES;
const { OPCAO_ALERTA_MSG, OPCAO_ALERTA_RM, OPCAO_ALERTA_TO } = require('./_opcoes');

module.exports = {
    cmd: '/crypto',
    usage: '/crypto [OPÇÃO] [MOEDA...]  ou  /crypto [MOEDA] -alerta [regra] [-to <destino>]... [-msg <texto>]  ou  /crypto -alerta -rm <nº...|all>',
    aliases: ['/bitcoio', '/creptomoeda'],
    summary: 'Preço e variação de 24 h das criptomoedas',
    help: 'Preço atual e variação de 24 h das criptomoedas ativadas (Binance) ou só das pedidas (ex.: /crypto BTC ETH).',
    cmd_opts: [
        {
            opts: ['add', 'a'],
            values: ['<TOKEN>'],
            desc: 'Ativa uma moeda suportada. Só o dono (ou um admin).',
            cron: false,
            role: ADMIN
        },
        {
            opts: ['alerta'],
            values: [],
            desc: 'Sem regra: lista os alertas. Com regra (ex.: BTC < 90000): avisa no seu privado (ou nos destinos do -to) quando o preço passar do valor. A moeda também pode vir antes: /crypto BTC -alerta < 90000. Só o dono (ou um admin).',
            cron: false
        },
        {
            opts: ['del', 'd'],
            values: ['<TOKEN>'],
            desc: 'Desativa uma moeda. Só o dono (ou um admin).',
            cron: false,
            role: ADMIN
        },
        { opts: ['list', 'l'], values: [], desc: 'Lista as moedas suportadas (* = ativada).' },
        OPCAO_ALERTA_MSG,
        OPCAO_ALERTA_RM,
        OPCAO_ALERTA_TO
    ],
    role: USER,
    cron: true
};
