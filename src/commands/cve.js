/*
 * Comando /cve.
 */

const axios = require('axios');

const { DAY_MS } = require('../constants');
const { printError } = require('../log');
const { SETTINGS_SCHEMA, getSetting } = require('../settings');
const { summarizeText } = require('../util/format');

/*
 * /cve [<id>|<text>] [-highscore|-high [max]]: CVEs published on the NVD (nvd.nist.gov).
 * /cve                → the most recent 'cve.max' from the last CVE_DAYS_RECENT days
 * /cve -high [N]      → the N most recent critical ones (CVSS v3 CRITICAL, ≥ 9) from the
 * last 'cve.maxDays' days (without N, 'cve.max')
 * /cve <id>           → the requested CVE (CVE-2026-1234 or just 2026-1234)
 * /cve <text>        → the most recent 'cve.max' that mention the text (keywordSearch)
 *
 * The cve.circl.lu API that zapzap used changed format and almost never brings the
 * CVSS score. Without a key the NVD accepts ~5 queries every 30s.
 */
const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const CVE_DAYS_RECENT = 2;

// The NVD wants ISO-8601 without the 'Z'
const nvdData = (d) => d.toISOString().replace('Z', '');

const periodDays = (daysAlt) => daysAlt === 1 ? 'último dia' : `últimos ${daysAlt} dias`;

// Preferred score: CVSS v3.1 > v4.0 > v3.0 > v2 (Primary metric, otherwise the first)
function noteCvss(cve) {
    const m = cve.metrics ?? {};

    for (const keyAlt of ['cvssMetricV31', 'cvssMetricV40', 'cvssMetricV30', 'cvssMetricV2']) {
        const metric = m[keyAlt]?.find(x => x.type === 'Primary') ?? m[keyAlt]?.[0];
        if (metric?.cvssData?.baseScore != null) {
            return { score: metric.cvssData.baseScore, severity: metric.cvssData.baseSeverity ?? metric.baseSeverity ?? '' };
        }
    }

    return null;
}

/*
 * The `max` most recently published CVEs in the last `dias`, newest first
 * to the oldest. The NVD sorts from oldest to newest and has no
 * reverse ordering: one query counts the total and the other fetches only the end.
 */
async function searchFinal(filter, max) {
    const query = async (params) =>
        (await axios.get(NVD_URL, { params: { ...filter, ...params }, timeout: 30000 })).data;

    const { totalResults } = await query({ resultsPerPage: 1 });
    if (!totalResults) return { total: 0, cves: [] };

    const { vulnerabilities } = await query({ resultsPerPage: max, startIndex: Math.max(0, totalResults - max) });

    return { total: totalResults, cves: vulnerabilities.map(v => v.cve).reverse() };
}

async function searchCvesRecent({ dias: daysAlt, max, critical = false }) {
    const end = new Date();
    const filter = {
        pubStartDate: nvdData(new Date(end.getTime() - daysAlt * DAY_MS)),
        pubEndDate: nvdData(end),
        noRejected: '',
        ...(critical && { cvssV3Severity: 'CRITICAL' })
    };

    return (await searchFinal(filter, max)).cves;
}

// The `max` most recent CVEs that mention the text (at any time), and how many there are in total
const searchPerText = (textAlt, max) => searchFinal({ keywordSearch: textAlt, noRejected: '' }, max);

const EMOJI_SEVERITY = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' };

// A search result line: severity + id, publication date and the description
function formatResult(cve) {
    const severity = noteCvss(cve)?.severity?.toUpperCase();
    const description = cve.descriptions?.find(d => d.lang === 'en')?.value ?? '';
    const data = new Date(cve.published).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
    });

    return `${EMOJI_SEVERITY[severity] ?? '⚪'} *${cve.id}*\n` +
           `🗓️ ${data}\n` +
           `🔎 ${summarizeText(description, 220)}`;
}

