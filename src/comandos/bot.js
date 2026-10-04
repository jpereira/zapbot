/*
 * Comando /bot.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { ehODono, itensDasPessoas } = require('./set');
const { client } = require('../cliente');
const { idsDoChatAtual, resolveLidToPhone, resolverNomeDoGrupo } = require('../contatos');
const {
    descreverDestino, descreverDestinos, enviarAosDestinos, extrairDestinos, resolverDestinos
} = require('../destinos');
const { aguardarConfirmacao, autorDe } = require('../escolhas');
const { GetOptFromCommand } = require('../opcoes');
const { printInfo } = require('../log');
const { descreverRegra, gravarRegra, regraDe } = require('../permissoes');
const {
    SETTINGS_SCHEMA, comandoDeUsuario, getSetting, setSetting, validarSetting
} = require('../settings');
const { textoDoInfo } = require('../sistema');
const {
    agendamentoDiario, agendarStatusDiario, desligarStatusDiario, destinosDoStatus, ondeVai,
    textoDoStatus
} = require('../status');
const { fmtQuando, lerHora } = require('../util/quando');

/*
 * /bot: o bot e quem usa (settings 'bot.paused', 'bot.admins' e 'bot.users')
 *   /bot           → o status (o mesmo do -status): o estado, o relatório de 24 h e quem usa
 *   /bot -on|-off  → liga e desliga: desligado, TODOS os comandos são ignorados, exceto o /bot
 *                    (as listas de admins e usuários ficam como estão)
 *   /bot -users    → os usuários deste chat (num grupo, os de lá; no seu privado, todos)
 *   /bot -all-users → todos os usuários, em qualquer chat (num grupo, com os telefones de fora
 *                     escondidos)
 *   /bot -reset    → volta ao padrão: ligado, sem admins extras e sem usuários (só o dono)
 * A recuperação de apagadas, o /watch e os alertas continuam funcionando com ele desligado.
 *
 * Os atalhos do IRC (o: operador, manda; v: voz, só fala), só do dono, um de cada vez:
 *   /bot +o|-o <pessoa...>        → põe e tira admins (bot.admins)
 *   /bot +v|-v <pessoa|grupo...>  → põe e tira usuários (bot.users)
 * A pessoa é /Nome/, "Nome", @menção ou +número, como no -to. Sem ninguém, vale
 * o chat atual: no grupo, o grupo (que não vira admin); no privado de alguém, a pessoa.
 * O +v de uma pessoa digitado num grupo vale só nesse grupo.
 *
 * E o relatório (src/status.js) e as versões (src/sistema.js), que não combinam com as outras:
 *   /bot -status (-s)         → o relatório agora (o mesmo do /bot sem opção)
 *   /bot -s 06h [-to <dest>]  → todo dia às 06:00 (Brasília), no seu privado ou nos -to
 *   /bot -s -to <dest>        → o relatório agora, nos -to (pessoas, grupos, e-mails)
 *   /bot -s off               → desliga o envio diário
 *   /bot -info (-i)           → versões (Node.js, whatsapp-web.js, Chromium...) e o sistema
 */
// Quem usa os comandos, pelo bot.users
function quemUsa() {
    const users = getSetting('bot.users');
    const admins = getSetting('bot.admins').length ? ' e os admins' : '';
    if (users.includes('all')) {
        return '🔓 *Comandos:* todos usam os comuns\n' +
            '⚠️ _Atenção: qualquer pessoa pode executar os comandos comuns do bot, em qualquer chat. ' +
            'Para restringir: /set bot.users false (e depois /bot +v para liberar alguns)._';
    }
    if (!users.length) return `🔒 *Comandos:* só o dono${admins}`;
    return '👥 *Comandos:* o dono e quem está na lista abaixo';
}

// As marcas de cada papel
const PAPEIS = { dono: '🤖', admin: '👑', usuario: '🗣️', nenhum: '🚫' };

// Os telefones de quem está no grupo (o LID vira o telefone)
async function membrosDoGrupo(chatId) {
    const chat = await client.getChatById(chatId).catch(() => null);
    const membros = new Set();
    for (const p of chat?.participants ?? []) {
        const id = p.id?._serialized ?? '';
        const telefone = id.endsWith('@lid') ? await resolveLidToPhone(id) : id;
        if (telefone) membros.add(telefone.split('@')[0]);
    }
    return membros;
}

