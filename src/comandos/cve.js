/*
 * Comando /cve.
 */

const axios = require('axios');

const { DAY_MS } = require('../constantes');
const { printError } = require('../log');
const { SETTINGS_SCHEMA, getSetting } = require('../settings');
const { resumirTexto } = require('../util/formatar');

/*
 * /cve [max] [-highscore|-high [max]]: CVEs publicadas no NVD (nvd.nist.gov).
 *   /cve [N]         → as N mais recentes dos últimos CVE_DIAS_RECENTES dias
 *   /cve -high [N]   → as N críticas (CVSS v3 CRITICAL, ≥ 9) mais recentes dos
 *                      últimos 'cve.maxDays' dias
 * Sem N usa o setting 'cve.max'.
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
async function buscarCvesRecentes({ dias, max, critical = false }) {
    const fim = new Date();
    const filtro = {
        pubStartDate: nvdData(new Date(fim.getTime() - dias * DAY_MS)),
        pubEndDate: nvdData(fim),
        noRejected: '',
        ...(critical && { cvssV3Severity: 'CRITICAL' })
    };

    const consultar = async (params) =>
        (await axios.get(NVD_URL, { params: { ...filtro, ...params }, timeout: 30000 })).data;

    const { totalResults } = await consultar({ resultsPerPage: 1 });
    if (!totalResults) return [];

    const { vulnerabilities } = await consultar({ resultsPerPage: max, startIndex: Math.max(0, totalResults - max) });

    return vulnerabilities.map(v => v.cve).reverse();
}

function formatarCve(cve) {
    const nota = notaCvss(cve);
    const descricao = cve.descriptions?.find(d => d.lang === 'en')?.value ?? '';

    return `🛡️ *${cve.id}*${nota ? ` — ${nota.score} ${nota.severity}` : ''}\n` +
           `${resumirTexto(descricao, 220)}\n` +
           `https://nvd.nist.gov/vuln/detail/${cve.id}`;
}

async function cmdCve({ msg, opts }) {
    const critical = opts.given.has('highscore');
    const dias = critical ? getSetting('cve.maxDays') : CVE_DIAS_RECENTES;

    // <max> informado (/cve 5 ou /cve -high 5) sobrepõe o setting cve.max
    const { max: limite } = SETTINGS_SCHEMA['cve.max'];
    const valor = opts.opt.highscore ?? opts.argv[0] ?? getSetting('cve.max');
    const max = Number(valor);

    if (!Number.isInteger(max) || max < 1 || max > limite) {
        await msg.reply(`❌ Quantidade inválida: ${valor}. Use de 1 a ${limite}.\n💡 _/cve 5 ou /cve -high 5_`);
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
    formatarCve
};
