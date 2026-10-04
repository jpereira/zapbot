/*
 * Agenda: os lembretes (/lembrete) e as mensagens agendadas (/cron), com a verificação periódica.
 */

const { enviarMidias, erroDosComandos, montarTexto } = require('./agendaComandos');
const { estado } = require('./estado');
const { client } = require('./cliente');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const {
    descreverDestino, enviarAosDestinos, extrairDestinos, resolverOuEscolher
} = require('./destinos');
const { printError, printInfo } = require('./log');
const { destinosDoStatus, textoDoStatus } = require('./status');
const { getSetting } = require('./settings');
const { plural, resumirTexto, semAcentos } = require('./util/formatar');
const { REPETICOES, fmtQuando, lerQuando, partesEmBrasilia, proximaRepeticao } = require('./util/quando');

/*
 * O /cron (aliases /agenda e /lembrete) tem dois modos, na mesma tabela
 * `schedules` e no mesmo timer:
 *   agendar  → (modo mensagem) o texto puro, como se você digitasse, no chat atual ou no do -to;
 *   lembrete → "⏰ Lembrete" no chat onde foi criado (respondendo a mensagem do
 *              comando, ou a mensagem que ele respondeu), ou no seu privado com
 *              -pv. É o modo do /lembrete e do -lembrete.
 * Os dois aceitam -repetir (-r) diario|semanal|mensal. O modo mensagem aceita
 * vários -to (um item só, com todos os destinos). Na lista, -edit <nº> troca a hora, o texto
 * ou a repetição de um item, e -pause/-resume <nº...|all> o seguram e soltam.
 * Um {/comando} no texto roda na hora do envio e a resposta entra no lugar
 * (veja agendaComandos.js); -test <nº> mostra agora como a mensagem sairia.
 * Sai da sua conta: só o dono usa.
 */
const TIPOS = {
    lembrete: {
        cmd: '/lembrete',
        icone: '⏰',
        criado: 'Lembrete criado',
        exemplo: '/lembrete 18:30 pagar o boleto',
        aceitaTo: false,
        aceitaPv: true
    },
    agendar: {
        cmd: '/cron',
        icone: '📅',
        criado: 'Mensagem agendada',
        exemplo: '/cron sexta 18h -to /Grupo L200/ Bom fim de semana!',
        aceitaTo: true,
        aceitaPv: false
    }
};
const EXEMPLOS = `💡 _Ex.: ${TIPOS.agendar.exemplo}\n${TIPOS.lembrete.exemplo}_`;

const MAX_DIAS = 366;
const ATRASO_TOLERADO_MS = 5 * 60_000;

/**
 * Lê "<quando> [opções] <texto>": as opções e o "quando" vêm no começo, em
 * qualquer ordem; o texto é o resto, como foi digitado (com as quebras de linha).
 * @returns {{ opt: {list?, lembrete?, rm?, repetir?, pv?, edit?, pause?, resume?, test?}, quando: {ms}|null,
 *            texto: string, destinos: Array<string|null>, comDestino: boolean }}
 */
function lerAgendamento(args) {
    const { destinos, informado: comDestino, resto } = extrairDestinos(args);
    const palavras = [...resto.matchAll(/\S+/g)];
    const opt = {};
    let quando = null;
    let i = 0;

    for (; i < palavras.length; i++) {
        const p = palavras[i][0];
        const nome = p.startsWith('-') ? p.slice(1).toLowerCase() : null;

        if (nome === 'list' || nome === 'l') opt.list = true;
        else if (nome === 'pv') opt.pv = true;
        else if (nome === 'lembrete' || nome === 'lem') opt.lembrete = true;
        else if (['rm', 'pause', 'resume'].includes(nome)) {
            // Um ou vários números (-rm 2, -rm 1 3 5, -rm 1,3,5) ou all
            const nums = [];
            while (/^(\d+,?)+$|^all$/i.test(palavras[i + 1]?.[0] ?? '')) nums.push(palavras[++i][0]);
            opt[nome] = nums.join(' ');
        } else if (['edit', 'test'].includes(nome)) opt[nome] = palavras[++i]?.[0] ?? '';
        else if (nome === 'repetir' || nome === 'r') opt.repetir = palavras[++i]?.[0] ?? '';
        else if (!quando && (quando = lerQuando(palavras.slice(i).map(m => m[0])))) i += quando.usadas - 1;
        else break;
    }

    const texto = i < palavras.length ? resto.slice(palavras[i].index).trim() : '';
    return { opt, quando, texto, destinos, comDestino };
}

