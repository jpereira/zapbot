const bot = require('./helpers/bot');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { runInNewContext } = require('node:vm');
const { diagnosePresence } = require('../src/debugPresence');

beforeEach(bot.restart);
afterEach(() => { delete bot.client.pupPage; });

async function evaluate(window, chatId = bot.GROUP, document, clock = {}) {
    const dataAlt = await runInNewContext(`(${diagnosePresence.toString()})(chatId)`, {
        chatId, window, document, setTimeout, clearTimeout, ...clock
    });
    return JSON.parse(JSON.stringify(dataAlt));
}

function modern(modules) {
    return { require(nameAlt) {
        if (!(nameAlt in modules)) throw new Error(`Módulo ausente: ${nameAlt}`);
        return modules[nameAlt];
    } };
}

test('usa WAWebCollections e Wid sem Store, lendo attributes', async () => {
    const chat = { id: { _serialized: bot.GROUP }, presence: {
        attributes: { isOnline: false, lastSeen: 1234567890 }
    } };
    const dataAlt = await evaluate(modern({
        WAWebWidFactory: { createWid: id => ({ _serialized: id }) },
        WAWebCollections: { Chat: { get: wid => wid?._serialized === bot.GROUP ? chat : null } }
    }));
    assert.equal(dataAlt.chatFound, true);
    assert.equal(dataAlt.presenceData.lastSeen, 1234567890);
    assert.equal(dataAlt.presenceData.isOnline, false);
    assert.equal(dataAlt.lastSeenISO, '2009-02-13T23:31:30.000Z');
    assert.match(dataAlt.lastSeenSource, /attributes.lastSeen$/);
});

test('resolve telefone/LID e lê coleção de presença independente do chat', async () => {
    const lid = '100000000000001@lid';
    const dataAlt = await evaluate(modern({
        WAWebWidFactory: { createWid: id => ({ _serialized: id }) },
        WAWebApiContact: { getAlternateUserWid: () => ({ _serialized: lid }) },
        WAWebCollections: {
            Chat: { get: () => null },
            Presence: { get: wid => wid?._serialized === lid
                ? { __x_lastSeen: 1234567890000, __x_isOnline: false } : null }
        }
    }), bot.OTHERAlt.jid);
    assert.deepEqual(dataAlt.resolvedIds, [bot.OTHERAlt.jid, lid]);
    assert.equal(dataAlt.chatFound, false);
    assert.equal(dataAlt.presenceAvailable, true);
    assert.equal(dataAlt.presenceData.lastSeen, 1234567890000);
    assert.equal(dataAlt.lastSeenISO, '2009-02-13T23:31:30.000Z');
});

test('carrega chat cru e aguarda atualização após subscribeUserPresence', async () => {
    const presence = { attributes: { isOnline: false } };
    let widReceived;
    const lid = '100000000000001@lid';
    let options;
    const window = modern({
        WAWebWidFactory: { createWid: id => ({ _serialized: id }) },
        WAWebCollections: { Chat: { get: () => null } },
        WAWebApiContact: { getAlternateUserWid: () => ({ _serialized: lid }) },
        WAWebContactPresenceBridge: { subscribeUserPresence(wid) {
            widReceived = wid;
            setTimeout(() => { presence.attributes.lastSeen = 1234567890; }, 20);
        } }
    });
    window.WWebJS = { getChat(id, opts) {
        options = opts;
        return { id: { _serialized: id }, presence };
    } };
    const dataAlt = await evaluate(window, bot.OTHERAlt.jid);
    assert.equal(options.getAsModel, false);
    assert.equal(widReceived._serialized, lid);
    assert.equal(dataAlt.before[0].data.attributes.lastSeen, undefined);
    assert.equal(dataAlt.presenceData.lastSeen, 1234567890);
    assert.ok(dataAlt.polls > 0);
    assert.ok(dataAlt.attempts.some(a => a.method.includes('subscribeUserPresence')));
});