/*
 * Um item das listas: a pessoa (o telefone), o grupo (o id @g.us) ou a pessoa
 * só num grupo ("telefone:grupo", o /bot +v digitado no grupo).
 */
function lerItem(item) {
    const [numero, soEm = null] = item.split(':');
    return { numero, soEm, ehGrupo: !soEm && item.endsWith('@g.us') };
}

/*
 * Quem a lista mostra, pelo chat onde o comando foi digitado:
 *   - no seu privado (ou com -all-users): todos;
 *   - num grupo: quem participa dele, o próprio grupo e quem só tem permissão nele;
 *   - no privado de alguém: só essa pessoa.
 * membros: num grupo, os telefones de quem está nele; o de quem não está sai
 * escondido (com o -all-users, aparece todo mundo, mas sem entregar o número
 * de ninguém ao grupo). Fora de grupo, null: nada é escondido.
 */
async function escopoDoChat({ chatId, isGroup, todos = false } = {}) {
    if (isGroup) {
        const membros = await membrosDoGrupo(chatId);
        const doGrupo = (item) => {
            const { numero, soEm, ehGrupo } = lerItem(item);
            if (ehGrupo) return item === chatId;
            return soEm ? soEm === chatId : membros.has(numero);
        };
        const mostra = todos ? null : doGrupo;
        return { chatId, membros, mostra, onde: 'deste grupo', aqui: 'neste grupo' };
    }

    const ids = chatId ? await idsDoChatAtual(chatId) : [];
    if (todos || !chatId || ids.includes(client.info.wid._serialized)) {
        return { chatId, membros: null, mostra: null };
    }

    const telefone = ids.find(i => i.endsWith('@c.us'))?.split('@')[0];
    const daPessoa = (item) => lerItem(item).numero === telefone;
    return { chatId, membros: null, mostra: daPessoa, onde: 'deste chat', aqui: 'neste chat' };
}

// 5521999982222 → 5521•••••2222 (o DDI e o DDD ficam, e os 4 últimos)
const mascarar = (n) => `${n.slice(0, 4)}${'•'.repeat(Math.max(1, n.length - 8))}${n.slice(-4)}`;
const numeroVisivel = (n, membros) => (membros && !membros.has(n) ? mascarar(n) : n);

// O nome de um telefone ou grupo: o do grupo, o do contato ou, para você, o do seu perfil
async function nomeDoItem(item) {
    if (item.endsWith('@g.us')) return resolverNomeDoGrupo(item).catch(() => null);

    // Você raramente está na própria agenda: vale o nome do seu perfil
    const contato = await client.getContactById(`${item}@c.us`).catch(() => null);
    return contato?.name || contato?.pushname || (ehODono(item) ? client.info.pushname : null);
}

// " · só neste grupo" ou " · só em 👥 Amigos Faculdade" (a pessoa só num grupo)
async function soEmTexto(soEm, escopo) {
    if (!soEm) return '';
    if (soEm === escopo?.chatId) return ' · só neste grupo';
    return ` · só em 👥 ${await nomeDoItem(soEm) || soEm}`;
}

/*
 * Um item como o resto do bot mostra um destino: "👤 Camila Gama · +5521988887777",
 * "👤 +5521977777777" (sem nome) ou "👥 Grupo Familia"; a pessoa só num grupo,
 * com o grupo no fim.
 */
async function descreverItem(item, escopo) {
    const { numero, soEm, ehGrupo } = lerItem(item);
    const nome = await nomeDoItem(numero);
    if (ehGrupo) return descreverDestino({ id: item, nome: nome || item, grupo: true });

    const fone = `+${numeroVisivel(numero, escopo?.membros)}`;
    const pessoa = nome ? `${descreverDestino({ nome, grupo: false })} · ${fone}` : `👤 ${fone}`;
    return pessoa + await soEmTexto(soEm, escopo);
}

