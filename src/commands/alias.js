/*
 * /alias: separates the registration options from the options of the command that will be saved.
 */
const { botConfig } = require('../botConfig');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { aliasBlock, fixDash, textIsAlias, listAliases } = require('../aliases');
const { commandsInText, commandsError, breakLines } = require('../textCommands');
const { findCommand, resolveGroupInput } = require('./base');
const { listExampleFiles, loadExample } = require('../zb');
const { getSetting, setSetting } = require('../settings');
const { t } = require('../i18n');

const aliasName = nameAlt => '/' + nameAlt.replace(/^\//, '');
const reservedGroupAlias = name => /^\/(?:g(?:\.|$)|group\.)/i.test(name);
const NAME = /^\/?[\p{L}\p{N}_.-]+$/u;
const MATCH_MAX = 10;   // aliases shown when /alias <part> finds several

// /alias -examples: lists the examples/*.zb files; with a name, shows the aliases the file would create (the same blocks of
// the /alias list, with the marks and which ones already exist) and loads nothing; only with -yes it loads, replacing
// the ones that exist
async function examplesReply(msg, name, yes = false) {
    const files = listExampleFiles();
    const done = getSetting('alias.examples');
    if (!name) {
        if (!files.length) return msg.reply(t('adm.alias.examplesNone'));
        const linesAlt = files.map(f => `${done.includes(f.name) ? '✅' : '⬜'} ${f.name}${f.manual ? t('adm.alias.examplesManual') : ''}`).join('\n');
        return msg.reply(t('adm.alias.examplesList', { list: linesAlt }));
    }
    const example = files.find(f => f.name === name.replace(/\.zb$/, '').toLowerCase());
    if (!example) return msg.reply(t('adm.alias.examplesMissing', { name, list: files.map(f => f.name).join(', ') }));
    if (!yes) {
        const { preview, failed } = await loadExample(example, { preview: true });
        const blocks = preview.map(a => aliasBlock(a) + (a.exists ? `\n${t('adm.alias.previewExists')}` : ''));
        const news = preview.filter(a => !a.exists).length;
        return msg.reply([
            t('adm.alias.previewTitle', { name: example.name, n: preview.length, added: news, existing: preview.length - news }),
            ...blocks,
            ...failed.map(f => t('adm.alias.examplesFailed', { name: f.name, error: f.error })),
            t('adm.alias.previewTip', { name: example.name })
        ].join('\n\n'), undefined, { linkPreview: false });
    }
    const { loaded, updated, skipped, failed } = await loadExample(example, { overwrite: true });
    if (!done.includes(example.name)) await setSetting('alias.examples', [...done, example.name]);
    return msg.reply([
        t('adm.alias.examplesLoaded', { name: example.name, n: loaded.length, list: loaded.join(', ') || '-' }),
        updated.length && t('adm.alias.examplesUpdated', { n: updated.length, list: updated.join(', ') }),
        skipped.length && t('adm.alias.examplesSkipped', { n: skipped.length, list: skipped.join(', '), name: example.name }),
        ...failed.map(f => t('adm.alias.examplesFailed', { name: f.name, error: f.error }))
    ].filter(Boolean).join('\n'), undefined, { linkPreview: false });
}

async function cmdAlias({ msg, args, collect = null }) {
    await dbReady;
    const textAlt = args.trim();
    if (!textAlt || /^-(list|l)$/.test(textAlt)) return listAliases(msg);
    // /alias -examples [<file>] [-yes]: lists the files; with a file, shows what it would create; with -yes, loads it
    // (replacing what exists). -yes|-y may come before the -examples or anywhere after it
    const examples = textAlt.match(/^((?:-(?:yes|y)\s+)*)-(?:examples|ex)((?:\s+\S+)*)$/i);
    if (examples) {
        const words = `${examples[1]} ${examples[2]}`.split(/\s+/).filter(Boolean);
        const isYes = (w) => /^-(?:yes|y)$/i.test(w);
        return examplesReply(msg, words.find(w => !isYes(w)), words.some(isYes));
    }
    const move = textAlt.match(/^-(?:move|m)\s+(\S+)\s+(\S+)$/);
    if (/^-(?:move|m)(?:\s|$)/.test(textAlt) && !move) return msg.reply(t('adm.alias.usageMove'));
    if (move) {
        const [oldAlt2, freshAlt] = [aliasName(move[1]), aliasName(move[2])];
        if (!NAME.test(move[2])) return msg.reply(t('adm.alias.invalidName', { name: freshAlt }));
        if (freshAlt === '/all') return msg.reply(t('adm.alias.allReserved'));
        if (botConfig.commands.some(c => c.cmd === freshAlt || c.aliases?.includes(freshAlt)) || reservedGroupAlias(freshAlt)) {
            return msg.reply(t('adm.alias.isCommand', { name: freshAlt }));
        }
        if (!(await dbGet(`SELECT 1 FROM command_aliases WHERE name = ?${msg.fromMe ? '' : ' AND owner_only = 0'}`, [oldAlt2]))) {
            return msg.reply(t('adm.alias.notFound', { name: oldAlt2 }));
        }
        if (oldAlt2 === freshAlt) return msg.reply(t('adm.alias.sameName', { name: freshAlt }));
        if (await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [freshAlt])) { // a private one counts: the name is taken
            return msg.reply(t('adm.alias.exists', { name: freshAlt }));
        }
        await dbRun('UPDATE command_aliases SET name = ? WHERE name = ?', [freshAlt, oldAlt2]);
        return msg.reply(t('adm.alias.renamed', { old: oldAlt2, fresh: freshAlt }));
    }
    const removeAlt2 = textAlt.match(/^-rm\s+(\S[\s\S]*)$/);
    // A private alias is the owner's: whoever else registers or removes does not see it (it "does not exist" for them)
    const hidden = msg.fromMe ? '' : ' AND owner_only = 0';
    if (removeAlt2) {
        const names = [...new Set(removeAlt2[1].split(/[\s,]+/).filter(Boolean).map(aliasName))];
        if (names.includes('/all')) {
            const r = await dbRun(`DELETE FROM command_aliases WHERE 1 = 1${hidden}`);
            return msg.reply(t('adm.alias.allRemoved', { n: r.changes }));
        }
        const removed = [];
        const missing = [];
        for (const nameAlt of names) {
            const r = await dbRun(`DELETE FROM command_aliases WHERE name = ?${hidden}`, [nameAlt]);
            (r.changes ? removed : missing).push(nameAlt);
        }
        if (names.length === 1) {
            return msg.reply(t(removed.length ? 'adm.alias.removed' : 'adm.alias.notFound', { name: names[0] }));
        }
        return msg.reply([
            removed.length && t('adm.alias.removedMany', { n: removed.length, list: removed.join(', ') }),
            missing.length && t('adm.alias.missing', { n: missing.length, list: missing.join(', ') })
        ].filter(Boolean).join('\n'));
    }
    // Only the name (/alias /dolar): shows what the alias does; if it is not an alias, the error
    if (/^\/?[\p{L}\p{N}_.][\p{L}\p{N}_.-]*$/u.test(textAlt)) {
        const nameAlt = aliasName(textAlt);
        const alias = await dbGet(`SELECT * FROM command_aliases WHERE name = ?${hidden}`, [nameAlt]);
        if (alias) return msg.reply(aliasBlock(alias), undefined, { linkPreview: false });
        // Not an alias: the ones whose name has the text (/alias foo finds /foo, /foobar and /my.foo)
        const term = nameAlt.slice(1).toLowerCase();
        const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
        const found = await dbAll(`SELECT * FROM command_aliases WHERE lower(name) LIKE ? ESCAPE '\\'${hidden} ORDER BY name`, [like]);
        if (found.length) {
            const shown = found.slice(0, MATCH_MAX);
            const more = found.length > MATCH_MAX ? `\n\n${t('adm.alias.matchMore', { n: found.length - MATCH_MAX })}` : '';
            return msg.reply(`${t('adm.alias.match', { term, n: found.length })}\n\n${shown.map(aliasBlock).join('\n\n')}${more}`,
                undefined, { linkPreview: false });
        }
        const isCommand = botConfig.commands.some(c => c.cmd === nameAlt || c.aliases?.includes(nameAlt)) || reservedGroupAlias(nameAlt);
        return msg.reply(t(isCommand ? 'adm.alias.isCommand' : 'adm.alias.notFound', { name: nameAlt }));
    }
    // -q|-quiet: without the "🔗 Alias ..." header when running; -p|-private: only the owner sees and runs it (it is not
    // listed, not in /help, and for anyone else it does not exist). They work before the name, after it or after the
    // description, in any order; -public takes the lock off
    let quiet = false;
    let privateFlag = null;
    const removeQuiet = (s) => {
        for (let m; (m = s.match(/^-(quiet|q|private|p|public)(?:\s+|$)/));) {
            if (m[1] === 'quiet' || m[1] === 'q') quiet = true;
            else privateFlag = m[1] !== 'public';
            s = s.slice(m[0].length);
        }
        return s;
    };
    const flagged = removeQuiet(textAlt);
    // Only the flag(s) and the name (/alias -p /end.froes): changes the alias that exists
    if (privateFlag !== null && /^\/?[\p{L}\p{N}_.][\p{L}\p{N}_.-]*$/u.test(flagged)) {
        if (!msg.fromMe) return msg.reply(t('adm.alias.ownerOnlyPrivate'));
        const nameOnly = aliasName(flagged);
        const r = await dbRun('UPDATE command_aliases SET owner_only = ? WHERE name = ?', [privateFlag ? 1 : 0, nameOnly]);
        if (!r.changes) return msg.reply(t('adm.alias.notFound', { name: nameOnly }));
        return msg.reply(t(privateFlag ? 'adm.alias.madePrivate' : 'adm.alias.madePublic', { name: nameOnly }));
    }
    const registration = flagged.match(/^(\S+)\s+([\s\S]+)$/);
    if (!registration || !NAME.test(registration[1])) {
        return msg.reply(t('adm.alias.usage'));
    }
    if (privateFlag !== null && !msg.fromMe) return msg.reply(t('adm.alias.ownerOnlyPrivate'));
    const nameAlt = aliasName(registration[1]);
    // Overwriting a private alias: only the owner (for anyone else it does not exist, and the name is taken)
    if (!msg.fromMe && await dbGet('SELECT 1 FROM command_aliases WHERE name = ? AND owner_only = 1', [nameAlt])) {
        return msg.reply(t('adm.alias.exists', { name: nameAlt }));
    }
    if (nameAlt === '/all') return msg.reply(t('adm.alias.allReserved'));
    if (botConfig.commands.some(c => c.cmd === nameAlt || c.aliases?.includes(nameAlt)) || reservedGroupAlias(nameAlt)) {
        return msg.reply(t('adm.alias.isCommand', { name: nameAlt }));
    }
    let commandAlt = removeQuiet(registration[2].trim());
    let description = '';
    const QUOTES = /(["“”](?:\\.|[^"“”\\])*["“”]|['‘’](?:\\.|[^'‘’\\])*['‘’])/.source;
    const removeQuotes = q => q.slice(1, -1).replace(/\\(["'\\])/g, '$1');
    // Only the description, with no command: updates that of an alias that already exists
    const soDescription = commandAlt.match(new RegExp(`^-(?:desc|d)\\s+${QUOTES}$`));
    if (soDescription) {
        const r = await dbRun('UPDATE command_aliases SET description = ? WHERE name = ?', [removeQuotes(soDescription[1]), nameAlt]);
        if (!r.changes) return msg.reply(t('adm.alias.notFoundDesc', { name: nameAlt }));
        return msg.reply(t('adm.alias.descUpdated', { name: nameAlt, desc: removeQuotes(soDescription[1]) }), undefined, { linkPreview: false });
    }
    if (/^-(desc|d)(?:\s|$)/.test(commandAlt)) {
        const d = commandAlt.match(new RegExp(`^-(?:desc|d)\\s+${QUOTES}\\s+([\\s\\S]+)$`));
        if (!d) return msg.reply(t('adm.alias.needDesc'));
        description = removeQuotes(d[1]);
        commandAlt = removeQuiet(d[2].trim());
    }
    if (textIsAlias(commandAlt)) {
        // Text with {/command}, as in /cron: the typed \n becomes a line break
        commandAlt = breakLines(commandAlt);
        if (!commandsInText(commandAlt).length) {
            return msg.reply(t('adm.alias.badTarget'));
        }
        const errorAlt = await commandsError(commandAlt, '/alias');
        if (errorAlt) return msg.reply(errorAlt);
    } else {
        const destination = commandAlt.split(/\s+/, 1)[0];
        const grouped = resolveGroupInput(commandAlt, { partial: false });
        const target = grouped ? grouped.command : findCommand(destination);
        if (!target || target.cmd === '/alias') {
            return msg.reply(t('adm.alias.badTargetCmd'));
        }
        if (grouped) commandAlt = [target.cmd, grouped.args].filter(Boolean).join(' ');
        if (target.cmd === '/me') {
            const errorAlt = await commandsError(commandAlt.slice(destination.length), '/alias');
            if (errorAlt) return msg.reply(errorAlt);
        }
    }
    commandAlt = fixDash(commandAlt);
    // collect (the preview of /alias -examples): everything was checked as always; it only hands back what it would save
    if (collect) {
        collect.push({ name: nameAlt, description, command: commandAlt, quiet: quiet ? 1 : 0, owner_only: privateFlag ? 1 : 0 });
        return;
    }
    await dbRun(`INSERT INTO command_aliases (name, description, command, quiet, owner_only) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET description = excluded.description,
        command = excluded.command, quiet = excluded.quiet, owner_only = excluded.owner_only`,
    [nameAlt, description, commandAlt, quiet ? 1 : 0, privateFlag ? 1 : 0]);
    const detail = (description ? `\n📝 ${description}` : '') + (quiet ? '\n🔇 quiet' : '') + (privateFlag ? '\n🔒 private' : '');
    await msg.reply(t('adm.alias.saved', { name: nameAlt, command: commandAlt, detail }), undefined, { linkPreview: false });
}

module.exports = { cmdAlias };
