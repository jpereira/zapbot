/*
 * /meme: Template de meme aleatório do imgflip
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/meme',
    usage: '/meme [search]',
    summary: 'Random meme template from imgflip',
    help: 'Random meme template from imgflip, optionally filtered by name.',
    role: USER,
    cron: true
};
