# 🤖 ZapBot v1.0.24

<p align="center">
  <img src="docs/assets/logo.png" alt="ZapBot logo: an angel robot with a halo and wings, winking and
  giving a thumbs up in a green chat bubble, with a little demon face peeking from the side" width="320">
</p>

<p align="center">
  <a href="https://github.com/jpereira/zapbot/actions/workflows/ci.yml"><img src="https://github.com/jpereira/zapbot/actions/workflows/ci.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/jpereira/zapbot/actions/workflows/containers.yml"><img src="https://github.com/jpereira/zapbot/actions/workflows/containers.yml/badge.svg" alt="Container image"></a>
  <a href="https://github.com/jpereira/zapbot/actions/workflows/docs.yml"><img src="https://github.com/jpereira/zapbot/actions/workflows/docs.yml/badge.svg" alt="Documentation build"></a>
  <a href="https://github.com/jpereira/zapbot/blob/main/package.json"><img src="https://img.shields.io/github/package-json/v/jpereira/zapbot" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/jpereira/zapbot" alt="License"></a>
  <img src="https://img.shields.io/badge/node-24-339933?logo=nodedotjs&amp;logoColor=white" alt="Node.js 24">
  <a href="https://github.com/jpereira/zapbot/commits/main"><img src="https://img.shields.io/github/last-commit/jpereira/zapbot" alt="Last commit"></a>
  <a href="https://jpereira.github.io/zapbot/"><img src="https://img.shields.io/badge/docs-jpereira.github.io%2Fzapbot-blue?logo=readthedocs&amp;logoColor=white" alt="Documentation"></a>
  <a href="https://chat.whatsapp.com/LrYlfasTbRx5lBhGdGNj4F?mode=gi_t"><img src="https://img.shields.io/badge/WhatsApp-Join%20the%20group-25D366?logo=whatsapp&amp;logoColor=white" alt="WhatsApp group"></a>
</p>

> 🇧🇷 **Leia em português (pt_BR): [README.pt-BR.md](README.pt-BR.md).**
>
> The documentation (`docs/` and the website) is available in English and in Brazilian Portuguese, with
> a language selector on the site. The bot itself speaks English by default; `/set zapbot.lang pt_BR` switches its help, replies,
> alerts, and errors to Brazilian Portuguese.

**Your WhatsApp group's guard dog.** ZapBot is a self-hosted WhatsApp bot written in Node.js. It runs on top of
a real WhatsApp Web session, as a *linked device* of your own account: no Business API, no monthly fee, and your
messages stay on your server. You type commands in any chat and it answers (`/help`, `/show`, `/gpt`, `/qr`...).

## 🆕 What's new (the fun stuff)

Yep, we've been busy. The best of the latest batch:

- 🎙️ **Transcribe any video or audio.** Send a link (Instagram, YouTube, X, TikTok...) or reply to a video or a voice
  note and get the **text of the speech**, or `-sum` for a **summary** on top. It runs on your own server
  (faster-whisper), so no OpenAI bill and the audio never leaves home. [`/transcribe`](docs/commands/transcribe.md) · [`/get -t`](docs/commands/get.md)
- 📈 **Quotes in one command.** `/stocks` has the dollar, euro and USDT (it replaces `/rates`) and any stock, ETF or
  index (`MSTR`, `NVDA`, `PETR4.SA`, `^GSPC`...), with alerts like `/stocks MSTR -alert < 90`. `/crypto` now also
  shows the price **in reais** (🇧🇷, straight from Binance) and gold as `XAUT`. [`/stocks`](docs/commands/stocks.md) · [`/crypto`](docs/commands/crypto.md)
- 🧮 **A calculator for lists.** Reply to `437 gym / 351 running` (or a debt list in `R$`, `EUR`, `USD`, with signs
  and the total) with `/calc`: it prints a tape with every number and checks the total of the text. It also does
  `100/2*6` and `((1+7)*8)/2`. [`/calc`](docs/commands/calc.md)
- 📨 **Forward to your people in one reply.** `/forward` sends the message you replied to (with a text of yours on
  top, if you want) to contacts, groups, emails or saved lists. Make a list and an alias and it's one word:
  `/alias -q nopt /forward -q #nopt`, then reply `/nopt Look at this!`. `-q` is fully silent, `-s` brings the
  header and the summary. [`/forward`](docs/commands/forward.md)
