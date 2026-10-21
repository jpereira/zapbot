/*
 * Comando /cve.
 */

const axios = require('axios');

const { DAY_MS } = require('../constantes');
const { printError } = require('../log');
const { SETTINGS_SCHEMA, getSetting } = require('../settings');
const { resumirTexto } = require('../util/formatar');

/*
 * /cve [<id>|<texto>] [-highscore|-high [max]]: CVEs publicadas no NVD (nvd.nist.gov).
 *   /cve                → as 'cve.max' mais recentes dos últimos CVE_DIAS_RECENTES dias
 *   /cve -high [N]      → as N críticas (CVSS v3 CRITICAL, ≥ 9) mais recentes dos
 *                         últimos 'cve.maxDays' dias (sem N, 'cve.max')
 *   /cve <id>           → a CVE pedida (CVE-2026-1234 ou só 2026-1234)
 *   /cve <texto>        → as 'cve.max' mais recentes que citam o texto (keywordSearch)
 *
 * A API do cve.circl.lu que o zapzap usava mudou de formato e quase nunca traz a
 * nota CVSS. Sem chave o NVD aceita ~5 consultas a cada 30s.
 */
const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const CVE_DIAS_RECENTES = 2;

// O NVD quer ISO-8601 sem o 'Z'
const nvdData = (d) => d.toISOString().replace('Z', '');

const periodoDias = (dias) => dias === 1 ? 'último dia' : `últimos ${dias} dias`;

// Nota preferida: CVSS v3.1 > v4.0 > v3.0 > v2 (métrica Primary, senão a primeira)
function notaCvss(cve) {
    const m = cve.metrics ?? {};

    for (const chave of ['cvssMetricV31', 'cvssMetricV40', 'cvssMetricV30', 'cvssMetricV2']) {
        const metrica = m[chave]?.find(x => x.type === 'Primary') ?? m[chave]?.[0];
        if (metrica?.cvssData?.baseScore != null) {
            return { score: metrica.cvssData.baseScore, severity: metrica.cvssData.baseSeverity ?? metrica.baseSeverity ?? '' };
        }
    }

    return null;
}

/*
 * As `max` CVEs publicadas mais recentemente nos últimos `dias`, da mais nova
 * para a mais antiga. O NVD ordena da mais antiga para a mais nova e não tem
 * ordenação reversa: uma consulta conta o total e a outra busca só o final.
 */
async function buscarFinal(filtro, max) {
    const consultar = async (params) =>
        (await axios.get(NVD_URL, { params: { ...filtro, ...params }, timeout: 30000 })).data;

    const { totalResults } = await consultar({ resultsPerPage: 1 });
    if (!totalResults) return { total: 0, cves: [] };

    const { vulnerabilities } = await consultar({ resultsPerPage: max, startIndex: Math.max(0, totalResults - max) });

    return { total: totalResults, cves: vulnerabilities.map(v => v.cve).reverse() };
}

async function buscarCvesRecentes({ dias, max, critical = false }) {
    const fim = new Date();
    const filtro = {
        pubStartDate: nvdData(new Date(fim.getTime() - dias * DAY_MS)),
        pubEndDate: nvdData(fim),
        noRejected: '',
        ...(critical && { cvssV3Severity: 'CRITICAL' })
    };

    return (await buscarFinal(filtro, max)).cves;
}

// As `max` CVEs mais recentes que citam o texto (em qualquer época), e quantas há ao todo
const buscarPorTexto = (texto, max) => buscarFinal({ keywordSearch: texto, noRejected: '' }, max);

const EMOJI_SEVERIDADE = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' };

// Uma linha de resultado de busca: severidade + id, data de publicação e a descrição
function formatarResultado(cve) {
    const severidade = notaCvss(cve)?.severity?.toUpperCase();
    const descricao = cve.descriptions?.find(d => d.lang === 'en')?.value ?? '';
    const data = new Date(cve.published).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
    });

    return `${EMOJI_SEVERIDADE[severidade] ?? '⚪'} *${cve.id}*\n` +
           `🗓️ ${data}\n` +
           `🔎 ${resumirTexto(descricao, 220)}`;
}

