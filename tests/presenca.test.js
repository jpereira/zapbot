const bot = require('./helpers/bot');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { runInNewContext } = require('node:vm');
const { diagnosticarPresenca } = require('../src/debugPresenca');

beforeEach(bot.reiniciar);
afterEach(() => { delete bot.client.pupPage; });

async function avaliar(window, chatId = bot.GRUPO, document, clock = {}) {
    const dados = await runInNewContext(`(${diagnosticarPresenca.toString()})(chatId)`, {
        chatId, window, document, setTimeout, clearTimeout, ...clock
    });
    return JSON.parse(JSON.stringify(dados));
}

function moderno(modules) {
    return { require(nome) {
        if (!(nome in modules)) throw new Error(`Módulo ausente: ${nome}`);
        return modules[nome];
    } };
}

test('usa WAWebCollections e Wid sem Store, lendo attributes', async () => {
    const chat = { id: { _serialized: bot.GRUPO }, presence: {
        attributes: { isOnline: false, lastSeen: 1234567890 }
    } };
    const dados = await avaliar(moderno({
        WAWebWidFactory: { createWid: id => ({ _serialized: id }) },
        WAWebCollections: { Chat: { get: wid => wid?._serialized === bot.GRUPO ? chat : null } }
    }));
    assert.equal(dados.chatFound, true);
    assert.equal(dados.presenceData.lastSeen, 1234567890);
    assert.equal(dados.presenceData.isOnline, false);
    assert.equal(dados.lastSeenISO, '2009-02-13T23:31:30.000Z');
    assert.match(dados.lastSeenSource, /attributes.lastSeen$/);
});

test('resolve telefone/LID e lê coleção de presença independente do chat', async () => {
    const lid = '100000000000001@lid';
    const dados = await avaliar(moderno({
        WAWebWidFactory: { createWid: id => ({ _serialized: id }) },
        WAWebApiContact: { getAlternateUserWid: () => ({ _serialized: lid }) },
        WAWebCollections: {
            Chat: { get: () => null },
            Presence: { get: wid => wid?._serialized === lid
                ? { __x_lastSeen: 1234567890000, __x_isOnline: false } : null }
        }
    }), bot.OUTRO.jid);
    assert.deepEqual(dados.resolvedIds, [bot.OUTRO.jid, lid]);
    assert.equal(dados.chatFound, false);
    assert.equal(dados.presenceAvailable, true);
    assert.equal(dados.presenceData.lastSeen, 1234567890000);
    assert.equal(dados.lastSeenISO, '2009-02-13T23:31:30.000Z');
});

test('carrega chat cru e aguarda atualização após subscribeUserPresence', async () => {
    const presence = { attributes: { isOnline: false } };
    let widRecebido;
    const lid = '100000000000001@lid';
    let options;
    const window = moderno({
        WAWebWidFactory: { createWid: id => ({ _serialized: id }) },
        WAWebCollections: { Chat: { get: () => null } },
        WAWebApiContact: { getAlternateUserWid: () => ({ _serialized: lid }) },
        WAWebContactPresenceBridge: { subscribeUserPresence(wid) {
            widRecebido = wid;
            setTimeout(() => { presence.attributes.lastSeen = 1234567890; }, 20);
        } }
    });
    window.WWebJS = { getChat(id, opts) {
        options = opts;
        return { id: { _serialized: id }, presence };
    } };
    const dados = await avaliar(window, bot.OUTRO.jid);
    assert.equal(options.getAsModel, false);
    assert.equal(widRecebido._serialized, lid);
    assert.equal(dados.before[0].data.attributes.lastSeen, undefined);
    assert.equal(dados.presenceData.lastSeen, 1234567890);
    assert.ok(dados.polls > 0);
    assert.ok(dados.attempts.some(a => a.method.includes('subscribeUserPresence')));
});

test('assinatura no modelo legado, get()/toJSON() e referência circular', async () => {
    const presence = {
        subscribe() { this.valor = 1234567890; },
        get(key) { return key === 'lastSeen' ? this.valor : null; },
        toJSON() { return { isOnline: false, lastSeen: this.valor }; }
    };
    presence.self = presence;
    const dados = await avaliar({ Store: { Chat: { get: () => ({ presence }) } } });
    assert.equal(dados.presenceData.lastSeen, 1234567890);
    assert.ok(dados.attempts.some(a => a.method.endsWith('.subscribe()')));
    assert.ok(!JSON.stringify(dados.sources).includes('self'));
});

