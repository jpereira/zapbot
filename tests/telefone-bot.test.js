const bot = require('./helpers/bot');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { normalizarTelefoneBot, telefoneBotJid } = bot.src('telefoneBot');
const { messageToSelf } = bot.src('cliente');
const telefone = process.env.PHONE_NUMBER;

beforeEach(async () => {
    await bot.reiniciar();
    process.env.PHONE_NUMBER = telefone;
});
afterEach(() => { process.env.PHONE_NUMBER = telefone; });

test('número em dígitos envia ao chat privado sem warning', async () => {
    const inicio = bot.logs.length;
    await messageToSelf('Teste de aviso');
    assert.equal(bot.client.enviadas[0].chatId, `${telefone}@c.us`);
    assert.equal(process.env.PHONE_NUMBER, telefone);
    assert.ok(!bot.logs.slice(inicio).some(l => l.includes('PHONE_NUMBER ajustado')));
});

test('limpa sufixos e formatação, avisa o formato esperado e continua enviando', async () => {
    for (const valor of [
        `${telefone}@c.us`, `${telefone}@s.whatsapp.net`, `${telefone}@dominio123`,
        '+55 (21) 90000-0000', ` ${telefone} `
    ]) {
        process.env.PHONE_NUMBER = valor;
        const inicio = bot.logs.length;
        await messageToSelf('Aviso com telefone limpo');
        assert.equal(bot.client.enviadas.at(-1).chatId, `${telefone}@c.us`);
        assert.equal(process.env.PHONE_NUMBER, telefone);
        const warnings = bot.logs.slice(inicio).filter(l => l.includes('PHONE_NUMBER ajustado'));
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /⚠️.*DDI \+ DDD \+ número.*PHONE_NUMBER=5521999999999/);
        assert.equal(telefoneBotJid(), `${telefone}@c.us`);
        assert.equal(bot.logs.slice(inicio).filter(l => l.includes('PHONE_NUMBER ajustado')).length, 1);
    }
});

test('não inventa um identificador quando o telefone está vazio ou ausente', () => {
    process.env.PHONE_NUMBER = '';
    assert.equal(telefoneBotJid(), '');
    delete process.env.PHONE_NUMBER;
    assert.equal(normalizarTelefoneBot(), '');
    assert.equal(process.env.PHONE_NUMBER, undefined);
});