// "CVE-2026-1234", "cve-2026-1234" ou "2026-1234" → "CVE-2026-1234" (null se não for um id)
function normalizarId(texto) {
    const m = String(texto).trim().match(/^(?:cve-)?(\d{4}-\d{4,})$/i);
    return m ? `CVE-${m[1]}` : null;
}

// A CVE pelo id, ou null se o NVD não a conhece
async function buscarCve(id) {
    try {
        const { data } = await axios.get(NVD_URL, { params: { cveId: id }, timeout: 30000 });
        return data.vulnerabilities?.[0]?.cve ?? null;
    } catch (err) {
        if (err.response?.status === 404) return null;
        throw err;
    }
}

function formatarCve(cve) {
    const nota = notaCvss(cve);
    const descricao = cve.descriptions?.find(d => d.lang === 'en')?.value ?? '';

    return `🛡️ *${cve.id}*${nota ? ` — ${nota.score} ${nota.severity}` : ''}\n` +
           `${resumirTexto(descricao, 220)}\n` +
           `https://nvd.nist.gov/vuln/detail/${cve.id}`;
}

async function cmdCve({ msg, opts }) {
    const texto = opts.argv.filter(Boolean).join(' ').trim();
    if (texto) {
        try {
            const id = normalizarId(texto);
            if (id) {
                const cve = await buscarCve(id);
                await msg.reply(cve ? formatarCve(cve) : `🛡️ ${id} não encontrada no NVD.`, null, { linkPreview: false });
                return;
            }

            const max = getSetting('cve.max');
            const { total, cves } = await buscarPorTexto(texto, max);
            if (!cves.length) {
                await msg.reply(`🛡️ Nenhuma CVE com "${texto}".`);
                return;
            }

            const mais = total > cves.length
                ? `\n\n💡 _Há mais ${total - cves.length} (use um texto mais específico ou o id)._` : '';
            await msg.reply(`🔎 *${cves.length} de ${total} CVEs com* "${texto}"\n\n` +
                `${cves.map(formatarResultado).join('\n\n')}${mais}`, null, { linkPreview: false });
        } catch (err) {
            printError('/cve:', err.response?.status ?? '', err.message);
            await msg.reply('❌ Não consegui consultar o NVD agora (limite de consultas? tente em 30s).');
        }
        return;
    }

    const critical = opts.given.has('highscore');
    const dias = critical ? getSetting('cve.maxDays') : CVE_DIAS_RECENTES;

    // <max> informado (/cve -high 5) sobrepõe o setting cve.max
    const { max: limite } = SETTINGS_SCHEMA['cve.max'];
    const valor = opts.opt.highscore ?? getSetting('cve.max');
    const max = Number(valor);

    if (!Number.isInteger(max) || max < 1 || max > limite) {
        await msg.reply(`❌ Quantidade inválida: ${valor}. Use de 1 a ${limite}.\n💡 _/cve -high 5_`);
        return;
    }

    try {
        const cves = await buscarCvesRecentes({ dias, max, critical });

        if (!cves.length) {
            await msg.reply(`🛡️ Nenhuma CVE${critical ? ' crítica' : ''} publicada no ${periodoDias(dias)}.`);
            return;
        }

        const titulo = critical
            ? `🔥 *${cves.length} CVEs críticas mais recentes* _(CVSS ≥ 9, ${periodoDias(dias)})_`
            : `🛡️ *Últimas ${cves.length} CVEs publicadas* _(${periodoDias(dias)})_`;

        await msg.reply(`${titulo}\n\n${cves.map(formatarCve).join('\n\n')}`, null, { linkPreview: false });
    } catch (err) {
        printError('/cve:', err.response?.status ?? '', err.message);
        await msg.reply('❌ Não consegui consultar o NVD agora (limite de consultas? tente em 30s).');
    }
}

module.exports = {
    buscarCvesRecentes,
    cmdCve,
    formatarCve,
    formatarResultado
};
