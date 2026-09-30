/*
 * Contatos e chats: números, @lid -> telefone, nomes de grupos e de menções.
 */

const { client } = require('./cliente');
const { printDebug, printError } = require('./log');
const { isDebugMode } = require('./settings');

function normalizerPhoneNumber(phoneNumber) {
    return String(phoneNumber ?? '').replace(/\D/g, '');
}

function isPhoneNumber(value) {
    const digits = normalizerPhoneNumber(value);
    return digits.length >= 10 && digits.length <= 13;
}

function normalizeWid(wid) {
    if (!wid) return null;
    return `${wid.split('@')[0].split(':')[0]}@c.us`;
}

/**
 * Remove o identificador de dispositivo (:1, :93 etc.)
 * sem alterar o servidor original: @lid continua @lid.
 */
function removeDeviceSuffix(jid) {
    if (!jid || typeof jid !== 'string') return null;

    const atIndex = jid.indexOf('@');
    if (atIndex === -1) return jid;

    const userPart = jid.substring(0, atIndex).split(':')[0];
    const serverPart = jid.substring(atIndex + 1);

    return `${userPart}@${serverPart}`;
}

const lidPhoneCache = new Map();

/**
 * Converte um identificador @lid para o telefone real @c.us.
 */
async function resolveLidToPhone(lidJid) {
    const normalizedLid = removeDeviceSuffix(lidJid);

    if (!normalizedLid?.endsWith('@lid')) return normalizedLid;
    if (lidPhoneCache.has(normalizedLid)) return lidPhoneCache.get(normalizedLid);

    try {
        const result = await client.getContactLidAndPhone([normalizedLid]);

        const mapping = Array.isArray(result)
            ? result.find(item => removeDeviceSuffix(item?.lid) === normalizedLid)
            : null;

        let phoneJid = mapping?.pn || null;

        if (phoneJid && !phoneJid.includes('@')) {
            phoneJid = `${phoneJid}@c.us`;
        }

        phoneJid = removeDeviceSuffix(phoneJid);

        if (phoneJid?.endsWith('@c.us')) {
            lidPhoneCache.set(normalizedLid, phoneJid);
            return phoneJid;
        }

        return null;
    } catch (error) {
        printError('[LID] Falha ao converter LID para telefone:', normalizedLid, error?.message || String(error));
        return null;
    }
}

/*
 * Nome real de um grupo (chatId @g.us -> assunto do grupo).
 * O msg._data.chat nem sempre vem preenchido (ou vem com dados de outro chat),
 * então buscamos o chat pelo id. Cache curto: o assunto do grupo pode mudar.
 */
const GROUP_NAME_TTL_MS = 10 * 60 * 1000;
const groupNameCache = new Map();

async function resolverNomeDoGrupo(chatId) {
    if (!chatId?.endsWith('@g.us')) return null;

    const cache = groupNameCache.get(chatId);
    if (cache && Date.now() - cache.at < GROUP_NAME_TTL_MS) return cache.name;

    const chat = await client.getChatById(chatId).catch((err) => {
        if (isDebugMode()) printDebug(`[GRUPO] getChatById falhou para ${chatId}: ${err?.message || err}`);
        return null;
    });

    // getChatById monta o modelo completo do grupo e quebra para alguns grupos (@lid);
    // nesse caso lemos o assunto direto das coleções do WhatsApp Web.
    const name =
        chat?.name ||
        chat?.groupMetadata?.subject ||
        (await nomeDoGrupoNoStore(chatId)) ||
        null;

    if (name) groupNameCache.set(chatId, { name, at: Date.now() });
    return name;
}

async function nomeDoGrupoNoStore(chatId) {
    if (!client.pupPage) return null;

    return client.pupPage.evaluate((id) => {
        const { Chat, GroupMetadata } = window.require('WAWebCollections');
        const wid = window.require('WAWebWidFactory').createWid(id);
        const chat = Chat.get(wid);

        return GroupMetadata?.get(wid)?.subject || chat?.name || chat?.formattedTitle || null;
    }, chatId).catch((err) => {
        if (isDebugMode()) printDebug(`[GRUPO] Store sem o grupo ${chatId}: ${err?.message || err}`);
        return null;
    });
}

/*
 * Troca as menções cruas do texto (@100000000000001, que pode ser LID ou telefone)
 * pelo nome do contato: "@100000000000001" -> "@Fulano".
 * mentionedIds (da mensagem) ajuda a saber se o número é @lid ou @c.us;
 * sem ele (ocorrências antigas) tentamos os dois.
 */
const mentionNameCache = new Map();

async function nomeDaMencao(user, mentionedIds = []) {
    if (mentionNameCache.has(user)) return mentionNameCache.get(user);

    const candidatos = mentionedIds
        .map(m => removeDeviceSuffix(typeof m === 'string' ? m : m?._serialized))
        .filter(jid => jid?.split('@')[0] === user);

    if (!candidatos.length) candidatos.push(`${user}@lid`, `${user}@c.us`);

    let nome = null;

    for (const jid of candidatos) {
        // Para um @lid, o contato pelo telefone real costuma ter o nome salvo na agenda
        const phoneJid = jid.endsWith('@lid') ? await resolveLidToPhone(jid) : null;

        for (const id of [phoneJid, jid].filter(Boolean)) {
            const contact = await client.getContactById(id).catch(() => null);
            nome = contact?.name || contact?.pushname || contact?.verifiedName || null;
            if (nome) break;
        }

        if (!nome && phoneJid) nome = `+${phoneJid.split('@')[0]}`;
        if (nome) break;
    }

    if (nome) mentionNameCache.set(user, nome);
    return nome;
}

async function resolverMencoes(texto, mentionedIds = []) {
    texto = String(texto ?? '');
    const users = [...new Set([...texto.matchAll(/@(\d{6,})/g)].map(m => m[1]))];

    for (const user of users) {
        const nome = await nomeDaMencao(user, mentionedIds);
        if (nome) texto = texto.replaceAll(`@${user}`, `@${nome}`);
    }

    return texto;
}

/*
 * /show e /edit: reexibem as mensagens APAGADAS (/show) e EDITADAS (/edit)
 * guardadas no cache, no mesmo formato dos alertas.
 *   /show        → a última apagada deste chat      (/edit: a última editada)
 *   /show -3     → as 3 últimas (máx. setting 'show.max')
 *   /show -3 -pv → envia no SEU privado em vez de expor no chat atual
 *   /show -list  → apagadas e editadas do cache, por chat (o -l dos dois é o mesmo)
 *   /show -flush → remove as apagadas deste chat (no seu privado: de todos os chats)
 *   /show -2 -c 1       → as 2 últimas do chat nº 1 da lista de apagadas do -l
 *   /edit -2 -c zapbot  → as 2 últimas editadas do chat cujo nome contém "zapbot"
 *   /edit -f -c 1       → flush só das editadas do chat nº 1
 * Envia em ordem cronológica: a última enviada é a mais recente.
 */
// Em conversas privadas o mesmo chat pode aparecer como @lid ou @c.us
async function idsDoChatAtual(chatId) {
    const ids = [chatId];

    if (chatId.endsWith('@lid')) {
        const telefone = await resolveLidToPhone(chatId);
        if (telefone) ids.push(telefone);
    }

    return ids;
}

module.exports = {
    idsDoChatAtual,
    isPhoneNumber,
    normalizeWid,
    normalizerPhoneNumber,
    removeDeviceSuffix,
    resolveLidToPhone,
    resolverMencoes,
    resolverNomeDoGrupo
};