/*
 * O papel de cada um, pelo mais alto: 🤖 o dono (a conta do bot, que já usa
 * tudo), 👑 admin ou 🗣️ usuário.
 */
function marcasDe(item, admins, users) {
    const { numero, soEm } = lerItem(item);
    if (soEm) return [`${PAPEIS.usuario} +v`];
    return [
        ehODono(numero) && `${PAPEIS.dono} dono`,
        admins.includes(item) && `${PAPEIS.admin} +o`,
        users.includes(item) && `${PAPEIS.usuario} +v`
    ].filter(Boolean);
}

/*
 * Admins (+o) e usuários (+v) numa lista só: quem está nas duas aparece uma
 * vez, com as duas marcas. Primeiro os admins, na ordem de cada setting.
 * novos: os que acabaram de entrar (com ✅). dica: 'todos' (o -all-users, com
 * o cuidado de não expor quem é de fora) ou 'usuarios' (o -users, na resposta
 * do +o/+v).
 */
async function listaDeUsuarios(escopo, { novos = [], dica = 'todos' } = {}) {
    const admins = getSetting('bot.admins');
    const users = getSetting('bot.users').filter(i => i !== 'all');
    const todos = [...new Set([...admins, ...users])];
    if (!todos.length) return '';

    // Só os deste chat: quantos ficaram de fora, e como ver todos
    const { mostra, onde, aqui } = escopo;
    const itens = mostra ? todos.filter(mostra) : todos;
    const fora = todos.length - itens.length;
    const comoVer = dica === 'todos'
        ? `⚠️ _Para listar todos: /bot -all-users ou /bot -au. Cuidado: mostra também quem não é ${onde}._`
        : '_Listar usuários: /bot -users ou /bot -u_';
    const rodape = fora ? `\n\n💡 _Só quem é ${onde}; mais ${fora} fora daqui._\n${comoVer}` : '';
    const titulo = `*Usuários* (${itens.length})${mostra ? ` ${aqui}` : ''}`;
    if (!itens.length) return `${titulo}\n_Ninguém ${onde}._${rodape}`;

    const linhas = await Promise.all(itens.map(async (item) => {
        const novo = novos.includes(item) ? ' ✅' : '';
        // A regra do +cmd|-cmd embaixo (admin usa tudo: sem ela)
        const regra = !admins.includes(item) && regraDe(item);
        return `• ${marcasDe(item, admins, users).join(' ')} · ${await descreverItem(item, escopo)}${novo}` +
            (regra ? `\n → ${descreverRegra(regra)}` : '');
    }));

    const dono = itens.some(i => !lerItem(i).soEm && ehODono(i));
    return `${titulo}\n${linhas.join('\n')}\n\n${permissoes({ dono })}${rodape}`;
}

// O que cada marca quer dizer (a do dono, só com você na lista; a do sem permissão, no /whois)
function permissoes({ dono = false, semPermissao = false } = {}) {
    return '*Permissões*\n' +
        (dono ? `${PAPEIS.dono} dono: você, que já usa tudo\n` : '') +
        `${PAPEIS.admin} +o: admin, usa tudo\n` +
        `${PAPEIS.usuario} +v: usuário, usa os comandos comuns` +
        (semPermissao ? `\n${PAPEIS.nenhum} sem permissão: o bot ignora os comandos dela` : '');
}

// Ligado ou desligado, e quem usa os comandos
const estadoDoBot = () => (getSetting('bot.paused')
    ? '⏸️ *Bot:* desligado (todos os comandos são ignorados)'
    : '▶️ *Bot:* ativo') + '\n' + quemUsa();

const MAIS_INFORMACOES = 'ℹ️ _Mais informações em /bot -h_';

// A lista do -users e do -all-users (sem ninguém nela, a linha de quem usa os comandos)
async function textoDosUsuarios(chat) {
    return await listaDeUsuarios(await escopoDoChat(chat)) || quemUsa();
}

// O /bot sem opção e o -status: o estado no topo, o relatório, os usuários e o envio diário
async function relatorio(chat) {
    const usuarios = await listaDeUsuarios(await escopoDoChat(chat));
    const texto = await textoDoStatus(Date.now(), { estadoDoBot: estadoDoBot(), usuarios });
    return `${texto}\n\n${MAIS_INFORMACOES}`;
}

