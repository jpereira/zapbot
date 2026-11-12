/*
 * Comando /weather.
 */

const axios = require('axios');

const { printError } = require('../log');
const { language, t } = require('../i18n');
const { getSetting } = require('../settings');

// /weather [N|Nd] [city]: Open-Meteo (no API key); with N, the forecast for the next N days
const WEATHER_WMO = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌦️', 56: '🌧️', 57: '🌧️',
    61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '❄️', 77: '🌨️',
    80: '🌦️', 81: '🌧️', 82: '⛈️', 85: '🌨️', 86: '❄️',
    95: '⛈️', 96: '⛈️', 99: '⛈️'
};

// [icon, description] from the WMO code, in the current language
function weatherWmo(codeAlt) {
    return codeAlt in WEATHER_WMO
        ? [WEATHER_WMO[codeAlt], t(`weather.wmo.${codeAlt}`)]
        : ['🌡️', t('weather.code', { code: codeAlt })];
}

const OPEN_METEO_GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const TIME_COLD = 5;   // °C: "It's freezing!"
const TIME_CALOR = 30; // °C: "So hot!"

// Geocoding kept in memory: a city's coordinates do not change and the city
// default (tempo.city) is queried all the time
const geoCache = new Map();
const GEO_CACHE_MAX = 100;

/*
 * Resolves a city, with an optional state or country after a comma, to
 * { name, admin1, country, latitude, longitude } or null.
 * Open-Meteo understands the whole text and picks the most
 * relevant (normally the most populous).
 */
async function geocodeCity(city) {
    const keyAlt = `${language()}:${city.toLowerCase()}`;
    if (geoCache.has(keyAlt)) return geoCache.get(keyAlt);

    const { data } = await axios.get(OPEN_METEO_GEO_URL, {
        timeout: 15000,
        params: { name: city, count: 1, language: language() === 'pt_BR' ? 'pt' : 'en' }
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
    const [iconAlt, description] = weatherWmo(c.weather_code);
    const whereAlt = [local.name, local.admin1, local.country].filter(Boolean).join(', ');
    const temp = Math.round(c.temperature_2m);

    let textAlt = t('weather.now', {
        icon: iconAlt,
        place: whereAlt,
        desc: description,
        temp: measure(c.temperature_2m, '°C'),
        feels: measure(c.apparent_temperature, '°C'),
        max: measure(d.temperature_2m_max?.[0], '°C'),
        min: measure(d.temperature_2m_min?.[0], '°C'),
        humidity: measure(c.relative_humidity_2m, '%'),
        wind: measure(c.wind_speed_10m, ' km/h'),
        rain: measure(d.precipitation_probability_max?.[0], '%')
    });

    if (temp <= TIME_COLD) textAlt += '\n\n' + t('weather.freezing');
    if (temp >= TIME_CALOR) textAlt += '\n\n' + t('weather.hot');

    return textAlt;
}

// "2026-09-30" → "qua 30/09" (the date already comes in the city timezone: timezone=auto)
function dayLabel(iso) {
    const [, mes, day] = iso.split('-');
    const week = new Date(`${iso}T12:00:00Z`).toLocaleDateString(language() === 'pt_BR' ? 'pt-BR' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
    return `${week} ${day}/${mes}`;
}

// One line per day: icon, day, max/min, chance of rain and condition
function formatForecast({ daily: d }) {
    const linesAlt = d.time.map((iso, i) => {
        const [iconAlt, description] = weatherWmo(d.weather_code?.[i]);
        const when = i === 0 ? t('weather.today', { day: dayLabel(iso) }) : dayLabel(iso);
        return `${iconAlt} *${when}:* ${measure(d.temperature_2m_max?.[i], '°')}/${measure(d.temperature_2m_min?.[i], '°')}` +
               ` · ☔ ${measure(d.precipitation_probability_max?.[i], '%')} · ${description}`;
    });

    const title = d.time.length === 1 ? t('weather.forecastToday') : t('weather.forecastDays', { n: d.time.length });
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

async function cmdWeather({ msg, args }) {
    const request = readArgumentsTime(args);
    const max = getSetting('tempo.maxDays');

    if (request.dias !== null && (request.dias < 1 || request.dias > max)) {
        await msg.reply(t('weather.invalidDays', { n: request.dias, max, api: TIME_DAYS_API }));
        return;
    }

    // Without a city uses the tempo.city setting
    const city = request.cidade || getSetting('tempo.city');

    try {
        const local = await geocodeCity(city);

        if (!local) {
            await msg.reply(t('weather.cityNotFound', { city: city }));
            return;
        }

        const dataAlt = await queryTime(local, request.dias ?? 1);
        let textAlt = formatTime(local, dataAlt);
        if (request.dias) textAlt += `\n\n${formatForecast(dataAlt)}`;

        await msg.reply(textAlt);
    } catch (err) {
        printError('/weather:', err.response?.status ?? '', err.message);
        await msg.reply(t('weather.failed'));
    }
}

module.exports = {
    cmdWeather
};
