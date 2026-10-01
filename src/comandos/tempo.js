/*
 * Comando /tempo.
 */

const axios = require('axios');

const { printError } = require('../log');
const { getSetting } = require('../settings');

// /tempo [N|Nd] [cidade]: Open-Meteo (sem chave de API); com N, a previsão dos próximos N dias
const CLIMA_WMO = {
    0: ['☀️', 'Céu limpo'], 1: ['🌤️', 'Predominantemente limpo'], 2: ['⛅', 'Parcialmente nublado'],
    3: ['☁️', 'Nublado'], 45: ['🌫️', 'Neblina'], 48: ['🌫️', 'Neblina com geada'],
    51: ['🌦️', 'Garoa fraca'], 53: ['🌦️', 'Garoa'], 55: ['🌦️', 'Garoa forte'],
    56: ['🌧️', 'Garoa congelante'], 57: ['🌧️', 'Garoa congelante forte'],
    61: ['🌧️', 'Chuva fraca'], 63: ['🌧️', 'Chuva'], 65: ['🌧️', 'Chuva forte'],
    66: ['🌧️', 'Chuva congelante'], 67: ['🌧️', 'Chuva congelante forte'],
    71: ['🌨️', 'Neve fraca'], 73: ['🌨️', 'Neve'], 75: ['❄️', 'Neve forte'], 77: ['🌨️', 'Grãos de neve'],
    80: ['🌦️', 'Pancadas de chuva'], 81: ['🌧️', 'Pancadas de chuva fortes'], 82: ['⛈️', 'Pancadas violentas'],
    85: ['🌨️', 'Pancadas de neve'], 86: ['❄️', 'Pancadas de neve fortes'],
    95: ['⛈️', 'Trovoada'], 96: ['⛈️', 'Trovoada com granizo'], 99: ['⛈️', 'Trovoada com granizo forte']
};

const OPEN_METEO_GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const TEMPO_FRIO = 5;   // °C: "Tá congelando!"
const TEMPO_CALOR = 30; // °C: "Que calor!"

// Geocodificação guardada em memória: coordenada de cidade não muda e a cidade
// padrão (tempo.city) é consultada o tempo todo
const geoCache = new Map();
const GEO_CACHE_MAX = 100;

/*
 * Resolve "cidade[, estado][, país]" para { name, admin1, country, latitude, longitude }
 * ou null. A Open-Meteo entende o texto inteiro e escolhe o resultado mais
 * relevante (normalmente o mais populoso).
 */
async function geocodificarCidade(cidade) {
    const chave = cidade.toLowerCase();
    if (geoCache.has(chave)) return geoCache.get(chave);

    const { data } = await axios.get(OPEN_METEO_GEO_URL, {
        timeout: 15000,
        params: { name: cidade, count: 1, language: 'pt' }
    });
    const local = data.results?.[0] ?? null;

    // Só guarda acertos: "não encontrada" pode ser erro de digitação corrigido depois
    if (local) {
        if (geoCache.size >= GEO_CACHE_MAX) geoCache.delete(geoCache.keys().next().value);
        geoCache.set(chave, local);
    }

    return local;
}

// O limite da Open-Meteo para forecast_days (o setting tempo.maxDays não passa disso)
const TEMPO_DIAS_API = 16;

async function consultarTempo({ latitude, longitude }, dias = 1) {
    const { data } = await axios.get(OPEN_METEO_URL, {
        timeout: 15000,
        params: {
            latitude,
            longitude,
            current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
            forecast_days: dias,
            timezone: 'auto'
        }
    });

    return data;
}

// Valor ausente (a Open-Meteo às vezes manda null) vira '-'
const medida = (valor, unidade) => valor == null ? '-' : `${Math.round(valor)}${unidade}`;

