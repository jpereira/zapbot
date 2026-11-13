/*
 * /walissu: Tags 2 group members with a random CVE
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/walissu',
    usage: '/walissu',
    aliases: [],
    summary: 'Mentions 2 group members with a random CVE',
    help: 'Walissu CVE BOT: mentions 2 group members with a random CVE.',
    role: USER
};