// +o/-o (bot.admins), +v/-v (bot.users) e +cmd/-cmd (os comandos de cada usuário), em qualquer
// ordem
const ATALHO = /(^|\s)[+-](o|v|cmd)(?=\s|$)/;
const OPERACAO = /(^|\s)([+-])([ov])(?=\s|$)/;
const OPCAO_CMD = /(^|\s)([+-])cmd(?:\s+((?:[^\s+-]\S*,\s*)*[^\s+-]\S*))?(?=\s|$)/;
const LISTA_DO_ATALHO = { o: 'bot.admins', v: 'bot.users' };

/*
 * O texto do atalho: a operação (+o/-o/+v/-v), o +cmd/-cmd e os comandos dele,
 * o -all-users (a resposta com todos; o -users é o normal) e o resto (quem).
 */
function lerAtalho(texto) {
    let resto = ` ${texto} `;
    const tirar = (re) => {
        const m = resto.match(re);
        if (m) resto = resto.slice(0, m.index) + m[1] + resto.slice(m.index + m[0].length);
        return m;
    };
    const todos = Boolean(tirar(/(^|\s)-(?:au|all-users)(?=\s|$)/));
    tirar(/(^|\s)-(?:u|users)(?=\s|$)/);
    const cmd = tirar(OPCAO_CMD);
    const op = tirar(OPERACAO);
    return {
        op: op ? { sinal: op[2], letra: op[3] } : null,
        cmd: cmd ? { sinal: cmd[2], texto: cmd[3] ?? '' } : null,
        todos,
        quem: resto.trim()
    };
}

// "/cotacao,/crypto meme" → ['/cotacao', '/crypto', '/meme']; "all" → ['all']; inválido: lança
function lerComandos(texto) {
    const nomes = texto.split(/[\s,]+/).filter(Boolean);
    if (!nomes.length) throw new Error('informe os comandos, separados por vírgula: +cmd /cotacao,/meme');
    if (nomes.length === 1 && /^all$/i.test(nomes[0])) return ['all'];
    return [...new Set(nomes.map(comandoDeUsuario))];
}
const QUEM = { 'bot.admins': { um: 'admin', varios: 'admins' }, 'bot.users': { um: 'usuário', varios: 'usuários' } };

/*
 * Sem ninguém, o chat onde o comando foi digitado: no grupo, o grupo; no
 * privado de alguém, a pessoa (pelo telefone). No seu privado, não há quem.
 * @returns {Promise<string[]|null>} null: já respondeu o erro
 */
async function itensDoChat(msg, key, { chatId, isGroup }) {
    if (isGroup) {
        if (key === 'bot.users') return [chatId];
        await msg.reply('❌ Um grupo não pode ser admin (todos ali mandariam no bot).\n' +
            '💡 _Para liberar os comandos comuns neste grupo: /bot +v_');
        return null;
    }

    const ids = await idsDoChatAtual(chatId);
    if (ids.includes(client.info.wid._serialized)) {
        await msg.reply('❌ Este é o seu privado: você (o dono) já usa tudo.\n' +
            '💡 _Use num grupo ou no privado de alguém, ou informe quem: /bot +v /Nome/_');
        return null;
    }

    const telefone = ids.find(i => i.endsWith('@c.us'));
    if (!telefone) {
        await msg.reply('❌ Não sei o telefone desta pessoa (o WhatsApp só informou o id interno): use o número, ex.: /bot +v +5521999999999.');
        return null;
    }
    return [telefone.split('@')[0]];
}

/*
 * Os itens do texto (nomes, menções, números, grupos), já validados. Num
 * grupo, o +v de uma pessoa vale só nesse grupo ("telefone:grupo").
 * @returns {Promise<string[]|null>} null: já respondeu o erro
 */