// Lembretes e mensagens juntos, na ordem em que saem (os números do -rm). O status diário (/bot -status) fica de fora
const listar = () => dbAll("SELECT * FROM schedules WHERE kind != 'status' ORDER BY due_at, id");

// Os destinos de um item: os vários -to (recipients) ou o chat dele
const destinosDoItem = (s) => (s.recipients
    ? JSON.parse(s.recipients)
    : [{ id: s.chat_id, nome: s.chat_name, grupo: Boolean(s.is_group) }]);

// Para onde vai: "👥 Grupo", "👤 Contato" ou "seu privado"
const ondeDoDestino = (d) => (d.id === client.info.wid._serialized ? 'seu privado' : `${d.grupo ? '👥' : '👤'} ${d.nome}`);
const ondeDoItem = (s) => destinosDoItem(s).map(ondeDoDestino).join(', ');

// O mesmo, com o id (grupo) ou o número (pessoa), para o log
function ondeNoLog(d) {
    const onde = ondeDoDestino(d);
    if (onde === 'seu privado') return onde;
    const numero = !d.grupo && d.id.endsWith('@c.us') ? `+${d.id.split('@')[0]}` : d.id;
    return `${onde} (${numero})`;
}

function linhaDaLista(s, i) {
    const repete = s.repeat ? ` 🔁 ${REPETICOES[s.repeat].rotulo}` : '';
    const pausado = s.paused ? ' ⏸️ _pausado_' : '';
    // O texto inteiro, como foi cadastrado; as linhas seguintes recuadas, como a do destino
    const texto = s.text.replace(/\n/g, '\n   ');
    const destinos = destinosDoItem(s).map(d => `\n   → ${ondeDoDestino(d)}`).join('');
    return `${i + 1}. ${TIPOS[s.kind]?.icone ?? '📅'} *${fmtQuando(s.due_at)}*${repete}${pausado} — ${texto}${destinos}`;
}

// "2" → [item 2]; "all" → todos; senão null
function itensDoNumero(itens, valor) {
    const alvo = semAcentos(valor).trim();
    if (alvo === 'all') return itens;
    const item = /^\d+$/.test(alvo) ? itens[Number(alvo) - 1] : null;
    return item ? [item] : null;
}

/*
 * "1 3,5" → os itens 1, 3 e 5 (os números da lista, na ordem; repetido conta
 * uma vez); "all" → todos. Algum que não existe: { faltando }, e quem chama não
 * mexe em nenhum.
 * @returns {{ alvos: object[] } | { faltando: string[] }}
 */
function itensDosNumeros(itens, valor) {
    const partes = semAcentos(valor ?? '').split(/[\s,]+/).filter(Boolean);
    if (partes.includes('all')) return { alvos: itens };

    const numeros = [...new Set(partes.map(Number))].sort((a, b) => a - b);
    const faltando = numeros.filter(n => !itens[n - 1]);
    if (!numeros.length || faltando.length) return { faltando: faltando.length ? faltando.map(String) : ['?'] };
    return { alvos: numeros.map(n => itens[n - 1]) };
}

// "❌ Nº 7, 9 não existem. Nada foi <feito>; ..."
const erroDosNumeros = (faltando, feito, uso) =>
    `❌ Nº ${faltando.join(', ')} não existe${faltando.length > 1 ? 'm' : ''}. Nada foi ${feito}; veja a lista com /cron -l\n💡 _${uso}_`;

// O "quando" de um item novo ou editado: no futuro e até MAX_DIAS
function erroDoQuando(ms, agora = Date.now()) {
    if (ms <= agora) return `❌ ${fmtQuando(ms)} já passou.`;
    if (ms > agora + MAX_DIAS * 86400_000) return `❌ No máximo ${MAX_DIAS} dias à frente.`;
    return null;
}

/*
 * -pause / -resume <nº...|all>. Ao retomar, um item repetido que venceu enquanto
 * estava pausado pula para o próximo horário; um único sai na próxima verificação.
 */
