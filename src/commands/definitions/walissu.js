/*
 * /walissu: Tags 2 group members with a random CVE
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/walissu',
    usage: '/walissu',
    aliases: ['/ualisu'],
    summary: 'Marca 2 membros do grupo com uma CVE aleatória',
    help: 'Walissu CVE BOT: marca 2 membros do grupo com uma CVE aleatória.',
    role: USER
};