async function itensDoTexto(msg, key, texto, { chatId, isGroup }) {
    const bruto = await itensDasPessoas(msg, key, texto);
    if (bruto === null) return null;

    let itens;
    try {
        itens = validarSetting(key, bruto);
    } catch (e) {
        await msg.reply(`❌ ${e.message}`);
        return null;
    }
    if (itens.includes('all')) {
        await msg.reply('❌ Informe quem: /nome/, @menção, +número ou /grupo/.');
        return null;
    }

    const soNoGrupo = key === 'bot.users' && isGroup;
    return itens.map(i => (soNoGrupo && !i.endsWith('@g.us') ? `${i}:${chatId}` : i));
}

/*
 * O que sai com o -v: num grupo, a permissão dele (ou, sem ela, a geral); no
 * privado, todas as da pessoa (a geral e as de cada grupo).
 */
function aRemover(item, atual, { isGroup }) {
    const { numero, soEm } = lerItem(item);
    if (soEm && isGroup) return atual.includes(item) ? [item] : atual.filter(i => i === numero);
    if (lerItem(item).ehGrupo) return atual.filter(i => i === item);
    return atual.filter(i => lerItem(i).numero === numero);
}

/*
 * +o|-o|+v|-v: muda a lista e responde com a lista deste chat (os que entraram,
 * com ✅; os que saíram, numa linha 🗑️ em cima). Os que entraram e não aparecem
 * na lista daqui ganham uma linha ✅ em cima.
 */
async function mudarLista(msg, key, itens, acrescentar, chat) {
    const atual = getSetting(key);
    const quem = QUEM[key];
    const escopo = await escopoDoChat(chat);
    const curtos = (lista) => Promise.all(lista.map(i => descreverItem(i, escopo)));

    if (acrescentar && atual.includes('all')) {
        await msg.reply('❌ Todos já usam os comandos comuns (/set bot.users true). ' +
            'Para liberar só alguns: /set bot.users false antes.');
        return;
    }

    let novos;
    let removidos = [];
    if (acrescentar) {
        // Já tem: o próprio item ou, para quem só ganharia um grupo, a permissão geral
        novos = itens.filter(i => !atual.includes(i) && !atual.includes(lerItem(i).numero));
        if (!novos.length) {
            await msg.reply(`ℹ️ Já é ${quem.um}: ${(await curtos(itens)).join(', ')}.`);
            return;
        }
        await setSetting(key, [...atual, ...novos]);
        // Quem entra começa sem regra (uma velha, de antes de sair pelo /set, não volta)
        if (key === 'bot.users') for (const i of novos) await gravarRegra(i, null);
    } else {
        removidos = [...new Set(itens.flatMap(i => aRemover(i, atual, chat)))];
        if (!removidos.length) {
            await msg.reply(`❌ Não é ${quem.um}: ${(await curtos(itens)).join(', ')}.\n💡 _Veja com /bot -users_`);
            return;
        }
        await setSetting(key, atual.filter(i => !removidos.includes(i)));
        if (key === 'bot.users') for (const i of removidos) await gravarRegra(i, null);
    }
    printInfo(`/bot: ${key} ${acrescentar ? '+' : '-'} ${JSON.stringify(acrescentar ? novos : removidos)}`);

    const lista = await listaDeUsuarios(escopo, { novos: novos ?? [], dica: 'usuarios' });
    const foraDaLista = (novos ?? []).filter(i => escopo.mostra && !escopo.mostra(i));
    const emCima = [
        ...(await Promise.all(removidos.map(async i => `🗑️ ${await descreverItem(i, escopo)}`))),
        ...(await Promise.all(foraDaLista.map(async i => `✅ ${await descreverItem(i, escopo)}`)))
    ];
    await msg.reply((emCima.length ? `${emCima.join('\n')}\n\n` : '') + (lista || quemUsa()));
}

/*
 * +cmd|-cmd: a regra de cada usuário. Junto com o +v, define a regra:
 * +v +cmd /a,/b = só esses; +v -cmd /a = todos, menos esse. Sozinhos:
 *   +cmd: quem não é usuário entra só com esses; "Apenas" ganha esses; "Todos,
 *         menos" libera esses de novo; quem usa todos fica como está; all apaga a regra;
 *   -cmd: "Apenas" perde esses (o último, não: aí é o -v); quem usa todos fica
 *         "Todos, menos" esses; "Todos, menos" ganha esses.
 * Num grupo, a pessoa é a de lá ("telefone:grupo") ou, sem ela, a de qualquer chat.
 */
