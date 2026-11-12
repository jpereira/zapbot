# `/weather` (`/tempo`)

Current weather (condition, temperature, feels-like, humidity and wind), the day's high, low and
chance of rain, from [Open-Meteo](https://open-meteo.com/) (free, no API key). With a number of days,
it also shows the forecast for the next days.

| Argument | Description |
|---|---|
| `[N]` or `[Nd]` | N-day forecast, counting today (`16` or `16d`). From 1 up to the `tempo.maxDays` setting (default 16, Open-Meteo's maximum). Only valid as the first argument |
| `[cidade]` | City to look up, optionally with a state or country after a comma. Without it, uses the `tempo.city` setting |

```text
/weather                         → default city (tempo.city)
/weather Rio de Janeiro          → Rio de Janeiro, RJ
/weather Paris, Texas            → Paris in the US (not the one in France)
/tempo Lisboa                  → the same, through the alias
/temp Lisboa                    → same, completed from the start of the name
/weather 7d Niteroi              → now + forecast for today and the next 6 days
/weather 16d Niteroi             → today and the next 15 days
/weather 3                       → default city, today and the next 2 days
/weather -h                      → command help
```

Example reply:

```text
⛅ Tempo em Niterói, Rio de Janeiro, Brasil

Parcialmente nublado
🌡️ Agora: 24°C (sensação 25°C)
📈 Máx: 27°C  📉 Mín: 20°C
💧 Umidade: 78%  🌬️ Vento: 12 km/h
☔ Chance de chuva: 35%
```

With days (`/weather 3d Niteroi`), after the current weather:

```text
📅 Próximos 3 dias
🌦️ Hoje (qua 30/09): 32°/22° · ☔ 29% · Pancadas de chuva
🌦️ qui 01/10: 33°/22° · ☔ 92% · Garoa
🌦️ sex 02/10: 22°/20° · ☔ 100% · Pancadas de chuva
```

Above the maximum the bot refuses and states the limit. To limit queries, use
`/set tempo.maxDays 7`; `/set -reset tempo.maxDays` sets the limit back to 16 days. A saved limit
keeps applying after a restart. Without N, the reply has only today's weather. Days follow the
timezone of the city being queried. With `1`, the forecast block is titled "Previsão de hoje".
At 5°C or below the reply ends with "🥶 Tá congelando!", and at 30°C or above with "🔥 Que calor
da porra!".

## Changing the default city

The city `/weather` uses with no argument lives in the `tempo.city` setting (default
`Niteroi, Rio de Janeiro, Brazil`). To change it, send on WhatsApp (`/set` accepts the owner and
extra admins):

```text
/set tempo.city São Paulo, Brazil
/set tempo.city                  → shows the current value
/set -reset tempo.city           → goes back to Niteroi, Rio de Janeiro, Brazil
```

The change takes effect immediately, without a restart. Tips:

- Use `city, state` or `city, country` when the name repeats elsewhere: just `Niteroi` also works,
  but the search picks the most relevant one with that name (usually the most populous).
- Accents are optional (`Niteroi` or `Niterói`) and the country can be in Portuguese or English.
- If the city isn't found the bot replies `❌ Cidade não encontrada`; test first with
  `/weather <cidade>` and only then save it to `tempo.city`.
