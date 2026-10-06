const bot = require('./helpers/bot');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { normalizePhoneBot, phoneBotJid } = bot.src('botPhone');
const { messageToSelf } = bot.src('client');
const phoneAlt = process.env.PHONE_NUMBER;

beforeEach(async () => {
    await bot.restart();
    process.env.PHONE_NUMBER = phoneAlt;
});
afterEach(() => { process.env.PHONE_NUMBER = phoneAlt; });

test('número em dígitos envia ao chat privado sem warning', async () => {
    const start = bot.logs.length;
    await messageToSelf('Teste de aviso');
    assert.equal(bot.client.enviadas[0].chatId, `${phoneAlt}@c.us`);
    assert.equal(process.env.PHONE_NUMBER, phoneAlt);
    assert.ok(!bot.logs.slice(start).some(l => l.includes('PHONE_NUMBER ajustado')));
});

test('limpa sufixos e formatação, avisa o formato esperado e continua enviando', async () => {
    for (const valueAlt of [
        `${phoneAlt}@c.us`, `${phoneAlt}@s.whatsapp.net`, `${phoneAlt}@dominio123`,
        '+55 (21) 90000-0000', ` ${phoneAlt} `
    ]) {
        process.env.PHONE_NUMBER = valueAlt;
        const start = bot.logs.length;
        await messageToSelf('Aviso com telefone limpo');
        assert.equal(bot.client.enviadas.at(-1).chatId, `${phoneAlt}@c.us`);
        assert.equal(process.env.PHONE_NUMBER, phoneAlt);
        const warnings = bot.logs.slice(start).filter(l => l.includes('PHONE_NUMBER ajustado'));
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /⚠️.*DDI \+ DDD \+ número.*PHONE_NUMBER=5521999999999/);
        assert.equal(phoneBotJid(), `${phoneAlt}@c.us`);
        assert.equal(bot.logs.slice(start).filter(l => l.includes('PHONE_NUMBER ajustado')).length, 1);
    }
});

test('não inventa um identificador quando o telefone está vazio ou ausente', () => {
    process.env.PHONE_NUMBER = '';
    assert.equal(phoneBotJid(), '');
    delete process.env.PHONE_NUMBER;
    assert.equal(normalizePhoneBot(), '');
    assert.equal(process.env.PHONE_NUMBER, undefined);
});
