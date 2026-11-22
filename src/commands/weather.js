/*
 * Comando /weather.
 */

const axios = require('axios');

const { printError } = require('../log');
const { language, t } = require('../i18n');
const { getSetting } = require('../settings');
const { querySources } = require('../weatherSources');

// /weather [N|Nd] [city]: Open-Meteo (no API key); with N, the forecast for the next N days
const WEATHER_WMO = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌦️', 56: '🌧️', 57: '🌧️',
    61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '❄️', 77: '🌨️',
    80: '🌦️', 81: '🌧️', 82: '⛈️', 85: '🌨️', 86: '❄️',
    95: '⛈️', 96: '⛈️', 99: '⛈️'
};

// At night, a clear or almost clear sky is not a sun
const WEATHER_NIGHT = { 0: '🌙', 1: '🌙', 2: '☁️' };

// [icon, description] from the WMO code, in the current language (daytime, unless `day` is false)
function weatherWmo(codeAlt, day = true) {
    return codeAlt in WEATHER_WMO
        ? [day === false && codeAlt in WEATHER_NIGHT ? WEATHER_NIGHT[codeAlt] : WEATHER_WMO[codeAlt], t(`weather.wmo.${codeAlt}`)]
        : ['🌡️', t('weather.code', { code: codeAlt })];
}

const OPEN_METEO_GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const TIME_COLD = 5;   // °C: "It's freezing!"
const TIME_HOT = 30; // °C: "So hot!"
const DIVERGENCE = 3; // °C: from there /weather warns that the sources diverge
const RAIN_LIKELY = 50; // %: the day counts toward the "rainy days" in the summary
const QUIET_FEELS = 2;  // °C: -quiet only says the feels-like when it differs this much from the temperature
const QUIET_RAIN = 30;  // %: -quiet only mentions the rain from this chance
const QUIET_GUSTS = 40; // km/h: -quiet only mentions the wind from these gusts
const QUIET_UV = 8;     // -quiet only mentions the UV from this index

// Geocoding kept in memory: a city's coordinates do not change and the city
// default (weather.city) is queried all the time
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

// Open-Meteo's limit for forecast_days (the weather.maxDays setting does not go past it)
const TIME_DAYS_API = 16;

async function queryTime({ latitude, longitude }, daysAlt = 1) {
    const { data } = await axios.get(OPEN_METEO_URL, {
        timeout: 15000,
        params: {
            latitude,
            longitude,
            current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset',
            forecast_days: daysAlt,
            timezone: 'auto'
        }
    });

    // An answer without the current weather (Open-Meteo answers {error, reason} with a 200 sometimes) is a failure
    if (!data?.current) throw new Error(`Open-Meteo answered without the weather${data?.reason ? `: ${data.reason}` : ''}`);
    return data;
}

// Missing value (Open-Meteo sometimes sends null) becomes '-'
const measure = (valueAlt, unit) => valueAlt == null ? '-' : `${Math.round(valueAlt)}${unit}`;

// The wind direction (degrees it comes from) on the compass rose, in the current language
const ROSA = { pt_BR: ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'], en_US: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] };
const windDirection = (degrees) => (degrees == null ? '' : ROSA[language()][Math.round(degrees / 45) % 8]);

// "2026-10-01T05:12" (already in the city timezone) → "05:12"
const hourAlt = (iso) => (iso ? String(iso).slice(11, 16) : '');

// Number with 1 decimal in the language format ("2,1" / "2.1")
const decimal = (n) => Number(n).toLocaleString(language() === 'pt_BR' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 1 });

