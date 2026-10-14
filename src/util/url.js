/*
 * URLs: extração, validação e o anti-SSRF do /get (só endereços públicos).
 */

const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const https = require('https');
const axios = require('axios');

function extractFirstUrl(text) {
    const m = String(text ?? '').match(/https?:\/\/[^\s"'<>]+/);
    return m ? m[0] : null;
}

function isValidHttpUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/*
 * Anti-SSRF do /get: o yt-dlp roda na rede do servidor, então uma URL como
 * http://192.168.0.1/ ou http://localhost:2375/ alcançaria a rede interna.
 * Recusamos hosts que resolvem para endereços privados/loopback/link-local.
 * (Não cobre redirects nem DNS rebinding feitos depois pelo yt-dlp.)
 */
const REDES_BLOQUEADAS = new net.BlockList();

for (const [rede, prefixo] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) {
    REDES_BLOQUEADAS.addSubnet(rede, prefixo, 'ipv4');
}

for (const [rede, prefixo] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
    REDES_BLOQUEADAS.addSubnet(rede, prefixo, 'ipv6');
}

function isEnderecoBloqueado(address) {
    // ::ffff:10.0.0.1 (IPv4 mapeado em IPv6) é checado como IPv4
    const v4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (v4) return REDES_BLOQUEADAS.check(v4, 'ipv4');

    return REDES_BLOQUEADAS.check(address, net.isIPv6(address) ? 'ipv6' : 'ipv4');
}

// Os IPs públicos do host, ou [] se não resolver/for bloqueado (sem exceção para o chamador)
async function enderecosPublicos(host) {
    const alvo = host.replace(/^\[|\]$/g, '');
    const enderecos = net.isIP(alvo)
        ? [{ address: alvo }]
        : await dns.lookup(alvo, { all: true }).catch(() => []);

    return enderecos.filter(e => !isEnderecoBloqueado(e.address)).map(e => e.address);
}

async function isUrlPublica(str) {
    const host = new URL(str).hostname;
    const publicos = await enderecosPublicos(host);
    // Uma resposta DNS mista (um IP público, um privado) é recusada: o host
    // pode fazer rebinding entre a checagem e a conexão real.
    const total = net.isIP(host.replace(/^\[|\]$/g, ''))
        ? 1
        : (await dns.lookup(host.replace(/^\[|\]$/g, ''), { all: true }).catch(() => [])).length;
    return publicos.length > 0 && publicos.length === total;
}

/*
 * GET que fecha a janela de TOCTOU do isUrlPublica: a conexão é fixada (pin) no
 * IP já verificado — o host não consegue trocar para um endereço interno entre
 * a checagem e o connect (DNS rebinding) — e cada redirect é revalidado no
 * mesmo esquema antes de ser seguido. Vale só para os fetches feitos pelo
 * próprio Node; processos externos (yt-dlp) precisam de isolamento de rede.
 */
async function httpGetSeguro(urlInicial, { maxRedirects = 3, ...opcoes } = {}) {
    let url = urlInicial;

    for (let salto = 0; salto <= maxRedirects; salto++) {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error(`protocolo não permitido: ${parsed.protocol}`);
        }

        const publicos = await enderecosPublicos(parsed.hostname);
        if (!publicos.length) throw new Error(`endereço não permitido: ${parsed.hostname}`);

        const ip = publicos[0];
        const familia = net.isIPv6(ip) ? 6 : 4;
        // lookup fixo: o socket conecta no IP verificado, não numa nova resolução
        const lookup = (_host, _opts, cb) => cb(null, ip, familia);
        const agent = parsed.protocol === 'https:'
            ? new https.Agent({ lookup })
            : new http.Agent({ lookup });

        const resp = await axios.get(url, {
            ...opcoes,
            maxRedirects: 0,
            httpAgent: agent,
            httpsAgent: agent,
            validateStatus: (s) => s >= 200 && s < 400
        });

        if (resp.status >= 300 && resp.status < 400 && resp.headers.location) {
            url = new URL(resp.headers.location, url).toString();
            continue;
        }
        return resp;
    }

    throw new Error('redirects demais');
}

module.exports = {
    enderecosPublicos,
    extractFirstUrl,
    httpGetSeguro,
    isEnderecoBloqueado,
    isUrlPublica,
    isValidHttpUrl
};
