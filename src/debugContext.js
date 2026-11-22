const { AsyncLocalStorage } = require('async_hooks');

const contexts = new AsyncLocalStorage();
let initializing = false;
const bootStartLogs = () => { initializing = true; };
const bootCompleteLogs = () => { initializing = false; };
const canFilterDebug = () => !initializing && !contextDebug().noFilter;
const contextDebug = () => contexts.getStore() ?? {};
const withContextDebug = (dataAlt, run) => contexts.run(
    { ...contextDebug(), ...dataAlt }, run
);

module.exports = {
    withContextDebug, contextDebug, bootStartLogs, bootCompleteLogs, canFilterDebug
};
