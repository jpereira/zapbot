#!/usr/bin/env node
/*
 * Gera, a partir do src/comandos/definicoes/, os trechos de docs/comandos/index.md (em inglês) e de
 * docs/comandos/index.pt-BR.md (em português) entre os
 * marcadores `<!-- gerado:NOME -->` e `<!-- /gerado:NOME -->`:
 *   roles     "Comandos por role": a lista de cada role;
 *   limites   a tabela do que um `admin` delegado não faz (as marcas `role` e `outrosChats`).
 *
 * node scripts/gerar-docs.js           reescreve o arquivo
 * node scripts/gerar-docs.js --check   só confere (sai com 1 se estiver desatualizado)
 */

const fs = require('fs');
const path = require('path');

const { commands } = require('../src/comandos/comandos');
const { localizar } = require('../src/comandos/localizar');
const { ROLES } = require('../src/roles');

const DOCS = path.join(__dirname, '..', 'docs', 'comandos');
const COLUNAS = 98;

// Os links separados por vírgula, quebrando em até 98 colunas (um link nunca quebra no meio)
function quebrar(itens) {
    const linhas = [];
    let linha = '';
    for (const item of itens) {
        const nova = linha ? `${linha}, ${item}` : item;
        if (nova.length > COLUNAS && linha) {
            linhas.push(`${linha},`);
            linha = item;
        } else {
            linha = nova;
        }
    }
    return [...linhas, linha].join('\n');
}

// Os textos de cada idioma: o inglês (en) é a página docs/comandos/index.md, e o português (pt-BR), a index.pt-BR.md
const TEXTOS = {
    en: {
        lang: 'en_US',
        arquivo: 'index.md',
        porRole: 'Commands by role',
        grupos: [
            '**user** (whoever is in `bot.users`)',
            '**admin, delegable** (admins and the owner; the owner releases them to a user with `+cmd`)',
            '**admin** (admins and the owner; never delegable)',
            '**owner** (the owner only)'
        ],
        tabela: ['Command', 'Current chat only (left out)', 'Owner and admins only']
    },
    'pt-BR': {
        lang: 'pt_BR',
        arquivo: 'index.pt-BR.md',
        porRole: 'Comandos por role',
        grupos: [
            '**user** (de quem está no `bot.users`)',
            '**admin, delegáveis** (admins e o dono; o dono libera a um usuário com `+cmd`)',
            '**admin** (admins e o dono; nunca delegáveis)',
            '**owner** (só o dono)'
        ],
        tabela: ['Comando', 'Só o chat atual (fica de fora)', 'Só o dono e os admins']
    }
};

// Os grupos da lista, do mais comum ao mais restrito: os comandos que entram em cada um
const ENTRA = [
    c => c.role === ROLES.USER,
    c => c.role === ROLES.ADMIN && c.delegavel,
    c => c.role === ROLES.ADMIN && !c.delegavel,
    c => c.role === ROLES.OWNER
];

const porRole = (texto) => () => {
    const partes = [`### ${texto.porRole}\n`];
    texto.grupos.forEach((titulo, i) => {
        const links = commands.filter(ENTRA[i]).map(c => `[\`${c.cmd}\`](${c.cmd.slice(1)}.md)`);
        if (links.length) partes.push(`${titulo} (${links.length}):\n\n${quebrar(links)}\n`);
    });
    return partes.join('\n');
};

// As opções (ou os argumentos) marcados no cmd_opts
const nomeDe = (o) => (o.opts ? `-${o.opts[0]}` : o.argv.join(' '));
const celula = (itens) => (itens.length ? itens.map(n => `\`${n}\``).join(', ').replace(/\|/g, '\\|') : '');

const limites = (texto) => () => {
    const linhas = commands.map(c => localizar(c, texto.lang)).map(c => ({
        cmd: c.cmd,
        outros: celula((c.cmd_opts ?? []).filter(o => o.outrosChats).map(nomeDe)),
        ajustes: celula((c.cmd_opts ?? []).filter(o => o.role && o.role !== ROLES.USER).map(nomeDe))
    })).filter(l => l.outros || l.ajustes);

    return [
        `| ${texto.tabela.join(' | ')} |`,
        '|---|---|---|',
        ...linhas.map(l => `| \`${l.cmd}\` | ${l.outros} | ${l.ajustes} |`)
    ].join('\n');
};

const arquivoDe = (idioma) => path.join(DOCS, TEXTOS[idioma].arquivo);

// A página com cada trecho gerado trocado pelo novo (idioma: 'en' ou 'pt-BR')
function gerar(conteudo, idioma = 'en') {
    const texto = TEXTOS[idioma];
    const trechos = { roles: porRole(texto), limites: limites(texto) };
    conteudo ??= fs.readFileSync(arquivoDe(idioma), 'utf8');
    return Object.entries(trechos).reduce((md, [nome, fn]) => {
        const re = new RegExp(`(<!-- gerado:${nome} -->\\n)[\\s\\S]*?(\\n<!-- /gerado:${nome} -->)`);
        if (!re.test(md)) throw new Error(`docs/comandos/${texto.arquivo}: sem os marcadores gerado:${nome}`);
        return md.replace(re, (_, ini, fim) => `${ini}${fn().trimEnd()}${fim}`);
    }, conteudo);
}

if (require.main === module) {
    let desatualizado = false;
    for (const idioma of Object.keys(TEXTOS)) {
        const arquivo = arquivoDe(idioma);
        const atual = fs.readFileSync(arquivo, 'utf8');
        const novo = gerar(atual, idioma);
        if (novo === atual) continue;

        if (process.argv.includes('--check')) {
            console.error(`docs/comandos/${TEXTOS[idioma].arquivo} desatualizado: rode node scripts/gerar-docs.js`);
            desatualizado = true;
        } else {
            fs.writeFileSync(arquivo, novo);
            console.log(`docs/comandos/${TEXTOS[idioma].arquivo} atualizado`);
        }
    }
    if (desatualizado) process.exit(1);
}

module.exports = { gerar };
