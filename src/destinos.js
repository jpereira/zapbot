/*
 * Destino de um aviso ou alvo de um comando: um contato, um grupo, um número
 * ou (onde faz sentido) e-mails. É o -to de todos os comandos: /cron, os
 * alertas de preço (/cotacao e /crypto -alerta), o /defi -alerta e o
 * /backup -send; e o alvo do /mudo.
 */

const { client } = require('./cliente');
const { resolveLidToPhone } = require('./contatos');
const { enviarEmail, smtpParaEnviar } = require('./email');
const { aguardarEscolha, autorDe } = require('./escolhas');
const { printDebug, printError } = require('./log');
const { isDebugMode } = require('./settings');
const { semAcentos } = require('./util/formatar');

/*
 * Formas aceitas:
 *   +5521999999999   → privado do número: DDI + DDD + número (o "+" é opcional)
 *   /Jorge Pereira/  → primeiro, um contato da sua agenda com todas as palavras
 *   "Jorge Pereira"    no nome; sem contato, um grupo. Em qualquer ordem, sem
 *   Jorge              diferenciar maiúsculas nem acentos; /.../ e aspas
 *                      permitem espaços
 *   email            → (aceitaEmail) o QRCODE_EMAIL_SMTP_TO, pelo SMTP do bot
 *   voce@exemplo.com → (aceitaEmail) um ou mais e-mails, separados por vírgula
 * O nome igual (inteiro) ganha de um que só contém as palavras. Se ainda assim
 * mais de um servir, o comando lista e você responde com o nº (resolverOuEscolher).
 */
const DESTINO = /(^|\s)-to(?=\s|$)(?:\s+("([^"]*)"|'([^']*)'|\/([^/]*)\/|(\S+)))?/;
const EXEMPLO = '/Jorge Pereira/, /Grupo L200/ ou +5521999999999';
const LIMITE = 10;

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const ehPalavraEmail = (s) => /^e-?mail$/i.test(s);

// Os endereços do QRCODE_EMAIL_SMTP_TO, que pode vir como "Eu <eu@exemplo.com>, outro@x.com"
const emailsDoSmtpTo = () => String(process.env.QRCODE_EMAIL_SMTP_TO ?? '').split(',')
    .map(e => (e.match(/<([^>]*)>/)?.[1] ?? e).trim());

/**
 * Tira o "-to <destino>" do texto do comando.
 * @returns {{ destino: string|null, informado: boolean, resto: string }}
 *   informado: o -to apareceu (mesmo sem valor, que é um erro para quem chama)
 */
function extrairDestino(texto) {
    const m = String(texto ?? '').match(DESTINO);
    if (!m) return { destino: null, informado: false, resto: String(texto ?? '') };

    const valor = (m[3] ?? m[4] ?? m[5] ?? m[6] ?? '').trim();
    // Só tira o trecho da opção: o resto (inclusive quebras de linha) fica como veio
    const resto = (texto.slice(0, m.index) + m[1] + texto.slice(m.index + m[0].length)).trim();

    return { destino: valor || null, informado: true, resto };
}

/**
 * Tira todos os "-to <destino>" do texto (o /cron aceita vários).
 * @returns {{ destinos: Array<string|null>, informado: boolean, resto: string }}
 *   destinos: um por -to, na ordem (null: -to sem valor)
 */
function extrairDestinos(texto) {
    const destinos = [];
    let resto = String(texto ?? '');

    for (;;) {
        const r = extrairDestino(resto);
        if (!r.informado) break;
        destinos.push(r.destino);
        resto = r.resto;
    }

    return { destinos, informado: destinos.length > 0, resto };
}

const normalizar = (s) => semAcentos(s).trim();

// "+5521999999999", "5521 99999-9999" → só os dígitos; null se não é um número
function lerNumero(texto) {
    if (!/^\+?[\d\s().-]+$/.test(texto)) return null;
    return texto.replace(/\D/g, '');
}

