/*
 * A command that sends something secret (the QR code and the code of the 2FA of the web interface): everything the bot
 * sends from inside runSecret() is marked so that 'message_create' does not save it (no row, no media): see
 * client.sendMessage and isNoStore. Notes of a protected tag use their own context (notesLock) for the same.
 */

const { AsyncLocalStorage } = require('async_hooks');

const context = new AsyncLocalStorage();

/** Runs fn: what the bot sends inside it is never saved */
const runSecret = (fn) => context.run({ secret: true }, fn);

const inSecret = () => context.getStore()?.secret === true;

module.exports = { inSecret, runSecret };
