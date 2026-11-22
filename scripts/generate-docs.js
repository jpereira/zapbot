#!/usr/bin/env node
/*
 * Generates, from src/commands/definitions/, the snippets of docs/commands/index.md (in English) and of
 * docs/commands/index.pt-BR.md (in Portuguese) between the
 * marcadores `<!-- gerado:NOME -->` e `<!-- /gerado:NOME -->`:
 * roles     "Commands by role": each role's list;
 * limits   the table of what a delegated `admin` does not do (the `role` and `otherChats` marks).
 *
 * node scripts/gerar-docs.js           reescreve o file
 * node scripts/generate-docs.js --check   only checks (exits with 1 if out of date)
 */

const fs = require('fs');
const path = require('path');

const { commands } = require('../src/commands/commands');
const { locate } = require('../src/commands/localize');
const { ROLES } = require('../src/roles');

const DOCS = path.join(__dirname, '..', 'docs', 'commands');
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

// The text of each language: English (en) is the docs/commands/index.md page, and Portuguese (pt-BR), index.pt-BR.md
const TEXTS = {
    en: {
        lang: 'en_US',
        file: 'index.md',
        byRole: 'Commands by role',
        groups: [
            '**user** (whoever is in `bot.users`)',
            '**admin, delegable** (admins and the owner; the owner releases them to a user with `+cmd`)',
            '**admin** (admins and the owner; never delegable)',
            '**owner** (the owner only)'
        ],
        table: ['Command', 'Current chat only (left out)', 'Owner and admins only']
    },
    'pt-BR': {
        lang: 'pt_BR',
        file: 'index.pt-BR.md',
        byRole: 'Comandos por role',
        groups: [
            '**user** (de quem está no `bot.users`)',
            '**admin, delegáveis** (admins e o dono; o dono libera a um usuário com `+cmd`)',
            '**admin** (admins e o dono; nunca delegáveis)',
            '**owner** (só o dono)'
        ],
        table: ['Comando', 'Só o chat atual (fica de fora)', 'Só o dono e os admins']
    }
};

// The list groups, from the most common to the most restricted: the commands that enter each one
const ENTERS = [
    c => c.role === ROLES.USER,
    c => c.role === ROLES.ADMIN && c.isDelegable,
    c => c.role === ROLES.ADMIN && !c.isDelegable,
    c => c.role === ROLES.OWNER
];

const byRole = (textAlt) => () => {
    const partsAlt = [`### ${textAlt.byRole}\n`];
    textAlt.groups.forEach((title, i) => {
        const links = commands.filter(ENTERS[i]).map(c => `[\`${c.cmd}\`](${c.cmd.slice(1)}.md)`);
        if (links.length) partsAlt.push(`${title} (${links.length}):\n\n${lineBreak(links)}\n`);
    });
    return partsAlt.join('\n');
};

// The options (or the arguments) marked in cmd_opts
const nameAltAlt = (o) => (o.opts ? `-${o.opts[0]}` : o.argv.join(' '));
const cell = (items) => (items.length ? items.map(n => `\`${n}\``).join(', ').replace(/\|/g, '\\|') : '');

const limits = (textAlt) => () => {
    const linesAlt = commands.map(c => locate(c, textAlt.lang)).map(c => ({
        cmd: c.cmd,
        others: cell((c.cmd_opts ?? []).filter(o => o.otherChats).map(nameAltAlt)),
        settings: cell((c.cmd_opts ?? []).filter(o => o.role && o.role !== ROLES.USER).map(nameAltAlt))
    })).filter(l => l.others || l.settings);

    return [
        `| ${textAlt.table.join(' | ')} |`,
        '|---|---|---|',
        ...linesAlt.map(l => `| \`${l.cmd}\` | ${l.others} | ${l.settings} |`)
    ].join('\n');
};

const file = (language) => path.join(DOCS, TEXTS[language].file);

// The page with each generated snippet replaced by the new one (language: 'en' or 'pt-BR')
function generate(content, language = 'en') {
    const textAlt = TEXTS[language];
    const snippets = { roles: byRole(textAlt), limites: limits(textAlt) };
    content ??= fs.readFileSync(file(language), 'utf8');
    return Object.entries(snippets).reduce((md, [nameAlt, fn]) => {
        const re = new RegExp(`(<!-- gerado:${nameAlt} -->\\n)[\\s\\S]*?(\\n<!-- /gerado:${nameAlt} -->)`);
        if (!re.test(md)) throw new Error(`docs/commands/${textAlt.file}: sem os marcadores gerado:${nameAlt}`);
        return md.replace(re, (_, marker, end) => `${marker}${fn().trimEnd()}${end}`);
    }, content);
}

if (require.main === module) {
    let outdated = false;
    for (const language of Object.keys(TEXTS)) {
        const fileAlt = file(language);
        const current = fs.readFileSync(fileAlt, 'utf8');
        const freshAlt = generate(current, language);
        if (freshAlt === current) continue;

        if (process.argv.includes('--check')) {
            console.error(`docs/commands/${TEXTS[language].file} out of date: run node scripts/generate-docs.js`);
            outdated = true;
        } else {
            fs.writeFileSync(fileAlt, freshAlt);
            console.log(`docs/commands/${TEXTS[language].file} updated`);
        }
    }
    if (outdated) process.exit(1);
}

module.exports = { generate };
