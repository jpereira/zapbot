/*
 * /meme: Random meme template from imgflip
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
