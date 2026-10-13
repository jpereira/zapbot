/*
 * Comandos /block e /unblock.
 */

const { client, concluirAviso } = require('../cliente');
const { resolveLidToPhone } = require('../contatos');
const { resolverOuEscolher } = require('../destinos');
const { printError, printInfo } = require('../log');
const { itensDoTexto } = require('./set');
const { esperar, plural } = require('../util/formatar');

/*
 * /block <pessoa>       → bloqueia na sua conta do WhatsApp (/contato/, @menção
 *                         ou +número; respondendo uma mensagem, quem a escreveu)
 * /block (ou -l)        → os bloqueados, numerados para o /unblock <nº>
 * /unblock <pessoa|nº>  → desbloqueia (a pessoa como no /block, ou o nº da lista)
 * /unblock -all (-a)    → desbloqueia todos
 * A lista vem do WhatsApp: quem você bloqueou no celular também aparece.
 * Grupos não se bloqueiam.
 */
const EXEMPLOS = '/Fulano/, @menção ou +5521999999999';

/*
 * O último -l ({ id, telefone, nome }): o "nº 2" do /unblock 2 é o da lista
 * que você viu, mesmo que alguém tenha sido bloqueado no celular nesse meio-tempo.
 */
let ultimaLista = [];

// "/Fulano de Tal/" ou "'Fulano de Tal'" → "Fulano de Tal" (como no /mute)
const semDelimitadores = (texto) => texto.trim()
    .replace(/^\/(.*)\/$/s, '$1')
    .replace(/^(["'])(.*)\1$/s, '$2')
    .trim();

// O nome de um contato; o number de um @lid é o próprio lid (não o telefone), então não serve
const nomeDe = (c) => {
    const id = String(c.id?._serialized ?? '');
    return c.name || c.pushname || (c.number && !id.endsWith('@lid') ? `+${c.number}` : id.split('@')[0]);
};

/*
 * Um bloqueado: { id, telefone, nome }. O WhatsApp guarda os bloqueios pelo
 * id interno (@lid), e o number de um contato @lid é o próprio lid, não o
 * telefone: o telefone vem do LID (quando o WhatsApp sabe), e o nome, do
 * contato do telefone (o da sua agenda), senão do próprio @lid.
 */
async function bloqueado(c) {
    const id = c.id._serialized;
    const jid = id.endsWith('@lid') ? await resolveLidToPhone(id) : id;
    const telefone = jid?.endsWith('@c.us') ? jid.split('@')[0] : null;
    const doTelefone = jid && jid !== id ? await client.getContactById(jid).catch(() => null) : null;
    const nome = doTelefone?.name || c.name || doTelefone?.pushname || c.pushname || null;
    return { id, telefone, nome };
}

// "Fulano · +5521...", "+5521..." ou, sem nome nem telefone conhecido, o id interno
const descrever = (b) => (b.nome ? `${b.nome}${b.telefone ? ` · +${b.telefone}` : ''}`
    : b.telefone ? `+${b.telefone}` : `${b.id.split('@')[0]} _(id interno, sem telefone conhecido)_`);

/*
 * Os bloqueados: com nome (em ordem), depois só com telefone, depois só com o
 * id. O getBlockedContacts do whatsapp-web.js cria os contatos sem o client
 * (os métodos deles não funcionam): só os campos valem.
 */
async function bloqueados() {
    const lista = await Promise.all((await client.getBlockedContacts()).map(bloqueado));
    const grupo = (b) => (b.nome ? 0 : b.telefone ? 1 : 2);
    return lista.sort((a, b) => grupo(a) - grupo(b) ||
        (a.nome ?? a.telefone ?? a.id).localeCompare(b.nome ?? b.telefone ?? b.id, 'pt-BR'));
}

async function listar(msg) {
    const lista = await bloqueados();
    ultimaLista = lista;

    if (!lista.length) {
        await msg.reply(`🚫 Ninguém bloqueado.\n💡 _Ex.: /block ${EXEMPLOS}, ou responda uma mensagem com /block._`);
        return;
    }

    const linhas = lista.map((b, i) => `${i + 1}. 👤 ${descrever(b)}`);

    await msg.reply(`🚫 *Bloqueados* (${lista.length})\n\n${linhas.join('\n')}\n\n` +
        '💡 _Desbloqueie com /unblock <nº|nome>._');
}

/**
 * A pessoa: a do texto (buscada como no -to, só contatos) ou, sem ele, quem
 * escreveu a mensagem respondida.
 * @returns {Promise<{ id: string, nome: string } | null>} null: já respondeu o erro
 */
async function lerPessoa(msg, texto, quotedMsg, cmd) {
    if (texto) {
        const d = await resolverOuEscolher(msg, texto, {
            tipo: 'contato',
            semEmail: `❌ O ${cmd} é de pessoas: informe um contato, uma menção ou um número, não um e-mail.`
        });
        if (!d) return null;
        if (d.grupo) {
            await msg.reply(`❌ ${d.nome} é um grupo: o ${cmd} é de pessoas.`);
            return null;
        }
        return d;
    }

    if (quotedMsg.fromMe) return { id: client.info.wid._serialized, nome: 'você' };

    const id = quotedMsg.author || quotedMsg.from;
    const contato = await client.getContactById(id).catch(() => null);
    return { id, nome: contato ? nomeDe(contato) : id.split('@')[0] };
}

/*
 * As pessoas do texto: "/Fulano de Tal/", "nome entre aspas", +número,
 * @menção ou uma palavra cada (como no /whois). Só palavras soltas, sem
 * nenhum desses, são um nome só: /block Fulano Silva é uma pessoa, não duas.
 */
function pessoasDoTexto(texto) {
    if (!/[/"'@+]|\d{8,}/.test(texto)) return texto.trim() ? [texto.trim()] : [];
    return itensDoTexto(texto);
}

/*
 * O WhatsApp Web atualiza a lista de bloqueados logo depois do bloqueio (ou do
 * desbloqueio), mas não na mesma hora: a conferência espera um pouco antes de
 * dar como falha.
 */
const ESPERA_CONFERENCIA_MS = 1500;

/*
 * O @lid de um id (null: o WhatsApp não informou). O block() do
 * whatsapp-web.js troca o telefone pelo @lid com o que o WhatsApp Web já sabe
 * e, num número que ele não conhece, bloqueia sem id (o erro interno "t").
 * O getContactLidAndPhone pergunta ao WhatsApp quando não sabe.
 */
async function lidDe(id) {
    if (id.endsWith('@lid')) return id;
    const [r] = await client.getContactLidAndPhone([id]).catch(() => []);
    return r?.lid?.endsWith('@lid') ? r.lid : null;
}

// Algum dos ids está na lista de bloqueados do WhatsApp? Espera um pouco antes do não (como no /unblock)
async function naLista(ids, { esperarSeNao = false } = {}) {
    const esta = async () => (await client.getBlockedContacts()).some(c => ids.includes(c.id._serialized));
    if (await esta() || !esperarSeNao) return esta();
    await esperar(ESPERA_CONFERENCIA_MS);
    return esta();
}

/**
 * Bloqueia uma pessoa já resolvida. Um erro não derruba as outras: vira o motivo.
 * @returns {Promise<'bloqueado'|'ja'|string>} o que aconteceu, ou o motivo de não bloquear
 */
async function bloquearUma(pessoa) {
    if (pessoa.id === client.info.wid._serialized) return 'é a conta do próprio bot';

    try {
        const lid = await lidDe(pessoa.id);
        const ids = [pessoa.id, lid].filter(Boolean);
        if (await naLista(ids)) return 'ja';

        // Pelo @lid, quando o WhatsApp informou: o block() não precisa trocar o telefone
        const contato = await client.getContactById(lid ?? pessoa.id);
        await contato.block();

        if (!(await naLista(ids, { esperarSeNao: true }))) return 'o WhatsApp não bloqueou (não entrou na lista)';
    } catch (err) {
        printError(`/block: ${pessoa.nome} (${pessoa.id}):`, err.message);
        return `o WhatsApp recusou o bloqueio (erro "${err.message}")`;
    }

    printInfo(`/block: ${pessoa.nome} (${pessoa.id}) bloqueado`);
    return 'bloqueado';
}

const DICA_BLOCK = '💡 _Desfaça com /unblock; veja a lista com /block._';

// Uma pessoa: a resposta de sempre
async function responderUma(msg, pessoa, r) {
    await msg.reply(r === 'bloqueado' ? `🚫 *Bloqueado:* 👤 ${pessoa.nome}\n${DICA_BLOCK}`
        : r === 'ja' ? `ℹ️ 👤 ${pessoa.nome} já está bloqueado.\n💡 _Veja a lista com /block_`
            : r === 'é a conta do próprio bot' ? '❌ Não dá para bloquear a conta do próprio bot.'
                : `⚠️ Não consegui bloquear 👤 ${pessoa.nome}: ${r}.`);
}

// Várias: um resumo só, por resultado
async function responderVarias(msg, resultados) {
    const grupo = (titulo, lista, comMotivo = false) => (lista.length
        ? `${titulo} (${lista.length}):*\n${lista.map(({ pessoa, r }) => `👤 ${pessoa.nome}${comMotivo ? `: ${r}` : ''}`).join('\n')}`
        : null);

    const partes = [
        grupo('🚫 *Bloqueados', resultados.filter(x => x.r === 'bloqueado')),
        grupo('ℹ️ *Já estavam bloqueados', resultados.filter(x => x.r === 'ja')),
        grupo('❌ *Não bloqueados', resultados.filter(x => x.r !== 'bloqueado' && x.r !== 'ja'), true)
    ].filter(Boolean);

    await msg.reply(`${partes.join('\n\n')}\n\n${DICA_BLOCK}`);
}

async function cmdBlock({ msg, opts, quotedMsg }) {
    // O argv vem sem as opções (-l, -mask): só as pessoas
    const texto = opts.argv.join(' ').trim();

    if (opts.opt.list || (!texto && !quotedMsg)) {
        await listar(msg);
        return;
    }

    // Respondendo uma mensagem, sem ninguém no texto: quem a escreveu
    const itens = texto ? pessoasDoTexto(texto) : [null];

    if (itens.length === 1) {
        const pessoa = await lerPessoa(msg, itens[0] && semDelimitadores(itens[0]), quotedMsg, '/block');
        if (pessoa) await responderUma(msg, pessoa, await bloquearUma(pessoa));
        return;
    }

    // Várias: uma de cada vez (cada uma pode pedir a escolha na lista); quem não foi achada já teve o erro respondido
    const resultados = [];
    for (const item of itens) {
        const pessoa = await lerPessoa(msg, item, null, '/block');
        if (!pessoa || resultados.some(x => x.pessoa.id === pessoa.id)) continue;
        resultados.push({ pessoa, r: await bloquearUma(pessoa) });
    }
    if (resultados.length) await responderVarias(msg, resultados);
}

// Os da lista que o WhatsApp ainda tem como bloqueados (pelo id exato da lista)
async function aindaBloqueados(lista) {
    if (!lista.length) return [];
    const ficaram = async () => {
        const ids = new Set((await client.getBlockedContacts()).map(c => c.id._serialized));
        return lista.filter(b => ids.has(b.id));
    };

    const agora = await ficaram();
    if (!agora.length) return agora;
    await esperar(ESPERA_CONFERENCIA_MS);
    return ficaram();
}

// Desbloqueia pelo id exato da lista de bloqueados, sem a troca pelo @lid do whatsapp-web.js
async function desbloquearPeloId(id) {
    if (!client.pupPage) throw new Error('sem a página do WhatsApp Web');
    await client.pupPage.evaluate(async (contactId) => {
        const contato = await window.require('WAWebCollections').Contact.find(contactId);
        await window.require('WAWebBlockContactAction').unblockContact(contato, 'ChatListBlock');
    }, id);
}

/*
 * O unblock() do whatsapp-web.js não confere nada: troca o contato pelo @lid,
 * desbloqueia e devolve true. Um bloqueio guardado pelo telefone (dos antigos)
 * fica na lista, e o bot contaria como desbloqueado. Por isso: desbloqueia,
 * confere na lista do WhatsApp, desbloqueia de novo quem ficou (pelo id exato
 * da lista) e confere outra vez; quem ainda ficar é falha.
 * @param {object[]} lista  os bloqueados ({ id, telefone, nome }, de bloqueados())
 * @returns {Promise<Array<{ b: object, motivo: string }>>} as falhas
 */
async function desbloquear(lista) {
    const falhas = new Map();  // id → motivo
    for (const b of lista) {
        try {
            const contato = await client.getContactById(b.id);
            await contato.unblock();
        } catch (err) {
            falhas.set(b.id, err.message);
        }
    }

    let ficaram = await aindaBloqueados(lista.filter(b => !falhas.has(b.id)));
    for (const b of ficaram) {
        printInfo(`/unblock: ${descrever(b)} (${b.id}) continua bloqueado; desbloqueando pelo id da lista`);
        await desbloquearPeloId(b.id).catch(err => printError(`/unblock: ${b.id} pelo id da lista:`, err.message));
    }
    ficaram = await aindaBloqueados(ficaram);
    for (const b of ficaram) falhas.set(b.id, 'o WhatsApp não desbloqueou (continua na lista)');

    return lista.filter(b => falhas.has(b.id)).map(b => ({ b, motivo: falhas.get(b.id) }));
}

/*
 * /unblock -all: um por um; quem falha não segura os outros. Como no /get, o
 * "⏳ Desbloqueando…" vira o resultado (o WhatsApp edita a mensagem).
 */
async function desbloquearTodos(msg) {
    const lista = await bloqueados();
    ultimaLista = [];

    if (!lista.length) {
        await msg.reply('🚫 Ninguém bloqueado.');
        return;
    }

    const aviso = await msg.reply(`⏳ Desbloqueando ${plural(lista.length, 'contato', 'contatos')}, aguarde.`);
    const falhas = await desbloquear(lista);

    const ok = lista.length - falhas.length;
    printInfo(`/unblock -all: ${ok} desbloqueados, ${falhas.length} falhas`);
    await concluirAviso(msg, aviso, `✅ ${plural(ok, 'desbloqueado', 'desbloqueados')}.` +
        (falhas.length ? `\n\n⚠️ Não consegui desbloquear (${falhas.length}):\n` +
            falhas.map(f => `• ${descrever(f.b)}: ${f.motivo}`).join('\n') : ''));
}

// O telefone de um id (o @lid vira o telefone, se o WhatsApp souber); null: não sei
async function telefoneDe(id) {
    const jid = id.endsWith('@lid') ? await resolveLidToPhone(id) : id;
    return jid?.endsWith('@c.us') ? jid.split('@')[0] : null;
}

async function cmdUnblock({ msg, opts, quotedMsg }) {
    if (opts.opt.all) {
        await desbloquearTodos(msg);
        return;
    }

    // O argv vem sem as opções: só a pessoa (ou o nº)
    const texto = semDelimitadores(opts.argv.join(' '));

    if (!texto && !quotedMsg) {
        await listar(msg);
        return;
    }

    /*
     * Quem desbloquear sai da lista do WhatsApp (o isBlocked do contato não
     * serve: o bloqueio pode estar no @lid ou no telefone). O nº é o da lista
     * que você viu; a pessoa é achada pelo id ou pelo telefone.
     */
    const atuais = await bloqueados();
    let nome;
    let alvo;
    if (/^\d{1,3}$/.test(texto)) {
        const b = (ultimaLista.length ? ultimaLista : atuais)[Number(texto) - 1];
        if (!b) {
            await msg.reply(`❌ Nº ${texto} não existe. Veja a lista com /block`);
            return;
        }
        nome = descrever(b);
        alvo = atuais.find(x => x.id === b.id || (b.telefone && x.telefone === b.telefone));
    } else {
        const pessoa = await lerPessoa(msg, texto, quotedMsg, '/unblock');
        if (!pessoa) return;
        const telefone = await telefoneDe(pessoa.id);
        nome = pessoa.nome;
        alvo = atuais.find(x => x.id === pessoa.id || (telefone && x.telefone === telefone));
    }

    if (!alvo) {
        await msg.reply(`ℹ️ 👤 ${nome} não está bloqueado.\n💡 _Veja a lista com /block_`);
        return;
    }

    const [falha] = await desbloquear([alvo]);
    if (falha) {
        await msg.reply(`⚠️ Não consegui desbloquear 👤 ${nome}: ${falha.motivo}.`);
        return;
    }
    printInfo(`/unblock: ${nome} (${alvo.id}) desbloqueado`);
    await msg.reply(`✅ *Desbloqueado:* 👤 ${nome}`);
}

module.exports = {
    cmdBlock,
    cmdUnblock
};