test('fallback abre contato na interface e encontra a presença atualizada', async () => {
    const presence = {};
    let abriu = false;
    const dados = await avaliar(moderno({
        WAWebCollections: { Chat: { get: () => ({ presence }) } },
        WAWebCmd: { Cmd: { openChatBottom({ chat }) {
            abriu = true;
            chat.presence.lastSeen = 1234567890;
        } } }
    }), bot.OUTRO.jid);
    assert.equal(abriu, true);
    assert.equal(dados.presenceData.lastSeen, 1234567890);
});

test('chatstate offline é candidato; horário de mensagem não é lastSeen', async () => {
    const chat = { t: 999, previewMessage: { t: 999 }, presence: {
        chatstates: { models: [{ attributes: { type: 'unavailable', t: 1234567890 } }] }
    } };
    const dados = await avaliar({ Store: { Chat: { get: () => chat } } });
    assert.equal(dados.presenceData.lastSeen, 1234567890);
    assert.match(dados.lastSeenKind, /confirmar no aplicativo/);
    assert.ok(dados.lastSeenCandidates.every(c => c.value !== 999));
    chat.presence.chatstates.models[0].attributes.deny = true;
    const negado = await avaliar({ Store: { Chat: { get: () => chat } } });
    assert.equal(negado.presenceData.lastSeen, null);
});

test('descobre coleção quando os nomes fixos estão ausentes', async () => {
    const dados = await avaliar(moderno({
        __debug: { modulesMap: { WAWebNewPresenceCollection: {} } },
        WAWebNewPresenceCollection: { PresenceCollectionImpl: {
            get: () => ({ lastSeen: 1234567890 })
        } }
    }));
    assert.equal(dados.presenceData.lastSeen, 1234567890);
    assert.ok(dados.discoveredModules.includes('WAWebNewPresenceCollection'));
});

test('falha de uma estratégia não impede as outras', async () => {
    const window = moderno({ WAWebCollections: {
        Chat: { get() { throw new Error('Chave inválida'); } }
    } });
    window.Store = { Chat: { get: () => ({ presence: { lastSeen: 1234567890 } }) } };
    const dados = await avaliar(window);
    assert.equal(dados.presenceData.lastSeen, 1234567890);
    assert.ok(dados.attempts.some(a => a.error === 'Chave inválida'));
});

test('carrega chat por findOrCreateLatestChat e lê getter de presença', async () => {
    const chat = { id: { _serialized: bot.GRUPO } };
    const dados = await avaliar(moderno({
        WAWebCollections: { Chat: { get: () => null } },
        WAWebFindChatAction: { findOrCreateLatestChat: () => ({ chat }) },
        WAWebChatGetters: { getPresence: () => ({ lastSeen: 1234567890 }) }
    }));
    assert.equal(dados.chatFound, true);
    assert.equal(dados.presenceData.lastSeen, 1234567890);
    assert.match(dados.lastSeenSource, /getPresence.lastSeen$/);
});

test('texto do cabeçalho é diagnóstico separado, sem substituir lastSeen', async () => {
    const dados = await avaliar({}, bot.GRUPO, { querySelector: () => ({
        innerText: 'Fulano\nvisto por último hoje às 10:30',
        querySelectorAll: () => [{
            getAttribute: () => null, textContent: 'visto por último hoje às 10:30'
        }]
    }) });
    assert.equal(dados.presenceData.lastSeen, null);
    assert.deepEqual(dados.ui.presenceTexts, ['visto por último hoje às 10:30']);
    assert.match(dados.ui.headerText, /Fulano/);
});

test('consulta que nunca termina tem timeout e preserva diagnósticos', async () => {
    const dados = await avaliar({ WWebJS: { getChat: () => new Promise(() => {}) } });
    assert.equal(dados.chatFound, false);
    assert.ok(dados.attempts.some(a => a.error === 'Timeout de 1500 ms'));
    assert.ok(dados.elapsedMs < 5000);
});

