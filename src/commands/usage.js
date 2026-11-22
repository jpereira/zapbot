/*
 * Comando /usage.
 */

const { phoneAlt3, textPhones } = require('./whois');
const { contactName, groupResolverName } = require('../contacts');
const { client } = require('../client');
const { t } = require('../i18n');
const { allConsumption, itemsAlt, limitsWithUsage, usageLine, lastUses } = require('../usageLimit');
const { fmtWhen } = require('../util/when');

/*
 * /usage             → your limits here: uses, limit and when it renews
 * /usage -l          → your last uses that counted (when, command, parameters)
 * /usage <person>... → (owner and admins) other people's
 * The limit comes from /bot +cmd /gpt +limit 5/day; the owner and the admins have no limit.
 */
const TOP = 10;

// -all (owner and admins): who used the commands with a limit the most, and which commands go out the most
async function allShowConsumption(msg) {
    const { days: daysAlt, total, people, byCmd } = await allConsumption();
    if (!total) {
        await msg.reply(t('usage.allEmpty', { days: daysAlt }));
        return;
    }

    const linesAlt = [];
    for (const [i, p] of people.slice(0, TOP).entries()) {
        const nameAlt = p.group
            ? `👥 ${await groupResolverName(p.key).catch(() => null) ?? p.key}`
            : `👤 ${contactName(await client.getContactById(`${p.key}@c.us`).catch(() => null)) ?? `+${p.key}`}`;
        const cmds = [...p.byCmd].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ');
        linesAlt.push(`${i + 1}. ${nameAlt} — ${p.total} (${cmds})`);
    }
    const commands = [...byCmd].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' · ');
    const more = people.length > TOP ? '\n' + t('usage.allMore', { n: people.length - TOP }) : '';

    await msg.reply(t('usage.allTitle', { days: daysAlt, total }) + `\n${linesAlt.join('\n')}${more}\n\n${t('usage.allByCmd')} ${commands}`);
}

async function cmdUsage({ msg, opts, quotedMsg, senderNumber, chatId, isGroup, admin }) {
    const textAlt = opts.argv.join(' ').trim();

    if (opts.opt.all) {
        if (!admin) {
            await msg.reply(t('usage.ownerOnly'));
            return;
        }
        await allShowConsumption(msg);
        return;
    }

    if ((textAlt || quotedMsg) && !admin) {
        await msg.reply(t('usage.ownerOnly'));
        return;
    }

    let numbers;
    if (textAlt) {
        numbers = await textPhones(msg, textAlt);
        if (!numbers) return;
    } else if (quotedMsg) {
        const phoneAlt = await phoneAlt3(quotedMsg.fromMe ? client.info.wid._serialized : (quotedMsg.author || quotedMsg.from));
        if (!phoneAlt) {
            await msg.reply(t('whois.unknownPhoneAuthor'));
            return;
        }
        numbers = [phoneAlt];
    } else {
        const eu = msg.fromMe ? client.info.wid.user : senderNumber;
        if (!eu) {
            await msg.reply(t('whois.unknownPhoneYou'));
            return;
        }
        numbers = [eu];
    }

    const blocks = [];
    for (const numberAlt of numbers) {
        const who = { number: numberAlt, chatId, isGroup };
        const heSame = numbers.length === 1 && !textAlt && !quotedMsg;

        if (opts.opt.log) {
            const uses = await lastUses(itemsAlt(who));
            blocks.push(uses.length
                ? uses.map(u => `• ${fmtWhen(u.when)} · ${u.cmd}${u.params ? ` ${u.params.slice(0, 80)}` : ''}`).join('\n')
                : t('usage.logEmpty'));
        } else {
            const limits = await limitsWithUsage(who);
            blocks.push(limits.length
                ? limits.map(l => `• ${usageLine(l)}`).join('\n')
                : t(heSame ? 'usage.none' : 'usage.noneOf', { who: `+${numberAlt}` }));
        }
    }

    await msg.reply(`${t(opts.opt.log ? 'usage.logTitle' : 'usage.title')}\n${blocks.join('\n\n')}`);
}

module.exports = { cmdUsage };
