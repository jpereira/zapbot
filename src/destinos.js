/*
 * Destino de um aviso ou alvo de um comando: um contato, um grupo ou um número.
 * Usado pelo -to do /cron e dos alertas de preço (/cotacao e /crypto -alerta),
 * pelo alvo do /mudo e pelo -send do /defi -alerta.
 */

const { client } = require('./cliente');
const { aguardarEscolha } = require('./escolhas');
const { semAcentos } = require('./util/formatar');

/*
 * Formas aceitas:
 *   +5521999999999   → privado do número: DDI + DDD + número (o "+" é opcional)
 *   /Jorge Pereira/  → primeiro, um contato da sua agenda com todas as palavras
 *   "Jorge Pereira"    no nome; sem contato, um grupo. Em qualquer ordem, sem
 *   Jorge              diferenciar maiúsculas nem acentos; /.../ e aspas
 *                      permitem espaços
 * O nome igual (inteiro) ganha de um que só contém as palavras. Se ainda assim
 * mais de um servir, o comando lista e você responde com o nº (resolverOuEscolher).
 */
const DESTINO = /(^|\s)-to(?=\s|$)(?:\s+("([^"]*)"|'([^']*)'|\/([^/]*)\/|(\S+)))?/;
const EXEMPLO = '/Jorge Pereira/, /Grupo L200/ ou +5521999999999';
const LIMITE = 10;

// A mesma regex do -to para outra opção (ex.: o -send do /defi)
const regexDaOpcao = (opcao) => (opcao === 'to' ? DESTINO
    : new RegExp(DESTINO.source.replace('-to', `-${opcao}`)));

/**
 * Tira o "-to <destino>" (ou outra opção, como "-send") do texto do comando.
 * @returns {{ destino: string|null, informado: boolean, resto: string }}
 *   informado: a opção apareceu (mesmo sem valor, que é um erro para quem chama)
 */
function extrairDestino(texto, opcao = 'to') {
    const m = String(texto ?? '').match(regexDaOpcao(opcao));
    if (!m) return { destino: null, informado: false, resto: String(texto ?? '') };

    const valor = (m[3] ?? m[4] ?? m[5] ?? m[6] ?? '').trim();
    // Só tira o trecho da opção: o resto (inclusive quebras de linha) fica como veio
    const resto = (texto.slice(0, m.index) + m[1] + texto.slice(m.index + m[0].length)).trim();

    return { destino: valor || null, informado: true, resto };
}

const normalizar = (s) => semAcentos(s).trim();

// "+5521999999999", "5521 99999-9999" → só os dígitos; null se não é um número
function lerNumero(texto) {
    if (!/^\+?[\d\s().-]+$/.test(texto)) return null;
    return texto.replace(/\D/g, '');
}

/*
 * Os contatos salvos na agenda (com nome). O WhatsApp pode trazer a mesma
 * pessoa como @c.us e como @lid: com o mesmo nome, fica só o @c.us.
 */
async function contatosDaAgenda() {
    const todos = (await client.getContacts?.().catch(() => []) ?? [])
        .filter(c => c?.isMyContact && !c.isGroup && !c.isMe && c.name && c.id?._serialized);
    const comTelefone = new Set(todos.filter(c => c.id._serialized.endsWith('@c.us')).map(c => normalizar(c.name)));

    return todos.filter(c => c.id._serialized.endsWith('@c.us') || !comTelefone.has(normalizar(c.name)));
}

const doContato = (c) => ({ id: c.id._serialized, nome: c.name, grupo: false, numero: c.number ?? null });
const doGrupo = (g) => ({ id: g.id._serialized, nome: g.name, grupo: true });

/**
 * Resolve o texto para um chat.
 * @param {string} valor  o que veio no -to (ou no alvo do /mudo, no -send...)
 * @param {object} [o]
 * @param {string} [o.opcao]  como chamar o destino nas mensagens de erro (padrão: "-to")
 * @returns {Promise<{ id: string, nome: string, grupo: boolean }
 *   | { erro: string }
 *   | { opcoes: Array<{ id, nome, grupo }>, busca: string, mais: number }>}
 *   opcoes: mais de um serviu; quem chama oferece a escolha (resolverOuEscolher)
 */
