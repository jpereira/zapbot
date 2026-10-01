/*
 * Destino de um aviso (-to): uma pessoa pelo número ou um grupo pelo nome.
 * Usado pelos alertas de preço (/cotacao e /crypto -alerta) e pelo /agendar.
 */

const { client } = require('./cliente');
const { semAcentos } = require('./util/formatar');

/*
 * Formas aceitas:
 *   -to @5521999999999      → privado da pessoa (o "@" é opcional; vale também
 *                             mencionar o contato com @ no WhatsApp)
 *   -to /Grupo L200/        → grupo cujo nome tem todas as palavras, em qualquer
 *   -to "Grupo L200"          ordem e sem diferenciar maiúsculas nem acentos
 *   -to L200                  ("Grupo sobre L200"); /.../ e aspas permitem espaços
 */
const DESTINO = /(^|\s)-to(?=\s|$)(?:\s+("([^"]*)"|'([^']*)'|\/([^/]*)\/|(\S+)))?/;

/**
 * Tira o "-to <destino>" do texto do comando.
 * @returns {{ destino: string|null, informado: boolean, resto: string }}
 *   informado: o -to apareceu (mesmo sem valor, que é um erro para quem chama)
 */
function extrairDestino(texto) {
    const m = String(texto ?? '').match(DESTINO);
    if (!m) return { destino: null, informado: false, resto: String(texto ?? '') };

    const valor = (m[3] ?? m[4] ?? m[5] ?? m[6] ?? '').trim();
    // Só tira o trecho do -to: o resto (inclusive quebras de linha) fica como veio
    const resto = (texto.slice(0, m.index) + m[1] + texto.slice(m.index + m[0].length)).trim();

    return { destino: valor || null, informado: true, resto };
}

const normalizar = (s) => semAcentos(s).trim();

/**
 * Resolve o destino para um chat.
 * @param {string} valor  o que veio depois do -to
 * @param {object} [o]
 * @param {string[]} [o.mencoes]  msg.mentionedIds (mencionar com @ no WhatsApp)
 * @returns {Promise<{ id: string, nome: string, grupo: boolean } | { erro: string }>}
 */
async function resolverDestino(valor, { mencoes = [] } = {}) {
    const texto = String(valor ?? '').trim().replace(/^@/, '');

    if (!texto) return { erro: '❌ Informe o destino do -to: @número ou o nome do grupo.' };

    // Pessoa: só dígitos (com +, espaços ou traços, se vierem entre aspas)
    const digitos = texto.replace(/[\s()+-]/g, '');

    if (/^\d+$/.test(digitos)) {
        // Mencionado com @: o WhatsApp manda o id (às vezes @lid) em mentionedIds
        const mencionado = mencoes.find(id => id.split('@')[0] === digitos);
        if (mencionado) return { id: mencionado, nome: await nomeDoContato(mencionado, digitos), grupo: false };

        if (digitos.length < 10 || digitos.length > 15) {
            return { erro: `❌ Número inválido: ${texto}. Use DDI + DDD + número (ex.: @5521999999999).` };
        }

        const wid = await client.getNumberId(digitos).catch(() => null);
        if (!wid) return { erro: `❌ O número ${digitos} não está no WhatsApp.` };

        return { id: wid._serialized, nome: await nomeDoContato(wid._serialized, digitos), grupo: false };
    }

    // Grupo: todas as palavras no nome
    const palavras = normalizar(texto).split(/\s+/);
    const grupos = (await client.getChats().catch(() => [])).filter(c => c.isGroup);
    const encontrados = grupos.filter(g => palavras.every(p => normalizar(g.name).includes(p)));
    const exato = encontrados.find(g => normalizar(g.name) === normalizar(texto));

    if (exato || encontrados.length === 1) {
        const g = exato || encontrados[0];
        return { id: g.id._serialized, nome: g.name, grupo: true };
    }

    if (!encontrados.length) {
        return { erro: `❌ Nenhum grupo com "${texto}" no nome.\n💡 _Para uma pessoa, use o número: -to @5521999999999_` };
    }

    const LIMITE = 10;
    const nomes = encontrados.slice(0, LIMITE).map(g => `• ${g.name}`).join('\n');
    const mais = encontrados.length > LIMITE ? `\n_+${encontrados.length - LIMITE} grupo(s)_` : '';

    return { erro: `🔎 "${texto}" corresponde a ${encontrados.length} grupos:\n${nomes}${mais}\n💡 _Use mais palavras do nome, entre /.../ ou aspas: -to /Grupo L200/_` };
}

async function nomeDoContato(id, digitos) {
    const contato = await client.getContactById(id).catch(() => null);
    return contato?.name || contato?.pushname || digitos;
}

// "👥 Grupo sobre L200" / "👤 Fulano"
const descreverDestino = (d) => `${d.grupo ? '👥' : '👤'} ${d.nome}`;

module.exports = {
    descreverDestino,
    extrairDestino,
    resolverDestino
};