async function pausarOuRetomar(msg, itens, pausar, valor) {
    const opcao = pausar ? '-pause' : '-resume';
    const { alvos, faltando } = itensDosNumeros(itens, valor);

    if (faltando) {
        await msg.reply(erroDosNumeros(faltando, pausar ? 'pausado' : 'retomado', `/cron ${opcao} <nº> [nº...] ou ${opcao} all`));
        return;
    }

    const agora = Date.now();
    const linhas = [];
    for (const s of alvos.filter(s => Boolean(s.paused) !== pausar)) {
        let dueAt = s.due_at;
        if (!pausar && s.repeat) while (dueAt <= agora) dueAt = proximaRepeticao(dueAt, s.repeat, s.day_of_month);

        await dbRun('UPDATE schedules SET paused = ?, due_at = ? WHERE id = ?', [pausar ? 1 : 0, dueAt, s.id]);
        const vencido = !pausar && dueAt <= agora ? ' _(já passou: sai agora)_' : '';
        linhas.push(`• *${fmtQuando(dueAt)}* — ${resumirTexto(s.text, 60)}${vencido}`);
    }

    if (!linhas.length) {
        await msg.reply(pausar ? 'ℹ️ Já estava pausado.' : 'ℹ️ Não estava pausado.');
        return;
    }

    await msg.reply(`${pausar ? '⏸️ *Pausado*' : '▶️ *Retomado*'} (${linhas.length})\n${linhas.join('\n')}` +
        (pausar ? '\n💡 _Volta com /cron -resume <nº|all>._' : ''));
}

/*
 * -edit <nº> [quando] [-repetir ...] [texto]: troca o que vier. O destino e o
 * modo não mudam (para isso, remova e crie de novo).
 */
async function editar(msg, itens, { opt, quando, texto }) {
    const [s] = itensDoNumero(itens, opt.edit ?? '') ?? [];

    if (!s || semAcentos(opt.edit).trim() === 'all') {
        await msg.reply(`❌ Nº ${opt.edit || '?'} não existe. Veja a lista com /cron -l\n💡 _/cron -edit <nº> [quando] [texto]_`);
        return;
    }
    if (!quando && !texto && opt.repetir === undefined) {
        await msg.reply('❌ Informe o que mudar: a hora, o texto e/ou o -repetir.\n💡 _/cron -edit 2 18h · /cron -edit 2 novo texto · /cron -edit 2 sexta 9h -r semanal outro texto_');
        return;
    }

    let repetir = s.repeat;
    if (opt.repetir !== undefined) {
        repetir = semAcentos(opt.repetir).trim();
        if (['nao', 'off', 'no'].includes(repetir)) repetir = null;
        else if (!REPETICOES[repetir]) {
            await msg.reply('❌ Use -repetir (-r) diario, semanal, mensal ou nao.');
            return;
        }
    }

    const erroComando = texto ? erroDosComandos(texto) : null;
    if (erroComando) {
        await msg.reply(erroComando);
        return;
    }

    const dueAt = quando?.ms ?? s.due_at;
    if (quando) {
        const erro = erroDoQuando(dueAt);
        if (erro) {
            await msg.reply(erro);
            return;
        }
    }

    await dbRun('UPDATE schedules SET due_at = ?, day_of_month = ?, text = ?, repeat = ? WHERE id = ?',
        [dueAt, quando ? partesEmBrasilia(dueAt).dia : s.day_of_month, texto || s.text, repetir, s.id]);

    await msg.reply(`✏️ *Editado:* ${TIPOS[s.kind]?.icone ?? '📅'} *${fmtQuando(dueAt)}*` +
        (repetir ? ` 🔁 ${REPETICOES[repetir].rotulo}` : '') + (s.paused ? ' ⏸️ _pausado_' : '') +
        `\n📝 ${resumirTexto(texto || s.text, 100)}`);
}