test('assinatura no modelo legado, get()/toJSON() e referência circular', async () => {
    const presence = {
        subscribe() { this.valor = 1234567890; },
        get(key) { return key === 'lastSeen' ? this.valor : null; },
        toJSON() { return { isOnline: false, lastSeen: this.valor }; }
    };
    presence.self = presence;
    const dataAlt = await evaluate({ Store: { Chat: { get: () => ({ presence }) } } });
    assert.equal(dataAlt.presenceData.lastSeen, 1234567890);
    assert.ok(dataAlt.attempts.some(a => a.method.endsWith('.subscribe()')));
    assert.ok(!JSON.stringify(dataAlt.sources).includes('self'));
});

test('fallback abre contato na interface e encontra a presença atualizada', async () => {
    const presence = {};
    let opened = false;
    const dataAlt = await evaluate(modern({
        WAWebCollections: { Chat: { get: () => ({ presence }) } },
        WAWebCmd: { Cmd: { openChatBottom({ chat }) {
            opened = true;
            chat.presence.lastSeen = 1234567890;
        } } }
    }), bot.OTHERAlt.jid);
    assert.equal(opened, true);
    assert.equal(dataAlt.presenceData.lastSeen, 1234567890);
});

test('chatstate offline é candidato; horário de mensagem não é lastSeen', async () => {
    const chat = { t: 999, previewMessage: { t: 999 }, presence: {
        chatstates: { models: [{ attributes: { type: 'unavailable', t: 1234567890 } }] }
    } };
    const dataAlt = await evaluate({ Store: { Chat: { get: () => chat } } });
    assert.equal(dataAlt.presenceData.lastSeen, 1234567890);
    assert.match(dataAlt.lastSeenKind, /confirmar no aplicativo/);
    assert.ok(dataAlt.lastSeenCandidates.every(c => c.value !== 999));
    chat.presence.chatstates.models[0].attributes.deny = true;
    const denied = await evaluate({ Store: { Chat: { get: () => chat } } });
    assert.equal(denied.presenceData.lastSeen, null);
});

test('descobre coleção quando os nomes fixos estão ausentes', async () => {
    const dataAlt = await evaluate(modern({
        __debug: { modulesMap: { WAWebNewPresenceCollection: {} } },
        WAWebNewPresenceCollection: { PresenceCollectionImpl: {
            get: () => ({ lastSeen: 1234567890 })
        } }
    }));
    assert.equal(dataAlt.presenceData.lastSeen, 1234567890);
    assert.ok(dataAlt.discoveredModules.includes('WAWebNewPresenceCollection'));
});

test('falha de uma estratégia não impede as outras', async () => {
    const window = modern({ WAWebCollections: {
        Chat: { get() { throw new Error('Chave inválida'); } }
    } });
    window.Store = { Chat: { get: () => ({ presence: { lastSeen: 1234567890 } }) } };
    const dataAlt = await evaluate(window);
    assert.equal(dataAlt.presenceData.lastSeen, 1234567890);
    assert.ok(dataAlt.attempts.some(a => a.error === 'Chave inválida'));
});

test('carrega chat por findOrCreateLatestChat e lê getter de presença', async () => {
    const chat = { id: { _serialized: bot.GROUP } };
    const dataAlt = await evaluate(modern({
        WAWebCollections: { Chat: { get: () => null } },
        WAWebFindChatAction: { findOrCreateLatestChat: () => ({ chat }) },
        WAWebChatGetters: { getPresence: () => ({ lastSeen: 1234567890 }) }
    }));
    assert.equal(dataAlt.chatFound, true);
    assert.equal(dataAlt.presenceData.lastSeen, 1234567890);
    assert.match(dataAlt.lastSeenSource, /getPresence.lastSeen$/);
});

test('texto do cabeçalho é diagnóstico separado, sem substituir lastSeen', async () => {
    const dataAlt = await evaluate({}, bot.GROUP, { querySelector: () => ({
        innerText: 'Fulano\nvisto por último hoje às 10:30',
        querySelectorAll: () => [{
            getAttribute: () => null, textContent: 'visto por último hoje às 10:30'
        }]
    }) });
    assert.equal(dataAlt.presenceData.lastSeen, null);
    assert.deepEqual(dataAlt.ui.presenceTexts, ['visto por último hoje às 10:30']);
    assert.match(dataAlt.ui.headerText, /Fulano/);
});