function formatarTempo(local, { current: c, daily: d }) {
    const [icone, descricao] = CLIMA_WMO[c.weather_code] ?? ['🌡️', `Código ${c.weather_code}`];
    const onde = [local.name, local.admin1, local.country].filter(Boolean).join(', ');
    const temp = Math.round(c.temperature_2m);

    let texto =
        `${icone} *Tempo em ${onde}*\n\n` +
        `${descricao}\n` +
        `🌡️ *Agora:* ${medida(c.temperature_2m, '°C')} _(sensação ${medida(c.apparent_temperature, '°C')})_\n` +
        `📈 *Máx:* ${medida(d.temperature_2m_max?.[0], '°C')}  📉 *Mín:* ${medida(d.temperature_2m_min?.[0], '°C')}\n` +
        `💧 *Umidade:* ${medida(c.relative_humidity_2m, '%')}  🌬️ *Vento:* ${medida(c.wind_speed_10m, ' km/h')}\n` +
        `☔ *Chance de chuva:* ${medida(d.precipitation_probability_max?.[0], '%')}`;

    if (temp <= TEMPO_FRIO) texto += '\n\n🥶 Tá congelando!';
    if (temp >= TEMPO_CALOR) texto += '\n\n🔥 Que calor da porra!';

    return texto;
}

// "2026-09-30" → "qua 30/09" (a data já vem no fuso da cidade: timezone=auto)
function rotuloDoDia(iso) {
    const [, mes, dia] = iso.split('-');
    const semana = new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
    return `${semana} ${dia}/${mes}`;
}

// Uma linha por dia: ícone, dia, máx/mín, chance de chuva e condição
function formatarPrevisao({ daily: d }) {
    const linhas = d.time.map((iso, i) => {
        const [icone, descricao] = CLIMA_WMO[d.weather_code?.[i]] ?? ['🌡️', `Código ${d.weather_code?.[i]}`];
        const quando = i === 0 ? `Hoje (${rotuloDoDia(iso)})` : rotuloDoDia(iso);
        return `${icone} *${quando}:* ${medida(d.temperature_2m_max?.[i], '°')}/${medida(d.temperature_2m_min?.[i], '°')}` +
               ` · ☔ ${medida(d.precipitation_probability_max?.[i], '%')} · ${descricao}`;
    });

    const titulo = d.time.length === 1 ? 'Previsão de hoje' : `Próximos ${d.time.length} dias`;
    return `📅 *${titulo}*\n${linhas.join('\n')}`;
}

/**
 * "7d Niteroi" → { dias: 7, cidade: 'Niteroi' }; "Niteroi" → { dias: null, cidade: 'Niteroi' }.
 * Os dias (N ou Nd) só valem como primeiro argumento.
 */
function lerArgumentosTempo(args) {
    const m = args.trim().match(/^(\d+)d?(?:\s+|$)([\s\S]*)$/i);
    return m ? { dias: Number(m[1]), cidade: m[2].trim() } : { dias: null, cidade: args.trim() };
}

async function cmdTempo({ msg, args }) {
    const pedido = lerArgumentosTempo(args);
    const max = getSetting('tempo.maxDays');

    if (pedido.dias !== null && (pedido.dias < 1 || pedido.dias > max)) {
        await msg.reply(`❌ Quantidade de dias inválida: ${pedido.dias}. Use de 1 a ${max}.\n💡 _/tempo 7d Niteroi (máximo no setting tempo.maxDays, até ${TEMPO_DIAS_API})_`);
        return;
    }

    // Sem cidade usa o setting tempo.city
    const cidade = pedido.cidade || getSetting('tempo.city');

    try {
        const local = await geocodificarCidade(cidade);

        if (!local) {
            await msg.reply(`❌ Cidade não encontrada: ${cidade}\n💡 _Tente com estado e país: /tempo Niteroi, Rio de Janeiro, Brazil_`);
            return;
        }

        const dados = await consultarTempo(local, pedido.dias ?? 1);
        let texto = formatarTempo(local, dados);
        if (pedido.dias) texto += `\n\n${formatarPrevisao(dados)}`;

        await msg.reply(texto);
    } catch (err) {
        printError('/tempo:', err.response?.status ?? '', err.message);
        await msg.reply('❌ Não consegui consultar o tempo agora.');
    }
}

module.exports = {
    cmdTempo
};
