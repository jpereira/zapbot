/*
 * Executed entirely in the browser: internal modules vary between WhatsApp Web versions.
 * The debug prefix also avoids instrumentation wrappers in this serialized function.
 * Do not confuse the time of the last message with "last seen".
 */
async function diagnosePresence(chatId, { monitor = false } = {}) {
    const start = Date.now();
    const deadline = start + (monitor ? 10000 : 25000);
    const attempts = [];
    const modules = {};
    const modelsAlt = new Map();
    const ids = new Set([chatId.replace(/:\d+(?=@)/, '')]);
    const read = (obj, keyAlt) => {
        try { return obj?.[keyAlt]; } catch { return undefined; }
    };
    const serial = id => typeof id === 'string' ? id : read(id, '_serialized') ?? read(id, '$1');
    const get = (collection, keyAlt) => {
        try { return collection?.get?.(keyAlt); } catch { return null; }
    };
    const collectionModels = c => {
        try {
            const models = c?.getModelsArray?.() ?? c?.models ?? c?._models ?? [];
            return Array.isArray(models) ? models : Object.values(models);
        } catch { return []; }
    };
    const load = nameAlt => {
        if (nameAlt in modules) return modules[nameAlt];
        try {
            const module = window.require?.(nameAlt);
            modules[nameAlt] = module ?? null;
            attempts.push({ method: nameAlt, status: module ? 'disponível' : 'indisponível',
                exports: module ? Object.keys(module).slice(0, 40) : [] });
        } catch (err) {
            modules[nameAlt] = null;
            attempts.push({ method: nameAlt, status: 'indisponível',
                error: String(err.message ?? err).slice(0, 180) });
        }
        return modules[nameAlt];
    };
    const attempt = async (method, fn) => {
        if (Date.now() >= deadline) {
            attempts.push({ method, status: 'prazo esgotado' });
            return null;
        }
        let timer;
        const limitAlt = Math.min(1500, deadline - Date.now());
        try {
            const resultAlt = await Promise.race([
                Promise.resolve().then(fn),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`Timeout de ${limitAlt} ms`)), limitAlt);
                })
            ]);
            attempts.push({ method, status: resultAlt == null ? 'sem retorno' : 'ok' });
            return resultAlt;
        } catch (err) {
            attempts.push({ method, status: 'erro',
                error: String(err.message ?? err).slice(0, 180) });
            return null;
        } finally {
            clearTimeout(timer);
        }
    };
    const save = (source, model) => {
        if (model && typeof model === 'object') modelsAlt.set(source, model);
        else modelsAlt.delete(source);
        return model;
    };
    const factory = load('WAWebWidFactory');
    const widDe = id => {
        try { return factory?.createWid?.(id) ?? id; } catch { return id; }
    };
    const collections = load('WAWebCollections');
    const api = load('WAWebApiContact');
    const debug = (() => {
        try { return window.require?.('__debug'); } catch { return null; }
    })();
    const discoveredModules = Object.keys(debug?.modulesMap ?? {})
        .filter(nameAlt => /(?:Presence|Chatstate|LastSeen)/i.test(nameAlt)).slice(0, 60);
    for (const nameAlt of discoveredModules.filter(n => /(?:LastSeen|Presence.*Getters)/.test(n))
        .slice(0, 12)) load(nameAlt);
    load('WAWebPresenceChatAction');
    for (const id of [...ids]) {
        if (!/@(?:c\.us|lid)$/.test(id)) continue;
        const contact = get(collections?.Contact, widDe(id));
        const alternative = await attempt(`getAlternateUserWid(${id})`,
            () => api?.getAlternateUserWid?.(widDe(id)));
        const mapping = await attempt(`WWebJS.enforceLidAndPnRetrieval(${id})`,
            () => window.WWebJS?.enforceLidAndPnRetrieval?.(id));
        for (const candidateAlt of [alternative, mapping?.lid, mapping?.phone,
            read(contact, 'phoneNumber'), read(contact, 'lid')]) {
            const freshAlt = serial(candidateAlt);
            if (freshAlt && /@(?:c\.us|lid)$/.test(freshAlt)) ids.add(freshAlt);
        }
    }

    const chats = new Map();
    const collectionsChat = [
        ['WAWebCollections.Chat', collections?.Chat], ['Store.Chat', window.Store?.Chat]
    ];
    for (const id of ids) {
        for (const [nameAlt, collection] of collectionsChat) {
            if (!collection) {
                attempts.push({ method: `${nameAlt}(${id})`, status: 'indisponível' });
                continue;
            }
            for (const [type, keyAlt] of [['Wid', widDe(id)], ['string', id]]) {
                const chat = await attempt(`${nameAlt}.get(${type}, ${id})`, () => collection.get(keyAlt));
                if (chat) chats.set(`${nameAlt}:${id}`, chat);
            }
            const chat = collectionModels(collection).find(c => serial(read(c, 'id')) === id);
            if (chat) chats.set(`${nameAlt}.models:${id}`, chat);
        }
        if (![...chats.values()].some(c => serial(read(c, 'id')) === id)) {
            const chat = await attempt(`WWebJS.getChat(${id})`,
                () => window.WWebJS?.getChat?.(id, { getAsModel: false }));
            if (chat) chats.set(`WWebJS:${id}`, chat);
        }
        if (!chats.size) {
            const chat = await attempt(`WAWebCollections.Chat.find(${id})`,
                () => collections?.Chat?.find?.(widDe(id)));
            if (chat) chats.set(`Chat.find:${id}`, chat);
        }
        if (!chats.size) {
            const action = load('WAWebFindChatAction');
            const found = await attempt(`findOrCreateLatestChat(${id})`,
                () => action?.findOrCreateLatestChat?.(widDe(id)));
            if (found?.chat) chats.set(`findOrCreateLatestChat:${id}`, found.chat);
        }
    }

    for (const chat of chats.values()) {
        for (const candidate of [read(chat, 'id'), read(read(chat, 'presence'), 'id')]) {
            const id = serial(candidate);
            if (id && /@(?:c\.us|lid)$/.test(id)) ids.add(id);
        }
    }
    const idPresence = [...ids].find(id => id.endsWith('@lid')) ?? [...ids][0];
    const presenceCollections = [
        ['WAWebCollections.Presence', collections?.Presence],
        ['Store.Presence', window.Store?.Presence]
    ];
    for (const nameAlt of new Set(['WAWebPresenceCollection', 'WAWebPresenceModel',
        ...discoveredModules.filter(n => /Presence.*Collection/.test(n)).slice(0, 8)])) {
        const module = load(nameAlt);
        for (const keyAlt of ['PresenceCollection', 'PresenceCollectionImpl', 'Presence']) {
            if (module?.[keyAlt]?.get) presenceCollections.push([`${nameAlt}.${keyAlt}`, module[keyAlt]]);
        }
    }
    const searchPresences = () => {
        for (const [nameAlt, chat] of chats) {
            save(`${nameAlt}.presence`, read(chat, 'presence'));
            save(`${nameAlt}.__x_presence`, read(chat, '__x_presence'));
            save(`${nameAlt}.attributes.presence`, read(read(chat, 'attributes'), 'presence'));
            save(`${nameAlt}.contact.presence`, read(read(chat, 'contact'), 'presence'));
            try { save(`${nameAlt}.get(presence)`, chat.get?.('presence')); }
            catch { /* Model without a presence getter. */ }
        }
        for (const id of ids) {
            const contact = get(collections?.Contact, widDe(id));
            save(`Contact(${id}).presence`, read(contact, 'presence'));
            save(`Contact(${id}).__x_presence`, read(contact, '__x_presence'));
            for (const [nameAlt, collection] of presenceCollections) {
                save(`${nameAlt}(${id})`, get(collection, widDe(id)) ?? get(collection, id));
                const modelAlt = collectionModels(collection).find(c => serial(read(c, 'id')) === id);
                save(`${nameAlt}.models(${id})`, modelAlt);
            }
        }
    };

    // Limited snapshot without circular references; never walks messages or the schedule.
    const snapshot = (obj, depth = 0, seen = new Set()) => {
        if (obj == null) return null;
        if (typeof obj === 'string') return obj.slice(0, 250);
        if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
        if (typeof obj === 'bigint') return String(obj);
        if (typeof obj !== 'object') return null;
        if (seen.has(obj)) return '[circular]';
        if (depth > 3) return '[limite de profundidade]';
        seen.add(obj);
        if (Array.isArray(obj)) return obj.slice(0, 5).map(v => snapshot(v, depth + 1, seen));
        const resultAlt = {};
        const keys = new Set([
        'type', 't', 'deny', '__x_type', '__x_t', '__x_deny',
        'isOnline', 'lastSeen', 'lastSeenTimestamp', 'lastSeenTs', 'last_seen',
        'chatstate', 'chatstates', 'hasData', 'isSubscribed',
        '__x_isOnline', '__x_lastSeen', '__x_chatstate', '__x_chatstates',
        'attributes', '_values', '_data']);
        for (const keyAlt of [...keys].slice(0, 40)) {
            const v = read(obj, keyAlt);
            if (v === undefined || typeof v === 'function') continue;
            if (keyAlt === 'chatstates' || keyAlt === '__x_chatstates') {
                resultAlt[keyAlt] = collectionModels(v).slice(0, 5)
                    .map(m => snapshot(m, depth + 1, seen));
            } else if (keyAlt === 'id') {
                resultAlt[keyAlt] = serial(v) ?? null;
            } else {
                resultAlt[keyAlt] = snapshot(v, depth + 1, new Set(seen));
            }
        }
        return resultAlt;
    };
    const priority = (source, id) =>
        (/^(?:WAWebCollections\.Presence|WAWebPresenceCollection\.)/.test(source) ? 20 : 0) +
        (id === idPresence || source.includes(`(${idPresence})`) ? 10 : 0);
    const sourcesAlt = () => [...modelsAlt].sort(([a, ma], [b, mb]) =>
        priority(b, serial(read(mb, 'id'))) - priority(a, serial(read(ma, 'id'))))
        .filter(([, model], i, allAlt2) =>
        allAlt2.findIndex(([, other]) => other === model) === i).slice(0, 24)
        .map(([source, model]) => {
        const data = snapshot(model);
        if (typeof model.get === 'function') {
            const values = {};
            for (const key of ['isOnline', 'lastSeen', 'chatstate', 'hasData', 'isSubscribed']) {
                try { values[key] = snapshot(model.get(key)); }
                catch { /* Getter not available. */ }
            }
            data.get = values;
        }
        if (typeof model.toJSON === 'function') {
            try { data.toJSON = snapshot(model.toJSON()); } catch { /* Modelo parcial. */ }
        }
        return { source, id: serial(read(model, 'id')), keys: Object.keys(data), data };
    });
    const candidatesAlt = sources => {
        const candidates = [];
        const search = (obj, path) => {
            if (!obj || typeof obj !== 'object') return;
            for (const [key, value] of Object.entries(obj)) {
                if (/^(?:__x_)?last_?seen(?:Timestamp|Ts)?$/i.test(key) && value != null &&
                    ['string', 'number'].includes(typeof value)) {
                    candidates.push({ source: `${path}.${key}`, value, kind: 'lastSeen' });
                }
                search(value, `${path}.${key}`);
            }
            // Chatstate uses type/t/deny: t is only a candidate for last seen when offline.
            if (['unavailable', 'offline'].includes(obj.type ?? obj.__x_type) &&
                !(obj.deny ?? obj.__x_deny) && (obj.t ?? obj.__x_t) != null) {
                candidates.push({ source: `${path}.${obj.t != null ? 't' : '__x_t'}`,
                    value: obj.t ?? obj.__x_t,
                    kind: 'chatstate offline (confirmar no aplicativo)' });
            }
        };
        for (const { source, data } of sources) search(data, source);
        return candidates;
    };
    searchPresences();
    const chatGetters = load('WAWebChatGetters');
    if (typeof chatGetters?.getPresence === 'function') {
        for (const [nameAlt, chat] of chats) {
            save(`${nameAlt}.getPresence`, await attempt(`WAWebChatGetters.getPresence(${nameAlt})`,
                () => chatGetters.getPresence(chat)));
        }
    }
    const before = sourcesAlt();
    const properties = data => [data, data?.attributes, data?._values,
        data?.get, data?.toJSON, data?._data].filter(Boolean);
    const fieldOf = (sourceAlt, nameAlt) => properties(sourceAlt?.data)
        .map(p => p[nameAlt] ?? p[`__x_${nameAlt}`])
        .find(v => v != null && typeof v !== 'object') ?? null;
    const chooseSource = sources => sources.find(s =>
        priority(s.source, s.id) >= 20) ?? sources.find(s => fieldOf(s, 'hasData') === true) ??
        sources.find(s => candidatesAlt([s]).length) ?? sources[0];
    const signature = sourceAlt => JSON.stringify(sourceAlt?.data);

    const subscriptions = [
        ['WAWebContactPresenceBridge', load('WAWebContactPresenceBridge')],
        ['WAWebPresenceSubscribeAction', load('WAWebPresenceSubscribeAction')],
        ['Store.PresenceUtils', window.Store?.PresenceUtils],
        ...discoveredModules.filter(n => /Presence.*(?:Bridge|Subscribe)/.test(n))
            .slice(0, 8).map(n => [n, load(n)])
    ];
    let subscriptionRequested = false;
    const signatureActive = monitor && fieldOf(chooseSource(before), 'isSubscribed') === true;
    for (const id of [idPresence]) {
        if (!/@(?:c\.us|lid)$/.test(id)) continue;
        for (const [nameAlt, module] of subscriptions) {
            for (const fn of ['subscribeUserPresence', 'subscribePresence']) {
                const method = module?.[fn];
                if (signatureActive || subscriptionRequested || typeof method !== 'function') continue;
                if (fn === 'subscribeUserPresence' && !id.endsWith('@lid')) continue;
                await attempt(`${nameAlt}.${fn}(${id})`, () => method.call(module, widDe(id)));
                const attemptAlt = attempts.at(-1);
                subscriptionRequested = ['ok', 'sem retorno'].includes(attemptAlt.status) ||
                    Boolean(attemptAlt.error?.startsWith('Timeout'));
            }
        }
    }
    for (const [nameAlt, model] of modelsAlt) {
        if (!signatureActive && !subscriptionRequested && typeof model.subscribe === 'function') {
            await attempt(`${nameAlt}.subscribe()`, () => model.subscribe());
            const attemptAlt = attempts.at(-1);
            subscriptionRequested = ['ok', 'sem retorno'].includes(attemptAlt.status) ||
                Boolean(attemptAlt.error?.startsWith('Timeout'));
        }
        if (typeof model.getLastSeen === 'function') {
            const lastSeen = await attempt(`${nameAlt}.getLastSeen()`, () => model.getLastSeen());
            if (lastSeen != null) save(`${nameAlt}.getLastSeen()`, { lastSeen });
        }
    }

    // Known getters; the other exports stay in the diagnostic for the next investigation.
    for (const nameAlt of new Set(['WAWebPresenceGetters', 'WAWebChatPresenceGetters',
        'WAWebContactGetters', 'WAWebChatGetters',
        ...discoveredModules.filter(n => /(?:Presence|LastSeen).*Getters/.test(n)).slice(0, 8)])) {
        const module = load(nameAlt);
        const targets = nameAlt.includes('Contact')
            ? [...ids].map(id => [`Contact(${id})`, get(collections?.Contact, widDe(id))])
            : nameAlt === 'WAWebChatGetters' ? [...chats] : [...modelsAlt];
        for (const fn of ['getLastSeen', 'getLastSeenTimestamp', 'getIsOnline']) {
            if (typeof module?.[fn] !== 'function') continue;
            for (const [source, model] of targets.slice(0, 4)) {
                if (!model) continue;
                const value = await attempt(`${nameAlt}.${fn}(${source})`, () => module[fn](model));
                if (value != null) save(`${nameAlt}.${fn}(${source})`, {
                    [fn === 'getIsOnline' ? 'isOnline' : 'lastSeen']: value
                });
            }
        }
    }

    // Opening the chat triggers the same path as the interface; only as a fallback without lastSeen.
    searchPresences();
    let openRequested = false;
    if (!monitor && !candidatesAlt(sourcesAlt()).some(c => c.kind === 'lastSeen') && chats.size &&
        /@(?:c\.us|lid)$/.test(chatId)) {
        const cmd = load('WAWebCmd')?.Cmd;
        if (typeof cmd?.openChatBottom === 'function') {
            openRequested = true;
            await attempt('Cmd.openChatBottom (abre o contato na interface)',
                () => cmd.openChatBottom({ chat: chats.values().next().value }));
        }
    }
    const waitUntil = Math.min(deadline, Date.now() + (monitor ? 5000 : 15000));
    let polls = 0;
    while (Date.now() < waitUntil && /@(?:c\.us|lid)$/.test(chatId)) {
        searchPresences();
        const current = chooseSource(sourcesAlt());
        const previous = before.find(s => s.source === current?.source);
        const changed = signature(current) !== signature(previous);
        const ready = fieldOf(current, 'hasData') === true ||
            (fieldOf(current, 'hasData') == null && candidatesAlt(current ? [current] : []).length);
        const completed = !subscriptionRequested || changed;
        if (ready && completed) break;
        await new Promise(resolve => setTimeout(resolve, 400));
        polls++;
    }
    searchPresences();
    const sources = sourcesAlt();
    const sourceAlt = chooseSource(sources);
    const candidates = fieldOf(sourceAlt, 'isOnline') === true
        ? [] : candidatesAlt(sourceAlt ? [sourceAlt] : []);
    const explicit = candidates.find(c => c.kind === 'lastSeen');
    const foundAlt = explicit ?? candidates.find(c => c.kind.startsWith('chatstate offline'));
    const field = nameAlt => fieldOf(sourceAlt, nameAlt);
    const dateChangedDuringQuery = Boolean(sourceAlt && signature(sourceAlt) !==
        signature(before.find(s => s.source === sourceAlt.source)));
    const hasData = field('hasData');
    const queryStatus = dateChangedDuringQuery && hasData === true
        ? 'dados mudaram durante a consulta'
        : hasData === true || foundAlt
            ? 'dados em cache; atualização não confirmada'
            : 'sem dados recebidos até o fim da consulta';
    const valueAlt = foundAlt?.value ?? null;
    const numberAlt = typeof valueAlt === 'number' || /^\d+$/.test(String(valueAlt)) ? Number(valueAlt) : NaN;
    const data = numberAlt > 0 ? new Date(numberAlt < 1e12 ? numberAlt * 1000 : numberAlt) : null;
    const ui = { requestedChatId: chatId, openRequested, headerText: null, presenceTexts: [] };
    try {
        const header = monitor ? null : document.querySelector('#main header');
        ui.headerText = header?.innerText?.slice(0, 1000) ?? null;
        ui.presenceTexts = [...(header?.querySelectorAll('[title], [aria-label], span') ?? [])]
            .flatMap(el => [
                el.getAttribute('title'), el.getAttribute('aria-label'), el.textContent
            ])
            .filter(t => t &&
                /visto por último|last seen|online|digitando|typing|gravando/i.test(t))
            .map(t => t.trim().slice(0, 250));
        ui.presenceTexts = [...new Set(ui.presenceTexts)].slice(0, 12);
    } catch (err) {
        ui.error = String(err.message ?? err).slice(0, 180);
    }
    ui.note = 'Texto da interface: confirme o contato no cabeçalho; não é usado como timestamp.';
    const state = properties(sourceAlt?.data).map(p => p.chatstate ?? p.__x_chatstate)
        .find(v => v != null) ?? null;
    const stateProps = [state, state?.attributes, state?._values, state?._data].filter(Boolean);
    const stateField = nameAlt => stateProps.map(p => p[nameAlt] ?? p[`__x_${nameAlt}`])
        .find(v => v != null && typeof v !== 'object') ?? null;
    const resultAlt = {
        chatId, resolvedIds: [...ids], chatFound: chats.size > 0,
        presenceAvailable: modelsAlt.size > 0,
        presenceKeys: sources[0]?.keys ?? [],
        presenceData: {
            isOnline: field('isOnline'), lastSeen: valueAlt,
            hasData: field('hasData'), isSubscribed: field('isSubscribed'),
            chatstate: typeof state === 'string' ? state : {
                type: stateField('type'), t: stateField('t'), deny: stateField('deny')
            }
        },
        lastSeenSource: foundAlt?.source ?? null,
        lastSeenKind: foundAlt?.kind ?? null,
        subscriptionRequested,
        presenceSource: sourceAlt?.source ?? null,
        presenceId: sourceAlt?.id ?? idPresence,
        queryStatus,
        dataChangedDuringQuery: dateChangedDuringQuery,
        lastSeenISO: data && !Number.isNaN(data.getTime()) ? data.toISOString() : null,
        lastSeenCandidates: candidates,
        before, sources, attempts, discoveredModules, ui, polls, elapsedMs: Date.now() - start,
        note: valueAlt == null
            ? 'Last Seen não encontrado. Veja sources e attempts; null não significa offline.'
            : 'Last Seen encontrado; confira a origem e compare com o aplicativo.',
        ...(!chats.size ? { error: 'Chat não encontrado nas fontes consultadas' } : {})
    };
    if (!monitor) return resultAlt;
    // The scheduler needs the result, without repeating the internal templates in the debug.
    return {
        chatId, presenceData: resultAlt.presenceData,
        lastSeenSource: resultAlt.lastSeenSource, lastSeenKind: resultAlt.lastSeenKind,
        subscriptionRequested, dataChangedDuringQuery: dateChangedDuringQuery, queryStatus,
        presenceId: resultAlt.presenceId
    };
}

module.exports = { diagnosePresence };