async function mudarComandos(msg, itens, { sinal, comandos, comV }, chat) {
    const users = getSetting('bot.users');
    if (users.includes('all')) {
        await msg.reply('❌ Todos já usam os comandos comuns (/set bot.users true). ' +
            'Para liberar só alguns: /set bot.users false antes.');
        return;
    }

    const escopo = await escopoDoChat(chat);
    const tudo = comandos.includes('all');
    const alterados = [];
    const novosUsuarios = [];
    const avisos = [];

    for (const item of itens) {
        const { numero, soEm } = lerItem(item);
        const alvo = !users.includes(item) && soEm && users.includes(numero) ? numero : item;
        const ehUsuario = users.includes(alvo);
        const regra = regraDe(alvo);
        const quem = await descreverItem(alvo, escopo);
        // A lista da regra com esses (uniao) e sem esses (sobra)
        const uniao = regra ? [...new Set([...regra.comandos, ...comandos])] : comandos;
        const sobra = regra ? regra.comandos.filter(c => !comandos.includes(c)) : [];
        let nova;

        if (comV) {
            nova = tudo ? null : { apenas: sinal === '+', comandos };
        } else if (sinal === '+') {
            if (!ehUsuario || tudo) nova = tudo ? null : { apenas: true, comandos };
            else if (!regra) {
                avisos.push(`ℹ️ ${quem} já usa todos os comandos comuns.`);
                continue;
            } else if (regra.apenas) nova = { apenas: true, comandos: uniao };
            else nova = sobra.length ? { apenas: false, comandos: sobra } : null;
        } else {
            if (!ehUsuario) {
                avisos.push(`❌ Não é usuário: ${quem}.`);
                continue;
            }
            if (tudo || (regra?.apenas && !sobra.length)) {
                avisos.push(`❌ Não sobraria comando para ${quem}: para tirar a pessoa, /bot -v; para liberar todos, /bot +cmd all.`);
                continue;
            }
            if (!regra) nova = { apenas: false, comandos };
            else nova = regra.apenas ? { apenas: true, comandos: sobra } : { apenas: false, comandos: uniao };
        }

        const mesma = JSON.stringify(nova) === JSON.stringify(regra);
        if (ehUsuario && mesma) {
            avisos.push(`ℹ️ Nada mudou: ${quem}${regra ? ` (${descreverRegra(regra)})` : ''}.`);
            continue;
        }
        if (!ehUsuario) novosUsuarios.push(alvo);
        await gravarRegra(alvo, nova);
        alterados.push(alvo);
    }

    if (novosUsuarios.length) await setSetting('bot.users', [...users, ...novosUsuarios]);
    if (!alterados.length) {
        await msg.reply(avisos.join('\n'));
        return;
    }
    printInfo(`/bot: bot.users.cmds ${sinal}cmd ${comandos.join(',')} → ${JSON.stringify(alterados)}`);

    const lista = await listaDeUsuarios(escopo, { novos: alterados, dica: 'usuarios' });
    const foraDaLista = alterados.filter(i => escopo.mostra && !escopo.mostra(i));
    const emCima = [
        ...avisos,
        ...(await Promise.all(foraDaLista.map(async i => {
            const regra = regraDe(i);
            return `✅ ${await descreverItem(i, escopo)}${regra ? `\n → ${descreverRegra(regra)}` : ''}`;
        })))
    ];
    await msg.reply((emCima.length ? `${emCima.join('\n')}\n\n` : '') + (lista || quemUsa()));
}

