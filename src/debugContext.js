const { AsyncLocalStorage } = require('async_hooks');

const contexts = new AsyncLocalStorage();
const contextDebug = () => contexts.getStore() ?? {};
const withContextDebug = (dataAlt, run) => contexts.run(
    { ...contextDebug(), ...dataAlt }, run
);

module.exports = { withContextDebug, contextDebug };
