/*
 * Comandos /join e /leave: entrar em um grupo por um link de convite e sair de um grupo.
 */

const { client } = require('../cliente');
const { resolverOuEscolher } = require('../destinos');
const { printError, printInfo } = require('../log');
const { plural } = require('../util/formatar');
const { itensDoTexto } = require('./set');

/*
 * /join <link|código>    → entra no grupo do convite (chat.whatsapp.com/<código>)
 * /join -info <link>     → mostra o grupo do convite (nome, participantes, descrição) sem entrar
 * /join -l               → os grupos em que você está (o mesmo que /leave -l)
 * /leave <grupo|nº>...  → sai dos grupos: o nome como no -to (vários que servem: você escolhe
 *                          na lista) ou o nº da lista do -l; pode ser mais de um (/leave 3 1 /Família/)
 * /leave -l              → os grupos numerados
 */

/*
 * A última lista mostrada ({ id, nome }): o "nº 2" do /leave 2 é o da lista que você viu,
 * mesmo que você tenha entrado em outro grupo nesse meio-tempo.
 */
let ultimaLista = [];

// "/Grupo L200/" ou "'Grupo L200'" → "Grupo L200" (como no /mute)
const semDelimitadores = (texto) => texto.trim()
    .replace(/^\/(.*)\/$/s, '$1')
    .replace(/^(["'])(.*)\1$/s, '$2')
    .trim();

// "https://chat.whatsapp.com/AbC...", "chat.whatsapp.com/invite/AbC..." ou só o código → o código
function codigoDoConvite(texto) {
    const t = texto.trim();
    return t.match(/^(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([\w-]{16,32})(?:[/?#]\S*)?$/i)?.[1]
        ?? t.match(/^([\w-]{20,24})$/)?.[1] ?? null;
}

async function listar(msg) {
    const chats = (await client.getChats()).filter(c => c.isGroup && c.name);
    chats.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    ultimaLista = chats.map(c => ({ id: c.id._serialized, nome: c.name }));

    if (!chats.length) {
        await msg.reply('👥 Você não está em nenhum grupo.\n\n💡 _Entre com /join <link do convite>._');
        return;
    }
    const linhas = chats.map((c, i) => {
        const n = c.participants?.length;
        return `${i + 1}. ${c.name}${n ? ` · ${plural(n, 'participante', 'participantes')}` : ''}`;
    });
    await msg.reply(`👥 *GRUPOS* (${chats.length})\n\n${linhas.join('\n')}\n\n` +
        '💡 *Dicas*\n/join <link> entra\n/leave <nº|nome> sai');
}

async function cmdJoin({ msg, opts }) {
    if (opts.opt.list) return listar(msg);

    const texto = opts.argv.join(' ').trim();
    if (!texto) return msg.reply('❌ Use: /join [-info] <link do convite (chat.whatsapp.com/...)> ou /join -l');

    const codigo = codigoDoConvite(texto);
    if (!codigo) return msg.reply('❌ Link de convite inválido. Ex.: https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv');

    let info;
    try {
        info = await client.getInviteInfo(codigo);
    } catch (e) {
        printInfo(`[JOIN] convite ${codigo} não resolvido:`, e.message);
        return msg.reply('❌ Convite inválido, expirado ou revogado.');
    }
    const nome = info?.subject || 'grupo sem nome';

    if (opts.opt.info) {
        const n = info?.size ?? info?.participants?.length;
        return msg.reply([
            `👥 *${nome}*`,
            n && `👤 ${plural(n, 'participante', 'participantes')}`,
            info?.desc && `📝 ${info.desc}`,
            `💡 _Entre com /join ${texto.replace(/^-\w+\s+/, '')}_`
        ].filter(Boolean).join('\n'), undefined, { linkPreview: false });
    }

    try {
        await client.acceptInvite(codigo);
    } catch (e) {
        printError(`[JOIN] não entrou em "${nome}":`, e.message);
        return msg.reply(`❌ Não consegui entrar em 👥 ${nome}: ${e.message || 'o WhatsApp recusou'}.`);
    }
    printInfo(`[JOIN] entrou em "${nome}"`);
    await msg.reply(`✅ Entrei em 👥 ${nome}`);
}

// Sai de um grupo; devolve o erro (texto) ou null
async function sairDe(alvo) {
    const chat = await client.getChatById(alvo.id).catch(() => null);
    if (!chat?.isGroup || typeof chat.leave !== 'function') return 'não é um grupo em que você está';
    try {
        await chat.leave();
    } catch (e) {
        printError(`[LEAVE] não saiu de "${alvo.nome}":`, e.message);
        return e.message || 'o WhatsApp recusou';
    }
    printInfo(`[LEAVE] saiu de "${alvo.nome}"`);
    return null;
}

/*
 * Os grupos do texto: nº da lista, /nome com espaço/, "aspas" ou uma palavra cada. Só palavras
 * soltas (sem nº, barras nem aspas) são um nome só: /leave Grupo Família é um grupo, não dois.
 */
function itensDoLeave(texto) {
    const soltas = texto.split(/\s+/);
    if (!/[/"',]/.test(texto) && !soltas.every(p => /^\d{1,4}$/.test(p))) return [semDelimitadores(texto)];
    return itensDoTexto(texto);
}

async function cmdLeave({ msg, opts }) {
    const texto = opts.argv.join(' ').trim();
    if (opts.opt.list || !texto) return listar(msg);

    // Os nº valem para a lista que você viu, mesmo que ela mude no meio do comando
    const lista = ultimaLista;
    const alvos = [];
    const erros = [];
    for (const item of itensDoLeave(texto)) {
        let alvo;
        if (/^\d{1,4}$/.test(item)) {
            alvo = lista[Number(item) - 1];
            if (!alvo) {
                erros.push(`❌ Nº ${item} fora da lista; veja os grupos com /leave -l.`);
                continue;
            }
        } else {
            alvo = await resolverOuEscolher(msg, item, { tipo: 'grupo' });
            if (!alvo) continue;  // o erro já foi respondido
        }
        if (!alvos.some(a => a.id === alvo.id)) alvos.push(alvo);
    }

    const saiu = [];
    for (const alvo of alvos) {
        const erro = await sairDe(alvo);
        if (erro) erros.push(`❌ Não consegui sair de 👥 ${alvo.nome}: ${erro}.`);
        else saiu.push(alvo);
    }

    const linhas = [
        saiu.length === 1 && alvos.length === 1 ? `👋 Saí de 👥 ${saiu[0].nome}`
            : saiu.length && `👋 Saí de ${plural(saiu.length, 'grupo', 'grupos')}:\n${saiu.map(g => `👥 ${g.nome}`).join('\n')}`,
        ...erros
    ].filter(Boolean);
    // Saindo do grupo em que o comando foi dado, a resposta pode não ter mais para onde ir
    if (linhas.length) await msg.reply(linhas.join('\n\n')).catch(e => printInfo(`[LEAVE] sem resposta: ${e.message}`));
}

module.exports = { cmdJoin, cmdLeave, codigoDoConvite };
