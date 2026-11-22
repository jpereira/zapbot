/*
 * Shows the arguments with the same rules each command uses.
 * Does not resolve contacts or perform actions while reading the diagnostic.
 */
const { GetOptFromCommand } = require('./options');
const { extractDestinations } = require('./destinations');
const { extractMessage } = require('./priceAlerts');
const { readOptionsDebug } = require('./debugOptions');
const { readOptionsWatch } = require('./watch/options');
const { readScheduling } = require('./schedule');

function dataParserCommand(args, command, opts) {
    if (opts.opt.help) return opts;
    try {
        if (command.cmd === '/debug') {
            const opt = readOptionsDebug(args);
            return { opt, argv: [], given: new Set(Object.keys(opt)) };
        }
        if (command.cmd === '/watch') {
            const o = readOptionsWatch(args);
            return o;
        }
        if (command.cmd === '/cron') return readScheduling(args);
        const hasDestination = command.cmd_opts?.some(o => o.opts?.includes('to'));
        const alert = ['/crypto', '/stocks'].includes(command.cmd) && opts.given.has('alert');
        if (!hasDestination && !alert) return opts;
        const destinations = hasDestination ? extractDestinations(args) : null;
        let rest = destinations?.rest ?? args;
        const messageAlt = alert ? extractMessage(rest) : null;
        rest = messageAlt?.rest ?? rest;
        const resultAlt = GetOptFromCommand(rest, command);
        if (destinations?.given) {
            resultAlt.opt.to = destinations.destinations;
            resultAlt.given.add('to');
        }
        if (messageAlt?.given) {
            resultAlt.opt.msg = messageAlt.message;
            resultAlt.given.add('msg');
        }
        return resultAlt;
    } catch (err) {
        return { input: args, error: err.message };
    }
}

module.exports = { dataParserCommand };
