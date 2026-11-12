/*
 * /walissu: Marca 2 membros do grupo com uma CVE aleatória
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/walissu',
    usage: '/walissu',
    aliases: ['/ualisu'],
    summary: 'Mentions 2 group members with a random CVE',
    help: 'Walissu CVE BOT: mentions 2 group members with a random CVE.',
    role: USER
};