/*
 * Os contatos salvos na agenda (com nome). O WhatsApp pode trazer a mesma
 * pessoa duas vezes: pelo telefone e pelo LID (o id interno, de ~15 dígitos),
 * e o do LID às vezes vem como @lid, às vezes como um @c.us com os dígitos do
 * LID. Entre os de mesmo nome, sai o que é o LID de outro da lista (pelo mapa
 * LID → telefone do WhatsApp) e o @lid quando há um @c.us.
 */
async function semAsCopiasPeloLid(contatos) {
    const porNome = Map.groupBy(contatos, c => normalizar(c.name));
    const copias = new Set();

    for (const doNome of porNome.values()) {
        if (doNome.length < 2) continue;

        const ids = new Set(doNome.map(c => c.id._serialized));
        for (const c of doNome) {
            const lid = c.id._serialized.endsWith('@lid') ? c.id._serialized : `${c.id._serialized.split('@')[0]}@lid`;
            const telefone = await resolveLidToPhone(lid);
            if (telefone && telefone !== c.id._serialized && ids.has(telefone)) copias.add(c);
        }

        // Sem o mapa: o @lid sai se o mesmo nome tem um @c.us
        if (doNome.some(c => c.id._serialized.endsWith('@c.us') && !copias.has(c))) {
            doNome.filter(c => c.id._serialized.endsWith('@lid')).forEach(c => copias.add(c));
        }
    }

    return contatos.filter(c => !copias.has(c));
}

/*
 * Contatos e grupos com todas as palavras no nome, lidos direto da memória do
 * WhatsApp Web. NÃO usa o client.getContacts() nem o client.getChats(): eles
 * montam o modelo completo de tudo, e o getChats() consulta os servidores do
 * WhatsApp para CADA grupo (groupMetadata.update); com muitos grupos, a página
 * fica ocupada por minutos e as mensagens seguintes esperam na fila.
 * Aqui o filtro roda lá dentro e só volta o necessário. Um contato de LID
 * (o id interno) vem com o telefone dele, se o WhatsApp souber qual é.
 * O nome e o "está na agenda" saem das mesmas funções que o whatsapp-web.js
 * usa (WAWebContactGetters e WAWebFrontendContactGetters): no modelo cru do
 * contato, c.name e c.isMyContact vêm vazios.
 */
const BUSCA_TIMEOUT_MS = 20_000;

function buscarNoWhatsApp(palavras) {
    const busca = client.pupPage.evaluate((palavras) => {
        const tentar = (fn, padrao = null) => {
            try {
                return fn() ?? padrao;
            } catch {
                return padrao;
            }
        };

        // Sem algum módulo (outra versão do WhatsApp Web), valem as propriedades do modelo
        const { Contact, Chat } = window.require('WAWebCollections');
        const { getAlternateUserWid } = tentar(() => window.require('WAWebApiContact'), {});
        const getters = tentar(() => window.require('WAWebContactGetters'), {});
        const { getIsMyContact } = tentar(() => window.require('WAWebFrontendContactGetters'), {});
        const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const casa = (nome) => Boolean(nome) && palavras.every(p => norm(nome).includes(p));
        const serial = (wid) => wid?._serialized ?? null;

        const contatos = Contact.getModelsArray()
            .filter(c => c.id?.server !== 'g.us')
            .map(c => ({ c, nome: tentar(() => getters.getName(c), c.name) }))
            .filter(({ c, nome }) => casa(nome) &&
                tentar(() => getIsMyContact(c), c.isMyContact) && !tentar(() => getters.getIsMe(c), c.isMe))
            .map(({ c, nome }) => {
                const id = serial(c.id);
                const telefone = id?.endsWith('@lid')
                    ? serial(c.phoneNumber) ?? serial(tentar(() => getAlternateUserWid(c.id)))
                    : null;
                return { id: telefone ?? id, nome };
            });

        const grupos = Chat.getModelsArray()
            .filter(ch => ch.id?.server === 'g.us' && casa(ch.formattedTitle || ch.name))
            .map(ch => ({ id: serial(ch.id), nome: ch.formattedTitle || ch.name }));

        return { contatos, grupos };
    }, palavras);

    let limite;
    const tempo = new Promise((_, rejeitar) => {
        limite = setTimeout(() => rejeitar(new Error(`o WhatsApp Web não respondeu em ${BUSCA_TIMEOUT_MS / 1000} s`)), BUSCA_TIMEOUT_MS);
    });
    return Promise.race([busca, tempo]).finally(() => clearTimeout(limite));
}

