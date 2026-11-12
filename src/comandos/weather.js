/*
 * Comando /weather.
 */

const axios = require('axios');

const { printError } = require('../log');
const { idioma, t } = require('../i18n');
const { getSetting } = require('../settings');

// /weather [N|Nd] [cidade]: Open-Meteo (sem chave de API); com N, a previsão dos próximos N dias
const CLIMA_WMO = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌦️', 56: '🌧️', 57: '🌧️',
    61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '❄️', 77: '🌨️',
    80: '🌦️', 81: '🌧️', 82: '⛈️', 85: '🌨️', 86: '❄️',
    95: '⛈️', 96: '⛈️', 99: '⛈️'
};

// [ícone, descrição] do código WMO, no idioma atual
function climaWmo(codigo) {
    return codigo in CLIMA_WMO
        ? [CLIMA_WMO[codigo], t(`weather.wmo.${codigo}`)]
        : ['🌡️', t('weather.code', { code: codigo })];
}

const OPEN_METEO_GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const TEMPO_FRIO = 5;   // °C: "Tá congelando!"
const TEMPO_CALOR = 30; // °C: "Que calor!"

// Geocodificação guardada em memória: coordenada de cidade não muda e a cidade
// padrão (tempo.city) é consultada o tempo todo
const geoCache = new Map();
const GEO_CACHE_MAX = 100;

/*
 * Resolve uma cidade, com estado ou país opcional após uma vírgula, para
 * { name, admin1, country, latitude, longitude } ou null.
 * A Open-Meteo entende o texto inteiro e escolhe o resultado mais
 * relevante (normalmente o mais populoso).
 */
async function geocodificarCidade(cidade) {
    const chave = `${idioma()}:${cidade.toLowerCase()}`;
    if (geoCache.has(chave)) return geoCache.get(chave);

    const { data } = await axios.get(OPEN_METEO_GEO_URL, {
        timeout: 15000,
        params: { name: cidade, count: 1, language: idioma() === 'pt_BR' ? 'pt' : 'en' }
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
    const [icone, descricao] = climaWmo(c.weather_code);
    const onde = [local.name, local.admin1, local.country].filter(Boolean).join(', ');
    const temp = Math.round(c.temperature_2m);

    let texto = t('weather.now', {
        icon: icone,
        place: onde,
        desc: descricao,
        temp: medida(c.temperature_2m, '°C'),
        feels: medida(c.apparent_temperature, '°C'),
        max: medida(d.temperature_2m_max?.[0], '°C'),
        min: medida(d.temperature_2m_min?.[0], '°C'),
        humidity: medida(c.relative_humidity_2m, '%'),
        wind: medida(c.wind_speed_10m, ' km/h'),
        rain: medida(d.precipitation_probability_max?.[0], '%')
    });

    if (temp <= TEMPO_FRIO) texto += '\n\n' + t('weather.freezing');
    if (temp >= TEMPO_CALOR) texto += '\n\n' + t('weather.hot');

    return texto;
}

// "2026-09-30" → "qua 30/09" (a data já vem no fuso da cidade: timezone=auto)
function rotuloDoDia(iso) {
    const [, mes, dia] = iso.split('-');
    const semana = new Date(`${iso}T12:00:00Z`).toLocaleDateString(idioma() === 'pt_BR' ? 'pt-BR' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
    return `${semana} ${dia}/${mes}`;
}

// Uma linha por dia: ícone, dia, máx/mín, chance de chuva e condição
function formatarPrevisao({ daily: d }) {
    const linhas = d.time.map((iso, i) => {
        const [icone, descricao] = climaWmo(d.weather_code?.[i]);
        const quando = i === 0 ? t('weather.today', { day: rotuloDoDia(iso) }) : rotuloDoDia(iso);
        return `${icone} *${quando}:* ${medida(d.temperature_2m_max?.[i], '°')}/${medida(d.temperature_2m_min?.[i], '°')}` +
               ` · ☔ ${medida(d.precipitation_probability_max?.[i], '%')} · ${descricao}`;
    });

    const titulo = d.time.length === 1 ? t('weather.forecastToday') : t('weather.forecastDays', { n: d.time.length });
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

async function cmdWeather({ msg, args }) {
    const pedido = lerArgumentosTempo(args);
    const max = getSetting('tempo.maxDays');

    if (pedido.dias !== null && (pedido.dias < 1 || pedido.dias > max)) {
        await msg.reply(t('weather.invalidDays', { n: pedido.dias, max, api: TEMPO_DIAS_API }));
        return;
    }

    // Sem cidade usa o setting tempo.city
    const cidade = pedido.cidade || getSetting('tempo.city');

    try {
        const local = await geocodificarCidade(cidade);

        if (!local) {
            await msg.reply(t('weather.cityNotFound', { city: cidade }));
            return;
        }

        const dados = await consultarTempo(local, pedido.dias ?? 1);
        let texto = formatarTempo(local, dados);
        if (pedido.dias) texto += `\n\n${formatarPrevisao(dados)}`;

        await msg.reply(texto);
    } catch (err) {
        printError('/weather:', err.response?.status ?? '', err.message);
        await msg.reply(t('weather.failed'));
    }
}

module.exports = {
    cmdWeather
};