test('chatstate cheio de metadados mantém type/t e a origem exata do horário', async () => {
    const state = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`metadata${i}`, {}]));
    Object.assign(state, { __x_type: 'unavailable', __x_t: 1792006075 });
    const presence = { __x_chatstate: state, isOnline: false, hasData: true, isSubscribed: true };
    presence.chatstate = state;
    presence.attributes = { chatstate: state };
    const dados = await avaliar({ Store: { Chat: { get: () => ({ presence }) } } });
    assert.equal(dados.presenceData.lastSeen, 1792006075);
    assert.equal(dados.presenceData.chatstate.t, 1792006075);
    assert.match(dados.lastSeenSource, /(?:chatstate|__x_chatstate)\.__x_t$/);
    assert.equal(dados.sources.length, 1);
    assert.doesNotMatch(JSON.stringify(dados.sources), /metadata|circular/);
});

test('assinatura ativa usa somente o LID, sem duplicar chamadas ao mesmo contato', async () => {
    const lid = '100000000000001@lid';
    const calls = [];
    const presence = { lastSeen: 1234567890, subscribe() { calls.push('model'); } };
    const bridge = { subscribeUserPresence(id) {
        calls.push(id._serialized);
        presence.hasData = true;
        presence.isSubscribed = true;
    },
        subscribePresence() { calls.push('legacy'); } };
    const dados = await avaliar(moderno({
        WAWebWidFactory: { createWid: id => ({ _serialized: id }) },
        WAWebApiContact: { getAlternateUserWid: () => ({ _serialized: lid }) },
        WAWebCollections: { Chat: { get: () => ({ presence }) } },
        WAWebContactPresenceBridge: bridge
    }), bot.OUTRO.jid);
    assert.deepEqual(calls, [lid]);
    assert.equal(dados.subscriptionRequested, true);
});

test('resumo mantém flags e horário na mesma fonte de presença', async () => {
    const vazio = { isOnline: false, hasData: false, isSubscribed: false };
    const carregado = { isOnline: true, hasData: true, isSubscribed: true, lastSeen: 1234567890 };
    const dados = await avaliar(moderno({
        WAWebCollections: { Chat: { get: () => ({ presence: vazio }) },
            Presence: { get: () => carregado } }
    }));
    assert.equal(dados.presenceData.hasData, true);
    assert.equal(dados.presenceData.isOnline, true);
    assert.equal(dados.presenceData.isSubscribed, true);
    assert.equal(dados.dataChangedDuringQuery, false);
});

function relogioDaPagina(aoAvancar = () => {}) {
    let agora = Date.now();
    return {
        Date: class extends Date { static now() { return agora; } },
        setTimeout(fn, ms) {
            if (ms !== 400) return setTimeout(fn, ms);
            return setTimeout(() => {
                agora += ms;
                aoAvancar(agora);
                fn();
            }, 0);
        }
    };
}

test('aguarda dados tardios no LID canônico sem repetir assinatura', async () => {
    const lid = '100000000000001@lid';
    const antigo = { id: { _serialized: bot.OUTRO.jid }, isOnline: false,
        hasData: true, isSubscribed: true, chatstate: { type: 'unavailable', t: 1234567890 } };
    const atual = { id: { _serialized: lid }, isOnline: false,
        hasData: false, isSubscribed: false, chatstate: { type: 'unavailable', t: null } };
    let calls = 0;
    const clock = relogioDaPagina(agora => {
        if (agora >= inicio + 9000) {
            atual.hasData = true;
            atual.isSubscribed = true;
            atual.chatstate.t = 1792006744;
        }
    });
    const inicio = clock.Date.now();
    const dados = await avaliar(moderno({
        WAWebWidFactory: { createWid: id => ({ _serialized: id }) },
        WAWebApiContact: { getAlternateUserWid: () => ({ _serialized: lid }) },
        WAWebCollections: {
            Chat: { get: () => ({ presence: antigo }) },
            Presence: { get: wid => wid?._serialized === lid ? atual : null }
        },
        WAWebContactPresenceBridge: { subscribeUserPresence() { calls++; } }
    }), bot.OUTRO.jid, undefined, clock);
    assert.equal(calls, 1);
    assert.equal(dados.presenceId, lid);
    assert.equal(dados.presenceData.lastSeen, 1792006744);
    assert.equal(dados.dataChangedDuringQuery, true);
    assert.equal(dados.queryStatus, 'dados mudaram durante a consulta');
    assert.ok(dados.elapsedMs >= 9000);
});

