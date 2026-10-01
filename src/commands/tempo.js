/*
 * Comando /tempo.
 */

const axios = require('axios');

const { printError } = require('../log');
const { getSetting } = require('../settings');

// /tempo [city]: Open-Meteo (no API key)
const WEATHER_WMO = {
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
const TIME_COLD = 5;   // °C: "It's freezing!"
const TIME_CALOR = 30; // °C: "So hot!"

// Geocoding kept in memory: a city's coordinates do not change and the city
// default (tempo.city) is queried all the time
const geoCache = new Map();
const GEO_CACHE_MAX = 100;

/*
 * Resolves "city[, state][, country]" to { name, admin1, country, latitude, longitude }
 * or null. Open-Meteo understands the whole text and picks the most
 * relevant (normally the most populous).
 */
async function geocodeCity(city) {
    const keyAlt = city.toLowerCase();
    if (geoCache.has(keyAlt)) return geoCache.get(keyAlt);

    const { data } = await axios.get(OPEN_METEO_GEO_URL, {
        timeout: 15000,
        params: { name: city, count: 1, language: 'pt' }
    });
    const local = data.results?.[0] ?? null;

    // Only stores hits: "not found" may be a typo corrected later
    if (local) {
        if (geoCache.size >= GEO_CACHE_MAX) geoCache.delete(geoCache.keys().next().value);
        geoCache.set(keyAlt, local);
    }

    return local;
}

// Open-Meteo's limit for forecast_days (the tempo.maxDays setting does not go past it)
const TIME_DAYS_API = 16;

async function queryTime({ latitude, longitude }, daysAlt = 1) {
    const { data } = await axios.get(OPEN_METEO_URL, {
        timeout: 15000,
        params: {
            latitude,
            longitude,
            current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
            forecast_days: daysAlt,
            timezone: 'auto'
        }
    });

    return data;
}

// Missing value (Open-Meteo sometimes sends null) becomes '-'
const measure = (valueAlt, unit) => valueAlt == null ? '-' : `${Math.round(valueAlt)}${unit}`;

function formatTime(local, { current: c, daily: d }) {
    const [iconAlt, description] = WEATHER_WMO[c.weather_code] ?? ['🌡️', `Código ${c.weather_code}`];
    const whereAlt = [local.name, local.admin1, local.country].filter(Boolean).join(', ');
    const temp = Math.round(c.temperature_2m);

    let textAlt =
        `${iconAlt} *Tempo em ${whereAlt}*\n\n` +
        `${description}\n` +
        `🌡️ *Agora:* ${measure(c.temperature_2m, '°C')} _(sensação ${measure(c.apparent_temperature, '°C')})_\n` +
        `📈 *Máx:* ${measure(d.temperature_2m_max?.[0], '°C')}  📉 *Mín:* ${measure(d.temperature_2m_min?.[0], '°C')}\n` +
        `💧 *Umidade:* ${measure(c.relative_humidity_2m, '%')}  🌬️ *Vento:* ${measure(c.wind_speed_10m, ' km/h')}\n` +
        `☔ *Chance de chuva:* ${measure(d.precipitation_probability_max?.[0], '%')}`;

    if (temp <= TIME_COLD) textAlt += '\n\n🥶 Tá congelando!';
    if (temp >= TIME_CALOR) textAlt += '\n\n🔥 Que calor da porra!';

    return textAlt;
}

// "2026-09-30" → "qua 30/09" (the date already comes in the city timezone: timezone=auto)
function dayLabel(iso) {
    const [, mes, day] = iso.split('-');
    const week = new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
    return `${week} ${day}/${mes}`;
}

// One line per day: icon, day, max/min, chance of rain and condition
function formatForecast({ daily: d }) {
    const linesAlt = d.time.map((iso, i) => {
        const [iconAlt, description] = WEATHER_WMO[d.weather_code?.[i]] ?? ['🌡️', `Código ${d.weather_code?.[i]}`];
        const when = i === 0 ? `Hoje (${dayLabel(iso)})` : dayLabel(iso);
        return `${iconAlt} *${when}:* ${measure(d.temperature_2m_max?.[i], '°')}/${measure(d.temperature_2m_min?.[i], '°')}` +
               ` · ☔ ${measure(d.precipitation_probability_max?.[i], '%')} · ${description}`;
    });

    const title = d.time.length === 1 ? 'Previsão de hoje' : `Próximos ${d.time.length} dias`;
    return `📅 *${title}*\n${linesAlt.join('\n')}`;
}

/**
 * "7d Niteroi" → { dias: 7, cidade: 'Niteroi' }; "Niteroi" → { dias: null, cidade: 'Niteroi' }.
 * The days (N or Nd) only count as the first argument.
 */
function readArgumentsTime(args) {
    const m = args.trim().match(/^(\d+)d?(?:\s+|$)([\s\S]*)$/i);
    return m ? { dias: Number(m[1]), cidade: m[2].trim() } : { dias: null, cidade: args.trim() };
}

async function cmdTime({ msg, args }) {
    const request = readArgumentsTime(args);
    const max = getSetting('tempo.maxDays');

    if (request.dias !== null && (request.dias < 1 || request.dias > max)) {
        await msg.reply(`❌ Quantidade de dias inválida: ${request.dias}. Use de 1 a ${max}.\n💡 _/tempo 7d Niteroi (máximo no setting tempo.maxDays, até ${TIME_DAYS_API})_`);
        return;
    }

    // Without a city uses the tempo.city setting
    const city = request.cidade || getSetting('tempo.city');

    try {
        const local = await geocodeCity(city);

        if (!local) {
            await msg.reply(`❌ Cidade não encontrada: ${city}\n💡 _Tente com estado e país: /tempo Niteroi, Rio de Janeiro, Brazil_`);
            return;
        }

        const dataAlt = await queryTime(local, request.dias ?? 1);
        let textAlt = formatTime(local, dataAlt);
        if (request.dias) textAlt += `\n\n${formatForecast(dataAlt)}`;

        await msg.reply(textAlt);
    } catch (err) {
        printError('/tempo:', err.response?.status ?? '', err.message);
        await msg.reply('❌ Não consegui consultar o tempo agora.');
    }
}

module.exports = {
    cmdTime
};