- 🚫 **A polite "no" instead of silence.** Whoever types a command they can't use gets
  `🚫 No permission to run /backup, talk to Jorge`, once in a while, never as flood. Turn it on/off or change the
  text with `/bot -d`. [`/bot`](docs/commands/bot.md#notice-for-denied-commands)
- 📸 **An Instagram carousel becomes an album.** `/get <link>` on a post with only photos sends **all of them**
  (`Image 1/10`...), the last one with the post's text. [`/get`](docs/commands/get.md)
- 👥 **Control the group from the chat.** `/group` shows and changes name, description, photo and who can send;
  `/group -send admins -for 30m` closes it and reopens by itself. [`/group`](docs/commands/group.md)
- 🛡️ **Group moderation.** `/warn` with a limit that kicks, `/antilink` for links, `/antitag` for the "tag everyone"
  abuse and `/antibadword` for banned words. [`/warn`](docs/commands/warn.md) · [`/antilink`](docs/commands/antilink.md) · [`/antitag`](docs/commands/antitag.md) · [`/antibadword`](docs/commands/antibadword.md)
- 📵 **Reject calls with a message.** `/call -on` hangs up voice and video calls and answers with a text of yours
  (`/call -msg ...`), once every 10 minutes per person, `/call -allow` lists who always rings and `/call -deny /Fulano/ -msg "Not now!"` always rejects someone, with a message of their own. [`/call`](docs/commands/call.md)
- 🎨 **Draw yourself and your friends.** `/draw @me @this draw the two of us as pirates` grabs the profile photos
  (`@me`, `@this`, `@reply` and plain names). [`/draw`](docs/commands/draw.md) · [`/gpt`](docs/commands/gpt.md)
- 🎲 **Games for the group.** Magic 8 ball, truth, dare and trivia; you can play just by replying to the bot. [`/games`](docs/commands/games.md)
- 📣 **Post on your Status** (and schedule it), peek at anyone's About and change yours. [`/status`](docs/commands/status.md) · [`/profile`](docs/commands/profile.md)
- 📇 **Your contacts, exported.** `/contacts` makes a vCard with names, numbers and profile photos. [`/contacts`](docs/commands/contacts.md)
- 🔇 **Mute for a while.** `/mute -for 2h` and the alerts come back by themselves. [`/mute`](docs/commands/mute.md)
- 📊 **Usage and limits.** `/usage -all` shows who uses what, `/bot +limit` caps each person, `/bot -flood` tunes the
  anti-flood, and `/whois -id` brings the hidden ids. [`/usage`](docs/commands/usage.md) · [`/whois`](docs/commands/whois.md)
- 🏷️ **Names instead of numbers.** Alerts of deleted and edited messages and reactions show `@Luis`, not
  `@265472113143884`. [`/show`](docs/commands/show.md)
- 🔌 **API and MCP (experimental).** Send messages and read your notes from scripts or an AI client.
  [API and MCP](docs/api.md)

```text
/draw @me @this draw the two of us as pirates
/transcribe https://www.instagram.com/reel/XXXXXXXX/
/transcribe -sum https://youtu.be/XXXXXXXXXXX
/transcribe -ss 30 -es 90 https://youtu.be/XXXXXXXXXXX
/stocks MSTR NVDA
/crypto XAUT
/calc 100/2*6
/get https://www.instagram.com/p/XXXXXXXX/            (a carousel: all the photos)
/forward /Family/ #friends Look at this!              (replying to the message)
/bot -denied You can't use $cmd here. Ask $admin!
/call -on -msg I don't take calls here, send a message!
/bot -flood 5/10                                      (at most 5 repeats in 10 seconds)
/games -trivia
/warn @Fulano posted a link
/antilink -delete -allow youtube.com
/mute -for 2h /Work group/
/usage -a
```

## ✨ What it can do

| | Skill | What it does | Try it |
|---|---|---|---|
| 🕵️ | **Recover what was erased** | Shows again the deleted and edited messages (and statuses, and removed reactions), with the original media | [`/show`](docs/commands/show.md) · `/show -e` · `/show -s` |
| 🤖 | **Talk to ChatGPT** | Answers questions, reads photos and PDFs, transcribes voice notes, summarizes conversations, draws images and GIFs, turns text into voice and reads text in pictures | [`/gpt`](docs/commands/gpt.md) · [`/tldr`](docs/commands/tldr.md) · [`/draw`](docs/commands/draw.md) · [`/tts`](docs/commands/tts.md) · [`/ocr`](docs/commands/ocr.md) |
| 📱 | **QR Codes** | Makes a QR Code from any text and reads one when you reply to its photo | [`/qr`](docs/commands/qr.md) |
| 🎞️ | **Media and stickers** | Downloads videos and audio from social networks, makes stickers (from images, videos or text), memes, GIFs, code snapshots and ASCII art | [`/get`](docs/commands/get.md) · [`/sticker`](docs/commands/sticker.md) · [`/meme`](docs/commands/meme.md) · [`/giphy`](docs/commands/giphy.md) · [`/carbon`](docs/commands/carbon.md) · [`/ascii`](docs/commands/ascii.md) |
| 🎙️ | **Transcribe speech** | Turns the speech of any link, video, audio or voice note into text, on your own server (no API, no cost per minute); `-ss` and `-es` pick a part | [`/transcribe`](docs/commands/transcribe.md) · [`/get -t`](docs/commands/get.md#transcribe-the-speech--transcribe) |
| 🔔 | **Watch and alerts** | Watches messages by text or regex, alerts on currency and crypto prices, DeFi positions out of range and contacts coming online, in your private chat, in a group or by e-mail | [`/watch`](docs/commands/watch.md) · [`/stocks`](docs/commands/stocks.md) · [`/crypto`](docs/commands/crypto.md) · [`/defi`](docs/commands/defi.md) · [`/monitor`](docs/commands/monitor.md) |
| 📅 | **Schedule and automate** | One-off and recurring messages, reminders, your own shortcuts, several commands in one message, notes with `#tags` and alerts, recipient lists | [`/cron`](docs/commands/cron.md) · [`/alias`](docs/commands/alias.md) · [`/batch`](docs/commands/batch.md) · [`/notes`](docs/commands/notes.md) · [`/forward`](docs/commands/forward.md) |
| 👥 | **Group management** | Mentions everyone, promotes and demotes, invite links, polls, welcome and goodbye messages, mutes and blocks | [`/everybody`](docs/commands/everybody.md) · [`/promote`](docs/commands/promote.md) · [`/invite`](docs/commands/invite.md) · [`/poll`](docs/commands/poll.md) · [`/welcome`](docs/commands/welcome.md) · [`/mute`](docs/commands/mute.md) · [`/warn`](docs/commands/warn.md) · [`/antilink`](docs/commands/antilink.md) |
| 📈 | **Markets** | Dollar and euro against the real, crypto (BTC, ETH, gold as **XAUT**), and **stocks and indexes** (MSTR, NVDA, PETR4.SA, the S&P 500), with alerts when a price crosses the value you set | [`/crypto`](docs/commands/crypto.md) · [`/stocks`](docs/commands/stocks.md) |
| 🌎 | **Everyday info** | Weather checked against more than one source, news, CVEs, Linux kernel versions, translation and chat statistics | [`/weather`](docs/commands/weather.md) · [`/news`](docs/commands/news.md) · [`/cve`](docs/commands/cve.md) · [`/kernel`](docs/commands/kernel.md) · [`/translate`](docs/commands/translate.md) · [`/stats`](docs/commands/stats.md) |
| 🎲 | **Fun and games** | Magic 8 ball, truth, dare and trivia for the group (you can play just by replying), jokes and your friends drawn into pictures | [`/games`](docs/commands/games.md) · [`/joke`](docs/commands/joke.md) · [`/draw`](docs/commands/draw.md) |
| 📣 | **Your profile and Status** | Posts on your WhatsApp Status (and schedules it), shows anyone's About text and changes yours, exports your contacts with photos | [`/status`](docs/commands/status.md) · [`/profile`](docs/commands/profile.md) · [`/contacts`](docs/commands/contacts.md) |
| 🔌 | **API and MCP (experimental)** | A local HTTP API (off by default) to send messages and read your notes from scripts, and an experimental MCP server for AI clients | [API and MCP](docs/api.md) |
| ⭐ | **Pro: limits per person** | Share `/gpt` and other commands with friends and groups, with a limit of successful calls per person, per day, week or month, and `/usage` to see what is left | [`/usage`](docs/commands/usage.md) |
| 🛡️ | **Yours, and safe** | Owner, admin and user roles per command, flood protection, anti-SSRF in downloads, backups, QR Code login by e-mail, and English or Brazilian Portuguese | [`/bot`](docs/commands/bot.md) · [`/backup`](docs/commands/backup.md) · [`/set`](docs/commands/set.md) |

All the commands, with their options and examples, are in [Commands](docs/commands/index.md).

## ⭐ Pro: let friends use `/gpt` without emptying your credit

The commands people most want in groups and among friends (`/gpt` first of all) cost you money on
every call. With a **usage limit per person**, you decide how many *successful* calls each one gets,
per day, week or month. When it runs out, the command does not even run:

```text
/bot +u /Rafael Silva/ +cmd /gpt +limit 5/day      → Rafael: 5 calls of /gpt per day
/bot +u +cmd /gpt,/tldr +limit 20/month            → typed in a group: shared by everyone there
/bot -limit /gpt /Rafael Silva/                    → takes the limit away
```

```text
/gpt what is the capital of France?
🚫 /gpt limit reached: 3 of 3 per day. It renews on Tue 17/11 00:00.

/usage
⏱️ *Usage limits*
• /gpt  2/3 per day · renews Tue 17/11 00:00
• /tldr  0/3 per day · renews Tue 17/11 00:00
```

Help, usage and errors never count, you and the admins have no limit, and the history is one
`/usage -l` away. All of it in [`/usage`](docs/commands/usage.md) and [`/bot`](docs/commands/bot.md#usage-limits-per-user-limit).

## 👀 See it in action

**Someone edited a message? You still have the original:**

```text
/show -e
✏️ EDITED MESSAGE (1/1)

👥 Group: Work
👤 Name: Fulano
📅 Sent at: 9/30/2026, 11:14:03
✏️ Edited at: 9/30/2026, 11:15:42
📝 Before: "meeting at 2pm"
💬 After: "meeting at 3pm"
```

**Ask ChatGPT about a photo, a PDF or a voice note** (just reply to it):

```text
(replying to a photo of a dog)
/gpt what breed is this dog?
🤖 It looks like a Labrador Retriever, from the snout and the short coat...
```

**QR Codes, both ways:**

```text
/qr https://example.com            → sends the QR Code image
(replying to a photo of a QR Code)
/qr                                → 📱 https://example.com
```

**A price alert that comes to you:**

```text
/crypto -alert BTC < 90000
🔔 Alert created
₿ BTC/USDT below $90,000.00
💰 Now: $64,820.55
💡 Notice in your private chat; checked every 5 minutes.
```

**Your own shortcuts, and several commands in one:**

```text
/alias money -d "Shows the dollar price" /stocks USD     → registers the shortcut
/money                                                  → runs /stocks USD
/alias wallet Orca {/defi orca}\n Prjx {/defi prjx}     → one text, several commands
```

The bot shows the command that was called before the result. Shortcuts follow the permissions of the commands
they call, and `/help alias` lists yours.

**Games for the group, just by replying:**

```text
/games -trivia
🧠 Trivia

What is the capital of Australia?

A) Sydney
B) Melbourne
C) Canberra
D) Perth

(Rafael replies to it)  c
✅ Correct! C) Canberra
```

```text
/games -8ball will it rain on Saturday?
🎱 will it rain on Saturday?
Don't count on it.
```

**Post on your Status (and schedule it), with a warning about the ban risk:**

```text
/status Good morning, everybody! ☀️
📣 Posted on your Status.

/cron 8h -r d -status Good morning! {/weather}
🗓️ Scheduled for Tue 17/11 08:00 🔁 daily to 👤 WhatsApp Status.
```

**Someone's About text, and yours:**

```text
/profile -a /Fulano/
📝 About of Fulano <+5521999999999>: Available only for emergencies

/profile -s Busy until Monday
✅ Your About is now: Busy until Monday
```

**Who is who: the ids of the chat and of the person** (to fill a setting, for example):

```text
/whois -id
🆔 IDs
👥 Group: 120363012345678901@g.us
• 📞 +5521911111111
  🪪 5521911111111@c.us
```

**A reminder, a scheduled message and a recurring one:**

```text
/cron tomorrow 9h -rem call the bank
/cron friday 18h -to /Family/ Dinner is at 8!
/cron 8h -r d Today: {/weather}
```

**A group portrait with the profile photos, without downloading anything:**

```text
/draw -p /Rafael Silva/ /Maria Lucia/ draw the two of them at a birthday party
🎨 draw the two of them at a birthday party
```

**The speech of a video, as text (no API, it runs on your server):**

```text
/transcribe https://www.instagram.com/reel/XXXXXXXX/
⏳ Transcribing the speech, this can take a while.
📝 Transcription · 🗣️ pt · 1:23

oi gente, hoje eu vou mostrar como fazer um pão de queijo bem fofinho em casa...
(reply to a voice note)  /transcribe
```

**Your contacts, with photos, in one file:**

```text
/contacts
📇 1,248 contacts exported, with photos. Sending the .vcf...
```

**Download a video or just the audio:**

```text
/get https://youtu.be/dQw4w9WgXcQ
/get -a https://youtu.be/dQw4w9WgXcQ
```

**Talk to the bot from your own scripts** (the local API, off by default; there is an experimental
MCP server on top of it for AI clients):

```text
$ curl -s -X POST http://127.0.0.1:3100/send \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d '{"to":"5521999999999","text":"Backup done ✅"}'
{"ok":true,"to":"5521999999999@c.us"}
```

See [API and MCP](docs/api.md).

The idea comes from the old IRC days: ZapBot is inspired by the old
[eggdrops](https://www.eggheads.org/), the bots that stood watch in the channels, answering
commands, keeping track of what happened and taking care of the place. Here the channel is the
WhatsApp group, and commands start with `/`.

## ℹ️ Good to know

- ZapBot is **not affiliated with WhatsApp or Meta**. It uses an unofficial client (`whatsapp-web.js`), so WhatsApp
  may block accounts that automate too aggressively: use it with care (see the notes on the
  [`/monitor`](docs/commands/monitor.md) risk).
- **Everything stays with you**: the database, the media and the backups live in `cache/`, on your server. The only
  things that leave it are the requests to the services you turn on (OpenAI, GIPHY, weather, news...).
- The bot answers in **English by default**; `/set zapbot.lang pt_BR` switches its replies to Brazilian
  Portuguese.

## Demo

<p align="center">
  <a href="docs/assets/demo/01-warmup.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/01-warmup.gif" alt="/ping, /version and /help answering" title="01-warmup.gif" width="220"></a>
  <a href="docs/assets/demo/02-show.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/02-show.gif" alt="/show redisplaying deleted messages" title="02-show.gif" width="220"></a>
  <a href="docs/assets/demo/03-monitor.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/03-monitor.gif" alt="/monitor alerting when a contact comes online" title="03-monitor.gif" width="220"></a>
  <a href="docs/assets/demo/05-sticker.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/05-sticker.gif" alt="/sticker -txt creating text stickers" title="05-sticker.gif" width="220"></a>
  <a href="docs/assets/demo/07-crypto.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/07-crypto.gif" alt="/crypto showing cryptocurrency prices" title="07-crypto.gif" width="220"></a>
  <a href="docs/assets/demo/10-watch.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/10-watch.gif" alt="/watch alerting when a message matches a rule" title="10-watch.gif" width="220"></a>
</p>

`/ping`, `/show`, `/monitor`, `/sticker -txt`, `/crypto` and `/watch`. All the scenes are in
[Demo](docs/demo.md).

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
latest release, currently `v1.0.24`:

```bash
git clone https://github.com/jpereira/zapbot.git
cd zapbot
git checkout v1.0.24

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
[Configuration](https://jpereira.github.io/zapbot/configuration/#email-qr-code-and-alerts) and in
[E-mails](https://jpereira.github.io/zapbot/emails/).

### Updating

To update, use `git fetch --tags`, the same `git checkout` (with the new release) and the build
again. The step by step (including the development version, `main`) is in
[Installation](https://jpereira.github.io/zapbot/installation/); the `config/.env` variables are in
[Configuration](https://jpereira.github.io/zapbot/configuration/).

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
([Permissions](https://jpereira.github.io/zapbot/commands/#permissions-role)).

💡 **Too many parameters?** Simplify them with [`/alias`](https://jpereira.github.io/zapbot/commands/alias/)
and make the bot your own:

```text
/alias -q /usd /stocks USD          → shows the USD price
/alias -q /btc /crypto BTC         → shows the Bitcoin price
/alias -q /forecast /weather ${1:-Rio de Janeiro}   → /forecast shows Rio; /forecast Lisboa, Lisbon
/alias /rec /sticker -ss $1 -es $2           → /rec 10 20 <link> runs /sticker -ss 10 -es 20 <link>
/alias -q /tofriends /forward -q /Family Group/ +5521999999999 /Maria Lucia/ /Rafael Silva/   → a shortcut for a /forward list
```

`$1`, `$2`... take the arguments you type when running, and `${1:-default}` sets a default value
(`/clima` alone uses it). That is the power of `/alias`: type `/usd` and it's done.

| Command | Aliases | Role | Description |
|---|---|:-:|---|
| [`/alias`](https://jpereira.github.io/zapbot/commands/alias/) | | `admin` | Registers, lists and removes shortcuts for commands with arguments, or texts with several `{/command}` |
| [`/antibadword`](https://jpereira.github.io/zapbot/commands/antibadword/) | | `admin` · delegable | Deletes messages from non-admins with banned words (a list per group) |
| [`/antilink`](https://jpereira.github.io/zapbot/commands/antilink/) | | `admin` · delegable | Deletes links sent by non-admins in the group |
| [`/antitag`](https://jpereira.github.io/zapbot/commands/antitag/) | | `admin` · delegable | Deletes messages from non-admins that tag lots of people |
| [`/ascii`](https://jpereira.github.io/zapbot/commands/ascii/) | | `user` | The text in big ASCII letters, in a block that fits on the phone screen |
| [`/backup`](https://jpereira.github.io/zapbot/commands/backup/) | | `admin` | Daily local backup and sending through `backup.to`; lists, details, restores, sends and deletes the database |
| [`/batch`](https://jpereira.github.io/zapbot/commands/batch/) | | `admin` | Runs several commands from a single message, in sequence (each line that starts with a command opens a block), and replies with a summary; `-stop` and `-dry` |
| [`/bills`](https://jpereira.github.io/zapbot/commands/bills/) | | `user` | Joke: draws 2 members to "pay a bill" |
| [`/block`](https://jpereira.github.io/zapbot/commands/block/) | | `admin` | Blocks one or several people on your WhatsApp account (replying to a message, whoever wrote it); with nothing, lists the blocked ones; `-mask` hides phone numbers |
| [`/bot`](https://jpereira.github.io/zapbot/commands/bot/) | | `admin` | Bot status (24 h report and the users); turns the commands on/off (`-on`/`-off`) and says who uses them: admins (`+a`/`-a`) and users (`+u`/`-u`, in any chat or only in one group, and each one's commands with `+cmd`/`-cmd`); `-reset` goes back to the default; `-status` (`-s`): report of the last 24 h, and `-s 06h` sends it every day; `-info` (`-i`): versions and system; `-test` (`-t`): tests cache, disk, database, WhatsApp, internet, SMTP, IMAP and programs; `-flush-email [true]`: counts and clears the messages in Sent and Trash; `-passwd <password\|off>` (owner) and `-login <password>`: an outsider becomes admin with the password |
| [`/cache`](https://jpereira.github.io/zapbot/commands/cache/) | | `admin` | Cache tree with sizes, message counts and cleanup |
| [`/calc`](https://jpereira.github.io/zapbot/commands/calc/) | `/math`, `/sum` | `user` | Calculates and sums the numbers of a list: reply to "437 gym / 351 running" and get 788; understands 1.234,56, signs, shows a tape of what it read and `-group` by name |
| [`/call`](https://jpereira.github.io/zapbot/commands/call/) | | `admin` | Rejects voice and video calls and replies with a message: turn it on/off, set the text and who always rings |
| [`/carbon`](https://jpereira.github.io/zapbot/commands/carbon/) | | `user` | The code in an editor-window image |
| [`/contacts`](https://jpereira.github.io/zapbot/commands/contacts/) | | `owner` | Exports your address book as a vCard (`.vcf`) with name, number, about and profile photo, ready for Android and iPhone. Only in your own private chat |
| [`/cron`](https://jpereira.github.io/zapbot/commands/cron/) | | `admin` | At the scheduled time (`30m`, `at 18h`, `friday 9h`...): sends a message (here or with `-to`, to one or several chats) or, with `-reminder`, a ⏰ reminder; can repeat, be edited and paused, and run commands in the text (`{/crypto}`) |
| [`/crypto`](https://jpereira.github.io/zapbot/commands/crypto/) | | `user` | Prices of the enabled cryptos (default: BTC, ETH, SOL and HYPE) or only the requested ones (`BTC ETH`); price alerts |
| [`/cve`](https://jpereira.github.io/zapbot/commands/cve/) | | `user` | Latest published CVEs (NVD); `-highscore` only the critical ones |
| [`/debug`](https://jpereira.github.io/zapbot/commands/debug/) | | `admin` | Debug logs with levels, filter and copy to chats |
| [`/defi`](https://jpereira.github.io/zapbot/commands/defi/) | | `admin` | Orca and Project X liquidity positions: balance, range, price and fees to collect, read on-chain; `-alert` warns when a position leaves and re-enters its range and when fees pass a value. `liquidswap`: LP positions on Aptos. `morpho` and `aave`: position, loans and risk on Morpho and Aave V3 |
| [`/demote`](https://jpereira.github.io/zapbot/commands/demote/) | | `admin` · delegable | Removes someone's group admin |
| [`/draw`](https://jpereira.github.io/zapbot/commands/draw/) | | `admin` · delegable | Draws an image or an animated GIF (`-gif`) with GPT Image (OpenAI); on a photo, edits or animates it |
| [`/everybody`](https://jpereira.github.io/zapbot/commands/everybody/) | | `admin` · delegable | Mentions everyone in the group |
| [`/forward`](https://jpereira.github.io/zapbot/commands/forward/) | | `admin` | Forwards the replied message to people, groups and emails (`-to`), only if every recipient is found |
| [`/games`](https://jpereira.github.io/zapbot/commands/games/) | | `user` | Group games: magic 8 ball, truth, dare and trivia |
| [`/get`](https://jpereira.github.io/zapbot/commands/get/) | | `user` | Downloads video/audio from social networks or from the replied media |
| [`/giphy`](https://jpereira.github.io/zapbot/commands/giphy/) | | `user` | A GIPHY GIF by tag, URL or ID, sent looping |
| [`/goodbye`](https://jpereira.github.io/zapbot/commands/goodbye/) | | `admin` · delegable | Message when someone leaves the group (per group; `{name}`, `{group}`) |
| [`/gpt`](https://jpereira.github.io/zapbot/commands/gpt/) | | `admin` · delegable | Asks ChatGPT (OpenAI); `-img`, `-gif`, `-voice`, `-prices`, `-usage` and `-status` (bytes, tokens, cost and balance) |
| [`/group`](https://jpereira.github.io/zapbot/commands/group/) | | `admin` · delegable | Shows and changes the group: name, description, photo, who can send, edit and add; `-send admins -for 30m` closes it for a while |
| [`/help`](https://jpereira.github.io/zapbot/commands/help/) | | `user` | Help menu, with only the commands the requester can use |
| [`/invite`](https://jpereira.github.io/zapbot/commands/invite/) | | `admin` | The group invite link (`-revoke` makes a new one) |
| [`/join`](https://jpereira.github.io/zapbot/commands/join/) | | `admin` | Joins a group through the invite link (`-info` shows the group without joining); `-l` lists your groups |
| [`/joke`](https://jpereira.github.io/zapbot/commands/joke/) | | `user` | A random joke in Portuguese |
| [`/kernel`](https://jpereira.github.io/zapbot/commands/kernel/) | | `user` | Current Linux kernel versions (kernel.org) |
| [`/leave`](https://jpereira.github.io/zapbot/commands/leave/) | | `admin` | Leaves one or more groups, by name or by the number in the list; `-l` lists your groups |
| [`/me`](https://jpereira.github.io/zapbot/commands/me/) | | `user` | Sends the typed message; `{/command}` runs and the reply takes its place, `\n` breaks the line |
| [`/members`](https://jpereira.github.io/zapbot/commands/members/) | | `admin` · delegable | Lists the group members |
| [`/meme`](https://jpereira.github.io/zapbot/commands/meme/) | | `user` | A random meme template (imgflip) |
| [`/monitor`](https://jpereira.github.io/zapbot/commands/monitor/) | | `admin` | 👀 Up to 5 contacts, limited history, per-contact filter and online-entry alerts |
| [`/mute`](https://jpereira.github.io/zapbot/commands/mute/) | | `admin` | Silences the alerts of deleted, edited, status and reactions (and the `/watch` ones) of a person, a group or a community; replying to an alert, of where it came from |
| [`/news`](https://jpereira.github.io/zapbot/commands/news/) | | `user` | Headlines from RSS feeds: `-hack`, `-g1`, `-gazeta`, `-brazil` |
| [`/noffa`](https://jpereira.github.io/zapbot/commands/noffa/) | | `user` | Joke: decorates the text with a rainbow |
| [`/notes`](https://jpereira.github.io/zapbot/commands/notes/) | | `admin` | Notes with ID and `#tag` (`-a`, `-l`, `-s`, `-r`): view with the media (`-v`), edit (`-u`), rename a tag (`-m`), describe a tag (`-d`), export to PDF (`-e`) and `-alert`, which warns at a date/time |
| [`/ocr`](https://jpereira.github.io/zapbot/commands/ocr/) | | `admin` · delegable | The text in a photo, read by ChatGPT (vision) |
| [`/ping`](https://jpereira.github.io/zapbot/commands/ping/) | | `user` | Checks that the bot is alive |
| [`/pixelart`](https://jpereira.github.io/zapbot/commands/pixelart/) | | `user` | Random ANSI/ASCII art (16colo.rs) |
| [`/poll`](https://jpereira.github.io/zapbot/commands/poll/) | | `admin` · delegable | Creates a native WhatsApp poll in the chat; `-r` shows the result |
| [`/profile`](https://jpereira.github.io/zapbot/commands/profile/) | | `admin` · delegable | A contact's profile picture, with the name from your address book and the phone number |
| [`/promote`](https://jpereira.github.io/zapbot/commands/promote/) | | `admin` · delegable | Makes someone a group admin |
| [`/qr`](https://jpereira.github.io/zapbot/commands/qr/) | | `user` | Makes the QR Code of a text (`-decode` reads one) |
| [`/search`](https://jpereira.github.io/zapbot/commands/search/) | | `admin` | Searches the WhatsApp Web history, not just the cache: in this chat or, in your private chat, in all of them (`-N` for more); `-mask` hides phone numbers |
| [`/set`](https://jpereira.github.io/zapbot/commands/set/) | | `admin` | Lists and changes the settings; `-a`/`-rm` add and remove list items (e.g. `bot.admins` and `bot.users`) |
| [`/show`](https://jpereira.github.io/zapbot/commands/show/) | | `admin` · delegable | In private, lists the cache; redisplays deleted messages, edits (`-e`), statuses (`-s`) and removed or changed reactions (`-r`); `-q` searches (text or regex) and `-mask` hides phone numbers |
| [`/stats`](https://jpereira.github.io/zapbot/commands/stats/) | | `admin` · delegable | Ranking of this chat or another (`/Group/`): who talks, deletes and edits the most, peak hours; `-me` for yours, `-l` lists the chats, `-flush` deletes |
| [`/status`](https://jpereira.github.io/zapbot/commands/status/) | | `admin` | Posts on your WhatsApp Status (text, photo or video); `/cron -status` schedules it |
| [`/sticker`](https://jpereira.github.io/zapbot/commands/sticker/) | | `user` | Sticker from an image, video or link (`/get -st`), replying or as the caption of the media; with `-txt`, an animated text sticker |
| [`/stocks`](https://jpereira.github.io/zapbot/commands/stocks/) | `/stock`, `/rates` | `user` | Quotes of the dollar, euro, pound and USDT against the real, and of stocks, ETFs and indexes (Yahoo Finance): USD, EUR, MSTR, PETR4.SA, `^GSPC`; `-alert` for price alerts |
| [`/tldr`](https://jpereira.github.io/zapbot/commands/tldr/) | | `admin` · delegable | Summarizes the chat's conversation with ChatGPT (`30m`, `2h`, `1d`, `1h30m` or `300` messages; replying to a message, from it on) |
| [`/transcribe`](https://jpereira.github.io/zapbot/commands/transcribe/) | | `user` | Text of the speech of a link, video or audio (`/get -t` is a shortcut), replying or as the caption; `-ss` and `-es` pick a part |
| [`/translate`](https://jpereira.github.io/zapbot/commands/translate/) | | `user` | Translates the text or the replied message with Google Translate, no key needed; `-to en` changes the language |
| [`/tts`](https://jpereira.github.io/zapbot/commands/tts/) | | `admin` · delegable | The text as a robot voice note (OpenAI) |
| [`/unblock`](https://jpereira.github.io/zapbot/commands/unblock/) | | `admin` | Unblocks a person: by name, by number, by the `/block` list number or by replying to a message |
| [`/unmute`](https://jpereira.github.io/zapbot/commands/unmute/) | | `admin` | Undoes `/mute`: by name, by list number, by replying to an alert, or all of them (`-all`) |
| [`/uptime`](https://jpereira.github.io/zapbot/commands/uptime/) | | `user` | Run time and connection time |
| [`/usage`](https://jpereira.github.io/zapbot/commands/usage/) | | `user` | Your usage limits (set by the owner with `/bot +limit`): used, left and when they renew; `-l` shows your last calls |
| [`/version`](https://jpereira.github.io/zapbot/commands/version/) | | `user` | Bot version (same banner as `/uptime`) |
| [`/walissu`](https://jpereira.github.io/zapbot/commands/walissu/) | | `user` | Joke: Walissu CVE BOT: tags 2 members with a random CVE |
| [`/warn`](https://jpereira.github.io/zapbot/commands/warn/) | | `admin` · delegable | Warns someone in the group; at the limit, they are removed |
| [`/watch`](https://jpereira.github.io/zapbot/commands/watch/) | | `admin` | Text/regex rules, with an optional source in `-in`; lists hits, searches them with `-q` and alerts the `-to` destinations; `-mask` hides phone numbers and `-mask N` turns on 🔒 on rule N |
| [`/weather`](https://jpereira.github.io/zapbot/commands/weather/) | | `user` | Weather now and the day's max/min (Open-Meteo); `/weather 16d` shows up to 16 days, counting today; without a city it uses `weather.city` |
| [`/welcome`](https://jpereira.github.io/zapbot/commands/welcome/) | | `admin` · delegable | Message when someone joins the group (per group; `{name}`, `{group}`) |
| [`/whois`](https://jpereira.github.io/zapbot/commands/whois/) | | `user` | Who you are and what you can do in the bot, in this chat: 🤖 owner, 👑 admin, 🗣️ user or 🚫 no permission; the owner and the admins see the others |

## Documentation

| Page | What it has |
|---|---|
| [Installation](https://jpereira.github.io/zapbot/installation/) | Requirements, installation, updating (stable and `main`) and QR Code |
| [Configuration](https://jpereira.github.io/zapbot/configuration/) | `config/.env`, external services and API keys |
| [E-mails](https://jpereira.github.io/zapbot/emails/) | QR Code by e-mail, anti-phishing code and e-mail alerts |
| [Commands](https://jpereira.github.io/zapbot/commands/) | One page per command, with options and examples |
| [Demo](docs/demo.md) | The bot in action, in GIFs |
| [Settings](https://jpereira.github.io/zapbot/settings/) | Settings you can change with `/set` |
| [API and MCP](https://jpereira.github.io/zapbot/api/) | The optional local HTTP API and the experimental MCP server for AI clients |
| [Operation](https://jpereira.github.io/zapbot/operation/) | Day to day, container health (heartbeat) and troubleshooting |
| [Development](https://jpereira.github.io/zapbot/development/) | Code structure, tests, documentation and a new version |

## Development

```bash
make deps         # development dependencies, without downloading Chromium
make test         # tests, with no network or WhatsApp (Node 22.13+)
make DOCK_REMOTE=1 test # tests of the image running on the homelab
make lint         # ESLint
make check        # lint, tests and documentation in strict mode
```

The code lives in `src/` (`app.js` only does the bootstrap). See
[Development](https://jpereira.github.io/zapbot/development/) for the structure, the tests, the
documentation and the releases' `scripts/bump.sh`.

## Contributions

Contributions are welcome via issues and pull requests. Feel free to post your queries or concerns on any of the discussion forums mentioned below:

[![Join WhatsApp Group](https://img.shields.io/badge/Join-WhatsApp%20Group-blue.svg?logo=WhatsApp)](https://chat.whatsapp.com/LrYlfasTbRx5lBhGdGNj4F?mode=gi_t)

---

**Author:** Jorge Pereira ([@jpereira](https://github.com/jpereira)) · jpereiran@gmail.com
**License:** [MIT](LICENSE)
