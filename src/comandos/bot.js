/*
 * Comando /bot.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { ehODono, itensDasPessoas } = require('./set');
const { client, concluirAviso } = require('../cliente');
const { idsDoChatAtual, nomeDoContato, resolveLidToPhone, resolverNomeDoGrupo } = require('../contatos');
const {
    descreverDestino, descreverDestinos, enviarAosDestinos, extrairDestinos, resolverDestinos
} = require('../destinos');
const { aguardarConfirmacao, autorDe } = require('../escolhas');
const { GetOptFromCommand } = require('../opcoes');
const { caixas } = require('../imap');
const { printInfo } = require('../log');
const { delegavel, descreverRegra, gravarRegra, regraDe } = require('../permissoes');
const {
    SETTINGS_SCHEMA, comandoDeUsuario, getSetting, setSetting, validarSetting
} = require('../settings');
const { definirSenha } = require('../login');
const { textoDoTeste } = require('../diagnostico');
const { textoDoInfo } = require('../sistema');
const {
    agendamentoDiario, agendarStatusDiario, desligarStatusDiario, destinosDoStatus, ondeVai,
    textoDoStatus
} = require('../status');
const { fmtQuando, lerHora } = require('../util/quando');
const { mascararTelefones, tirarOpcaoMascara } = require('../util/telefone');
const { contextoDebug } = require('../debugContexto');
const { t } = require('../i18n');

/*
 * /bot: o bot e quem usa (settings 'bot.paused', 'bot.admins' e 'bot.users')
 *   /bot           → o status (o mesmo do -status): o estado, o relatório de 24 h e quem usa
 *   /bot -on|-off  → liga e desliga: desligado, TODOS os comandos são ignorados, exceto o /bot
 *                    (as listas de admins e usuários ficam como estão)
 *   /bot -list-users → os usuários deste chat (num grupo, os de lá; no seu privado, todos)
 *   /bot -list-users all → todos os usuários, em qualquer chat (num grupo, com os telefones de fora
 *                     escondidos)
 *   /bot -passwd <senha|off> → (dono) define a senha do login (só o hash fica no banco)
 *   /bot -login <senha>      → quem é de fora, no privado, vira admin; o dono é avisado (WhatsApp e e-mail)
 *   /bot -reset    → tira todos os usuários e os limites deles (os admins e o liga/desliga ficam)
 *   /bot -reset force → volta tudo ao padrão: também tira os admins extras e liga o bot
 * A recuperação de apagadas, o /watch e os alertas continuam funcionando com ele desligado.
 *
 * Os atalhos do IRC (o: operador, manda; v: voz, só fala), só do dono, um de cada vez:
 *   /bot +a|-a <pessoa...>        → adiciona e tira admins (bot.admins)
 *   /bot +u|-u <pessoa|grupo...>  → adiciona e tira usuários (bot.users)
 * A pessoa é /Nome/, "Nome", @menção ou +número, como no -to. Sem ninguém, vale
 * o chat atual: no grupo, o grupo (que não vira admin); no privado de alguém, a pessoa.
 * O +u de uma pessoa digitado num grupo vale só nesse grupo.
 *
 * O relatório (src/status.js) aceita -to e -mask; as versões (src/sistema.js), -mask:
 *   /bot -status (-s)         → o relatório agora (o mesmo do /bot sem opção)
 *   /bot -s 06h [-to <dest>]  → todo dia às 06:00 (Brasília), no seu privado ou nos -to
 *   /bot -s -to <dest>        → o relatório agora, nos -to (pessoas, grupos, e-mails)
 *   /bot -s off               → desliga o envio diário
 *   /bot -info (-i)           → versões (Node.js, whatsapp-web.js, Chromium...) e o sistema
 */