test('consulta que nunca termina tem timeout e preserva diagnósticos', async () => {
    const dataAlt = await evaluate({ WWebJS: { getChat: () => new Promise(() => {}) } });
    assert.equal(dataAlt.chatFound, false);
    assert.ok(dataAlt.attempts.some(a => a.error === 'Timeout de 1500 ms'));
    assert.ok(dataAlt.elapsedMs < 5000);
});

test('chatstate cheio de metadados mantém type/t e a origem exata do horário', async () => {
    const state = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`metadata${i}`, {}]));
    Object.assign(state, { __x_type: 'unavailable', __x_t: 1792006075 });
    const presence = { __x_chatstate: state, isOnline: false, hasData: true, isSubscribed: true };
    presence.chatstate = state;
    presence.attributes = { chatstate: state };
    const dataAlt = await evaluate({ Store: { Chat: { get: () => ({ presence }) } } });
    assert.equal(dataAlt.presenceData.lastSeen, 1792006075);
    assert.equal(dataAlt.presenceData.chatstate.t, 1792006075);
    assert.match(dataAlt.lastSeenSource, /(?:chatstate|__x_chatstate)\.__x_t$/);
    assert.equal(dataAlt.sources.length, 1);
    assert.doesNotMatch(JSON.stringify(dataAlt.sources), /metadata|circular/);
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
    const dataAlt = await evaluate(modern({
        WAWebWidFactory: { createWid: id => ({ _serialized: id }) },
        WAWebApiContact: { getAlternateUserWid: () => ({ _serialized: lid }) },
        WAWebCollections: { Chat: { get: () => ({ presence }) } },
        WAWebContactPresenceBridge: bridge
    }), bot.OTHERAlt.jid);
    assert.deepEqual(calls, [lid]);
    assert.equal(dataAlt.subscriptionRequested, true);
});

test('resumo mantém flags e horário na mesma fonte de presença', async () => {
    const empty = { isOnline: false, hasData: false, isSubscribed: false };
    const loaded = { isOnline: true, hasData: true, isSubscribed: true, lastSeen: 1234567890 };
    const dataAlt = await evaluate(modern({
        WAWebCollections: { Chat: { get: () => ({ presence: empty }) },
            Presence: { get: () => loaded } }
    }));
    assert.equal(dataAlt.presenceData.hasData, true);
    assert.equal(dataAlt.presenceData.isOnline, true);
    assert.equal(dataAlt.presenceData.isSubscribed, true);
    assert.equal(dataAlt.dataChangedDuringQuery, false);
});

function pageClock(onAdvance = () => {}) {
    let nowAlt = Date.now();
    return {
        Date: class extends Date { static now() { return nowAlt; } },
        setTimeout(fn, ms) {
            if (ms !== 400) return setTimeout(fn, ms);
            return setTimeout(() => {
                nowAlt += ms;
                onAdvance(nowAlt);
                fn();
            }, 0);
        }
    };
}

test('aguarda dados tardios no LID canônico sem repetir assinatura', async () => {
    const lid = '100000000000001@lid';
    const oldAlt2 = { id: { _serialized: bot.OTHERAlt.jid }, isOnline: false,
        hasData: true, isSubscribed: true, chatstate: { type: 'unavailable', t: 1234567890 } };
    const current = { id: { _serialized: lid }, isOnline: false,
        hasData: false, isSubscribed: false, chatstate: { type: 'unavailable', t: null } };
    let calls = 0;
    const clock = pageClock(nowAlt => {
        if (nowAlt >= start + 9000) {
            current.hasData = true;
            current.isSubscribed = true;
            current.chatstate.t = 1792006744;
        }
    });
    const start = clock.Date.now();
    const dataAlt = await evaluate(modern({
        WAWebWidFactory: { createWid: id => ({ _serialized: id }) },
        WAWebApiContact: { getAlternateUserWid: () => ({ _serialized: lid }) },
        WAWebCollections: {
            Chat: { get: () => ({ presence: oldAlt2 }) },
            Presence: { get: wid => wid?._serialized === lid ? current : null }
        },
        WAWebContactPresenceBridge: { subscribeUserPresence() { calls++; } }
    }), bot.OTHERAlt.jid, undefined, clock);
    assert.equal(calls, 1);
    assert.equal(dataAlt.presenceId, lid);
    assert.equal(dataAlt.presenceData.lastSeen, 1792006744);
    assert.equal(dataAlt.dataChangedDuringQuery, true);
    assert.equal(dataAlt.queryStatus, 'dados mudaram durante a consulta');
    assert.ok(dataAlt.elapsedMs >= 9000);
});