async function tratarAtalho(msg, texto, chatAtual) {
    const { op, cmd, todos, quem } = lerAtalho(texto);
    const key = LISTA_DO_ATALHO[op?.letra ?? 'v'];
    const chat = { ...chatAtual, todos };

    // Só o dono: um admin extra não promove ninguém (nem a si mesmo)
    if (!msg.fromMe) {
        await msg.reply(`⛔ Só o dono do bot põe e tira ${QUEM[key].varios}.`);
        return;
    }

    // O +cmd|-cmd é dos usuários: com o +o/-o ou o -v, não
    if (cmd && op && (op.letra === 'o' || op.sinal === '-')) {
        await msg.reply('❌ O +cmd|-cmd vale só para usuários: /bot +v +cmd /cotacao /Fulano/ ou /bot -cmd /meme /Fulano/.');
        return;
    }

    let comandos = null;
    if (cmd) {
        try {
            comandos = lerComandos(cmd.texto);
        } catch (e) {
            await msg.reply(`❌ ${e.message}`);
            return;
        }
        if (cmd.sinal === '-' && comandos.includes('all')) {
            await msg.reply('❌ Para tirar todos os comandos, tire a pessoa: /bot -v.');
            return;
        }
    }

    const itens = quem
        ? await itensDoTexto(msg, key, quem, chat)
        : await itensDoChat(msg, key, chat);
    if (!itens) return;

    if (cmd) {
        await mudarComandos(msg, itens, { sinal: cmd.sinal, comandos, comV: Boolean(op) }, chat);
        return;
    }
    await mudarLista(msg, key, itens, op.sinal === '+', chat);
}

/*
 * -status: o relatório agora (no chat ou, com -to, nos destinos), o envio
 * diário numa hora (no seu privado ou nos -to; sem -to, ficam os de antes) ou off.
 */
async function tratarStatus(msg, valores, { destinosTexto, comDestino, chat }) {
    const destinos = comDestino
        ? await resolverDestinos(msg, destinosTexto, { aceitaEmail: true })
        : undefined;
    if (destinos === null) return;

    if (!valores.length) {
        if (!destinos) {
            await msg.reply(await relatorio(chat));
            return;
        }
        // Para fora, o relatório vai sem a lista de quem usa
        const texto = await textoDoStatus(Date.now(), { estadoDoBot: estadoDoBot() });
        await enviarAosDestinos(destinos, texto, { assunto: '📊 Status do ZapBot' })
            .then(() => msg.reply(`📊 Status enviado em ${descreverDestinos(destinos)}.`))
            .catch(err => msg.reply(`❌ Não consegui enviar o status: ${err.message}`));
        return;
    }

    if (valores.length === 1 && valores[0].toLowerCase() === 'off') {
        if (destinos) {
            await msg.reply('❌ O -to não vale com o off: /bot -status off desliga o envio diário.');
            return;
        }
        await msg.reply(await desligarStatusDiario()
            ? '🔕 Status diário desligado.'
            : 'ℹ️ O status diário já estava desligado.');
        return;
    }

    // "às 6h" ou "6h": a hora do envio diário
    const hora = lerHora(valores.filter(e => !/^[àa]s$/i.test(e)).join(''));
    if (!hora || valores.length > 2) {
        await msg.reply('❌ Não entendi a hora. Use 06h, 6h30, 06:00 ou às 18h (ou off para desligar).\n\n```' + getCommandSyntax('/bot') + '```');
        return;
    }

    const proximo = await agendarStatusDiario(hora, Date.now(), destinos);
    const dois = (n) => String(n).padStart(2, '0');
    const onde = ondeVai(destinosDoStatus(await agendamentoDiario()));
    await msg.reply(`⏰ *Status diário:* todo dia às *${dois(hora.h)}:${dois(hora.m)}*${onde}\n📅 Próximo: ${fmtQuando(proximo)}`);
}

// O que o -reset volta ao padrão (o envio diário do -status fica)
const DO_RESET = ['bot.paused', 'bot.admins', 'bot.users', 'bot.users.cmds'];

// Quanto tempo o -reset espera o "sim"
const CONFIRMAR_RESET_MS = 10_000;

