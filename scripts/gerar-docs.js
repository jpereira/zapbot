#!/usr/bin/env node
/*
 * Gera, a partir do src/comandos/definicoes/, os trechos de docs/comandos/index.md entre os
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
const { ROLES } = require('../src/roles');

const ARQUIVO = path.join(__dirname, '..', 'docs', 'comandos', 'index.md');
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

// Os grupos da lista, do mais comum ao mais restrito: [título, os comandos que entram]
const GRUPOS = [
    ['**user** (de quem está no `bot.users`)', c => c.role === ROLES.USER],
    ['**admin, delegáveis** (admins e o dono; o dono libera a um usuário com `+cmd`)',
        c => c.role === ROLES.ADMIN && c.delegavel],
    ['**admin** (admins e o dono; nunca delegáveis)', c => c.role === ROLES.ADMIN && !c.delegavel],
    ['**owner** (só o dono)', c => c.role === ROLES.OWNER]
];

function porRole() {
    const partes = ['### Comandos por role\n'];
    for (const [titulo, entra] of GRUPOS) {
        const links = commands.filter(entra).map(c => `[\`${c.cmd}\`](${c.cmd.slice(1)}.md)`);
        if (links.length) partes.push(`${titulo} (${links.length}):\n\n${quebrar(links)}\n`);
    }
    return partes.join('\n');
}

// As opções (ou os argumentos) marcados no cmd_opts
const nomeDe = (o) => (o.opts ? `-${o.opts[0]}` : o.argv.join(' '));
const celula = (itens) => (itens.length ? itens.map(n => `\`${n}\``).join(', ').replace(/\|/g, '\\|') : '');

function limites() {
    const linhas = commands.map(c => ({
        cmd: c.cmd,
        outros: celula((c.cmd_opts ?? []).filter(o => o.outrosChats).map(nomeDe)),
        ajustes: celula((c.cmd_opts ?? []).filter(o => o.role && o.role !== ROLES.USER).map(nomeDe))
    })).filter(l => l.outros || l.ajustes);

    return [
        '| Comando | Só o chat atual (fica de fora) | Só o dono e os admins |',
        '|---|---|---|',
        ...linhas.map(l => `| \`${l.cmd}\` | ${l.outros} | ${l.ajustes} |`)
    ].join('\n');
}

const TRECHOS = { roles: porRole, limites };

// O index.md com cada trecho gerado trocado pelo novo
function gerar(conteudo = fs.readFileSync(ARQUIVO, 'utf8')) {
    return Object.entries(TRECHOS).reduce((md, [nome, fn]) => {
        const re = new RegExp(`(<!-- gerado:${nome} -->\\n)[\\s\\S]*?(\\n<!-- /gerado:${nome} -->)`);
        if (!re.test(md)) throw new Error(`docs/comandos/index.md: sem os marcadores gerado:${nome}`);
        return md.replace(re, (_, ini, fim) => `${ini}${fn().trimEnd()}${fim}`);
    }, conteudo);
}

if (require.main === module) {
    const atual = fs.readFileSync(ARQUIVO, 'utf8');
    const novo = gerar(atual);
    if (process.argv.includes('--check')) {
        if (novo !== atual) {
            console.error('docs/comandos/index.md desatualizado: rode node scripts/gerar-docs.js');
            process.exit(1);
        }
    } else if (novo !== atual) {
        fs.writeFileSync(ARQUIVO, novo);
        console.log('docs/comandos/index.md atualizado');
    }
}

module.exports = { gerar };
