/*
 * /walissu: Tags 2 group members with a random CVE
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/walissu',
    usage: '/walissu',
    aliases: [],
    summary: 'Joke: mentions 2 group members with a random CVE',
    help: 'A joke, Walissu CVE BOT: mentions 2 group members with a random CVE (the reply says it is a joke).',
    role: USER
};