test('solicitação sem resposta encerra com status explícito e sem nova assinatura', async () => {
    const lid = '100000000000001@lid';
    let calls = 0;
    const presence = { id: { _serialized: lid }, hasData: false, isSubscribed: false,
        isOnline: false, chatstate: { type: 'unavailable', t: null } };
    const dataAlt = await evaluate(modern({
        WAWebCollections: { Chat: { get: () => ({ id: presence.id, presence }) } },
        WAWebContactPresenceBridge: { subscribeUserPresence() { calls++; } }
    }), bot.OTHERAlt.jid, undefined, pageClock());
    assert.equal(calls, 1);
    assert.equal(dataAlt.presenceData.lastSeen, null);
    assert.equal(dataAlt.queryStatus, 'sem dados recebidos até o fim da consulta');
    assert.equal(dataAlt.dataChangedDuringQuery, false);
    assert.ok(dataAlt.elapsedMs >= 15000 && dataAlt.elapsedMs <= 25000);
});

test('online no LID não é substituído pelo estado offline em cache do telefone', async () => {
    const lid = '100000000000001@lid';
    const oldAlt2 = { isOnline: false, hasData: true,
        chatstate: { type: 'unavailable', t: 1234567890 } };
    const online = { id: { _serialized: lid }, isOnline: true, hasData: true,
        isSubscribed: true, chatstate: { type: 'available', t: null } };
    const dataAlt = await evaluate(modern({
        WAWebWidFactory: { createWid: id => ({ _serialized: id }) },
        WAWebApiContact: { getAlternateUserWid: () => ({ _serialized: lid }) },
        WAWebCollections: { Chat: { get: () => ({ presence: oldAlt2 }) },
            Presence: { get: wid => wid?._serialized === lid ? online : null } }
    }), bot.OTHERAlt.jid);
    assert.equal(dataAlt.presenceData.isOnline, true);
    assert.equal(dataAlt.presenceData.chatstate.type, 'available');
    assert.equal(dataAlt.presenceData.lastSeen, null);
    assert.equal(dataAlt.presenceId, lid);
});

test('horário já em cache aguarda resposta e não é declarado atualizado', async () => {
    const lid = '100000000000001@lid';
    const presence = { id: { _serialized: lid }, isOnline: false, hasData: true,
        isSubscribed: true, chatstate: { type: 'unavailable', t: 1792006744 } };
    const dataAlt = await evaluate(modern({
        WAWebCollections: { Chat: { get: () => ({ id: presence.id, presence }) } },
        WAWebContactPresenceBridge: { subscribeUserPresence() {} }
    }), bot.OTHERAlt.jid, undefined, pageClock());
    assert.equal(dataAlt.presenceData.lastSeen, 1792006744);
    assert.equal(dataAlt.dataChangedDuringQuery, false);
    assert.equal(dataAlt.queryStatus, 'dados em cache; atualização não confirmada');
    assert.ok(dataAlt.elapsedMs >= 15000);
});

test('modo monitor reaproveita assinatura, sem abrir chat ou renovar presença', async () => {
    let queries = 0;
    let openings = 0;
    const presence = { id: { _serialized: '100000000000001@lid' }, isOnline: false,
        hasData: true, isSubscribed: true, chatstate: { type: 'unavailable', t: 1792007399 },
        subscribe() { queries++; } };
    const window = modern({
        WAWebCollections: { Chat: { get: () => ({ id: presence.id, presence }) } },
        WAWebContactPresenceBridge: { subscribeUserPresence() { queries++; } },
        WAWebCmd: { Cmd: { openChatBottom() { openings++; } } }
    });
    const dataAlt = await runInNewContext(
        `(${diagnosePresence.toString()})(chatId, { monitor: true })`, {
            chatId: bot.OTHERAlt.jid, window, setTimeout, clearTimeout
        });
    assert.equal(queries, 0);
    assert.equal(openings, 0);
    assert.equal(dataAlt.presenceData.lastSeen, 1792007399);
});
