/*
 * /meme: Template de meme aleatório do imgflip
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/meme',
    usage: '/meme [busca]',
    summary: 'Template de meme aleatório do imgflip',
    help: 'Template de meme aleatório do imgflip, opcionalmente filtrado pelo nome.',
    role: USER,
    cron: true
};
