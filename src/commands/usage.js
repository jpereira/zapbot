/*
 * Comando /usage.
 */

const { phoneAlt3, textPhones } = require('./whois');
const { client } = require('../client');
const { t } = require('../i18n');
const { itemsAlt, limitsWithUsage, usageLine, lastUses } = require('../usageLimit');
const { fmtWhen } = require('../util/when');

/*
 * /usage             → your limits here: uses, limit and when it renews
 * /usage -l          → your last uses that counted (when, command, parameters)
 * /usage <person>... → (owner and admins) other people's
 * The limit comes from /bot +cmd /gpt +limit 5/day; the owner and the admins have no limit.
 */
async function cmdUsage({ msg, opts, quotedMsg, senderNumber, chatId, isGroup, admin }) {
    const textAlt = opts.argv.join(' ').trim();

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
        const who = { numero: numberAlt, chatId, isGroup };
        const heSame = numbers.length === 1 && !textAlt && !quotedMsg;

        if (opts.opt.log) {
            const uses = await lastUses(itemsAlt(who));
            blocks.push(uses.length
                ? uses.map(u => `• ${fmtWhen(u.quando)} · ${u.cmd}${u.params ? ` ${u.params.slice(0, 80)}` : ''}`).join('\n')
                : t('usage.logEmpty'));
        } else {
            const limits = await limitsWithUsage(who);
            blocks.push(limits.length
                ? limits.map(l => `• ${usageLine(l)}`).join('\n')
                : t(heSame ? 'usage.none' : 'usage.noneOf', { quem: `+${numberAlt}` }));
        }
    }

    await msg.reply(`${t(opts.opt.log ? 'usage.logTitle' : 'usage.title')}\n${blocks.join('\n\n')}`);
}

module.exports = { cmdUsage };
