/*
 * /batch: vários comandos de uma mensagem só, executados um depois do outro.
 *
 * Uma linha que começa com um comando (ou alias) abre um bloco; o que vem depois,
 * linhas em branco inclusas, é do mesmo bloco. Uma linha com "/" que não é comando
 * (ex.: /etc/hosts) continua sendo texto do bloco. Cada bloco passa pelo mesmo
 * caminho de uma mensagem normal (alias, $1, opções) e a resposta é um resumo só.
 */
const { ehComandoOuAlias, executarAliasDeTexto, resolverAlias } = require('../aliases');
const { lerOpcoes: lerOpcoesDoComando } = require('../executar');
const { printError, printInfo } = require('../log');
const { resumirTexto } = require('../util/formatar');

const MAX_BLOCOS = 50;
const MAX_RESPOSTA = 300;
const SEM_PREVIA = { linkPreview: false };

// O texto vira blocos { linha }; o que vier antes do primeiro comando é ignorado (sobra)
async function separarBlocos(texto) {
    const blocos = [];
    let sobra = false;

    for (const linha of texto.split('\n')) {
        const nome = linha.trimStart().startsWith('/') ? linha.trim().split(/\s+/, 1)[0] : null;
        if (nome && await ehComandoOuAlias(nome)) {
            blocos.push(linha.trim());
        } else if (blocos.length) {
            blocos[blocos.length - 1] += `\n${linha}`;
        } else if (linha.trim()) {
            sobra = true;
        }
    }

    return { blocos: blocos.map(b => b.replace(/\s+$/, '')), sobra };
}

// Lê -stop (-s) / -dry (-d) / -quiet (-q) só da 1ª linha, antes dos comandos (o resto é dos blocos)
function lerOpcoes(args) {
    const opcoes = { stop: false, dry: false, quiet: false };
    let resto = args.trim();
    for (let m; (m = resto.match(/^-(stop|s|dry|d|quiet|q)(?=\s|$)\s*/i));) {
        const nome = m[1].toLowerCase();
        opcoes[nome === 'stop' || nome === 's' ? 'stop' : nome === 'quiet' || nome === 'q' ? 'quiet' : 'dry'] = true;
        resto = resto.slice(m[0].length);
    }
    return { opcoes, texto: resto };
}

// O msg do bloco: o mesmo, mas os textos que o comando responde são guardados para o resumo
function msgDoBloco(msg, linha, respostas) {
    const filho = Object.create(msg);
    Object.assign(filho, { body: linha, hasMedia: false, hasQuotedMsg: false });
    filho.reply = async (conteudo, ...resto) => {
        if (typeof conteudo !== 'string') return msg.reply(conteudo, ...resto);
        respostas.push(conteudo);
        return { id: msg.id, body: conteudo };
    };
    return filho;
}

async function executarBloco(linha, contexto) {
    const { HANDLERS } = require('./index'); // aqui dentro: o index importa este arquivo
    const respostas = [];
    const resolvido = await resolverAlias(linha);
    const command = resolvido?.command;

    if (!command) return { ok: false, respostas: ['comando desconhecido'] };
    if (command.cmd === '/batch') return { ok: false, respostas: ['/batch dentro de /batch não vale'] };

    const msg = msgDoBloco(contexto.msg, linha, respostas);
    const args = resolvido.args ?? linha.slice(linha.split(/\s+/, 1)[0].length).trim();

    if (resolvido.texto) {
        await executarAliasDeTexto(msg, { ...resolvido, quiet: true }, {
            chatId: contexto.chatId, chatName: contexto.chatName, isGroup: contexto.isGroup,
            quem: {
                nivel: contexto.nivel, admin: true, podeUsar: () => true, senderContact: contexto.senderContact,
                senderName: contexto.senderName, senderNumber: contexto.senderNumber
            }
        });
    } else {
        const handler = HANDLERS[command.cmd];
        if (!handler) return { ok: false, respostas: [`${command.cmd} ainda não foi implementado`] };
        await handler({ ...contexto, msg, args, opts: lerOpcoesDoComando(command, args), quotedMsg: null });
    }

    return { ok: !respostas.some(r => r.startsWith('❌') || r.startsWith('⚠️')), respostas };
}

const topo = (linha) => resumirTexto(linha.replace(/\s+/g, ' '), 50);

async function cmdBatch(contexto) {
    const { msg, args, quotedMsg } = contexto;
    const { opcoes, texto: digitado } = lerOpcoes(args);
    const texto = digitado || (quotedMsg?.body ?? '').trim();

    if (!texto) {
        await msg.reply('❌ Use: /batch [-stop] [-dry|-d] e, nas linhas de baixo, os comandos (ou responda uma mensagem com eles)');
        return;
    }

    const { blocos, sobra } = await separarBlocos(texto);
    if (!blocos.length) {
        await msg.reply('❌ Nenhum comando encontrado. Cada bloco começa com um comando ou alias, ex: /ideia ver isso');
        return;
    }
    if (blocos.length > MAX_BLOCOS) {
        await msg.reply(`❌ São ${blocos.length} blocos; o máximo é ${MAX_BLOCOS}. Nada foi executado.`);
        return;
    }

    const aviso = sobra ? '\n⚠️ _O texto antes do primeiro comando foi ignorado._' : '';

    if (opcoes.dry) {
        const linhas = blocos.map((b, i) => `${i + 1}. ${topo(b)}${b.includes('\n') ? ` (+${b.split('\n').length - 1} linhas)` : ''}`);
        await msg.reply(`📦 *BATCH* (${blocos.length}) · só a separação, nada executado\n\n${linhas.join('\n')}${aviso}`, undefined, SEM_PREVIA);
        return;
    }

    const linhas = [];
    const conteudos = []; // respostas com bloco de código (ex.: /ascii) saem inteiras, fora do resumo
    let falhas = 0;

    for (const [i, bloco] of blocos.entries()) {
        let r;
        try {
            r = await executarBloco(bloco, contexto);
        } catch (err) {
            printError(`/batch: erro no bloco ${i + 1}:`, err?.message || err);
            r = { ok: false, respostas: [err?.message || String(err)] };
        }

        if (!r.ok) falhas++;
        if (!r.ok && opcoes.quiet) printInfo(`/batch -quiet: bloco ${i + 1} falhou (${topo(bloco)}):`, r.respostas.join(' | '));
        const resposta = r.respostas.filter(t => !t.includes('```')).join('\n').trim();
        conteudos.push(...r.respostas.filter(t => t.includes('```')));
        const detalhe = resposta ? `\n   ↳ ${resumirTexto(resposta.replace(/\n+/g, ' · '), MAX_RESPOSTA)}` : '';
        linhas.push(`${r.ok ? '✅' : '❌'} ${i + 1} · ${topo(bloco)}${detalhe}`);

        if (!r.ok && opcoes.stop) {
            if (i + 1 < blocos.length) linhas.push(`⏹️ Parou no bloco ${i + 1}; ${blocos.length - i - 1} não rodaram.`);
            break;
        }
    }

    // -quiet: sem o resumo (o que os comandos mandam fora do resumo, como mídias, sai igual)
    if (!opcoes.quiet) {
        const ok = blocos.length - falhas;
        await msg.reply(`📦 *BATCH* · ${ok}/${blocos.length} ok\n\n${linhas.join('\n')}${aviso}`, undefined, SEM_PREVIA);
    }
    for (const c of conteudos) await msg.reply(c);
}

module.exports = { cmdBatch, separarBlocos };