async function resolverDestino(valor, { opcao = '-to' } = {}) {
    const texto = String(valor ?? '').trim();

    if (!texto) return { erro: `❌ Informe o destino do ${opcao}: um contato, um grupo ou um número (${EXEMPLO}).` };

    // Número: só dígitos, com + e separadores
    const digitos = lerNumero(texto);
    if (digitos !== null) {
        if (digitos.length < 10 || digitos.length > 15) {
            return { erro: `❌ Número inválido: ${texto}. Use DDI + DDD + número (ex.: +5521999999999).` };
        }

        const wid = await client.getNumberId(digitos).catch(() => null);
        if (!wid) return { erro: `❌ O número +${digitos} não está no WhatsApp.` };

        return { id: wid._serialized, nome: await nomeDoContato(wid._serialized, digitos), grupo: false };
    }

    // Nome: todas as palavras, primeiro nos contatos, depois nos grupos
    const busca = normalizar(texto);
    const palavras = busca.split(/\s+/);
    const casa = (nome) => palavras.every(p => normalizar(nome).includes(p));

    const contatos = (await contatosDaAgenda()).filter(c => casa(c.name));
    const grupos = (await client.getChats().catch(() => [])).filter(c => c.isGroup && c.name && casa(c.name));

    const exato = contatos.find(c => normalizar(c.name) === busca) ?? null;
    const grupoExato = grupos.find(g => normalizar(g.name) === busca) ?? null;

    if (exato && contatos.filter(c => normalizar(c.name) === busca).length === 1) return doContato(exato);
    if (!exato && grupoExato && grupos.filter(g => normalizar(g.name) === busca).length === 1) return doGrupo(grupoExato);

    const candidatos = contatos.length ? contatos.map(doContato) : grupos.map(doGrupo);
    if (candidatos.length === 1) return candidatos[0];

    if (!candidatos.length) {
        return { erro: `❌ Nenhum contato ou grupo com "${texto}" no nome.\n💡 _Use o nome como está na sua agenda ou o número: ${EXEMPLO}_` };
    }

    return { opcoes: candidatos.slice(0, LIMITE), busca: texto, mais: Math.max(0, candidatos.length - LIMITE) };
}

/**
 * Resolve o destino e, se mais de um servir, mostra a lista numerada e espera
 * você responder com o nº (até 2 minutos). Erros e o tempo esgotado já vão
 * respondidos no chat.
 * @param {object} msg  a mensagem do comando
 * @param {string} valor
 * @param {object} [o]  as mesmas de resolverDestino
 * @returns {Promise<{ id: string, nome: string, grupo: boolean } | null>}
 */
async function resolverOuEscolher(msg, valor, o = {}) {
    const r = await resolverDestino(valor, o);

    if (r.erro) {
        await msg.reply(r.erro);
        return null;
    }
    if (!r.opcoes) return r;

    const tipo = r.opcoes[0].grupo ? 'grupos' : 'contatos';
    const linhas = r.opcoes.map((d, i) => `${i + 1}. ${descreverDestino(d)}${d.numero ? ` · +${d.numero}` : ''}`);
    const mais = r.mais ? `\n_+${r.mais} ${tipo}: use mais palavras do nome para ver os outros_` : '';

    await msg.reply(`🔎 "${r.busca}" corresponde a ${r.opcoes.length + r.mais} ${tipo}:\n\n${linhas.join('\n')}${mais}\n\n` +
        '💡 _Responda só com o nº (em até 2 minutos), ou repita o comando com mais palavras do nome._');

    const chatId = msg.id?.remote ?? msg.from;
    return aguardarEscolha(chatId, r.opcoes, {
        aoExpirar: () => msg.reply(`⌛ Nenhum nº escolhido para "${r.busca}" em 2 minutos: nada foi feito.`)
    });
}

async function nomeDoContato(id, digitos) {
    const contato = await client.getContactById(id).catch(() => null);
    return contato?.name || contato?.pushname || `+${digitos}`;
}

// "👥 Grupo sobre L200" / "👤 Fulano"
const descreverDestino = (d) => `${d.grupo ? '👥' : '👤'} ${d.nome}`;

module.exports = {
    descreverDestino,
    extrairDestino,
    resolverDestino,
    resolverOuEscolher
};