// "CVE-2026-1234", "cve-2026-1234" or "2026-1234" → "CVE-2026-1234" (null if it is not an id)
function normalizeId(textAlt) {
    const m = String(textAlt).trim().match(/^(?:cve-)?(\d{4}-\d{4,})$/i);
    return m ? `CVE-${m[1]}` : null;
}

// The CVE by id, or null if the NVD does not know it
async function searchCve(id) {
    try {
        const { data } = await axios.get(NVD_URL, { params: { cveId: id }, timeout: 30000 });
        return data.vulnerabilities?.[0]?.cve ?? null;
    } catch (err) {
        if (err.response?.status === 404) return null;
        throw err;
    }
}

function formatCve(cve) {
    const note = noteCvss(cve);
    const description = cve.descriptions?.find(d => d.lang === 'en')?.value ?? '';

    return `🛡️ *${cve.id}*${note ? ` — ${note.score} ${note.severity}` : ''}\n` +
           `${summarizeText(description, 220)}\n` +
           `https://nvd.nist.gov/vuln/detail/${cve.id}`;
}

async function cmdCve({ msg, opts }) {
    const textAlt = opts.argv.filter(Boolean).join(' ').trim();
    if (textAlt) {
        try {
            const id = normalizeId(textAlt);
            if (id) {
                const cve = await searchCve(id);
                await msg.reply(cve ? formatCve(cve) : `🛡️ ${id} não encontrada no NVD.`, null, { linkPreview: false });
                return;
            }

            const max = getSetting('cve.max');
            const { total, cves } = await searchPerText(textAlt, max);
            if (!cves.length) {
                await msg.reply(`🛡️ Nenhuma CVE com "${textAlt}".`);
                return;
            }

            const more = total > cves.length
                ? `\n\n💡 _Há mais ${total - cves.length} (use um texto mais específico ou o id)._` : '';
            await msg.reply(`🔎 *${cves.length} de ${total} CVEs com* "${textAlt}"\n\n` +
                `${cves.map(formatResult).join('\n\n')}${more}`, null, { linkPreview: false });
        } catch (err) {
            printError('/cve:', err.response?.status ?? '', err.message);
            await msg.reply('❌ Não consegui consultar o NVD agora (limite de consultas? tente em 30s).');
        }
        return;
    }

    const critical = opts.given.has('highscore');
    const daysAlt = critical ? getSetting('cve.maxDays') : CVE_DAYS_RECENT;

    // the given <max> (/cve -high 5) overrides the cve.max setting
    const { max: limitAlt } = SETTINGS_SCHEMA['cve.max'];
    const valueAlt = opts.opt.highscore ?? getSetting('cve.max');
    const max = Number(valueAlt);

    if (!Number.isInteger(max) || max < 1 || max > limitAlt) {
        await msg.reply(`❌ Quantidade inválida: ${valueAlt}. Use de 1 a ${limitAlt}.\n💡 _/cve -high 5_`);
        return;
    }

    try {
        const cves = await searchCvesRecent({ dias: daysAlt, max, critical });

        if (!cves.length) {
            await msg.reply(`🛡️ Nenhuma CVE${critical ? ' crítica' : ''} publicada no ${periodDays(daysAlt)}.`);
            return;
        }

        const title = critical
            ? `🔥 *${cves.length} CVEs críticas mais recentes* _(CVSS ≥ 9, ${periodDays(daysAlt)})_`
            : `🛡️ *Últimas ${cves.length} CVEs publicadas* _(${periodDays(daysAlt)})_`;

        await msg.reply(`${title}\n\n${cves.map(formatCve).join('\n\n')}`, null, { linkPreview: false });
    } catch (err) {
        printError('/cve:', err.response?.status ?? '', err.message);
        await msg.reply('❌ Não consegui consultar o NVD agora (limite de consultas? tente em 30s).');
    }
}

module.exports = {
    searchCvesRecent,
    cmdCve,
    formatCve,
    formatResult
};
