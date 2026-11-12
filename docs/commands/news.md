# `/news` (`/noticias`)

Gathers the most recent headlines from a category's RSS feeds, with source, date and link. Without a
category, it shows the help with all the options. It's a regular command, available to users allowed
through `/bot +u` or the `bot.users` setting.

| Option | Value | Description |
|---|---|---|
| `-hack`, `-hacknews` | | Hacking/security: The Hacker News, BleepingComputer and Krebs on Security (setting `news.hack`) |
| `-g1` | | Latest news from [g1](https://g1.globo.com/) (setting `news.g1`) |
| `-gazeta`, `-gaz` | | [Gazeta do Povo](https://www.gazetadopovo.com.br/), Brazil section (setting `news.gazeta`) |
| `-brasil`, `-br` | | Blogs about Brazil listed on [feedspot](https://rss.feedspot.com/brazil_rss_feeds/), mostly in English (setting `news.brasil`) |
| `quantidade` | 1–10 | How many headlines. Without it, uses the `news.max` setting (5) |

```text
/news                → help with all the options
/news -g1            → the 5 most recent from g1
/news -gazeta 3      → the 3 most recent from Gazeta do Povo
/news -br 5          → the 5 most recent from the blogs about Brazil
/news -hack 10       → the 10 most recent about hacking
/news -g1 -gazeta 6  → g1 and Gazeta together (3 from each, at most)
/news -h             → command help
```

Illustrative example of a reply:

```text
📰 g1

1. Manchete recebida do feed…
g1 · 30/09/2026, 00:29:33
https://g1.globo.com/...
```

## Changing the feeds

Each category reads the list from its setting (`news.<categoria>`), which accepts any RSS feed:

```text
/set news.g1 https://g1.globo.com/rss/g1/economia/
/set news.hack https://feeds.feedburner.com/TheHackersNews https://krebsonsecurity.com/feed/
/set -reset news.g1                → back to the default
/set news.max 3                    → changes the default count
```

Details:

- Several categories in the same command add up their feeds, under the title "📰 News".
- Each source takes at most its share of the list (e.g. 6 headlines from 2 feeds → up to 3 from
  each); otherwise the one that publishes the most takes everything.
- A feed that's down doesn't take the others down: it only shows up in the log.
- `-brasil` reads about 15 feeds at once; the feedspot page is HTML, so its feeds were copied into
  the `news.brasil` setting (it isn't read on every use).
- Feeds must be RSS (`<item>`); Atom-only feeds (`<entry>`) aren't read.
