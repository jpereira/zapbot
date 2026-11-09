/*
 * /kernel: Versões atuais do kernel Linux
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/kernel',
    usage: '/kernel',
    summary: 'Versões atuais do kernel Linux',
    help: 'Versões atuais do kernel Linux (kernel.org).',
    role: USER,
    cron: true
};
