/*
 * Collector of what a command replies (src/usageLimit.js): the text of each reply, edited notice or send made
 * while it runs. The usage limit looks at the last one to know whether the command worked ("⏳ Processando..."
 * becomes "❌ Erro..." in an edit, which does not go through msg.reply).
 */

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

// Runs `fn` collecting what it replies; returns { result, replies }
async function collect(fn) {
    const replies = [];
    const resultAlt = await storage.run(replies, fn);
    return { resultado: resultAlt, respostas: replies };
}

// Called by whoever sends (client.sendMessage, completeNotice, msg.reply): outside a collector, it does nothing
const register = (content) => { storage.getStore()?.push(content); };

module.exports = { collect, register };
