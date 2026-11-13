/*
 * /weather: Tempo agora, máxima e mínima
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/weather',
    usage: '/weather [N|Nd] [city]',
    aliases: [],
    summary: 'Weather now, high and low',
    help: 'Weather now, high/low and chance of rain for the day (Open-Meteo); with N (or Nd), a forecast of N days counting today. Without a city, uses the tempo.city setting.',
    cmd_opts: [
        {
            argv: ['[N|Nd]'],
            desc: 'Forecast of N days, counting today (1 to tempo.maxDays, default 16 and the API maximum). Only as the first argument; without N, shows only today.',
            ex: ['/weather 16d Niteroi', '/weather 3']
        },
        {
            argv: ['[city]'],
            desc: 'City, optionally with state or country after a comma.',
            ex: ['/weather Paris, Texas']
        }
    ],
    role: USER,
    cron: true
};
