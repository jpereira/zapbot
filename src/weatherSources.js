/*
 * Other /weather sources, besides Open-Meteo (the main one), to check the weather now:
 * met   → MET Norway (Locationforecast, global, no key; asks for a User-Agent that identifies the client)
 * cptec → CPTEC/INPE, Brazil's official forecast, through BrasilAPI (no key; Brazilian cities only)
 * Each source that fails or does not cover the place simply does not appear (/weather carries on with Open-Meteo).
 * Which ones enter comes from the weather.sources setting.
 */

const axios = require('axios');

const { printInfo } = require('./log');
const { withoutAccents } = require('./util/format');
const { getSetting } = require('./settings');

const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const BRASILAPI_CPTEC = 'https://brasilapi.com.br/api/cptec/v1';
const TIMEOUT_MS = 8000;

// The state (Open-Meteo's admin1) → the UF CPTEC uses
const UF = {
    Acre: 'AC', Alagoas: 'AL', Amapá: 'AP', Amazonas: 'AM', Bahia: 'BA', Ceará: 'CE', 'Distrito Federal': 'DF',
    'Espírito Santo': 'ES', Goiás: 'GO', Maranhão: 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
    'Minas Gerais': 'MG', Pará: 'PA', Paraíba: 'PB', Paraná: 'PR', Pernambuco: 'PE', Piauí: 'PI',
    'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', Rondônia: 'RO',
    Roraima: 'RR', 'Santa Catarina': 'SC', 'São Paulo': 'SP', Sergipe: 'SE', Tocantins: 'TO'
};

const SOURCES = ['met', 'cptec'];

async function queryMet({ latitude, longitude }) {
    const { data } = await axios.get(MET_URL, {
        timeout: TIMEOUT_MS,
        params: { lat: Number(latitude).toFixed(4), lon: Number(longitude).toFixed(4) },
    });
    const d = data?.properties?.timeseries?.[0]?.data?.instant?.details;
    if (d?.air_temperature == null) return null;

    return {
        source: 'MET Norway',
        type: 'agora',
        temp: d.air_temperature,
        humidity: d.relative_humidity,
        wind: d.wind_speed == null ? null : d.wind_speed * 3.6, // m/s → km/h
        direction: d.wind_from_direction
    };
}

// The CPTEC id per city and UF (does not change)
const citiesCptec = new Map();

async function queryCptec(local, today) {
    const uf = UF[local.admin1];
    if (local.country_code !== 'BR' || !uf) return null;

    const keyAlt = `${withoutAccents(local.name).toLowerCase()}|${uf}`;
    if (!citiesCptec.has(keyAlt)) {
        const { data } = await axios.get(`${BRASILAPI_CPTEC}/cidade/${encodeURIComponent(local.name)}`, { timeout: TIMEOUT_MS });
        const city = (Array.isArray(data) ? data : []).find(c => c.state === uf && withoutAccents(c.name).toLowerCase() === withoutAccents(local.name).toLowerCase());
        if (!city) return null; // never guesses another city
        citiesCptec.set(keyAlt, city.id);
    }

    const { data } = await axios.get(`${BRASILAPI_CPTEC}/clima/previsao/${citiesCptec.get(keyAlt)}/1`, { timeout: TIMEOUT_MS });
    const todayDate = await today;
    const day = data?.clima?.find(c => c.data === todayDate);
    if (!day) return null;

    return { source: 'CPTEC/INPE', type: 'dia', min: day.min, max: day.max, description: day.condition_desc };
}

/**
 * The readings from the extra sources turned on in the setting, in parallel; those that fail or do not cover the place drop out.
 * @param {object} local  the Open-Meteo geocoding result
 * @param {string|Promise<string>} hoje  today's date in the city (YYYY-MM-DD), to pick the forecast day
 * @returns {Promise<object[]>}
 */
async function querySources(local, today) {
    const on = getSetting('weather.sources').filter(f => SOURCES.includes(f));
    const queries = on.map(f => (f === 'met' ? queryMet(local) : queryCptec(local, today)));

    const results = await Promise.allSettled(queries);
    return results.flatMap((r, i) => {
        if (r.status === 'rejected') {
            printInfo(`/weather: the source ${on[i]} did not respond:`, r.reason?.message ?? r.reason);
            return [];
        }
        return r.value ? [r.value] : [];
    });
}

module.exports = { SOURCES, querySources };
