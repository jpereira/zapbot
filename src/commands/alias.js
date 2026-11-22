/*
 * /alias: separates the registration options from the options of the command that will be saved.
 */
const { botConfig } = require('../botConfig');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { aliasBlock, fixDash, textIsAlias, listAliases } = require('../aliases');
const { commandsInText, commandsError, breakLines } = require('../textCommands');
const { findCommand } = require('./base');
const { listExampleFiles, loadExample } = require('../zb');
const { getSetting, setSetting } = require('../settings');
const { t } = require('../i18n');

const aliasName = nameAlt => '/' + nameAlt.replace(/^\//, '');
const NAME = /^\/?[\p{L}\p{N}_.-]+$/u;
const MATCH_MAX = 10;   // aliases shown when /alias <part> finds several

// /alias -examples: lists the examples/*.zb files; with a name, loads it (an alias that already exists stays)
async function examplesReply(msg, name, overwrite = false) {
    const files = listExampleFiles();
    const done = getSetting('alias.examples');
    if (!name) {
        if (!files.length) return msg.reply(t('adm.alias.examplesNone'));
        const linesAlt = files.map(f => `${done.includes(f.name) ? '✅' : '⬜'} ${f.name}${f.manual ? t('adm.alias.examplesManual') : ''}`).join('\n');
        return msg.reply(t('adm.alias.examplesList', { list: linesAlt }));
    }
    const example = files.find(f => f.name === name.replace(/\.zb$/, '').toLowerCase());
    if (!example) return msg.reply(t('adm.alias.examplesMissing', { name, list: files.map(f => f.name).join(', ') }));
    const { loaded, updated, skipped, failed } = await loadExample(example, { overwrite });
    if (!done.includes(example.name)) await setSetting('alias.examples', [...done, example.name]);
    return msg.reply([
        t('adm.alias.examplesLoaded', { name: example.name, n: loaded.length, list: loaded.join(', ') || '-' }),
        updated.length && t('adm.alias.examplesUpdated', { n: updated.length, list: updated.join(', ') }),
        skipped.length && t('adm.alias.examplesSkipped', { n: skipped.length, list: skipped.join(', '), name: example.name }),
        ...failed.map(f => t('adm.alias.examplesFailed', { name: f.name, error: f.error }))
    ].filter(Boolean).join('\n'), undefined, { linkPreview: false });
}

async function cmdAlias({ msg, args }) {
    await dbReady;
    const textAlt = args.trim();
    if (!textAlt || /^-(list|l)$/.test(textAlt)) return listAliases(msg);
    // /alias -examples [<file>] [-yes]: lists, loads one (what exists stays) or, with -yes, replaces what exists with the file's
    // (-yes|-y may come before the -examples or anywhere after it)
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
        if (botConfig.commands.some(c => c.cmd === freshAlt || c.aliases?.includes(freshAlt))) {
            return msg.reply(t('adm.alias.isCommand', { name: freshAlt }));
        }
        if (!(await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [oldAlt2]))) {
            return msg.reply(t('adm.alias.notFound', { name: oldAlt2 }));
        }
        if (oldAlt2 === freshAlt) return msg.reply(t('adm.alias.sameName', { name: freshAlt }));
        if (await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [freshAlt])) {
            return msg.reply(t('adm.alias.exists', { name: freshAlt }));
        }
        await dbRun('UPDATE command_aliases SET name = ? WHERE name = ?', [freshAlt, oldAlt2]);
        return msg.reply(t('adm.alias.renamed', { old: oldAlt2, fresh: freshAlt }));
    }
    const removeAlt2 = textAlt.match(/^-rm\s+(\S[\s\S]*)$/);
    if (removeAlt2) {
        const names = [...new Set(removeAlt2[1].split(/[\s,]+/).filter(Boolean).map(aliasName))];
        if (names.includes('/all')) {
            const r = await dbRun('DELETE FROM command_aliases');
            return msg.reply(t('adm.alias.allRemoved', { n: r.changes }));
        }
        const removed = [];
        const missing = [];
        for (const nameAlt of names) {
            const r = await dbRun('DELETE FROM command_aliases WHERE name = ?', [nameAlt]);
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
        const alias = await dbGet('SELECT * FROM command_aliases WHERE name = ?', [nameAlt]);
        if (alias) return msg.reply(aliasBlock(alias), undefined, { linkPreview: false });
        // Not an alias: the ones whose name has the text (/alias foo finds /foo, /foobar and /my.foo)
        const term = nameAlt.slice(1).toLowerCase();
        const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
        const found = await dbAll("SELECT * FROM command_aliases WHERE lower(name) LIKE ? ESCAPE '\\' ORDER BY name", [like]);
        if (found.length) {
            const shown = found.slice(0, MATCH_MAX);
            const more = found.length > MATCH_MAX ? `\n\n${t('adm.alias.matchMore', { n: found.length - MATCH_MAX })}` : '';
            return msg.reply(`${t('adm.alias.match', { term, n: found.length })}\n\n${shown.map(aliasBlock).join('\n\n')}${more}`,
                undefined, { linkPreview: false });
        }
        const isCommand = botConfig.commands.some(c => c.cmd === nameAlt || c.aliases?.includes(nameAlt));
        return msg.reply(t(isCommand ? 'adm.alias.isCommand' : 'adm.alias.notFound', { name: nameAlt }));
    }
    // -q|-quiet: without the "🔗 Alias ..." header when running; works before the name, after it or after the description
    let quiet = false;
    const removeQuiet = (s) => s.replace(/^-(?:quiet|q)(?:\s+|$)/, () => { quiet = true; return ''; });
    const registration = removeQuiet(textAlt).match(/^(\S+)\s+([\s\S]+)$/);
    if (!registration || !NAME.test(registration[1])) {
        return msg.reply(t('adm.alias.usage'));
    }
    const nameAlt = aliasName(registration[1]);
    if (nameAlt === '/all') return msg.reply(t('adm.alias.allReserved'));
    if (botConfig.commands.some(c => c.cmd === nameAlt || c.aliases?.includes(nameAlt))) {
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
        const target = findCommand(destination);
        if (!target || target.cmd === '/alias') {
            return msg.reply(t('adm.alias.badTargetCmd'));
        }
        if (target.cmd === '/me') {
            const errorAlt = await commandsError(commandAlt.slice(destination.length), '/alias');
            if (errorAlt) return msg.reply(errorAlt);
        }
    }
    commandAlt = fixDash(commandAlt);
    await dbRun(`INSERT INTO command_aliases (name, description, command, quiet) VALUES (?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET description = excluded.description,
        command = excluded.command, quiet = excluded.quiet`, [nameAlt, description, commandAlt, quiet ? 1 : 0]);
    const detail = (description ? `\n📝 ${description}` : '') + (quiet ? '\n🔇 quiet' : '');
    await msg.reply(t('adm.alias.saved', { name: nameAlt, command: commandAlt, detail }), undefined, { linkPreview: false });
}

module.exports = { cmdAlias };