async function tratarAgenda({ msg, args, chatId, chatName, isGroup, quotedMsg }) {
    await dbPronto;

    const { opt, quando, texto: digitado, destinos: destinosTexto, comDestino } = lerAgendamento(args);

    // Modo lembrete: chamado como /lembrete, ou com -lembrete
    const chamado = String(msg.body ?? '').trim().split(/\s+/, 1)[0].toLowerCase();
    const kind = chamado === '/lembrete' || opt.lembrete ? 'lembrete' : 'agendar';
    const t = TIPOS[kind];
    const sintaxe = `💡 _Ex.: ${t.exemplo}_`;
    const itens = await listar();

    if (opt.pv && !t.aceitaPv) {
        await msg.reply('❌ O -pv é do modo lembrete: use /lembrete (ou -lembrete) para lembrar no seu privado.');
        return;
    }

    if (comDestino && !t.aceitaTo) {
        await msg.reply('❌ O lembrete não tem -to: ele vem neste chat (ou no seu privado, com -pv). Para mandar uma mensagem a outro chat, use o /cron sem -lembrete.');
        return;
    }

    // -rm <nº...|all>: os números são os da lista, todos lidos antes de remover
    if (opt.rm !== undefined) {
        if (/\ball\b/i.test(opt.rm)) {
            await dbRun("DELETE FROM schedules WHERE kind != 'status'");
            await msg.reply(`🗑️ ${plural(itens.length, 'removido', 'removidos')}.`);
            return;
        }

        // Algum que não existe: não remove nenhum (a lista fica como estava)
        const { alvos: removidos, faltando } = itensDosNumeros(itens, opt.rm);
        if (faltando) {
            await msg.reply(erroDosNumeros(faltando, 'removido', '/cron -rm <nº> [nº...] ou -rm all'));
            return;
        }

        for (const s of removidos) await dbRun('DELETE FROM schedules WHERE id = ?', [s.id]);

        const linha = (s) => `*${fmtQuando(s.due_at)}* — ${resumirTexto(s.text, 60)}`;
        await msg.reply(removidos.length === 1
            ? `🗑️ Removido: ${linha(removidos[0])}`
            : `🗑️ *Removidos* (${removidos.length})\n${removidos.map(s => `• ${linha(s)}`).join('\n')}`);
        return;
    }

    // -pause / -resume <nº|all>
    if (opt.pause !== undefined || opt.resume !== undefined) {
        await pausarOuRetomar(msg, itens, opt.pause !== undefined, opt.pause ?? opt.resume);
        return;
    }

    // -edit <nº> [quando] [-repetir ...] [texto]
    if (opt.edit !== undefined) {
        if (comDestino || opt.pv || opt.lembrete) {
            await msg.reply('❌ O -edit troca só a hora, o texto e o -repetir. Para mudar o destino ou o modo, remova (-rm) e crie de novo.');
            return;
        }
        await editar(msg, itens, { opt, quando, texto: digitado });
        return;
    }

    // -test <nº>: monta agora (rodando os {/comando}) e mostra aqui, sem enviar ao destino
    if (opt.test !== undefined) {
        await testar(msg, itens, opt.test);
        return;
    }

    // -l, ou nada: a lista (lembretes e mensagens)
    if (opt.list || (!quando && !digitado && !quotedMsg)) {
        if (!itens.length) {
            await msg.reply(`📅 Nada agendado.\n${EXEMPLOS}`);
            return;
        }

        await msg.reply(`📅 *Agenda* (${itens.length})\n\n${itens.map(linhaDaLista).join('\n')}\n\n` +
            '💡 _📅 mensagem · ⏰ lembrete. -edit <nº> muda, -pause/-resume <nº...> segura e solta, -rm <nº...|all> remove._');
        return;
    }

    if (!quando) {
        await msg.reply(`❌ Não entendi quando. Use 6h, 18:30, às 18h (horário), +2h ou 30m (daqui a tanto tempo), amanhã 9h, sexta 18h ou 25/12 10:00.\n${sintaxe}`);
        return;
    }

    // Lembrete respondendo uma mensagem: o texto dela, se não vier outro
    const texto = digitado || (kind === 'lembrete' ? quotedMsg?.body?.trim() : '') || '';

    if (!texto) {
        await msg.reply(`❌ Faltou o texto.\n${sintaxe}`);
        return;
    }

    // {/comando} no texto: existe e pode rodar no /cron (o erro aparece agora, não na hora do envio)
    const erroComando = erroDosComandos(texto);
    if (erroComando) {
        await msg.reply(erroComando);
        return;
    }

    const agora = Date.now();
    const erroQuando = erroDoQuando(quando.ms, agora);
    if (erroQuando) {
        await msg.reply(erroQuando);
        return;
    }

    let repetir = null;
    if (opt.repetir !== undefined) {
        repetir = semAcentos(opt.repetir).trim();
        if (!REPETICOES[repetir]) {
            await msg.reply('❌ Use -repetir (-r) diario, semanal ou mensal.');
            return;
        }
    }

    const max = getSetting('agenda.max');
    const { n: total } = await dbGet("SELECT COUNT(*) AS n FROM schedules WHERE kind != 'status'");
    if (total + 1 > max) {
        await msg.reply(`❌ Limite de ${max} lembretes e mensagens agendadas (setting agenda.max). Remova algum antes.`);
        return;
    }

    // Onde vai: -to (mensagem; vários -to, um item com todos), -pv (lembrete) ou o chat atual
    const meuId = client.info.wid._serialized;
    let destinos = [{ id: chatId, nome: chatName, grupo: Boolean(isGroup) }];

    if (comDestino) {
        destinos = [];
        for (const destinoTexto of destinosTexto) {
            // Vários contatos ou grupos com o nome: espera você escolher na lista
            const destino = await resolverOuEscolher(msg, destinoTexto, {
                semEmail: '❌ O /cron envia a mensagem como se você digitasse, no WhatsApp: o -to é um contato, um grupo ou um número, não um e-mail.'
            });
            if (!destino) return;
            if (!destinos.some(d => d.id === destino.id)) destinos.push(destino);
        }
    } else if (opt.pv) {
        destinos = [{ id: meuId, nome: 'seu privado', grupo: false }];
    }

    // O lembrete responde a mensagem respondida pelo comando, ou o próprio comando (só no mesmo chat)
    const [primeiro] = destinos;
    const citada = kind === 'lembrete' && primeiro.id === chatId
        ? (quotedMsg?.id?._serialized ?? msg.id?._serialized ?? null)
        : null;
    const recipients = destinos.length > 1
        ? JSON.stringify(destinos.map(d => ({ id: d.id, nome: d.nome, grupo: Boolean(d.grupo) })))
        : null;

    await dbRun(
        `INSERT INTO schedules (kind, chat_id, chat_name, is_group, text, due_at, repeat, day_of_month, quoted_id, created_at, recipients)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [kind, primeiro.id, primeiro.nome, primeiro.grupo ? 1 : 0, texto, quando.ms, repetir,
            partesEmBrasilia(quando.ms).dia, citada, agora, recipients]
    );

    const onde = (d) => (d.id === meuId ? 'no seu privado' : d.id === chatId ? 'neste chat' : `em ${descreverDestino(d)}`);
    await msg.reply(`${t.icone} *${t.criado}* para *${fmtQuando(quando.ms)}*` +
        (repetir ? ` 🔁 ${REPETICOES[repetir].rotulo}` : '') +
        (destinos.length > 1
            ? ` em ${destinos.length} chats:\n${destinos.map(d => `• ${descreverDestino(d)}`).join('\n')}\n`
            : ` ${onde(destinos[0])}.\n`) +
        `📝 ${resumirTexto(texto, 100)}`);
}

// O que sai no chat: o texto puro (modo mensagem) ou o ⏰ Lembrete
function textoDoItem(s, texto, atrasado = false) {
    if (s.kind === 'agendar') return texto;
    return `⏰ *Lembrete*\n\n${texto}` + (atrasado ? `\n\n_(atrasado: era para ${fmtQuando(s.due_at)})_` : '');
}

/*
 * -test <nº>: monta o item agora, rodando os {/comando} como no chat de destino,
 * e mostra aqui como ele sairia. Não envia ao destino nem mexe no horário.
 */
async function testar(msg, itens, valor) {
    const [s] = itensDoNumero(itens, valor ?? '') ?? [];

    if (!s || semAcentos(valor).trim() === 'all') {
        await msg.reply(`❌ Nº ${valor || '?'} não existe. Veja a lista com /cron -l\n💡 _/cron -test <nº>_`);
        return;
    }

    // Os {/comando} rodam como no primeiro destino
    const { texto, midias } = await montarTexto(s.text, s);

    await msg.reply(`🧪 *Teste do nº ${valor.trim()}* _(sai em ${fmtQuando(s.due_at)} → ${ondeDoItem(s)})_\n\n` +
        (texto ? textoDoItem(s, texto) : '_(só mídia)_'));
    for (const { content, options } of midias) await msg.reply(content, undefined, { caption: options?.caption });
}

// Envia um item vencido; com repetição, agenda o próximo
async function dispararItem(s, agora) {
    const atrasado = agora - s.due_at > ATRASO_TOLERADO_MS;

    if (s.repeat) {
        let proximo = s.due_at;
        while (proximo <= agora) proximo = proximaRepeticao(proximo, s.repeat, s.day_of_month);
        await dbRun('UPDATE schedules SET due_at = ? WHERE id = ?', [proximo, s.id]);
    } else {
        // Sai ANTES de enviar: se o envio falhar, não repete a cada verificação
        await dbRun('DELETE FROM schedules WHERE id = ?', [s.id]);
    }

    if (s.kind === 'status') {
        // O relatório do /bot -status, montado na hora, nos destinos do -to (sem eles, o privado)
        const destinos = destinosDoStatus(s);
        const texto = await textoDoStatus(agora);
        await enviarAosDestinos(destinos, texto, { assunto: '📊 Status do ZapBot' })
            .catch(err => printError('/bot -status: falha ao enviar:', err.message));
        printInfo(`/bot -status: enviado para ${destinos.length ? destinos.map(d => d.email ?? d.id).join(', ') : 'seu privado'}` +
            (atrasado ? ' (atrasado)' : ''));
        return;
    }

    // Um destino que falha não segura os outros
    for (const d of destinosDoItem(s)) {
        await enviarAoDestinoDoItem(s, d, atrasado)
            .catch(err => printError(`${TIPOS[s.kind]?.cmd}: falha ao enviar ${s.id} para ${ondeNoLog(d)}:`, err.message));
    }
}

/*
 * Um destino do item: os {/comando} rodam no contexto do chat dele (o /stats
 * de um grupo é dele) e as mídias saem depois da mensagem.
 */
async function enviarAoDestinoDoItem(s, d, atrasado) {
    const noChat = { ...s, chat_id: d.id, chat_name: d.nome, is_group: d.grupo ? 1 : 0 };
    const { texto: montado, midias, comandos } = await montarTexto(s.text, noChat);
    const texto = textoDoItem(s, montado, atrasado);

    // Só mídia (ex.: "{/meme}"): não há texto a enviar
    if (texto && s.kind === 'agendar') {
        await client.sendMessage(d.id, texto);
    } else if (texto) {
        // A mensagem citada pode ter sumido: sem ela, vai sem citar
        await client.sendMessage(d.id, texto, s.quoted_id ? { quotedMessageId: s.quoted_id } : {})
            .catch(() => client.sendMessage(d.id, texto));
    }
    await enviarMidias(d.id, midias);

    printInfo(`${TIPOS[s.kind]?.cmd}: enviado para ${ondeNoLog(d)}` +
        (comandos.length ? `, com ${comandos.map(c => `{${c}}`).join(', ')}` : '') +
        `${atrasado ? ' (atrasado)' : ''}${s.repeat ? ` (${s.repeat})` : ''}`);
}

/*
 * Verificação periódica (a cada 30 s): envia o que venceu. Desconectado, espera;
 * ao voltar, envia o que venceu no meio tempo (os lembretes avisam o atraso).
 */
let verificando = false;

async function verificarAgenda() {
    if (verificando || !estado.pronto) return;
    verificando = true;

    try {
        await dbPronto;
        const agora = Date.now();
        const vencidos = await dbAll('SELECT * FROM schedules WHERE due_at <= ? AND paused = 0 ORDER BY due_at, id', [agora]);

        for (const s of vencidos) {
            await dispararItem(s, agora).catch(err => printError(`${TIPOS[s.kind]?.cmd ?? s.kind}: falha ao enviar ${s.id}:`, err.message));
        }
    } catch (err) {
        printError('Erro ao verificar a agenda:', err.message);
    } finally {
        verificando = false;
    }
}

// Chamada no app.js
function iniciarAgenda() {
    setInterval(verificarAgenda, 30 * 1000);
}

module.exports = {
    iniciarAgenda,
    lerAgendamento,
    tratarAgenda,
    verificarAgenda
};