// Mesma forma do whatsapp-web.js (Contact e Chat), para o resto do código não depender da origem
async function contatosEGrupos(palavras) {
    if (client.pupPage) {
        const { contatos, grupos } = await buscarNoWhatsApp(palavras);
        const unicos = [...new Map(contatos.filter(c => c.id).map(c => [c.id, c])).values()];
        return {
            contatos: unicos.map(c => ({ id: { _serialized: c.id }, name: c.nome, number: c.id.split('@')[0], isMyContact: true })),
            grupos: grupos.filter(g => g.id).map(g => ({ id: { _serialized: g.id }, name: g.nome, isGroup: true }))
        };
    }

    // Sem a página (os testes): as listas do cliente
    const [contatos, chats] = await Promise.all([client.getContacts?.().catch(() => []) ?? [], client.getChats().catch(() => [])]);
    const casa = (nome) => palavras.every(p => normalizar(nome).includes(p));
    return {
        contatos: contatos.filter(c => c?.isMyContact && !c.isGroup && !c.isMe && c.name && c.id?._serialized && casa(c.name)),
        grupos: chats.filter(c => c.isGroup && c.name && casa(c.name))
    };
}

const doContato = (c) => ({ id: c.id._serialized, nome: c.name, grupo: false, numero: c.number ?? null });
const doGrupo = (g) => ({ id: g.id._serialized, nome: g.name, grupo: true });

/**
 * "email" e/ou endereços → o destino por e-mail; null se o texto não é isso.
 * @returns {{ email: string, nome: string, grupo: false } | { erro: string } | null}
 */
function lerEmails(texto) {
    const partes = texto.split(/[\s,;]+/).filter(Boolean);
    if (!partes.length || !partes.every(p => ehPalavraEmail(p) || EMAIL.test(p))) return null;

    const emails = partes.flatMap(p => (ehPalavraEmail(p) ? emailsDoSmtpTo() : [p])).map(e => e.trim());

    if (emails.some(e => !EMAIL.test(e))) {
        return { erro: '❌ O "email" usa o QRCODE_EMAIL_SMTP_TO, que está vazio (ou inválido) no config/.env. Informe o e-mail: -to voce@exemplo.com' };
    }
    if (!smtpParaEnviar()) {
        return { erro: '❌ SMTP não configurado (QRCODE_EMAIL_SMTP_HOST e QRCODE_EMAIL_SMTP_USER no config/.env): não há como enviar por e-mail.' };
    }

    const lista = [...new Set(emails)].join(', ');
    return { email: lista, nome: lista, grupo: false };
}

/**
 * Resolve o texto para um chat (ou para e-mails).
 * @param {string} valor  o que veio no -to (ou no alvo do /mudo)
 * @param {object} [o]
 * @param {boolean} [o.aceitaEmail]  "email" e endereços valem (alertas, /backup); senão, erro
 * @param {string} [o.semEmail]      o erro quando não aceita (o porquê do comando)
 * @returns {Promise<{ id: string, nome: string, grupo: boolean }
 *   | { email: string, nome: string, grupo: false }
 *   | { erro: string }
 *   | { opcoes: Array<{ id, nome, grupo }>, busca: string, mais: number }>}
 *   opcoes: mais de um serviu; quem chama oferece a escolha (resolverOuEscolher)
 */
