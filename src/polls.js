/*
 * Polls: record of the polls and votes ('vote_update' event) and the /enquete -r scoreboard.
 */

const { client } = require('./client');
const { contactName, resolveLidToPhone } = require('./contacts');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const { printError, printInfo } = require('./log');
const { formatData, plural } = require('./util/format');

/*
 * WhatsApp only delivers the votes to whoever created the poll: the bot sees the votes
 * of your account's polls (those from /enquete and those you create on the phone).
 * Each 'vote_update' brings the CURRENT choice of whoever voted (empty list = withdrew
 * the vote), so the vote is stored over the previous one.
 */

// Saves the poll, if it does not exist yet (coming from /enquete or from the first vote)
async function registerPoll({ id, chatId, chatName = null, pergunta: question, opcoes: optionsAlt, multi = false, criadaEm: createdIn = Date.now() }) {
    await dbReady;
    await dbRun(
        `INSERT OR IGNORE INTO polls (id, chat_id, chat_name, question, options, multi, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, chatId, chatName, question, JSON.stringify(optionsAlt), multi ? 1 : 0, createdIn]
    );
}

// Name of who voted: their profile, the contact or the number
async function voterName(voter) {
    if (voter === client.info.wid._serialized) return client.info.pushname || 'Você';

    const jid = voter.endsWith('@lid') ? (await resolveLidToPhone(voter)) || voter : voter;
    const contactAlt = await client.getContactById(jid).catch(() => null);
    return contactName(contactAlt) || jid.split('@')[0];
}

client.on('vote_update', async (vote) => {
    try {
        const pollAlt = vote.parentMessage;
        const pollId = pollAlt?.id?._serialized;
        if (!pollId || !vote.voter) return;

        const chatId = pollAlt.id.remote;
        const chat = await client.getChatById(chatId).catch(() => null);

        await registerPoll({
            id: pollId,
            chatId,
            chatName: chat?.name ?? null,
            pergunta: pollAlt.pollName ?? '',
            opcoes: (pollAlt.pollOptions ?? []).map(o => o.name),
            multi: pollAlt.allowMultipleAnswers ?? false,
            criadaEm: (pollAlt.timestamp ?? 0) * 1000 || Date.now()
        });

        const choices = (vote.selectedOptions ?? []).map(o => o.name);

        if (!choices.length) {
            await dbRun('DELETE FROM poll_votes WHERE poll_id = ? AND voter = ?', [pollId, vote.voter]);
            return;
        }

        await dbRun(
            `INSERT INTO poll_votes (poll_id, voter, voter_name, options, voted_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(poll_id, voter) DO UPDATE SET
                voter_name = excluded.voter_name, options = excluded.options, voted_at = excluded.voted_at`,
            [pollId, vote.voter, await voterName(vote.voter), JSON.stringify(choices), vote.interractedAtTs || Date.now()]
        );

        printInfo(`Enquete "${pollAlt.pollName}": voto de ${vote.voter} (${choices.join(', ')})`);
    } catch (err) {
        printError('Erro ao registrar o voto:', err.message);
    }
});

const bar = (fraction) => '█'.repeat(Math.round(fraction * 10)) || '▏';

/**
 * A poll's scoreboard: the replied one (pollId) or the chat's most recent.
 * @returns {Promise<string>}
 */
async function pollScoreboard({ chatIds, pollId = null }) {
    await dbReady;

    const pollAlt = pollId
        ? await dbGet('SELECT * FROM polls WHERE id = ?', [pollId])
        : await dbGet(
            `SELECT * FROM polls WHERE chat_id IN (${chatIds.map(() => '?').join(', ')})
              ORDER BY created_at DESC, rowid DESC LIMIT 1`, chatIds);

    if (!pollAlt) {
        return pollId
            ? '📊 Não tenho os votos dessa enquete: o bot só registra as enquetes da sua conta, a partir dos primeiros votos.'
            : '📊 Nenhuma enquete registrada neste chat.\n💡 _Crie com /enquete Pergunta? | opção 1 | opção 2_';
    }

    const votes = await dbAll('SELECT voter_name, options FROM poll_votes WHERE poll_id = ? ORDER BY voted_at, rowid', [pollAlt.id]);
    const optionsAlt = JSON.parse(pollAlt.options);
    const byOption = new Map(optionsAlt.map(o => [o, []]));

    for (const v of votes) {
        for (const o of JSON.parse(v.options)) {
            if (!byOption.has(o)) byOption.set(o, []);
            byOption.get(o).push(v.voter_name);
        }
    }

    const totalVotes = [...byOption.values()].reduce((s, l) => s + l.length, 0);
    const ranking = [...byOption.entries()].sort((a, b) => b[1].length - a[1].length);
    const leader = ranking[0]?.[1].length ?? 0;

    let textAlt = `📊 *Resultado: ${pollAlt.question}*\n` +
        `_${plural(totalVotes, 'voto', 'votos')} de ${plural(votes.length, 'pessoa', 'pessoas')}` +
        `${pollAlt.multi ? ' · várias respostas' : ''} · criada em ${formatData(pollAlt.created_at)}_\n`;

    for (const [optionAlt, names] of ranking) {
        const pct = totalVotes ? Math.round((names.length / totalVotes) * 100) : 0;
        const iconAlt = names.length && names.length === leader ? '🏆' : '▫️';
        textAlt += `\n${iconAlt} *${optionAlt}* — ${names.length} (${pct}%) ${bar(totalVotes ? names.length / totalVotes : 0)}`;
        if (names.length) textAlt += `\n   _${names.join(', ')}_`;
    }

    if (!votes.length) textAlt += '\n\n_Ninguém votou ainda._';

    return textAlt;
}

module.exports = {
    pollScoreboard,
    registerPoll
};