// -reset: pergunta antes (responda "sim" em 10 s); com force, volta direto
async function resetar(msg, { chatId, forcar }) {
    if (!msg.fromMe) {
        await msg.reply('⛔ Só o dono do bot volta o /bot ao padrão.');
        return;
    }

    if (!forcar) {
        const segundos = CONFIRMAR_RESET_MS / 1000;
        await msg.reply('⚠️ *Voltar ao padrão?* O bot fica ligado, sem admins extras e sem usuários.\n' +
            `💡 _Responda *sim* em ${segundos} s para confirmar (ou /bot -r force, sem perguntar)._`);
        const confirmou = await aguardarConfirmacao(chatId, {
            ms: CONFIRMAR_RESET_MS,
            autor: autorDe(msg),
            aoExpirar: () => msg.reply(`⌛ Nada mudou: sem *sim* em ${segundos} s.`)
        });
        if (confirmou === false) await msg.reply('👍 Nada mudou.');
        if (!confirmou) return;
    }

    for (const key of DO_RESET) await setSetting(key, SETTINGS_SCHEMA[key].default);
    printInfo('/bot -reset: admins, usuários e bot.paused de volta ao padrão');
    await msg.reply(`♻️ *Padrão restaurado:* bot ligado, sem admins extras e sem usuários.\n\n${estadoDoBot()}`);
}

const USO = '❌ Uso: /bot [-on|-off] [-users|-all-users]  ou  ' +
    '/bot +o|-o|+v|-v [+cmd|-cmd <comandos>] [pessoa...] [-all-users]  ou  /bot -reset [force]  ou  ' +
    '/bot -status [<hora>|off] [-to <destino>]...  ou  /bot -info\n💡 _/bot -h para ajuda_';

async function cmdBot({ msg, opts: optsDoComando, args, chatId, isGroup }) {
    if (ATALHO.test(String(args ?? ''))) {
        await tratarAtalho(msg, String(args).trim(), { chatId, isGroup });
        return;
    }

    // O -to aceita espaços (/Grupo L200/), que o parser de opções separaria: sai antes
    const { destinos: destinosTexto, informado: comDestino, resto } = extrairDestinos(args);
    const opts = comDestino ? GetOptFromCommand(resto, findCommand('/bot')) : optsDoComando;
    const { on, off } = opts.opt;
    const todos = opts.given.has('all-users');
    const listar = todos || opts.given.has('users');
    const chat = { chatId, isGroup, todos };

    if (comDestino && !opts.given.has('status')) {
        await msg.reply('❌ O -to é do -status: /bot -status [<hora>] -to <destino>');
        return;
    }

    // -info e -reset: sozinhos (o -reset aceita o force, que não pergunta)
    for (const sozinha of ['info', 'reset']) {
        if (!opts.given.has(sozinha)) continue;
        const outra = sozinha === 'info' ? 'reset' : 'info';
        // O valor do -reset: nada ou force
        const valor = sozinha === 'reset' ? opts.opt.reset : null;
        const forcar = /^force$/i.test(valor ?? '');
        const combinada = on || off || listar || opts.given.has('status') || opts.given.has(outra);
        if (combinada || opts.argv.length || (valor && !forcar)) {
            await msg.reply(`❌ O -${sozinha} não combina com as outras opções.\n💡 _/bot -${sozinha}_`);
            return;
        }
        if (sozinha === 'info') await msg.reply(await textoDoInfo());
        else await resetar(msg, { chatId, forcar });
        return;
    }

    // -status [<hora>|off] [-to ...]: o parser pega um valor; "às 18h" deixa o resto em argv
    if (opts.given.has('status')) {
        if (on || off || listar) {
            await msg.reply('❌ O -status não combina com as outras opções.\n💡 _/bot -status [<hora>|off] [-to <destino>]_');
            return;
        }
        const valores = [opts.opt.status, ...opts.argv].filter(Boolean);
        await tratarStatus(msg, valores, { destinosTexto, comDestino, chat });
        return;
    }

    if (opts.argv.length || (on && off)) {
        await msg.reply(USO);
        return;
    }

    // -on|-off: só liga e desliga (as listas ficam); -users|-all-users: os usuários
    if (on || off) await setSetting('bot.paused', off);
    if (on || off || listar) {
        const partes = [(on || off) && estadoDoBot(), listar && await textoDosUsuarios(chat)]
            .filter(Boolean);
        await msg.reply(partes.join('\n\n'));
        return;
    }

    // Sem opção: o status
    await msg.reply(await relatorio(chat));
}

module.exports = {
    PAPEIS,
    cmdBot,
    descreverItem,
    escopoDoChat,
    permissoes
};