async function resolverDestino(valor, { aceitaEmail = false, semEmail = '❌ Aqui o destino não pode ser um e-mail.' } = {}) {
    const texto = String(valor ?? '').trim();

    if (!texto) {
        return { erro: `❌ Informe o destino do -to: um contato, um grupo ou um número (${EXEMPLO})` +
            `${aceitaEmail ? ', ou email (o QRCODE_EMAIL_SMTP_TO) e e-mails' : ''}.` };
    }

    // E-mail: "email" (o QRCODE_EMAIL_SMTP_TO) e/ou endereços
    const porEmail = lerEmails(texto);
    if (porEmail) return aceitaEmail ? porEmail : { erro: semEmail };

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

    let encontrados;
    try {
        encontrados = await contatosEGrupos(palavras);
    } catch (err) {
        printError(`[DESTINO] busca por "${texto}" falhou:`, err.message);
        return { erro: `⚠️ Não consegui buscar "${texto}" nos contatos e grupos agora (${err.message}). Tente de novo ou use o número: +5521999999999` };
    }
    const contatos = await semAsCopiasPeloLid(encontrados.contatos);
    const grupos = encontrados.grupos;

    if (isDebugMode()) {
        printDebug(`[DESTINO] "${texto}": contatos ${contatos.map(c => `${c.name}=${c.id._serialized}`).join(', ') || '-'}; ` +
            `grupos ${grupos.map(g => `${g.name}=${g.id._serialized}`).join(', ') || '-'}`);
    }

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
        autor: autorDe(msg),
        aoExpirar: () => msg.reply(`⌛ Nenhum nº escolhido para "${r.busca}" em 2 minutos: nada foi feito.`)
    });
}

/**
 * Envia um texto do bot ao destino: o chat (sem destino: o seu privado) ou,
 * por e-mail, sem a formatação do WhatsApp (*negrito*, _itálico_).
 * Lança o erro do envio para quem chamou.
 * @param {object|null} destino  o de resolverDestino (ou null)
 * @param {string} texto
 * @param {object} [o]
 * @param {string} [o.assunto]  do e-mail
 * @param {object} [o.opcoes]   do client.sendMessage (ex.: { linkPreview: false })
 */
async function enviarAoDestino(destino, texto, { assunto = 'Aviso', opcoes = {} } = {}) {
    if (destino?.email) {
        await enviarEmail({ para: destino.email.split(/\s*,\s*/), assunto, texto: texto.replace(/[*_]/g, '') });
        return;
    }
    await client.sendMessage(destino?.id || client.info.wid._serialized, texto, opcoes);
}

// Uma linha salva (dest_id, dest_name, dest_is_group, dest_email) → o destino; null: o seu privado
function destinoDaLinha(r) {
    if (r?.dest_email) return { email: r.dest_email, nome: r.dest_email, grupo: false };
    return r?.dest_id ? { id: r.dest_id, nome: r.dest_name, grupo: Boolean(r.dest_is_group) } : null;
}

// O contrário: o destino → as colunas dest_* de uma linha
const colunasDoDestino = (d) => ({
    dest_id: d?.email ? null : d?.id ?? null,
    dest_name: d?.email ? null : d?.nome ?? null,
    dest_is_group: d?.grupo ? 1 : 0,
    dest_email: d?.email ?? null
});

async function nomeDoContato(id, digitos) {
    const contato = await client.getContactById(id).catch(() => null);
    return contato?.name || contato?.pushname || `+${digitos}`;
}

// "👥 Grupo sobre L200" / "👤 Fulano" / "📧 voce@exemplo.com"
const descreverDestino = (d) => `${d.email ? '📧' : d.grupo ? '👥' : '👤'} ${d.email ?? d.nome}`;

module.exports = {
    colunasDoDestino,
    descreverDestino,
    destinoDaLinha,
    emailsDoSmtpTo,
    enviarAoDestino,
    extrairDestino,
    extrairDestinos,
    resolverDestino,
    resolverOuEscolher
};