test('solicitação sem resposta encerra com status explícito e sem nova assinatura', async () => {
    const lid = '100000000000001@lid';
    let calls = 0;
    const presence = { id: { _serialized: lid }, hasData: false, isSubscribed: false,
        isOnline: false, chatstate: { type: 'unavailable', t: null } };
    const dados = await avaliar(moderno({
        WAWebCollections: { Chat: { get: () => ({ id: presence.id, presence }) } },
        WAWebContactPresenceBridge: { subscribeUserPresence() { calls++; } }
    }), bot.OUTRO.jid, undefined, relogioDaPagina());
    assert.equal(calls, 1);
    assert.equal(dados.presenceData.lastSeen, null);
    assert.equal(dados.queryStatus, 'sem dados recebidos até o fim da consulta');
    assert.equal(dados.dataChangedDuringQuery, false);
    assert.ok(dados.elapsedMs >= 15000 && dados.elapsedMs <= 25000);
});

test('online no LID não é substituído pelo estado offline em cache do telefone', async () => {
    const lid = '100000000000001@lid';
    const antigo = { isOnline: false, hasData: true,
        chatstate: { type: 'unavailable', t: 1234567890 } };
    const online = { id: { _serialized: lid }, isOnline: true, hasData: true,
        isSubscribed: true, chatstate: { type: 'available', t: null } };
    const dados = await avaliar(moderno({
        WAWebWidFactory: { createWid: id => ({ _serialized: id }) },
        WAWebApiContact: { getAlternateUserWid: () => ({ _serialized: lid }) },
        WAWebCollections: { Chat: { get: () => ({ presence: antigo }) },
            Presence: { get: wid => wid?._serialized === lid ? online : null } }
    }), bot.OUTRO.jid);
    assert.equal(dados.presenceData.isOnline, true);
    assert.equal(dados.presenceData.chatstate.type, 'available');
    assert.equal(dados.presenceData.lastSeen, null);
    assert.equal(dados.presenceId, lid);
});

test('horário já em cache aguarda resposta e não é declarado atualizado', async () => {
    const lid = '100000000000001@lid';
    const presence = { id: { _serialized: lid }, isOnline: false, hasData: true,
        isSubscribed: true, chatstate: { type: 'unavailable', t: 1792006744 } };
    const dados = await avaliar(moderno({
        WAWebCollections: { Chat: { get: () => ({ id: presence.id, presence }) } },
        WAWebContactPresenceBridge: { subscribeUserPresence() {} }
    }), bot.OUTRO.jid, undefined, relogioDaPagina());
    assert.equal(dados.presenceData.lastSeen, 1792006744);
    assert.equal(dados.dataChangedDuringQuery, false);
    assert.equal(dados.queryStatus, 'dados em cache; atualização não confirmada');
    assert.ok(dados.elapsedMs >= 15000);
});

test('modo monitor reaproveita assinatura, sem abrir chat ou renovar presença', async () => {
    let consultas = 0;
    let aberturas = 0;
    const presence = { id: { _serialized: '100000000000001@lid' }, isOnline: false,
        hasData: true, isSubscribed: true, chatstate: { type: 'unavailable', t: 1792007399 },
        subscribe() { consultas++; } };
    const window = moderno({
        WAWebCollections: { Chat: { get: () => ({ id: presence.id, presence }) } },
        WAWebContactPresenceBridge: { subscribeUserPresence() { consultas++; } },
        WAWebCmd: { Cmd: { openChatBottom() { aberturas++; } } }
    });
    const dados = await runInNewContext(
        `(${diagnosticarPresenca.toString()})(chatId, { monitor: true })`, {
            chatId: bot.OUTRO.jid, window, setTimeout, clearTimeout
        });
    assert.equal(consultas, 0);
    assert.equal(aberturas, 0);
    assert.equal(dados.presenceData.lastSeen, 1792007399);
});
