# `/weather`

Current weather (condition, temperature, feels-like, humidity and wind), the day's high, low and
chance of rain, from [Open-Meteo](https://open-meteo.com/) (free, no API key). With a number of days,
it also shows the forecast for the next days.

| Argument | Description |
|---|---|
| `-quiet`, `-q` | Only a natural sentence, with no emoji or markdown (see [Quiet mode](#quiet-mode)) |
| `[N]` or `[Nd]` | N-day forecast, counting today (`16` or `16d`). From 1 up to the `weather.maxDays` setting (default 16, Open-Meteo's maximum). Only valid as the first argument |
| `[city]` | City to look up, optionally with a state or country after a comma. Without it, uses the `weather.city` setting |

```text
/weather                         → default city (weather.city)
/weather Rio de Janeiro          → Rio de Janeiro, RJ
/weather Paris, Texas            → Paris in the US (not the one in France)
/temp Lisboa                    → same, completed from the start of the name
/weather 7d Niteroi              → now + forecast for today and the next 6 days
/weather 16d Niteroi             → today and the next 15 days
/weather 3                       → default city, today and the next 2 days
/weather -q Niteroi              → only the sentence, to read or to speak
/weather -h                      → command help
```

Example reply:

```text
⛅ Niterói, Rio de Janeiro · Partly cloudy
🌡️ 24°C (feels like 25°C) · 📈 27° 📉 20°
💧 78%  🌬️ 12 km/h SE (gusts 28)
☔ 35% · 2.1 mm  ☀️ UV 8
🌅 05:12  🌇 17:40

_updated at 14:00 · source: Open-Meteo_
```

Every reply ends with the source of the data (the Open-Meteo license asks for the credit) and, when it
provides it, the time of the reading. The title takes the place and its state (the country only when there is no state) and the condition.
At night the clear sky is a 🌙. The wind has its direction, and the gusts only appear when they are 5 km/h or
more above the average. The rain volume (mm), the UV, the sunrise and sunset and the update time show up when
Open-Meteo provides them.

With days (`/weather 3d Niteroi`), after the current weather:

```text
📅 Next 3 days
🌦️ Today (Wed 30/09): 32°/22° · ☔ 29% · Rain showers
🌦️ Thu 01/10: 33°/22° · ☔ 92% · Drizzle
🌦️ Fri 02/10: 22°/20° · ☔ 100% · Rain showers
📊 Min 20° · Max 33° · rain likely on 2 days
```

The last line (from 2 days on) gives the range of the period and how many days have a 50% chance of rain
or more.

## Quiet mode

`-q` replaces the whole reply with **one natural sentence**, with no emoji, markdown, other sources or footer.
It is meant for a text, like `{/weather -q}` in the [`/tts`](tts.md#commands-in-the-text), and the forecast days
are ignored. It only says what matters:

- always: the city, the condition, the temperature, and the high and low;
- the feels-like only when it differs from the temperature by 2° or more;
- the rain only from a 30% chance (and its volume, when it is 1 mm or more);
- the wind only with gusts of 40 km/h or more, and the UV only from 8.

```text
/weather -q Niteroi
In Niterói, partly cloudy, 28 degrees, feels like 34. High of 32 and low of 23. Chance of rain of 100%, about 12 millimeters. Wind with gusts of 45 km/h. Very high UV.

/tts Good morning! {/weather -q}
```

Above the maximum the bot refuses and states the limit. To limit queries, use
`/set weather.maxDays 7`; `/set -reset weather.maxDays` sets the limit back to 16 days. A saved limit
keeps applying after a restart. Without N, the reply has only today's weather. Days follow the
timezone of the city being queried. With `1`, the forecast block is titled "Today's forecast".
At 5°C or below the reply ends with "🥶 It is freezing!", and at 30°C or above with "🔥 It is
hot!". The condition texts and the place names follow the `zapbot.lang` setting.

## Other sources

Besides Open-Meteo (the main source, always used), the reply for the current weather can bring the reading of
other sources, to cross-check:

```text
🔎 Other sources
• MET Norway: 25°C · 💧 80% · 🌬️ 14 km/h SE
• CPTEC/INPE: 📈 26° 📉 22° · Rain
⚠️ The sources differ by 5°C            ← only when the difference is 3°C or more
```

| Source | What it gives | Coverage |
|---|---|---|
| `met` | [MET Norway](https://api.met.no/): temperature, humidity and wind now | Worldwide, no key |
| `cptec` | CPTEC/INPE (through [BrasilAPI](https://brasilapi.com.br/)): today's min/max and condition | Brazilian cities, no key |

The `weather.sources` setting chooses them (`/set weather.sources met`; empty keeps only Open-Meteo). A
source that is down or does not cover the place just does not show up, and the footer lists only the ones that
answered. The CPTEC is only asked for Brazilian cities, and the city is matched by name **and** state: it never
guesses another one. MET Norway asks for a User-Agent that identifies the client with a contact: set it in
`weather.userAgent` (for example `/set weather.userAgent mybot/1.0 me@example.com`).

## Changing the default city

The city `/weather` uses with no argument lives in the `weather.city` setting (default
`Niteroi, Rio de Janeiro, Brazil`). To change it, send on WhatsApp (`/set` accepts the owner and
extra admins):

```text
/set weather.city São Paulo, Brazil
/set weather.city                  → shows the current value
/set -r weather.city           → goes back to Niteroi, Rio de Janeiro, Brazil
```

The change takes effect immediately, without a restart. Tips:

- Use `city, state` or `city, country` when the name repeats elsewhere: just `Niteroi` also works,
  but the search picks the most relevant one with that name (usually the most populous).
- Accents are optional (`Niteroi` or `Niterói`) and the country can be in Portuguese or English.
- If the city isn't found the bot replies `❌ City not found`; test first with
  `/weather <city>` and only then save it to `weather.city`.
