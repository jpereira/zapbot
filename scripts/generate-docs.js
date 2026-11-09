#!/usr/bin/env node
/*
 * Generates, from src/commands/definitions/, the snippets of docs/commands/index.md between the
 * marcadores `<!-- gerado:NOME -->` e `<!-- /gerado:NOME -->`:
 * roles     "Commands by role": each role's list;
 * limits   the table of what a delegated `admin` does not do (the `role` and `otherChats` marks).
 *
 * node scripts/gerar-docs.js           reescreve o arquivo
 * node scripts/generate-docs.js --check   only checks (exits with 1 if out of date)
 */

const fs = require('fs');
const path = require('path');

const { commands } = require('../src/commands/commands');
const { ROLES } = require('../src/roles');

const FILE = path.join(__dirname, '..', 'docs', 'commands', 'index.md');
const COLUMNS = 98;

// The comma-separated links, wrapping at up to 98 columns (a link never breaks in the middle)
function lineBreak(items) {
    const linesAlt = [];
    let line = '';
    for (const item of items) {
        const fresh = line ? `${line}, ${item}` : item;
        if (fresh.length > COLUMNS && line) {
            linesAlt.push(`${line},`);
            line = item;
        } else {
            line = fresh;
        }
    }
    return [...linesAlt, line].join('\n');
}

// The list groups, from the most common to the most restricted: [title, the commands that enter]
const GROUPS = [
    ['**user** (de quem está no `bot.users`)', c => c.role === ROLES.USER],
    ['**admin, delegáveis** (admins e o dono; o dono libera a um usuário com `+cmd`)',
        c => c.role === ROLES.ADMIN && c.delegavel],
    ['**admin** (admins e o dono; nunca delegáveis)', c => c.role === ROLES.ADMIN && !c.delegavel],
    ['**owner** (só o dono)', c => c.role === ROLES.OWNER]
];

function byRole() {
    const partsAlt = ['### Comandos por role\n'];
    for (const [title, enters] of GROUPS) {
        const links = commands.filter(enters).map(c => `[\`${c.cmd}\`](${c.cmd.slice(1)}.md)`);
        if (links.length) partsAlt.push(`${title} (${links.length}):\n\n${lineBreak(links)}\n`);
    }
    return partsAlt.join('\n');
}

// The options (or the arguments) marked in cmd_opts
const nameAltAlt = (o) => (o.opts ? `-${o.opts[0]}` : o.argv.join(' '));
const cell = (items) => (items.length ? items.map(n => `\`${n}\``).join(', ').replace(/\|/g, '\\|') : '');

function limits() {
    const linesAlt = commands.map(c => ({
        cmd: c.cmd,
        outros: cell((c.cmd_opts ?? []).filter(o => o.outrosChats).map(nameAltAlt)),
        ajustes: cell((c.cmd_opts ?? []).filter(o => o.role && o.role !== ROLES.USER).map(nameAltAlt))
    })).filter(l => l.outros || l.ajustes);

    return [
        '| Comando | Só o chat atual (fica de fora) | Só o dono e os admins |',
        '|---|---|---|',
        ...linesAlt.map(l => `| \`${l.cmd}\` | ${l.outros} | ${l.ajustes} |`)
    ].join('\n');
}

const SNIPPETS = { roles: byRole, limites: limits };

// index.md with each generated snippet replaced by the new one
function generate(content = fs.readFileSync(FILE, 'utf8')) {
    return Object.entries(SNIPPETS).reduce((md, [nameAlt, fn]) => {
        const re = new RegExp(`(<!-- gerado:${nameAlt} -->\\n)[\\s\\S]*?(\\n<!-- /gerado:${nameAlt} -->)`);
        if (!re.test(md)) throw new Error(`docs/commands/index.md: sem os marcadores gerado:${nameAlt}`);
        return md.replace(re, (_, ini, end) => `${ini}${fn().trimEnd()}${end}`);
    }, content);
}

if (require.main === module) {
    const current = fs.readFileSync(FILE, 'utf8');
    const freshAlt = generate(current);
    if (process.argv.includes('--check')) {
        if (freshAlt !== current) {
            console.error('docs/commands/index.md desatualizado: rode node scripts/generate-docs.js');
            process.exit(1);
        }
    } else if (freshAlt !== current) {
        fs.writeFileSync(FILE, freshAlt);
        console.log('docs/commands/index.md atualizado');
    }
}

module.exports = { generate };