// "Other sources": what each one read, and the warning when their temperature differs from the main one
function sourcesBlock(c, extras) {
    if (!extras.length) return '';

    const linesAlt = extras.map((e) => {
        if (e.type === 'dia') return t('weather.srcDay', { name: e.source, max: measure(e.max, '°'), min: measure(e.min, '°'), desc: e.description ?? '' });
        const dir = windDirection(e.direction);
        return t('weather.srcNow', {
            name: e.source, temp: measure(e.temp, '°C'), humidity: measure(e.humidity, '%'),
            wind: measure(e.wind, ' km/h') + (dir ? ` ${dir}` : '')
        });
    });

    // Compares the temperature now; CPTEC gives the day's range, so the current one has to fit in it
    const differences = extras.flatMap((e) => {
        if (c.temperature_2m == null) return [];
        if (e.type === 'agora' && e.temp != null) return [Math.abs(e.temp - c.temperature_2m)];
        if (e.type === 'dia' && e.max != null && e.min != null) {
            return [Math.max(0, e.min - c.temperature_2m, c.temperature_2m - e.max)];
        }
        return [];
    });
    const greater = Math.max(0, ...differences);
    const notice = greater >= DIVERGENCE ? `\n${t('weather.diverge', { diff: Math.round(greater) })}` : '';

    return `\n\n${t('weather.others')}\n${linesAlt.join('\n')}${notice}`;
}

function formatTime(local, { current: c, daily: d }, extras = []) {
    const [iconAlt, description] = weatherWmo(c.weather_code, c.is_day !== 0);
    // City and state; the country only when there is no state
    const whereAlt = [local.name, local.admin1 || local.country].filter(Boolean).join(', ');
    const temp = Math.round(c.temperature_2m);

    const linesAlt = [
        t('weather.title', { icon: iconAlt, place: whereAlt, desc: description }),
        t('weather.temp', {
            temp: measure(c.temperature_2m, '°C'),
            feels: measure(c.apparent_temperature, '°C'),
            max: measure(d.temperature_2m_max?.[0], '°'),
            min: measure(d.temperature_2m_min?.[0], '°')
        })
    ];

    // Wind: speed, direction and, if the gusts go well past the average, they
    const burst = c.wind_gusts_10m != null && c.wind_gusts_10m >= (c.wind_speed_10m ?? 0) + 5
        ? t('weather.gusts', { gust: measure(c.wind_gusts_10m, '') }) : '';
    const dir = windDirection(c.wind_direction_10m);
    linesAlt.push(t('weather.air', {
        humidity: measure(c.relative_humidity_2m, '%'),
        wind: measure(c.wind_speed_10m, ' km/h') + (dir ? ` ${dir}` : '') + burst
    }));

    // Rain (chance and, if any, the day's volume) and UV
    const mm = d.precipitation_sum?.[0];
    const uv = d.uv_index_max?.[0];
    linesAlt.push(t('weather.rain', {
        rain: measure(d.precipitation_probability_max?.[0], '%'),
        mm: mm > 0 ? ` · ${decimal(mm)} mm` : '',
        uv: uv != null ? `  ☀️ UV ${Math.round(uv)}` : ''
    }));

    const rises = hourAlt(d.sunrise?.[0]);
    const puts = hourAlt(d.sunset?.[0]);
    if (rises && puts) linesAlt.push(t('weather.sun', { rise: rises, set: puts }));

    let textAlt = linesAlt.join('\n') + sourcesBlock(c, extras);
    if (temp <= TIME_COLD) textAlt += '\n\n' + t('weather.freezing');
    if (temp >= TIME_HOT) textAlt += '\n\n' + t('weather.hot');

    // The data sources (Open-Meteo asks for attribution) and the reading time
    const hour = hourAlt(c.time);
    const sourcesAlt = ['Open-Meteo', ...extras.map(e => e.source)].join(', ');
    textAlt += '\n\n' + (hour ? t('weather.updated', { time: hour, source: sourcesAlt }) : t('weather.source', { source: sourcesAlt }));

    return textAlt;
}

/*
 * -quiet: the weather as a natural sentence, with no emoji or markdown (good for {/weather -q} in /tts):
 *   "Em Niterói, parcialmente nublado, 28 graus, com sensação de 34. Máxima de 32 e mínima de 23.
 *    Chance de chuva de 100%, cerca de 12 milímetros. Vento com rajadas de 45 km/h. UV muito alto."
 * Only what matters: the feels-like when it differs, the rain from QUIET_RAIN %, the gusts and the UV when strong.
 */
