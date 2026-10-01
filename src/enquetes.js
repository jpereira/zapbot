/*
 * Enquetes: registro das enquetes e dos votos (evento 'vote_update') e o placar do /enquete -r.
 */

const { client } = require('./cliente');
const { resolveLidToPhone } = require('./contatos');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const { printError, printInfo } = require('./log');
const { formatarData, plural } = require('./util/formatar');

/*
 * O WhatsApp só entrega os votos a quem criou a enquete: o bot vê os votos
 * das enquetes da sua conta (as do /enquete e as que você cria no celular).
 * Cada 'vote_update' traz a escolha ATUAL de quem votou (lista vazia = tirou
 * o voto), então o voto é gravado por cima do anterior.
 */

// Grava a enquete, se ainda não existe (vinda do /enquete ou do primeiro voto)
async function registrarEnquete({ id, chatId, chatName = null, pergunta, opcoes, multi = false, criadaEm = Date.now() }) {
    await dbPronto;
    await dbRun(
        `INSERT OR IGNORE INTO polls (id, chat_id, chat_name, question, options, multi, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, chatId, chatName, pergunta, JSON.stringify(opcoes), multi ? 1 : 0, criadaEm]
    );
}

// Nome de quem votou: o seu perfil, o contato ou o número
async function nomeDoEleitor(voter) {
    if (voter === client.info.wid._serialized) return client.info.pushname || 'Você';

    const jid = voter.endsWith('@lid') ? (await resolveLidToPhone(voter)) || voter : voter;
    const contato = await client.getContactById(jid).catch(() => null);
    return contato?.name || contato?.pushname || jid.split('@')[0];
}

client.on('vote_update', async (vote) => {
    try {
        const enquete = vote.parentMessage;
        const pollId = enquete?.id?._serialized;
        if (!pollId || !vote.voter) return;

        const chatId = enquete.id.remote;
        const chat = await client.getChatById(chatId).catch(() => null);

        await registrarEnquete({
            id: pollId,
            chatId,
            chatName: chat?.name ?? null,
            pergunta: enquete.pollName ?? '',
            opcoes: (enquete.pollOptions ?? []).map(o => o.name),
            multi: enquete.allowMultipleAnswers ?? false,
            criadaEm: (enquete.timestamp ?? 0) * 1000 || Date.now()
        });

        const escolhas = (vote.selectedOptions ?? []).map(o => o.name);

        if (!escolhas.length) {
            await dbRun('DELETE FROM poll_votes WHERE poll_id = ? AND voter = ?', [pollId, vote.voter]);
            return;
        }

        await dbRun(
            `INSERT INTO poll_votes (poll_id, voter, voter_name, options, voted_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(poll_id, voter) DO UPDATE SET
                voter_name = excluded.voter_name, options = excluded.options, voted_at = excluded.voted_at`,
            [pollId, vote.voter, await nomeDoEleitor(vote.voter), JSON.stringify(escolhas), vote.interractedAtTs || Date.now()]
        );

        printInfo(`Enquete "${enquete.pollName}": voto de ${vote.voter} (${escolhas.join(', ')})`);
    } catch (err) {
        printError('Erro ao registrar o voto:', err.message);
    }
});

const barra = (fracao) => '█'.repeat(Math.round(fracao * 10)) || '▏';

/**
 * Placar de uma enquete: a respondida (pollId) ou a mais recente do chat.
 * @returns {Promise<string>}
 */
async function placarDaEnquete({ chatIds, pollId = null }) {
    await dbPronto;

    const enquete = pollId
        ? await dbGet('SELECT * FROM polls WHERE id = ?', [pollId])
        : await dbGet(
            `SELECT * FROM polls WHERE chat_id IN (${chatIds.map(() => '?').join(', ')})
              ORDER BY created_at DESC, rowid DESC LIMIT 1`, chatIds);

    if (!enquete) {
        return pollId
            ? '📊 Não tenho os votos dessa enquete: o bot só registra as enquetes da sua conta, a partir dos primeiros votos.'
            : '📊 Nenhuma enquete registrada neste chat.\n💡 _Crie com /enquete Pergunta? | opção 1 | opção 2_';
    }

    const votos = await dbAll('SELECT voter_name, options FROM poll_votes WHERE poll_id = ? ORDER BY voted_at, rowid', [enquete.id]);
    const opcoes = JSON.parse(enquete.options);
    const porOpcao = new Map(opcoes.map(o => [o, []]));

    for (const v of votos) {
        for (const o of JSON.parse(v.options)) {
            if (!porOpcao.has(o)) porOpcao.set(o, []);
            porOpcao.get(o).push(v.voter_name);
        }
    }

    const totalVotos = [...porOpcao.values()].reduce((s, l) => s + l.length, 0);
    const ranking = [...porOpcao.entries()].sort((a, b) => b[1].length - a[1].length);
    const lider = ranking[0]?.[1].length ?? 0;

    let texto = `📊 *Resultado: ${enquete.question}*\n` +
        `_${plural(totalVotos, 'voto', 'votos')} de ${plural(votos.length, 'pessoa', 'pessoas')}` +
        `${enquete.multi ? ' · várias respostas' : ''} · criada em ${formatarData(enquete.created_at)}_\n`;

    for (const [opcao, nomes] of ranking) {
        const pct = totalVotos ? Math.round((nomes.length / totalVotos) * 100) : 0;
        const icone = nomes.length && nomes.length === lider ? '🏆' : '▫️';
        texto += `\n${icone} *${opcao}* — ${nomes.length} (${pct}%) ${barra(totalVotos ? nomes.length / totalVotos : 0)}`;
        if (nomes.length) texto += `\n   _${nomes.join(', ')}_`;
    }

    if (!votos.length) texto += '\n\n_Ninguém votou ainda._';

    return texto;
}

module.exports = {
    placarDaEnquete,
    registrarEnquete
};
