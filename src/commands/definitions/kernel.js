/*
 * /kernel: Current Linux kernel versions
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/kernel',
    usage: '/kernel',
    summary: 'Current Linux kernel versions',
    help: 'Current Linux kernel versions (kernel.org).',
    role: USER,
    cron: true
};