function quietTime(local, { current: c, daily: d }) {
    const [, description] = weatherWmo(c.weather_code, c.is_day !== 0);
    const temp = Math.round(c.temperature_2m);
    const feels = c.apparent_temperature == null ? null : Math.round(c.apparent_temperature);
    const parts = [];

    const degrees = (n) => t('weather.quietDegrees', { n: Math.abs(n), value: n });
    let first = t('weather.quietNow', { place: local.name, desc: description.toLowerCase(), temp: degrees(temp) });
    if (feels !== null && Math.abs(feels - temp) >= QUIET_FEELS) first += t('weather.quietFeels', { feels });
    parts.push(`${first}.`);

    const max = d.temperature_2m_max?.[0];
    const min = d.temperature_2m_min?.[0];
    if (max != null && min != null) parts.push(t('weather.quietRange', { max: Math.round(max), min: Math.round(min) }));

    const chance = d.precipitation_probability_max?.[0];
    if (chance != null && chance >= QUIET_RAIN) {
        const mm = Math.round(d.precipitation_sum?.[0] ?? 0);
        parts.push(t('weather.quietRain', { chance: Math.round(chance) }) + (mm >= 1 ? t('weather.quietMm', { n: mm }) : '') + '.');
    }

    if (c.wind_gusts_10m != null && c.wind_gusts_10m >= QUIET_GUSTS) parts.push(t('weather.quietGusts', { gust: Math.round(c.wind_gusts_10m) }));
    if (d.uv_index_max?.[0] != null && d.uv_index_max[0] >= QUIET_UV) parts.push(t('weather.quietUv'));

    return parts.join(' ');
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

    // Several days: the week's range and how many have likely rain
    let summary = '';
    const maxAlt = (d.temperature_2m_max ?? []).filter(v => v != null);
    const min = (d.temperature_2m_min ?? []).filter(v => v != null);
    if (d.time.length > 1 && maxAlt.length && min.length) {
        const rainy = (d.precipitation_probability_max ?? []).filter(v => v >= RAIN_LIKELY).length;
        summary = '\n' + t('weather.summary', {
            min: Math.round(Math.min(...min)), max: Math.round(Math.max(...maxAlt)), n: rainy
        });
    }
    return `📅 *${title}*\n${linesAlt.join('\n')}${summary}`;
}

/**
 * "7d Niteroi" → { days: 7, city: 'Niteroi' }; "Niteroi" → { days: null, city: 'Niteroi' }.
 * The days (N or Nd) only count as the first argument.
 */
function readArgumentsTime(args) {
    const m = args.trim().match(/^(\d+)d?(?:\s+|$)([\s\S]*)$/i);
    return m ? { days: Number(m[1]), city: m[2].trim() } : { days: null, city: args.trim() };
}

async function cmdWeather({ msg, opts }) {
    const request = readArgumentsTime(opts.argv.join(' '));
    const max = getSetting('weather.maxDays');

    if (request.days !== null && (request.days < 1 || request.days > max)) {
        await msg.reply(t('weather.invalidDays', { n: request.days, max, api: TIME_DAYS_API }));
        return;
    }

    // Without a city uses the weather.city setting
    const city = request.city || getSetting('weather.city');

    try {
        const local = await geocodeCity(city);

        if (!local) {
            await msg.reply(t('weather.cityNotFound', { city: city }));
            return;
        }

        // The extra sources go in parallel with Open-Meteo; today, in the city, picks the CPTEC day
        const query = queryTime(local, request.days ?? 1);
        // -quiet: only the sentence (it does not even look at the other sources, nor at the days)
        if (opts.opt.quiet) {
            await msg.reply(quietTime(local, await query));
            return;
        }
        // (a rejected query is handled by the await below; this derived promise must not become an unhandled rejection)
        const today = query.then(d => String(d.current?.time ?? d.daily?.time?.[0] ?? '').slice(0, 10));
        today.catch(() => {});

        const [dataAlt, extras] = await Promise.all([query, querySources(local, today)]);
        let textAlt = formatTime(local, dataAlt, extras);
        if (request.days) textAlt += `\n\n${formatForecast(dataAlt)}`;

        await msg.reply(textAlt);
    } catch (err) {
        printError('/weather:', err.response?.status ?? '', err.message);
        await msg.reply(t('weather.failed'));
    }
}

module.exports = {
    cmdWeather
};
