const { parentPort } = require('worker_threads');

parentPort.on('message', ({ source, flags, texts }) => {
    const regex = new RegExp(source, flags);
    parentPort.postMessage(texts.map(text => {
        const match = regex.exec(text);
        return match ? { start: match.index, end: match.index + match[0].length } : null;
    }));
});
