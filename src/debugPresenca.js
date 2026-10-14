/*
 * Executada inteira no browser: módulos internos variam entre versões do WhatsApp Web.
 * O prefixo debug também evita wrappers de instrumentação nesta função serializada.
 * Não confundir o horário da última mensagem com o "visto por último".
 */
async function diagnosticarPresenca(chatId, { monitor = false } = {}) {
    const inicio = Date.now();
    const prazo = inicio + (monitor ? 10000 : 25000);
    const attempts = [];
    const modules = {};
    const modelos = new Map();
    const ids = new Set([chatId.replace(/:\d+(?=@)/, '')]);
    const ler = (obj, chave) => {
        try { return obj?.[chave]; } catch { return undefined; }
    };
    const serial = id => typeof id === 'string' ? id : ler(id, '_serialized') ?? ler(id, '$1');
    const get = (colecao, chave) => {
        try { return colecao?.get?.(chave); } catch { return null; }
    };
    const modelosDaColecao = c => {
        try {
            const models = c?.getModelsArray?.() ?? c?.models ?? c?._models ?? [];
            return Array.isArray(models) ? models : Object.values(models);
        } catch { return []; }
    };
    const carregar = nome => {
        if (nome in modules) return modules[nome];
        try {
            const modulo = window.require?.(nome);
            modules[nome] = modulo ?? null;
            attempts.push({ method: nome, status: modulo ? 'disponível' : 'indisponível',
                exports: modulo ? Object.keys(modulo).slice(0, 40) : [] });
        } catch (err) {
            modules[nome] = null;
            attempts.push({ method: nome, status: 'indisponível',
                error: String(err.message ?? err).slice(0, 180) });
        }
        return modules[nome];
    };
    const tentar = async (method, fn) => {
        if (Date.now() >= prazo) {
            attempts.push({ method, status: 'prazo esgotado' });
            return null;
        }
        let timer;
        const limite = Math.min(1500, prazo - Date.now());
        try {
            const resultado = await Promise.race([
                Promise.resolve().then(fn),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`Timeout de ${limite} ms`)), limite);
                })
            ]);
            attempts.push({ method, status: resultado == null ? 'sem retorno' : 'ok' });
            return resultado;
        } catch (err) {
            attempts.push({ method, status: 'erro',
                error: String(err.message ?? err).slice(0, 180) });
            return null;
        } finally {
            clearTimeout(timer);
        }
    };
    const guardar = (source, model) => {
        if (model && typeof model === 'object') modelos.set(source, model);
        else modelos.delete(source);
        return model;
    };
    const factory = carregar('WAWebWidFactory');
    const widDe = id => {
        try { return factory?.createWid?.(id) ?? id; } catch { return id; }
    };
    const collections = carregar('WAWebCollections');
    const api = carregar('WAWebApiContact');
    const debug = (() => {
        try { return window.require?.('__debug'); } catch { return null; }
    })();
    const discoveredModules = Object.keys(debug?.modulesMap ?? {})
        .filter(nome => /(?:Presence|Chatstate|LastSeen)/i.test(nome)).slice(0, 60);
    for (const nome of discoveredModules.filter(n => /(?:LastSeen|Presence.*Getters)/.test(n))
        .slice(0, 12)) carregar(nome);
    carregar('WAWebPresenceChatAction');
    for (const id of [...ids]) {
        if (!/@(?:c\.us|lid)$/.test(id)) continue;
        const contact = get(collections?.Contact, widDe(id));
        const alternativo = await tentar(`getAlternateUserWid(${id})`,
            () => api?.getAlternateUserWid?.(widDe(id)));
        const mapping = await tentar(`WWebJS.enforceLidAndPnRetrieval(${id})`,
            () => window.WWebJS?.enforceLidAndPnRetrieval?.(id));
        for (const candidato of [alternativo, mapping?.lid, mapping?.phone,
            ler(contact, 'phoneNumber'), ler(contact, 'lid')]) {
            const novo = serial(candidato);
            if (novo && /@(?:c\.us|lid)$/.test(novo)) ids.add(novo);
        }
    }

    const chats = new Map();
    const colecoesChat = [
        ['WAWebCollections.Chat', collections?.Chat], ['Store.Chat', window.Store?.Chat]
    ];
    for (const id of ids) {
        for (const [nome, colecao] of colecoesChat) {
            if (!colecao) {
                attempts.push({ method: `${nome}(${id})`, status: 'indisponível' });
                continue;
            }
            for (const [tipo, chave] of [['Wid', widDe(id)], ['string', id]]) {
                const chat = await tentar(`${nome}.get(${tipo}, ${id})`, () => colecao.get(chave));
                if (chat) chats.set(`${nome}:${id}`, chat);
            }
            const chat = modelosDaColecao(colecao).find(c => serial(ler(c, 'id')) === id);
            if (chat) chats.set(`${nome}.models:${id}`, chat);
        }
        if (![...chats.values()].some(c => serial(ler(c, 'id')) === id)) {
            const chat = await tentar(`WWebJS.getChat(${id})`,
                () => window.WWebJS?.getChat?.(id, { getAsModel: false }));
            if (chat) chats.set(`WWebJS:${id}`, chat);
        }
        if (!chats.size) {
            const chat = await tentar(`WAWebCollections.Chat.find(${id})`,
                () => collections?.Chat?.find?.(widDe(id)));
            if (chat) chats.set(`Chat.find:${id}`, chat);
        }
        if (!chats.size) {
            const action = carregar('WAWebFindChatAction');
            const found = await tentar(`findOrCreateLatestChat(${id})`,
                () => action?.findOrCreateLatestChat?.(widDe(id)));
            if (found?.chat) chats.set(`findOrCreateLatestChat:${id}`, found.chat);
        }
    }

    for (const chat of chats.values()) {
        for (const candidate of [ler(chat, 'id'), ler(ler(chat, 'presence'), 'id')]) {
            const id = serial(candidate);
            if (id && /@(?:c\.us|lid)$/.test(id)) ids.add(id);
        }
    }
    const idPresenca = [...ids].find(id => id.endsWith('@lid')) ?? [...ids][0];
    const presenceCollections = [
        ['WAWebCollections.Presence', collections?.Presence],
        ['Store.Presence', window.Store?.Presence]
    ];
    for (const nome of new Set(['WAWebPresenceCollection', 'WAWebPresenceModel',
        ...discoveredModules.filter(n => /Presence.*Collection/.test(n)).slice(0, 8)])) {
        const modulo = carregar(nome);
        for (const chave of ['PresenceCollection', 'PresenceCollectionImpl', 'Presence']) {
            if (modulo?.[chave]?.get) presenceCollections.push([`${nome}.${chave}`, modulo[chave]]);
        }
    }
    const buscarPresencas = () => {
        for (const [nome, chat] of chats) {
            guardar(`${nome}.presence`, ler(chat, 'presence'));
            guardar(`${nome}.__x_presence`, ler(chat, '__x_presence'));
            guardar(`${nome}.attributes.presence`, ler(ler(chat, 'attributes'), 'presence'));
            guardar(`${nome}.contact.presence`, ler(ler(chat, 'contact'), 'presence'));
            try { guardar(`${nome}.get(presence)`, chat.get?.('presence')); }
            catch { /* Modelo sem getter de presença. */ }
        }
        for (const id of ids) {
            const contact = get(collections?.Contact, widDe(id));
            guardar(`Contact(${id}).presence`, ler(contact, 'presence'));
            guardar(`Contact(${id}).__x_presence`, ler(contact, '__x_presence'));
            for (const [nome, colecao] of presenceCollections) {
                guardar(`${nome}(${id})`, get(colecao, widDe(id)) ?? get(colecao, id));
                const modelo = modelosDaColecao(colecao).find(c => serial(ler(c, 'id')) === id);
                guardar(`${nome}.models(${id})`, modelo);
            }
        }
    };

    // Snapshot limitado e sem referências circulares; nunca percorre mensagens ou a agenda.
    const snapshot = (obj, depth = 0, vistos = new Set()) => {
        if (obj == null) return null;
        if (typeof obj === 'string') return obj.slice(0, 250);
        if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
        if (typeof obj === 'bigint') return String(obj);
        if (typeof obj !== 'object') return null;
        if (vistos.has(obj)) return '[circular]';
        if (depth > 3) return '[limite de profundidade]';
        vistos.add(obj);
        if (Array.isArray(obj)) return obj.slice(0, 5).map(v => snapshot(v, depth + 1, vistos));
        const resultado = {};
        const chaves = new Set([
        'type', 't', 'deny', '__x_type', '__x_t', '__x_deny',
        'isOnline', 'lastSeen', 'lastSeenTimestamp', 'lastSeenTs', 'last_seen',
        'chatstate', 'chatstates', 'hasData', 'isSubscribed',
        '__x_isOnline', '__x_lastSeen', '__x_chatstate', '__x_chatstates',
        'attributes', '_values', '_data']);
        for (const chave of [...chaves].slice(0, 40)) {
            const v = ler(obj, chave);
            if (v === undefined || typeof v === 'function') continue;
            if (chave === 'chatstates' || chave === '__x_chatstates') {
                resultado[chave] = modelosDaColecao(v).slice(0, 5)
                    .map(m => snapshot(m, depth + 1, vistos));
            } else if (chave === 'id') {
                resultado[chave] = serial(v) ?? null;
            } else {
                resultado[chave] = snapshot(v, depth + 1, new Set(vistos));
            }
        }
        return resultado;
    };
    const prioridade = (source, id) =>
        (/^(?:WAWebCollections\.Presence|WAWebPresenceCollection\.)/.test(source) ? 20 : 0) +
        (id === idPresenca || source.includes(`(${idPresenca})`) ? 10 : 0);
    const fontes = () => [...modelos].sort(([a, ma], [b, mb]) =>
        prioridade(b, serial(ler(mb, 'id'))) - prioridade(a, serial(ler(ma, 'id'))))
        .filter(([, model], i, todos) =>
        todos.findIndex(([, outro]) => outro === model) === i).slice(0, 24)
        .map(([source, model]) => {
        const data = snapshot(model);
        if (typeof model.get === 'function') {
            const values = {};
            for (const key of ['isOnline', 'lastSeen', 'chatstate', 'hasData', 'isSubscribed']) {
                try { values[key] = snapshot(model.get(key)); }
                catch { /* Getter não disponível. */ }
            }
            data.get = values;
        }
        if (typeof model.toJSON === 'function') {
            try { data.toJSON = snapshot(model.toJSON()); } catch { /* Modelo parcial. */ }
        }
        return { source, id: serial(ler(model, 'id')), keys: Object.keys(data), data };
    });
    const candidatosDe = sources => {
        const candidates = [];
        const procurar = (obj, path) => {
            if (!obj || typeof obj !== 'object') return;
            for (const [key, value] of Object.entries(obj)) {
                if (/^(?:__x_)?last_?seen(?:Timestamp|Ts)?$/i.test(key) && value != null &&
                    ['string', 'number'].includes(typeof value)) {
                    candidates.push({ source: `${path}.${key}`, value, kind: 'lastSeen' });
                }
                procurar(value, `${path}.${key}`);
            }
            // Chatstate usa type/t/deny: t só é candidato ao visto por último quando offline.
            if (['unavailable', 'offline'].includes(obj.type ?? obj.__x_type) &&
                !(obj.deny ?? obj.__x_deny) && (obj.t ?? obj.__x_t) != null) {
                candidates.push({ source: `${path}.${obj.t != null ? 't' : '__x_t'}`,
                    value: obj.t ?? obj.__x_t,
                    kind: 'chatstate offline (confirmar no aplicativo)' });
            }
        };
        for (const { source, data } of sources) procurar(data, source);
        return candidates;
    };
    buscarPresencas();
    const chatGetters = carregar('WAWebChatGetters');
    if (typeof chatGetters?.getPresence === 'function') {
        for (const [nome, chat] of chats) {
            guardar(`${nome}.getPresence`, await tentar(`WAWebChatGetters.getPresence(${nome})`,
                () => chatGetters.getPresence(chat)));
        }
    }
    const before = fontes();
    const propriedadesDe = data => [data, data?.attributes, data?._values,
        data?.get, data?.toJSON, data?._data].filter(Boolean);
    const campoDe = (fonte, nome) => propriedadesDe(fonte?.data)
        .map(p => p[nome] ?? p[`__x_${nome}`])
        .find(v => v != null && typeof v !== 'object') ?? null;
    const escolherFonte = sources => sources.find(s =>
        prioridade(s.source, s.id) >= 20) ?? sources.find(s => campoDe(s, 'hasData') === true) ??
        sources.find(s => candidatosDe([s]).length) ?? sources[0];
    const assinatura = fonte => JSON.stringify(fonte?.data);

    const subscriptions = [
        ['WAWebContactPresenceBridge', carregar('WAWebContactPresenceBridge')],
        ['WAWebPresenceSubscribeAction', carregar('WAWebPresenceSubscribeAction')],
        ['Store.PresenceUtils', window.Store?.PresenceUtils],
        ...discoveredModules.filter(n => /Presence.*(?:Bridge|Subscribe)/.test(n))
            .slice(0, 8).map(n => [n, carregar(n)])
    ];
    let subscriptionRequested = false;
    const assinaturaAtiva = monitor && campoDe(escolherFonte(before), 'isSubscribed') === true;
    for (const id of [idPresenca]) {
        if (!/@(?:c\.us|lid)$/.test(id)) continue;
        for (const [nome, modulo] of subscriptions) {
            for (const fn of ['subscribeUserPresence', 'subscribePresence']) {
                const method = modulo?.[fn];
                if (assinaturaAtiva || subscriptionRequested || typeof method !== 'function') continue;
                if (fn === 'subscribeUserPresence' && !id.endsWith('@lid')) continue;
                await tentar(`${nome}.${fn}(${id})`, () => method.call(modulo, widDe(id)));
                const tentativa = attempts.at(-1);
                subscriptionRequested = ['ok', 'sem retorno'].includes(tentativa.status) ||
                    Boolean(tentativa.error?.startsWith('Timeout'));
            }
        }
    }
    for (const [nome, model] of modelos) {
        if (!assinaturaAtiva && !subscriptionRequested && typeof model.subscribe === 'function') {
            await tentar(`${nome}.subscribe()`, () => model.subscribe());
            const tentativa = attempts.at(-1);
            subscriptionRequested = ['ok', 'sem retorno'].includes(tentativa.status) ||
                Boolean(tentativa.error?.startsWith('Timeout'));
        }
        if (typeof model.getLastSeen === 'function') {
            const lastSeen = await tentar(`${nome}.getLastSeen()`, () => model.getLastSeen());
            if (lastSeen != null) guardar(`${nome}.getLastSeen()`, { lastSeen });
        }
    }

    // Getters conhecidos; os outros exports ficam no diagnóstico para a próxima investigação.
    for (const nome of new Set(['WAWebPresenceGetters', 'WAWebChatPresenceGetters',
        'WAWebContactGetters', 'WAWebChatGetters',
        ...discoveredModules.filter(n => /(?:Presence|LastSeen).*Getters/.test(n)).slice(0, 8)])) {
        const modulo = carregar(nome);
        const alvos = nome.includes('Contact')
            ? [...ids].map(id => [`Contact(${id})`, get(collections?.Contact, widDe(id))])
            : nome === 'WAWebChatGetters' ? [...chats] : [...modelos];
        for (const fn of ['getLastSeen', 'getLastSeenTimestamp', 'getIsOnline']) {
            if (typeof modulo?.[fn] !== 'function') continue;
            for (const [source, model] of alvos.slice(0, 4)) {
                if (!model) continue;
                const value = await tentar(`${nome}.${fn}(${source})`, () => modulo[fn](model));
                if (value != null) guardar(`${nome}.${fn}(${source})`, {
                    [fn === 'getIsOnline' ? 'isOnline' : 'lastSeen']: value
                });
            }
        }
    }

    // Abrir o chat aciona o mesmo caminho da interface; apenas como fallback sem lastSeen.
    buscarPresencas();
    let openRequested = false;
    if (!monitor && !candidatosDe(fontes()).some(c => c.kind === 'lastSeen') && chats.size &&
        /@(?:c\.us|lid)$/.test(chatId)) {
        const cmd = carregar('WAWebCmd')?.Cmd;
        if (typeof cmd?.openChatBottom === 'function') {
            openRequested = true;
            await tentar('Cmd.openChatBottom (abre o contato na interface)',
                () => cmd.openChatBottom({ chat: chats.values().next().value }));
        }
    }
    const esperarAte = Math.min(prazo, Date.now() + (monitor ? 5000 : 15000));
    let polls = 0;
    while (Date.now() < esperarAte && /@(?:c\.us|lid)$/.test(chatId)) {
        buscarPresencas();
        const atual = escolherFonte(fontes());
        const anterior = before.find(s => s.source === atual?.source);
        const mudou = assinatura(atual) !== assinatura(anterior);
        const pronto = campoDe(atual, 'hasData') === true ||
            (campoDe(atual, 'hasData') == null && candidatosDe(atual ? [atual] : []).length);
        const concluido = !subscriptionRequested || mudou;
        if (pronto && concluido) break;
        await new Promise(resolve => setTimeout(resolve, 400));
        polls++;
    }
    buscarPresencas();
    const sources = fontes();
    const fonte = escolherFonte(sources);
    const candidates = campoDe(fonte, 'isOnline') === true
        ? [] : candidatosDe(fonte ? [fonte] : []);
    const explicito = candidates.find(c => c.kind === 'lastSeen');
    const encontrado = explicito ?? candidates.find(c => c.kind.startsWith('chatstate offline'));
    const campo = nome => campoDe(fonte, nome);
    const dataChangedDuringQuery = Boolean(fonte && assinatura(fonte) !==
        assinatura(before.find(s => s.source === fonte.source)));
    const hasData = campo('hasData');
    const queryStatus = dataChangedDuringQuery && hasData === true
        ? 'dados mudaram durante a consulta'
        : hasData === true || encontrado
            ? 'dados em cache; atualização não confirmada'
            : 'sem dados recebidos até o fim da consulta';
    const valor = encontrado?.value ?? null;
    const numero = typeof valor === 'number' || /^\d+$/.test(String(valor)) ? Number(valor) : NaN;
    const data = numero > 0 ? new Date(numero < 1e12 ? numero * 1000 : numero) : null;
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
    const state = propriedadesDe(fonte?.data).map(p => p.chatstate ?? p.__x_chatstate)
        .find(v => v != null) ?? null;
    const stateProps = [state, state?.attributes, state?._values, state?._data].filter(Boolean);
    const stateCampo = nome => stateProps.map(p => p[nome] ?? p[`__x_${nome}`])
        .find(v => v != null && typeof v !== 'object') ?? null;
    const resultado = {
        chatId, resolvedIds: [...ids], chatFound: chats.size > 0,
        presenceAvailable: modelos.size > 0,
        presenceKeys: sources[0]?.keys ?? [],
        presenceData: {
            isOnline: campo('isOnline'), lastSeen: valor,
            hasData: campo('hasData'), isSubscribed: campo('isSubscribed'),
            chatstate: typeof state === 'string' ? state : {
                type: stateCampo('type'), t: stateCampo('t'), deny: stateCampo('deny')
            }
        },
        lastSeenSource: encontrado?.source ?? null,
        lastSeenKind: encontrado?.kind ?? null,
        subscriptionRequested,
        presenceSource: fonte?.source ?? null,
        presenceId: fonte?.id ?? idPresenca,
        queryStatus,
        dataChangedDuringQuery,
        lastSeenISO: data && !Number.isNaN(data.getTime()) ? data.toISOString() : null,
        lastSeenCandidates: candidates,
        before, sources, attempts, discoveredModules, ui, polls, elapsedMs: Date.now() - inicio,
        note: valor == null
            ? 'Last Seen não encontrado. Veja sources e attempts; null não significa offline.'
            : 'Last Seen encontrado; confira a origem e compare com o aplicativo.',
        ...(!chats.size ? { error: 'Chat não encontrado nas fontes consultadas' } : {})
    };
    if (!monitor) return resultado;
    // O agendador precisa do resultado, sem repetir os modelos internos no debug.
    return {
        chatId, presenceData: resultado.presenceData,
        lastSeenSource: resultado.lastSeenSource, lastSeenKind: resultado.lastSeenKind,
        subscriptionRequested, dataChangedDuringQuery, queryStatus,
        presenceId: resultado.presenceId
    };
}

module.exports = { diagnosticarPresenca };
