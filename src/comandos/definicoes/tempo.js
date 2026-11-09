/*
 * /tempo: Tempo agora, máxima e mínima
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/tempo',
    usage: '/tempo [N|Nd] [cidade]',
    aliases: ['/weather'],
    summary: 'Tempo agora, máxima e mínima',
    help: 'Tempo agora, máx./mín. e chance de chuva do dia (Open-Meteo); com N (ou Nd), previsão de N dias contando hoje. Sem cidade usa o setting tempo.city.',
    cmd_opts: [
        {
            argv: ['[N|Nd]'],
            desc: 'Previsão de N dias, contando hoje (1 a tempo.maxDays, padrão 16 e máximo da API). Só como primeiro argumento; sem N, mostra só hoje.',
            ex: ['/tempo 16d Niteroi', '/tempo 3']
        },
        {
            argv: ['[cidade]'],
            desc: 'Cidade, opcionalmente com estado ou país após uma vírgula.',
            ex: ['/tempo Paris, Texas']
        }
    ],
    role: USER,
    cron: true
};
