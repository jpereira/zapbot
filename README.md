# 🤖 ZapBot v2.0.13 (devel)

<p align="center">
  <img src="docs/assets/logo.png" alt="ZapBot logo: an angel robot with a halo and wings, winking and
  giving a thumbs up in a green chat bubble, with a little demon face peeking from the side" width="320">
</p>

[![Tests](https://github.com/jpereira/zapbot/actions/workflows/ci.yml/badge.svg)](https://github.com/jpereira/zapbot/actions/workflows/ci.yml)

> 🇧🇷 **Leia em português (pt_BR): [README.pt-BR.md](README.pt-BR.md).**
>
> The documentation (`docs/` and the website) is available in English and in Brazilian Portuguese, with
> a language selector on the site. The bot itself speaks English by default; `/set zapbot.lang pt_BR` switches its help, replies,
> alerts, and errors to Brazilian Portuguese.

A WhatsApp bot written in Node.js that runs on top of a real WhatsApp Web session. It recovers
deleted and edited messages (and statuses), downloads videos from social networks, creates stickers,
watches messages by text/regex and notifies you in private, brings news, weather and CVEs, talks to
ChatGPT and a few more fun things, all through commands typed in the chat itself (`/help`, `/get`,
`/show`, `/news`, `/gpt`...).

Persistent aliases store commands with arguments and an optional description: register one with
`/alias dimdim -desc "Shows the dollar price" /rates USD`, run `/dimdim` and check `/help alias`.
The bot shows the command that was called before the result. An alias can also chain several commands
in one text, as in `/cron`: `/alias carteira Orca {/defi orca}\n Prjx {/defi prjx}`.

The idea comes from the old IRC days: ZapBot is inspired by the old
[eggdrops](https://www.eggheads.org/), the bots that stood watch in the channels, answering
commands, keeping track of what happened and taking care of the place. Here the channel is the
WhatsApp group, and commands start with `/`.

## Demo

<p align="center">
  <a href="docs/assets/demo/01-aquecimento.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/01-aquecimento.gif" alt="/ping, /version and /help answering" title="01-aquecimento.gif" width="220"></a>
  <a href="docs/assets/demo/02-show.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/02-show.gif" alt="/show redisplaying deleted messages" title="02-show.gif" width="220"></a>
  <a href="docs/assets/demo/03-monitor.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/03-monitor.gif" alt="/monitor alerting when a contact comes online" title="03-monitor.gif" width="220"></a>
  <a href="docs/assets/demo/05-sticker.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/05-sticker.gif" alt="/sticker -txt creating text stickers" title="05-sticker.gif" width="220"></a>
  <a href="docs/assets/demo/07-crypto.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/07-crypto.gif" alt="/crypto showing cryptocurrency prices" title="07-crypto.gif" width="220"></a>
  <a href="docs/assets/demo/10-watch.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/10-watch.gif" alt="/watch alerting when a message matches a rule" title="10-watch.gif" width="220"></a>
</p>

`/ping`, `/show`, `/monitor`, `/sticker -txt`, `/crypto` and `/watch`. All the scenes are in
[Demo](docs/demonstracao.md).

**Main features:**

- Recovers deleted or edited messages and statuses, and removed reactions: [`/show`](docs/comandos/show.md)
- 👀 Monitors up to 5 contacts, with a configurable interval, a limited history of the observed
  last-seen times and online alerts: [`/monitor`](docs/comandos/monitor.md)
- Downloads videos with yt-dlp and ffmpeg: [`/get`](docs/comandos/get.md)
- Creates stickers: [`/sticker`](docs/comandos/sticker.md)
- Watches messages by text or regex: [`/watch`](docs/comandos/watch.md)
- Schedules messages: [`/cron`](docs/comandos/cron.md)
- Keeps notes, with `#tag`, media (image, document, audio, video) and a reminder at a date/time:
  [`/notes`](docs/comandos/notes.md)
- Runs several commands from a single message: [`/batch`](docs/comandos/batch.md)
- Shows exchange rates and price alerts: [`/rates`](docs/comandos/rates.md),
  [`/crypto`](docs/comandos/crypto.md)
- Tracks DeFi positions (Orca, Project X, Liquidswap, Morpho, Aave V3): [`/defi`](docs/comandos/defi.md)
- Integrates ChatGPT: [`/gpt`](docs/comandos/gpt.md), [`/tldr`](docs/comandos/tldr.md),
  [`/draw`](docs/comandos/draw.md) (images and GIFs)
- Looks up CVEs, news and the weather: [`/cve`](docs/comandos/cve.md), [`/news`](docs/comandos/news.md),
  [`/weather`](docs/comandos/weather.md)
- Backs up the database: [`/backup`](docs/comandos/backup.md)
- Controls permissions per user and group, with flood protection: [`/bot`](docs/comandos/bot.md)

📖 **Full documentation: [jpereira.github.io/zapbot](https://jpereira.github.io/zapbot/)** (from the
latest release; the `main` one is in [`docs/`](docs/index.md)).

## How it works

```text
 ┌────────────── zapbot container (node:24-trixie-slim) ──────────────┐
 │                                                                    │
 │  app.js ──► whatsapp-web.js ──► Puppeteer ──► Chromium             │──► WhatsApp Web
 │    │                                          (headless)           │
 │    ├──► SQLite  (cache/zapbot.db)  messages, settings              │
 │    ├──► cache/media  media to recover deleted messages             │
 │    ├──► yt-dlp + ffmpeg  /get command                              │
 │    ├──► HTTP APIs (axios)  /gpt /weather /cve /news /giphy ...     │
 │    └──► SMTP (nodemailer)  QR Code and e-mail alerts               │
 │                                                                    │
 │ volumes:  wwebjs_auth  → WhatsApp session (.wwebjs_auth)           │
 │           app_cache    → SQLite database + media (cache/)          │
 └────────────────────────────────────────────────────────────────────┘
```

The bot acts as your own account (a *linked device*), stores the messages in a SQLite database and
reacts to commands typed in any chat. Details in
[How it works](https://jpereira.github.io/zapbot/#how-it-works).

## Installation

All you need is Docker with Compose v2, Git and a phone with WhatsApp. The stable version is the
latest release, currently `v2.0.12`:

```bash
git clone https://github.com/jpereira/zapbot.git
cd zapbot
git checkout v2.0.12

cp config/.env.example config/.env   # fill in PHONE_NUMBER and the e-mail (see below)

docker compose -f docker/docker-compose.yml build zapbot
docker compose -f docker/docker-compose.yml up -d zapbot
docker logs -f zapbot
```

On the first boot (or when the session expires), WhatsApp asks you to scan a QR Code in **WhatsApp
› Linked devices › Link a device**. Without e-mail, it is drawn in the logs
(`docker logs -f zapbot`).

### QR Code by e-mail (recommended)

We recommend receiving the QR Code by e-mail, especially on a server: it lands in your inbox, you
open it on the computer and scan it with the phone, without having to log in to the server to see
the logs. The same e-mail brings the bot's outage, reconnection and crash alerts. In `config/.env`:

```bash
QRCODE_EMAIL_ENABLE="true"
QRCODE_EMAIL_SMTP_HOST="smtp.gmail.com"                # your provider's SMTP server
QRCODE_EMAIL_SMTP_PORT="465"                           # SSL (port 587 does not work)
QRCODE_EMAIL_SMTP_USER="myaccount@gmail.com"           # the sending account
QRCODE_EMAIL_SMTP_PASS="abcd efgh ijkl mnop"           # app password, not the account's
QRCODE_EMAIL_SMTP_FROM="ZapBot <myaccount@gmail.com>"  # the same address as the account
QRCODE_EMAIL_SMTP_TO="You <you@example.com>"           # who receives the QR Code
QRCODE_EMAIL_SMTP_ANTIPHISHING="AnyPhraseOfYours"      # goes in every e-mail from the bot
```

- **Host, user and password** are those of the SMTP of whoever **sends** (Gmail, Yahoo, other
  providers with SMTP over SSL). Use the SMTP credential your provider requires; on accounts with
  an app password, set that password.
- **`QRCODE_EMAIL_SMTP_TO`** is the e-mail that will **receive** the QR Code (and the alerts). It
  can be the same as the sending account.
- WhatsApp renews the QR from time to time: each one arrives in a numbered e-mail (`#1`, `#2`...),
  and only the most recent one is valid.
- `config/.env` stays out of git (it is in `.gitignore`): the password does not go to the
  repository. Change the anti-phishing code to a phrase of your own: with it, you know the e-mail
  really came from your bot.

If something goes wrong, go back to `QRCODE_EMAIL_ENABLE="false"` and read the QR from the logs.
The details (providers, common errors) are in
[Configuration](https://jpereira.github.io/zapbot/configuracao/#email-qr-code-and-alerts) and in
[E-mails](https://jpereira.github.io/zapbot/emails/).

### Updating

To update, use `git fetch --tags`, the same `git checkout` (with the new release) and the build
again. The step by step (including the development version, `main`) is in
[Installation](https://jpereira.github.io/zapbot/instalacao/); the `config/.env` variables are in
[Configuration](https://jpereira.github.io/zapbot/configuracao/).

## Commands

Type them in the chat itself. `/help` lists the commands you can use (`/help -r` groups them by
role); `/<command> -h` shows the help of one. The person typing and each command have a level:
**owner > admin > user**. The **Role** column tells the minimum needed to use each command:

- `owner`: you, the account paired with the bot. Only you change who has access (`/bot +a`, `+u`,
  `+cmd`).
- `admin`: the extra admins (`/bot +a <person>`) and you. An `admin` command marked as
  **delegable** can be released by the owner to a user or a group. E.g.: `/bot +u +cmd /gpt`, typed
  in the group, releases only `/gpt` there. Whoever receives it sees only the current chat and
  changes nothing (switching the `/gpt` model, deleting statistics...).
- `user`: whoever is in `bot.users` (`/bot +u <person|group>`, or everyone with
  `/set bot.users true`). By default, only you use commands.

`/whois` tells you your level
([Permissions](https://jpereira.github.io/zapbot/comandos/#permissions-role)).

| Command | Aliases | Role | Description |
|---|---|:-:|---|
| [`/alias`](https://jpereira.github.io/zapbot/comandos/alias/) | | `admin` | Registers, lists and removes shortcuts for commands with arguments, or texts with several `{/command}` |
| [`/ascii`](https://jpereira.github.io/zapbot/comandos/ascii/) | | `user` | The text in big ASCII letters, in a block that fits on the phone screen |
| [`/backup`](https://jpereira.github.io/zapbot/comandos/backup/) | `/bkp` | `admin` | Daily local backup and sending through `backup.to`; lists, details, restores, sends and deletes the database |
| [`/batch`](https://jpereira.github.io/zapbot/comandos/batch/) |  | `admin` | Runs several commands from a single message, in sequence (each line that starts with a command opens a block), and replies with a summary; `-stop` and `-dry` |
| [`/bills`](https://jpereira.github.io/zapbot/comandos/bills/) | `/boletos` | `user` | Draws 2 members to "pay a bill" |
| [`/block`](https://jpereira.github.io/zapbot/comandos/block/) | `/bloquear` | `admin` | Blocks one or several people on your WhatsApp account (replying to a message, whoever wrote it); with nothing, lists the blocked ones; `-mask` hides phone numbers |
| [`/bot`](https://jpereira.github.io/zapbot/comandos/bot/) | | `admin` | Bot status (24 h report and the users); turns the commands on/off (`-on`/`-off`) and says who uses them: admins (`+a`/`-a`) and users (`+u`/`-u`, in any chat or only in one group, and each one's commands with `+cmd`/`-cmd`); `-reset` goes back to the default; `-status` (`-s`): report of the last 24 h, and `-s 06h` sends it every day; `-info` (`-i`): versions and system; `-test` (`-t`): tests cache, disk, database, WhatsApp, internet, SMTP, IMAP and programs; `-flush-email [true]`: counts and clears the messages in Sent and Trash; `-passwd <password\|off>` (owner) and `-login <password>`: an outsider becomes admin with the password |
| [`/cache`](https://jpereira.github.io/zapbot/comandos/cache/) | | `admin` | Cache tree with sizes, message counts and cleanup |
| [`/cron`](https://jpereira.github.io/zapbot/comandos/cron/) | `/agenda`, `/lembrete` | `admin` | At the scheduled time (`30m`, `às 18h`, `sexta 9h`...): sends a message (here or with `-to`, to one or several chats) or, as `/lembrete`, a ⏰ reminder; can repeat, be edited and paused, and run commands in the text (`{/crypto}`) |
| [`/crypto`](https://jpereira.github.io/zapbot/comandos/crypto/) | `/bitcoio`, `/creptomoeda` | `user` | Prices of the enabled cryptos (default: BTC, ETH, SOL and HYPE) or only the requested ones (`BTC ETH`); price alerts |
| [`/cve`](https://jpereira.github.io/zapbot/comandos/cve/) | | `user` | Latest published CVEs (NVD); `-highscore` only the critical ones |
| [`/debug`](https://jpereira.github.io/zapbot/comandos/debug/) | `/d`, `/dbg` | `admin` | Debug logs with levels, filter and copy to chats |
| [`/defi`](https://jpereira.github.io/zapbot/comandos/defi/) | | `admin` | Orca and Project X liquidity positions: balance, range, price and fees to collect, read on-chain; `-alerta` warns when a position leaves and re-enters its range and when fees pass a value. `liquidswap`: LP positions on Aptos. `morpho` and `aave`: position, loans and risk on Morpho and Aave V3 |
| [`/demote`](https://jpereira.github.io/zapbot/comandos/demote/) | | `admin` · delegable | Removes someone's group admin |
| [`/draw`](https://jpereira.github.io/zapbot/comandos/draw/) | `/desenhe`, `/desenha`, `/img` | `admin` · delegable | Draws an image or an animated GIF (`-gif`) with GPT Image (OpenAI); on a photo, edits or animates it |
| [`/everybody`](https://jpereira.github.io/zapbot/comandos/everybody/) | `/todos`, `/todes` | `admin` · delegable | Mentions everyone in the group |
| [`/get`](https://jpereira.github.io/zapbot/comandos/get/) | `/download` | `user` | Downloads video/audio from social networks or from the replied media |
| [`/giphy`](https://jpereira.github.io/zapbot/comandos/giphy/) | `/gif` | `user` | A GIPHY GIF by tag, URL or ID, sent looping |
| [`/goodbye`](https://jpereira.github.io/zapbot/comandos/goodbye/) | | `admin` · delegable | Message when someone leaves the group (per group; `{name}`, `{group}`) |
| [`/gpt`](https://jpereira.github.io/zapbot/comandos/gpt/) | `/ai` | `admin` · delegable | Asks ChatGPT (OpenAI); `-img`, `-gif`, `-voz`, `-prices`, `-usage` and `-status` (bytes, tokens, cost and balance) |
| [`/help`](https://jpereira.github.io/zapbot/comandos/help/) | `/h` | `user` | Help menu, with only the commands the requester can use |
| [`/invite`](https://jpereira.github.io/zapbot/comandos/invite/) | | `admin` | The group invite link (`-revoke` makes a new one) |
| [`/join`](https://jpereira.github.io/zapbot/comandos/join/) |  | `admin` | Joins a group through the invite link (`-info` shows the group without joining); `-l` lists your groups |
| [`/joke`](https://jpereira.github.io/zapbot/comandos/joke/) | `/piada`, `/humor` | `user` | A random joke in Portuguese |
| [`/kernel`](https://jpereira.github.io/zapbot/comandos/kernel/) | | `user` | Current Linux kernel versions (kernel.org) |
| [`/leave`](https://jpereira.github.io/zapbot/comandos/leave/) |  | `admin` | Leaves one or more groups, by name or by the number in the list; `-l` lists your groups |
| [`/me`](https://jpereira.github.io/zapbot/comandos/me/) | | `user` | Sends the typed message; `{/command}` runs and the reply takes its place, `\n` breaks the line |
| [`/members`](https://jpereira.github.io/zapbot/comandos/members/) | `/listageral`, `/list` | `admin` · delegable | Lists the group members |
| [`/meme`](https://jpereira.github.io/zapbot/comandos/meme/) | | `user` | A random meme template (imgflip) |
| [`/monitor`](https://jpereira.github.io/zapbot/comandos/monitor/) | | `admin` | 👀 Up to 5 contacts, limited history, per-contact filter and online-entry alerts |
| [`/mute`](https://jpereira.github.io/zapbot/comandos/mute/) | `/mudo` | `admin` | Silences the alerts of deleted, edited, status and reactions (and the `/watch` ones) of a person, a group or a community; replying to an alert, of where it came from |
| [`/news`](https://jpereira.github.io/zapbot/comandos/news/) |  | `user` | Headlines from RSS feeds: `-hack`, `-g1`, `-gazeta`, `-brasil` |
| [`/noffa`](https://jpereira.github.io/zapbot/comandos/noffa/) | `/🌈`, `/🏳️‍🌈` | `user` | Decorates the text with a rainbow |
| [`/notes`](https://jpereira.github.io/zapbot/comandos/notes/) |  | `admin` | Notes with ID and `#tag` (`-a`, `-l`, `-s`, `-r`): view with the media (`-v`), edit (`-u`), rename a tag (`-m`), describe a tag (`-d`), export to PDF (`-e`) and `-alerta`, which warns at a date/time |
| [`/ping`](https://jpereira.github.io/zapbot/comandos/ping/) | | `user` | Checks that the bot is alive |
| [`/pixelart`](https://jpereira.github.io/zapbot/comandos/pixelart/) | `/ansi`, `/px` | `user` | Random ANSI/ASCII art (16colo.rs) |
| [`/poll`](https://jpereira.github.io/zapbot/comandos/poll/) | `/enquete`, `/quiz` | `admin` · delegable | Creates a native WhatsApp poll in the chat; `-r` shows the result |
| [`/profile`](https://jpereira.github.io/zapbot/comandos/profile/) | `/perfil` | `admin` · delegable | A contact's profile picture, with the name from your address book and the phone number |
| [`/promote`](https://jpereira.github.io/zapbot/comandos/promote/) | | `admin` · delegable | Makes someone a group admin |
| [`/rates`](https://jpereira.github.io/zapbot/comandos/rates/) | `/cotacao`, `/cambio` | `user` | EUR and USDT (and USD, GBP) exchange rates against the real: current, open, close and change; price alerts |
| [`/search`](https://jpereira.github.io/zapbot/comandos/search/) | `/buscar` | `admin` | Searches the WhatsApp Web history, not just the cache: in this chat or, in your private chat, in all of them (`-N` for more); `-mask` hides phone numbers |
| [`/set`](https://jpereira.github.io/zapbot/comandos/set/) | `/config` | `admin` | Lists and changes the settings; `-a`/`-rm` add and remove list items (e.g. `bot.admins` and `bot.users`) |
| [`/show`](https://jpereira.github.io/zapbot/comandos/show/) |  | `admin` · delegable | In private, lists the cache; redisplays deleted messages, edits (`-e`), statuses (`-s`) and removed or changed reactions (`-r`); `-q` searches (text or regex) and `-mask` hides phone numbers |
| [`/stats`](https://jpereira.github.io/zapbot/comandos/stats/) |  | `admin` · delegable | Ranking of this chat or another (`/Group/`): who talks, deletes and edits the most, peak hours; `-me` for yours, `-l` lists the chats, `-flush` deletes |
| [`/sticker`](https://jpereira.github.io/zapbot/comandos/sticker/) |  | `user` | Sticker from an image, video or link (`/get -st`), replying or as the caption of the media; with `-txt`, an animated text sticker |
| [`/tldr`](https://jpereira.github.io/zapbot/comandos/tldr/) | `/resumo` | `admin` · delegable | Summarizes the chat's conversation with ChatGPT (`30m`, `2h`, `1d`, `1h30m` or `300` messages; replying to a message, from it on) |
| [`/translate`](https://jpereira.github.io/zapbot/comandos/translate/) | `/traduzir` | `user` | Translates the text or the replied message with Google Translate, no key needed; `-para en` changes the language |
| [`/unblock`](https://jpereira.github.io/zapbot/comandos/unblock/) |  | `admin` | Unblocks a person: by name, by number, by the `/block` list number or by replying to a message |
| [`/unmute`](https://jpereira.github.io/zapbot/comandos/unmute/) |  | `admin` | Undoes `/mute`: by name, by list number, by replying to an alert, or all of them (`-all`) |
| [`/uptime`](https://jpereira.github.io/zapbot/comandos/uptime/) | | `user` | Run time and connection time |
| [`/version`](https://jpereira.github.io/zapbot/comandos/version/) |  | `user` | Bot version (same banner as `/uptime`) |
| [`/walissu`](https://jpereira.github.io/zapbot/comandos/walissu/) | `/ualisu` | `user` | Walissu CVE BOT: tags 2 members with a random CVE |
| [`/watch`](https://jpereira.github.io/zapbot/comandos/watch/) |  | `admin` | Text/regex rules, with an optional source in `-in`; lists hits, searches them with `-q` and alerts the `-to` destinations; `-mask` hides phone numbers and `-mask N` turns on 🔒 on rule N |
| [`/weather`](https://jpereira.github.io/zapbot/comandos/weather/) | `/tempo` | `user` | Weather now and the day's max/min (Open-Meteo); `/weather 16d` shows up to 16 days, counting today; without a city it uses `tempo.city` |
| [`/welcome`](https://jpereira.github.io/zapbot/comandos/welcome/) | | `admin` · delegable | Message when someone joins the group (per group; `{name}`, `{group}`) |
| [`/whois`](https://jpereira.github.io/zapbot/comandos/whois/) | `/who`, `/id` | `user` | Who you are and what you can do in the bot, in this chat: 🤖 owner, 👑 admin, 🗣️ user or 🚫 no permission; the owner and the admins see the others |

## Documentation

| Page | What it has |
|---|---|
| [Installation](https://jpereira.github.io/zapbot/instalacao/) | Requirements, installation, updating (stable and `main`) and QR Code |
| [Configuration](https://jpereira.github.io/zapbot/configuracao/) | `config/.env`, external services and API keys |
| [E-mails](https://jpereira.github.io/zapbot/emails/) | QR Code by e-mail, anti-phishing code and e-mail alerts |
| [Commands](https://jpereira.github.io/zapbot/comandos/) | One page per command, with options and examples |
| [Demo](docs/demonstracao.md) | The bot in action, in GIFs |
| [Settings](https://jpereira.github.io/zapbot/settings/) | Settings you can change with `/set` |
| [Operation](https://jpereira.github.io/zapbot/operacao/) | Day to day, container health (heartbeat) and troubleshooting |
| [Development](https://jpereira.github.io/zapbot/desenvolvimento/) | Code structure, tests, documentation and a new version |

## Development

```bash
make deps         # development dependencies, without downloading Chromium
make test         # tests, with no network or WhatsApp (Node 22.13+)
make DOCK_REMOTE=1 test # tests of the image running on the homelab
make lint         # ESLint
make check        # lint, tests and documentation in strict mode
```

The code lives in `src/` (`app.js` only does the bootstrap). See
[Development](https://jpereira.github.io/zapbot/desenvolvimento/) for the structure, the tests, the
documentation and the releases' `scripts/bump.sh`.

## Contributions

Contributions are welcome via issues and pull requests. Feel free to post your queries or concerns on any of the discussion forums mentioned below:

[![Join WhatsApp Group](https://img.shields.io/badge/Join-WhatsApp%20Group-blue.svg?logo=WhatsApp)](https://chat.whatsapp.com/LrYlfasTbRx5lBhGdGNj4F?mode=gi_t)

---

**Author:** Jorge Pereira ([@jpereira](https://github.com/jpereira)) · jpereiran@gmail.com
**License:** [MIT](LICENSE)