// Quem usa os comandos, pelo bot.users
function quemUsa() {
    const users = getSetting('bot.users');
    const admins = getSetting('bot.admins').length ? t('adm.bot.andAdmins') : '';
    if (users.includes('all')) return t('adm.bot.everyone');
    if (!users.length) return t('adm.bot.ownerOnly', { admins });
    return t('adm.bot.ownerAndList');
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
 * só num grupo ("telefone:grupo", o /bot +u digitado no grupo).
 */
function lerItem(item) {
    const [numero, soEm = null] = item.split(':');
    return { numero, soEm, ehGrupo: !soEm && item.endsWith('@g.us') };
}

/*
 * Quem a lista mostra, pelo chat onde o comando foi digitado:
 *   - no seu privado (ou com -list-users all): todos;
 *   - num grupo: quem participa dele, o próprio grupo e quem só tem permissão nele;
 *   - no privado de alguém: só essa pessoa.
 * membros: num grupo, os telefones de quem está nele; o de quem não está sai
 * escondido (com o -list-users all, aparece todo mundo, mas sem entregar o número
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
        return { chatId, membros, mostra, onde: t('adm.bot.whereGroup'), aqui: t('adm.bot.hereGroup') };
    }

    const ids = chatId ? await idsDoChatAtual(chatId) : [];
    if (todos || !chatId || ids.includes(client.info.wid._serialized)) {
        return { chatId, membros: null, mostra: null };
    }

    const telefone = ids.find(i => i.endsWith('@c.us'))?.split('@')[0];
    const daPessoa = (item) => lerItem(item).numero === telefone;
    return { chatId, membros: null, mostra: daPessoa, onde: t('adm.bot.whereChat'), aqui: t('adm.bot.hereChat') };
}

// 5521999982222 → 5521•••••2222 (o DDI e o DDD ficam, e os 4 últimos)
const mascarar = (n) => `${n.slice(0, 4)}${'•'.repeat(Math.max(1, n.length - 8))}${n.slice(-4)}`;
const numeroVisivel = (n, membros) => contextoDebug().maskTelefones ? mascararTelefones(n)
    : membros && !membros.has(n) ? mascarar(n) : n;

// O nome de um telefone ou grupo: o do grupo, o do contato ou, para você, o do seu perfil
async function nomeDoItem(item) {
    if (item.endsWith('@g.us')) return resolverNomeDoGrupo(item).catch(() => null);

    // Você raramente está na própria agenda: vale o nome do seu perfil
    const contato = await client.getContactById(`${item}@c.us`).catch(() => null);
    return nomeDoContato(contato) || (ehODono(item) ? client.info.pushname : null);
}

// " · só neste grupo" ou " · só em 👥 Amigos Faculdade" (a pessoa só num grupo)
async function soEmTexto(soEm, escopo) {
    if (!soEm) return '';
    if (soEm === escopo?.chatId) return t('adm.bot.onlyInGroup');
    return t('adm.bot.onlyInNamed', { nome: await nomeDoItem(soEm) || soEm });
}

/*
 * Um item como o resto do bot mostra um destino: "👤 Maria Lucia · +5521988887777",
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
    if (soEm) return [`${PAPEIS.usuario} +u`];
    return [
        ehODono(numero) && `${PAPEIS.dono} ${t('adm.bot.markOwner')}`,
        admins.includes(item) && `${PAPEIS.admin} +a`,
        users.includes(item) && `${PAPEIS.usuario} +u`
    ].filter(Boolean);
}

/*
 * Admins (+a) e usuários (+u) numa lista só: quem está nas duas aparece uma
 * vez, com as duas marcas. Primeiro os admins, na ordem de cada setting.
 * novos: os que acabaram de entrar (com ✅). dica: 'todos' (o -list-users all, com
 * o cuidado de não expor quem é de fora) ou 'usuarios' (o -list-users, na resposta
 * do +a/+u).
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
    const comoVer = dica === 'todos' ? t('adm.bot.seeAllHint', { onde }) : t('adm.bot.listUsersHint');
    const rodape = fora ? `\n\n${t('adm.bot.footerOutside', { onde, fora, comoVer })}` : '';
    const titulo = mostra ? t('adm.bot.usersTitleScoped', { n: itens.length, aqui }) : t('adm.bot.usersTitle', { n: itens.length });
    if (!itens.length) return `${titulo}\n${t('adm.bot.nobody', { onde })}${rodape}`;

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
    return `${t('adm.bot.permTitle')}\n` +
        (dono ? `${t('adm.bot.permOwner', { e: PAPEIS.dono })}\n` : '') +
        `${t('adm.bot.permAdmin', { e: PAPEIS.admin })}\n` +
        t('adm.bot.permUser', { e: PAPEIS.usuario }) +
        (semPermissao ? `\n${t('adm.bot.permNone', { e: PAPEIS.nenhum })}` : '');
}

// Ligado ou desligado, e quem usa os comandos
const estadoDoBot = () => (getSetting('bot.paused') ? t('adm.bot.paused') : t('adm.bot.active')) + '\n' + quemUsa();

// A lista do -list-users [all] (sem ninguém nela, a linha de quem usa os comandos)
async function textoDosUsuarios(chat) {
    return await listaDeUsuarios(await escopoDoChat(chat)) || quemUsa();
}

// O /bot sem opção e o -status: o estado no topo, o relatório, os usuários e o envio diário
async function relatorio(chat) {
    const usuarios = await listaDeUsuarios(await escopoDoChat(chat));
    const texto = await textoDoStatus(Date.now(), { estadoDoBot: estadoDoBot(), usuarios });
    return `${texto}\n\n${t('adm.bot.moreInfo')}`;
}

// +a/-a (bot.admins), +u/-u (bot.users) e +cmd/-cmd (os comandos de cada usuário), em qualquer
// ordem
const ATALHO = /(^|\s)[+-](a|u|cmd)(?=\s|$)/;
const OPERACAO = /(^|\s)([+-])([au])(?=\s|$)/;
const OPCAO_CMD = /(^|\s)([+-])cmd(?:\s+((?:[^\s+,-][^\s,]*,\s*)*[^\s+,-][^\s,]*))?(?=\s|$)/;
const LISTA_DO_ATALHO = { a: 'bot.admins', u: 'bot.users' };

/*
 * O texto do atalho: a operação (+a/-a/+u/-u), o +cmd/-cmd e os comandos dele,
 * o -list-users all (a resposta com todos; sem o all é o normal) e o resto (quem).
 */
function lerAtalho(texto) {
    let resto = ` ${texto} `;
    const tirar = (re) => {
        const m = resto.match(re);
        if (m) resto = resto.slice(0, m.index) + m[1] + resto.slice(m.index + m[0].length);
        return m;
    };
    const todos = Boolean(tirar(/(^|\s)-(?:list-users|lu)\s+all(?=\s|$)/));
    tirar(/(^|\s)-(?:list-users|lu)(?=\s|$)/);
    const cmd = tirar(OPCAO_CMD);
    const op = tirar(OPERACAO);
    return {
        op: op ? { sinal: op[2], letra: op[3] } : null,
        cmd: cmd ? { sinal: cmd[2], texto: cmd[3] ?? '' } : null,
        todos,
        quem: resto.trim()
    };
}

// "/rates,/crypto meme" → ['/rates', '/crypto', '/meme']; "all" → ['all']; inválido: lança
function lerComandos(texto) {
    const nomes = texto.split(/[\s,]+/).filter(Boolean);
    if (!nomes.length) throw new Error(t('adm.bot.needCommands'));
    if (nomes.length === 1 && /^all$/i.test(nomes[0])) return ['all'];
    return [...new Set(nomes.map(comandoDeUsuario))];
}

/*
 * Sem ninguém, o chat onde o comando foi digitado: no grupo, o grupo; no
 * privado de alguém, a pessoa (pelo telefone). No seu privado, não há quem.
 * @returns {Promise<string[]|null>} null: já respondeu o erro
 */
async function itensDoChat(msg, key, { chatId, isGroup }) {
    if (isGroup) {
        if (key === 'bot.users') return [chatId];
        await msg.reply(t('adm.bot.groupNotAdmin'));
        return null;
    }

    const ids = await idsDoChatAtual(chatId);
    if (ids.includes(client.info.wid._serialized)) {
        await msg.reply(t('adm.bot.ownPrivate'));
        return null;
    }

    const telefone = ids.find(i => i.endsWith('@c.us'));
    if (!telefone) {
        await msg.reply(t('adm.bot.noPhone'));
        return null;
    }
    return [telefone.split('@')[0]];
}

/*
 * Os itens do texto (nomes, menções, números, grupos), já validados. Num
 * grupo, o +u de uma pessoa vale só nesse grupo ("telefone:grupo").
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
        await msg.reply(t('adm.bot.needWho'));
        return null;
    }

    const soNoGrupo = key === 'bot.users' && isGroup;
    return itens.map(i => (soNoGrupo && !i.endsWith('@g.us') ? `${i}:${chatId}` : i));
}

/*
 * O que sai com o -u: num grupo, a permissão dele (ou, sem ela, a geral); no
 * privado, todas as da pessoa (a geral e as de cada grupo).
 */
function aRemover(item, atual, { isGroup }) {
    const { numero, soEm } = lerItem(item);
    if (soEm && isGroup) return atual.includes(item) ? [item] : atual.filter(i => i === numero);
    if (lerItem(item).ehGrupo) return atual.filter(i => i === item);
    return atual.filter(i => lerItem(i).numero === numero);
}

/*
 * +a|-a|+u|-u: muda a lista e responde com a lista deste chat (os que entraram,
 * com ✅; os que saíram, numa linha 🗑️ em cima). Os que entraram e não aparecem
 * na lista daqui ganham uma linha ✅ em cima.
 */
async function mudarLista(msg, key, itens, acrescentar, chat) {
    const atual = getSetting(key);
    const admin = key === 'bot.admins';
    const escopo = await escopoDoChat(chat);
    const curtos = (lista) => Promise.all(lista.map(i => descreverItem(i, escopo)));

    if (acrescentar && atual.includes('all')) {
        await msg.reply(t('adm.bot.everyoneAlready'));
        return;
    }

    let novos;
    let removidos = [];
    if (acrescentar) {
        // Já tem: o próprio item ou, para quem só ganharia um grupo, a permissão geral
        novos = itens.filter(i => !atual.includes(i) && !atual.includes(lerItem(i).numero));
        if (!novos.length) {
            await msg.reply(t(admin ? 'adm.bot.alreadyAdmin' : 'adm.bot.alreadyUser', { lista: (await curtos(itens)).join(', ') }));
            return;
        }
        await setSetting(key, [...atual, ...novos]);
        // Quem entra começa sem regra (uma velha, de antes de sair pelo /set, não volta)
        if (key === 'bot.users') for (const i of novos) await gravarRegra(i, null);
    } else {
        removidos = [...new Set(itens.flatMap(i => aRemover(i, atual, chat)))];
        if (!removidos.length) {
            await msg.reply(t(admin ? 'adm.bot.notAdmin' : 'adm.bot.notUser', { lista: (await curtos(itens)).join(', ') }));
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
 * +cmd|-cmd: a regra de cada usuário. Junto com o +u, define a regra:
 * +u +cmd /a,/b = só esses; +u -cmd /a = todos, menos esse. Sozinhos:
 *   +cmd: (um comando admin só entra em "Apenas") quem não é usuário entra só com esses; "Apenas" ganha esses; "Todos,
 *         menos" libera esses de novo; quem usa todos fica como está; all apaga a regra;
 *   -cmd: "Apenas" perde esses (o último, não: aí é o -u); quem usa todos fica
 *         "Todos, menos" esses; "Todos, menos" ganha esses.
 * Num grupo, a pessoa é a de lá ("telefone:grupo") ou, sem ela, a de qualquer chat.
 */
async function mudarComandos(msg, itens, { sinal, comandos, comV }, chat) {
    const users = getSetting('bot.users');
    if (users.includes('all')) {
        await msg.reply(t('adm.bot.everyoneAlready'));
        return;
    }

    const escopo = await escopoDoChat(chat);
    const tudo = comandos.includes('all');
    const admins = comandos.filter(delegavel);
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
            else if (!regra?.apenas && admins.length) {
                avisos.push(t('adm.bot.adminNeedsOnly', { quem, admins: admins.join(', '), ex: admins[0] }));
                continue;
            } else if (!regra) {
                avisos.push(t('adm.bot.alreadyAll', { quem }));
                continue;
            } else if (regra.apenas) nova = { apenas: true, comandos: uniao };
            else nova = sobra.length ? { apenas: false, comandos: sobra } : null;
        } else {
            if (!ehUsuario) {
                avisos.push(t('adm.bot.notUserWho', { quem }));
                continue;
            }
            if (tudo || (regra?.apenas && !sobra.length)) {
                avisos.push(t('adm.bot.nothingLeft', { quem }));
                continue;
            }
            if (!regra) nova = { apenas: false, comandos };
            else nova = regra.apenas ? { apenas: true, comandos: sobra } : { apenas: false, comandos: uniao };
        }

        const mesma = JSON.stringify(nova) === JSON.stringify(regra);
        if (ehUsuario && mesma) {
            avisos.push(t('adm.bot.nothingChanged', { quem, regra: regra ? ` (${descreverRegra(regra)})` : '' }));
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
    const key = LISTA_DO_ATALHO[op?.letra ?? 'u'];
    const chat = { ...chatAtual, todos };

    // Só o dono: um admin extra não promove ninguém (nem a si mesmo)
    if (!msg.fromMe) {
        await msg.reply(t(key === 'bot.admins' ? 'adm.bot.ownerOnlyAdmins' : 'adm.bot.ownerOnlyUsers'));
        return;
    }

    // O +cmd|-cmd é dos usuários: com o +a/-a ou o -u, não
    if (cmd && op && (op.letra === 'a' || op.sinal === '-')) {
        await msg.reply(t('adm.bot.cmdOnlyUsers'));
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
            await msg.reply(t('adm.bot.cmdRemoveAll'));
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
        await enviarAosDestinos(destinos, texto, { assunto: t('adm.bot.statusSubject') })
            .then(() => msg.reply(t('adm.bot.statusSent', { onde: descreverDestinos(destinos) })))
            .catch(err => msg.reply(t('adm.bot.statusFail', { erro: err.message })));
        return;
    }

    if (valores.length === 1 && valores[0].toLowerCase() === 'off') {
        if (destinos) {
            await msg.reply(t('adm.bot.toNotWithOff'));
            return;
        }
        await msg.reply(await desligarStatusDiario()
            ? t('adm.bot.dailyOff')
            : t('adm.bot.dailyWasOff'));
        return;
    }

    // "às 6h" ou "6h": a hora do envio diário
    const hora = lerHora(valores.filter(e => !/^[àa]s$/i.test(e)).join(''));
    if (!hora || valores.length > 2) {
        await msg.reply(t('adm.bot.badHour', { sintaxe: getCommandSyntax('/bot') }));
        return;
    }

    const proximo = await agendarStatusDiario(hora, Date.now(), destinos);
    const dois = (n) => String(n).padStart(2, '0');
    const onde = ondeVai(destinosDoStatus(await agendamentoDiario()));
    await msg.reply(t('adm.bot.dailySet', { hora: `${dois(hora.h)}:${dois(hora.m)}`, onde, proximo: fmtQuando(proximo) }));
}

// O que cada -reset volta ao padrão (o envio diário do -status fica sempre)
const DO_RESET = ['bot.users', 'bot.users.cmds'];
const DO_RESET_COMPLETO = [...DO_RESET, 'bot.admins', 'bot.paused'];

// Quanto tempo o -reset espera o "sim"
const CONFIRMAR_RESET_MS = 10_000;

/*
 * -reset: tira todos os usuários e os limites deles; os admins extras e o liga/desliga ficam.
 * -reset force: volta tudo ao padrão (também tira os admins extras e liga o bot).
 * Os dois perguntam antes (responda "sim" em 10 s).
 */
async function resetar(msg, { chatId, completo }) {
    if (!msg.fromMe) {
        await msg.reply(t(completo ? 'adm.bot.resetOwnerFull' : 'adm.bot.resetOwner'));
        return;
    }

    const segundos = CONFIRMAR_RESET_MS / 1000;
    const pergunta = await msg.reply(t(completo ? 'adm.bot.askFull' : 'adm.bot.ask', { segundos }));
    const confirmou = await aguardarConfirmacao(chatId, {
        ms: CONFIRMAR_RESET_MS,
        autor: autorDe(msg),
        aoExpirar: () => concluirAviso(msg, pergunta, t('adm.bot.resetExpired', { segundos }))
    });
    if (confirmou === false) await msg.reply(t('adm.bot.nothingChangedShort'));
    if (!confirmou) return;

    const usuarios = getSetting('bot.users').length;
    for (const key of completo ? DO_RESET_COMPLETO : DO_RESET) await setSetting(key, SETTINGS_SCHEMA[key].default);

    if (completo) {
        printInfo('/bot -reset force: usuários, admins e bot.paused de volta ao padrão');
        await msg.reply(t('adm.bot.resetFullDone', { estado: estadoDoBot() }));
        return;
    }
    printInfo(`/bot -reset: ${usuarios} usuário(s) e os limites deles removidos`);
    await msg.reply(t('adm.bot.resetDone', { n: usuarios, estado: estadoDoBot() }));
}

// -flush-email: conta as mensagens de Sent e Trash; com "true", apaga tudo (só o dono)
async function limparEmail(msg, { apagar }) {
    if (apagar && !msg.fromMe) {
        await msg.reply(t('adm.bot.flushOwner'));
        return;
    }

    const aviso = apagar ? await msg.reply(t('adm.bot.flushing')) : null;
    try {
        const { sent, trash } = await caixas({ apagar });
        printInfo(`/bot -flush-email${apagar ? ' true' : ''}: Sent ${sent}, Trash ${trash}`);
        const texto = apagar
            ? t('adm.bot.flushed', { sent, trash, total: sent + trash })
            : t('adm.bot.flushCount', { sent, trash });
        await (apagar ? concluirAviso(msg, aviso, texto) : msg.reply(texto));
    } catch (err) {
        const texto = t('adm.bot.flushFail', { erro: err.message });
        await (apagar ? concluirAviso(msg, aviso, texto) : msg.reply(texto));
    }
}

async function cmdBot({ msg, opts: optsDoComando, args, chatId, isGroup }) {
    args = tirarOpcaoMascara(args);
    if (ATALHO.test(String(args ?? ''))) {
        await tratarAtalho(msg, String(args).trim(), { chatId, isGroup });
        return;
    }

    // Os destinos repetidos e agrupados (/Grupo L200/) são resolvidos juntos.
    const { destinos: destinosTexto, informado: comDestino, resto } = extrairDestinos(args);
    const opts = comDestino ? GetOptFromCommand(resto, findCommand('/bot')) : optsDoComando;
    const { on, off } = opts.opt;
    // -list-users [all]: sem o all, os deste chat; com ele, todos
    const listar = opts.given.has('list-users');
    const todos = listar && /^all$/i.test(opts.opt['list-users'] ?? '');
    if (listar && opts.opt['list-users'] && !todos) {
        await msg.reply(t('adm.bot.listUsersUse'));
        return;
    }
    const chat = { chatId, isGroup, todos };

    if (comDestino && !opts.given.has('status')) {
        await msg.reply(t('adm.bot.toIsStatus'));
        return;
    }

    // -info, -test, -reset e -flush-email: sozinhas (o -reset aceita o force, que não pergunta;
    // o -flush-email, o true)
    // -passwd <senha|off>: a senha do /bot -login (só o dono)
    if (opts.given.has('passwd')) {
        if (!msg.fromMe) {
            await msg.reply(t('adm.bot.passwdOwner'));
            return;
        }
        const senha = [opts.opt.passwd, ...opts.argv].filter(Boolean).join(' ').trim();
        await msg.reply(senha ? await definirSenha(senha) : t('adm.bot.passwdUsage'));
        return;
    }

    const SOZINHAS = ['info', 'test', 'reset', 'flush-email'];
    for (const sozinha of SOZINHAS) {
        if (!opts.given.has(sozinha)) continue;
        const outras = SOZINHAS.filter(o => o !== sozinha);
        // O valor do -reset: nada ou force; o do -flush-email: nada ou true
        const valor = sozinha === 'reset' || sozinha === 'flush-email' ? opts.opt[sozinha] : null;
        const forcar = new RegExp(`^${sozinha === 'reset' ? 'force' : 'true'}$`, 'i').test(valor ?? '');
        const combinada = on || off || listar || opts.given.has('status') || outras.some(o => opts.given.has(o));
        if (combinada || opts.argv.length || (valor && !forcar)) {
            await msg.reply(t('adm.bot.noCombine', { opcao: sozinha }));
            return;
        }
        if (sozinha === 'info') await msg.reply(await textoDoInfo());
        else if (sozinha === 'test') {
            const aviso = await msg.reply(t('adm.bot.testing'));
            await concluirAviso(msg, aviso, await textoDoTeste());
        } else if (sozinha === 'flush-email') await limparEmail(msg, { apagar: forcar });
        else await resetar(msg, { chatId, completo: forcar });
        return;
    }

    // -status [<hora>|off] [-to ...]: o parser pega um valor; "às 18h" deixa o resto em argv
    if (opts.given.has('status')) {
        if (on || off || listar) {
            await msg.reply(t('adm.bot.statusNoCombine'));
            return;
        }
        const valores = [opts.opt.status, ...opts.argv].filter(Boolean);
        await tratarStatus(msg, valores, { destinosTexto, comDestino, chat });
        return;
    }

    if (opts.argv.length || (on && off)) {
        await msg.reply(t('adm.bot.usage'));
        return;
    }

    // -on|-off: só liga e desliga (as listas ficam); -list-users [all]: os usuários
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
