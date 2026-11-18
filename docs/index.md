<p align="center">
  <img src="assets/logo.png" alt="ZapBot logo: an angel robot, with a halo and wings, winking and
  giving a thumbs up in a green chat bubble, and a demon face peeking from the side" width="320">
</p>

# ZapBot

<p align="center">
  <a href="https://github.com/jpereira/zapbot/actions/workflows/ci.yml"><img src="https://github.com/jpereira/zapbot/actions/workflows/ci.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/jpereira/zapbot/actions/workflows/containers.yml"><img src="https://github.com/jpereira/zapbot/actions/workflows/containers.yml/badge.svg" alt="Container image"></a>
  <a href="https://github.com/jpereira/zapbot/actions/workflows/docs.yml"><img src="https://github.com/jpereira/zapbot/actions/workflows/docs.yml/badge.svg" alt="Documentation build"></a>
  <a href="https://github.com/jpereira/zapbot/blob/main/package.json"><img src="https://img.shields.io/github/package-json/v/jpereira/zapbot" alt="Version"></a>
  <a href="https://github.com/jpereira/zapbot/blob/main/LICENSE"><img src="https://img.shields.io/github/license/jpereira/zapbot" alt="License"></a>
  <img src="https://img.shields.io/badge/node-24-339933?logo=nodedotjs&amp;logoColor=white" alt="Node.js 24">
  <a href="https://github.com/jpereira/zapbot/commits/main"><img src="https://img.shields.io/github/last-commit/jpereira/zapbot" alt="Last commit"></a>
  <a href="https://chat.whatsapp.com/LrYlfasTbRx5lBhGdGNj4F?mode=gi_t"><img src="https://img.shields.io/badge/WhatsApp-Join%20the%20group-25D366?logo=whatsapp&amp;logoColor=white" alt="WhatsApp group"></a>
</p>

> 🇧🇷 **Leia em português (pt_BR): [Português](https://jpereira.github.io/zapbot/pt-BR/).**

**Your WhatsApp group's guard dog.** ZapBot is a self-hosted WhatsApp bot written in Node.js. It runs on top of
a real WhatsApp Web session, as a *linked device* of your own account: no Business API, no monthly fee, and your
messages stay on your server. You type commands in any chat and it answers (`/help`, `/show`, `/gpt`, `/qr`...).

## 🆕 What's new (the fun stuff)

Yep, we've been busy. The best of the latest batch:

- 🎙️ **Transcribe any video or audio.** Send a link (Instagram, YouTube, X, TikTok...) or reply to a video or a voice
  note and get the **text of the speech**, or `-sum` for a **summary** on top. It runs on your own server
  (faster-whisper), so no OpenAI bill and the audio never leaves home. [`/transcribe`](commands/transcribe.md) · [`/get -t`](commands/get.md)
- 📈 **Quotes in one command.** `/stocks` has the dollar, euro and USDT (it replaces `/rates`) and any stock, ETF or
  index (`MSTR`, `NVDA`, `PETR4.SA`, `^GSPC`...), with alerts like `/stocks MSTR -alert < 90`. `/crypto` now also
  shows the price **in reais** (🇧🇷, straight from Binance) and gold as `XAUT`. [`/stocks`](commands/stocks.md) · [`/crypto`](commands/crypto.md)
- 🧮 **A calculator for lists.** Reply to `437 gym / 351 running` (or a debt list in `R$`, `EUR`, `USD`, with signs
  and the total) with `/calc`: it prints a tape with every number and checks the total of the text. It also does
  `100/2*6` and `((1+7)*8)/2`. [`/calc`](commands/calc.md)
- 📨 **Forward to your people in one reply.** `/forward` sends the message you replied to (with a text of yours on
  top, if you want) to contacts, groups, emails or saved lists. Make a list and an alias and it's one word:
  `/alias -q nopt /forward -q #nopt`, then reply `/nopt Look at this!`. `-q` is fully silent, `-s` brings the
  header and the summary. [`/forward`](commands/forward.md)
- 🚫 **A polite "no" instead of silence.** Whoever types a command they can't use gets
  `🚫 No permission to run /backup, talk to Jorge`, once in a while, never as flood. Turn it on/off or change the
  text with `/bot -d`. [`/bot`](commands/bot.md#notice-for-denied-commands)
- 📸 **An Instagram carousel becomes an album.** `/get <link>` on a post with only photos sends **all of them**
  (`Image 1/10`...), the last one with the post's text. [`/get`](commands/get.md)
- 👥 **Control the group from the chat.** `/group` shows and changes name, description, photo and who can send;
  `/group -send admins -for 30m` closes it and reopens by itself. [`/group`](commands/group.md)
- 🛡️ **Group moderation.** `/warn` with a limit that kicks, `/antilink` for links, `/antitag` for the "tag everyone"
  abuse and `/antibadword` for banned words. [`/warn`](commands/warn.md) · [`/antilink`](commands/antilink.md) · [`/antitag`](commands/antitag.md) · [`/antibadword`](commands/antibadword.md)
- 📵 **Reject calls with a message.** `/call -on` hangs up voice and video calls and answers with a text of yours
  (`/call -msg ...`), once every 10 minutes per person, `/call -allow` lists who always rings and `/call -deny /Fulano/ -msg "Not now!"` always rejects someone, with a message of their own. [`/call`](commands/call.md)
- 🎨 **Draw yourself and your friends.** `/draw @me @this draw the two of us as pirates` grabs the profile photos
  (`@me`, `@this`, `@reply` and plain names). [`/draw`](commands/draw.md) · [`/gpt`](commands/gpt.md)
- 🎲 **Games for the group.** Magic 8 ball, truth, dare and trivia; you can play just by replying to the bot. [`/games`](commands/games.md)
- 📣 **Post on your Status** (and schedule it), peek at anyone's About and change yours. [`/status`](commands/status.md) · [`/profile`](commands/profile.md)
- 📇 **Your contacts, exported.** `/contacts` makes a vCard with names, numbers and profile photos. [`/contacts`](commands/contacts.md)
- 🔇 **Mute for a while.** `/mute -for 2h` and the alerts come back by themselves. [`/mute`](commands/mute.md)
- 📊 **Usage and limits.** `/usage -all` shows who uses what, `/bot +limit` caps each person, and `/whois -id` brings
  the hidden ids. [`/usage`](commands/usage.md) · [`/whois`](commands/whois.md)
- 🏷️ **Names instead of numbers.** Alerts of deleted and edited messages and reactions show `@Luis`, not
  `@265472113143884`. [`/show`](commands/show.md)
- 🔌 **API and MCP (experimental).** Send messages and read your notes from scripts or an AI client.
  [API and MCP](api.md)

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
/games -trivia
/warn @Fulano posted a link
/antilink -delete -allow youtube.com
/mute -for 2h /Work group/
/usage -a
```

## ✨ What it can do

| | Skill | What it does | Try it |
|---|---|---|---|
| 🕵️ | **Recover what was erased** | Shows again the deleted and edited messages (and statuses, and removed reactions), with the original media | [`/show`](commands/show.md) · `/show -e` · `/show -s` |
| 🤖 | **Talk to ChatGPT** | Answers questions, reads photos and PDFs, transcribes voice notes, summarizes conversations, draws images and GIFs, turns text into voice and reads text in pictures | [`/gpt`](commands/gpt.md) · [`/tldr`](commands/tldr.md) · [`/draw`](commands/draw.md) · [`/tts`](commands/tts.md) · [`/ocr`](commands/ocr.md) |
| 📱 | **QR Codes** | Makes a QR Code from any text and reads one when you reply to its photo | [`/qr`](commands/qr.md) |
| 🎞️ | **Media and stickers** | Downloads videos and audio from social networks, makes stickers (from images, videos or text), memes, GIFs, code snapshots and ASCII art | [`/get`](commands/get.md) · [`/sticker`](commands/sticker.md) · [`/meme`](commands/meme.md) · [`/giphy`](commands/giphy.md) · [`/carbon`](commands/carbon.md) · [`/ascii`](commands/ascii.md) |
| 🎙️ | **Transcribe speech** | Turns the speech of any link, video, audio or voice note into text, on your own server (no API, no cost per minute); `-ss` and `-es` pick a part | [`/transcribe`](commands/transcribe.md) · [`/get -t`](commands/get.md#transcribe-the-speech--transcribe) |
| 🔔 | **Watch and alerts** | Watches messages by text or regex, alerts on currency and crypto prices, DeFi positions out of range and contacts coming online, in your private chat, in a group or by e-mail | [`/watch`](commands/watch.md) · [`/stocks`](commands/stocks.md) · [`/crypto`](commands/crypto.md) · [`/defi`](commands/defi.md) · [`/monitor`](commands/monitor.md) |
| 📅 | **Schedule and automate** | One-off and recurring messages, reminders, your own shortcuts, several commands in one message, notes with `#tags` and alerts, recipient lists | [`/cron`](commands/cron.md) · [`/alias`](commands/alias.md) · [`/batch`](commands/batch.md) · [`/notes`](commands/notes.md) · [`/forward`](commands/forward.md) |
| 👥 | **Group management** | Mentions everyone, promotes and demotes, invite links, polls, welcome and goodbye messages, mutes and blocks | [`/everybody`](commands/everybody.md) · [`/promote`](commands/promote.md) · [`/invite`](commands/invite.md) · [`/poll`](commands/poll.md) · [`/welcome`](commands/welcome.md) · [`/mute`](commands/mute.md) · [`/warn`](commands/warn.md) · [`/antilink`](commands/antilink.md) |
| 📈 | **Markets** | Dollar and euro against the real, crypto (BTC, ETH, gold as **XAUT**), and **stocks and indexes** (MSTR, NVDA, PETR4.SA, the S&P 500), with alerts when a price crosses the value you set | [`/crypto`](commands/crypto.md) · [`/stocks`](commands/stocks.md) |
| 🌎 | **Everyday info** | Weather checked against more than one source, news, CVEs, Linux kernel versions, translation and chat statistics | [`/weather`](commands/weather.md) · [`/news`](commands/news.md) · [`/cve`](commands/cve.md) · [`/kernel`](commands/kernel.md) · [`/translate`](commands/translate.md) · [`/stats`](commands/stats.md) |
| 🎲 | **Fun and games** | Magic 8 ball, truth, dare and trivia for the group (you can play just by replying), jokes and your friends drawn into pictures | [`/games`](commands/games.md) · [`/joke`](commands/joke.md) · [`/draw`](commands/draw.md) |
| 📣 | **Your profile and Status** | Posts on your WhatsApp Status (and schedules it), shows anyone's About text and changes yours, exports your contacts with photos | [`/status`](commands/status.md) · [`/profile`](commands/profile.md) · [`/contacts`](commands/contacts.md) |
| 🔌 | **API and MCP (experimental)** | A local HTTP API (off by default) to send messages and read your notes from scripts, and an experimental MCP server for AI clients | [API and MCP](api.md) |
| ⭐ | **Pro: limits per person** | Share `/gpt` and other commands with friends and groups, with a limit of successful calls per person, per day, week or month, and `/usage` to see what is left | [`/usage`](commands/usage.md) |
| 🛡️ | **Yours, and safe** | Owner, admin and user roles per command, flood protection, anti-SSRF in downloads, backups, QR Code login by e-mail, and English or Brazilian Portuguese | [`/bot`](commands/bot.md) · [`/backup`](commands/backup.md) · [`/set`](commands/set.md) |

All the commands, with their options and examples, are in [Commands](commands/index.md).

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
`/usage -l` away. All of it in [`/usage`](commands/usage.md) and [`/bot`](commands/bot.md#usage-limits-per-user-limit).

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
/draw @me @this draw the two of us as pirates           (in the chat with someone)
/draw @reply draw her as a superhero                   (replying to her message)
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

See [API and MCP](api.md).

The idea comes from the old IRC days: ZapBot is inspired by the old
[eggdrops](https://www.eggheads.org/), the bots that stood watch in the channels, answering
commands, keeping track of what happened and taking care of the place. Here the channel is the
WhatsApp group, and commands start with `/`.

## ℹ️ Good to know

- ZapBot is **not affiliated with WhatsApp or Meta**. It uses an unofficial client (`whatsapp-web.js`), so WhatsApp
  may block accounts that automate too aggressively: use it with care (see the notes on the
  [`/monitor`](commands/monitor.md) risk).
- **Everything stays with you**: the database, the media and the backups live in `cache/`, on your server. The only
  things that leave it are the requests to the services you turn on (OpenAI, GIPHY, weather, news...).
- The bot answers in **English by default**; `/set zapbot.lang pt_BR` switches its replies to Brazilian
  Portuguese.

## Demo

<p align="center">
  <a href="assets/demo/01-warmup.gif" target="_blank" rel="noopener"><img src="assets/demo/01-warmup.gif" alt="/ping, /version and /help replying" title="01-warmup.gif" width="220"></a>
  <a href="assets/demo/02-show.gif" target="_blank" rel="noopener"><img src="assets/demo/02-show.gif" alt="/show redisplaying deleted messages" title="02-show.gif" width="220"></a>
  <a href="assets/demo/03-monitor.gif" target="_blank" rel="noopener"><img src="assets/demo/03-monitor.gif" alt="/monitor alerting when a contact comes online" title="03-monitor.gif" width="220"></a>
  <a href="assets/demo/05-sticker.gif" target="_blank" rel="noopener"><img src="assets/demo/05-sticker.gif" alt="/sticker -txt creating text stickers" title="05-sticker.gif" width="220"></a>
  <a href="assets/demo/07-crypto.gif" target="_blank" rel="noopener"><img src="assets/demo/07-crypto.gif" alt="/crypto showing cryptocurrency prices" title="07-crypto.gif" width="220"></a>
  <a href="assets/demo/10-watch.gif" target="_blank" rel="noopener"><img src="assets/demo/10-watch.gif" alt="/watch alerting when a message matches a rule" title="10-watch.gif" width="220"></a>
</p>

`/ping`, `/show`, `/monitor`, `/sticker -txt`, `/crypto` and `/watch`. All scenes in
[Demo](demo.md).

Where to start:

- [Installation](installation.md): requirements, installing from the latest release, and updating.
- [Configuration](configuration.md): `config/.env`, API keys and email.
- [Commands](commands/index.md): all commands, with options and examples.
- [Operation](operation.md): day-to-day use, container health and troubleshooting.

## How it works

```text
 ┌────────────── container zapbot (node:24-trixie-slim) ──────────────┐
 │                                                                    │
 │  app.js ──► whatsapp-web.js ──► Puppeteer ──► Chromium             │──► WhatsApp Web
 │    │                                          (headless)           │
 │    ├──► SQLite  (cache/zapbot.db)  messages, settings              │
 │    ├──► cache/media  media to recover deleted messages             │
 │    ├──► yt-dlp + ffmpeg  the /get command                          │
 │    ├──► HTTP APIs (axios)  /gpt /weather /cve /news /giphy ...     │
 │    └──► SMTP (nodemailer)  QR Code and email alerts                │
 │                                                                    │
 │ volumes:  wwebjs_auth  → WhatsApp session (.wwebjs_auth)           │
 │           app_cache    → SQLite database + media (cache/)          │
 └────────────────────────────────────────────────────────────────────┘
```

- **WhatsApp session**: [`whatsapp-web.js`](https://github.com/wwebjs/whatsapp-web.js) opens
  WhatsApp Web in a headless Chromium and pairs with your phone as a *linked device*. The session
  is saved in the `wwebjs_auth` volume, so the QR Code only needs to be read the first time (or
  when the session is revoked). The library version is pinned in `package-lock.json` for
  reproducible installs. Local tweaks live in `patches/` and are applied by
  `scripts/apply-patches.js` during installation, using `git apply`.
  To install outside Docker: `PUPPETEER_SKIP_DOWNLOAD=true npm install`.
- **Bot number = your number**: the bot acts as the account that read the QR Code. Messages that
  *you* send (from any device) also go through the bot.
- **Persistence**: every received message is written to SQLite (media goes to `cache/media`).
  When someone deletes a message "for everyone", the bot finds the copy in the database and resends
  it **to your private chat** (the chat with yourself; turn the alert off with
  `/set show.alert.deleted off`, the message stays stored). Deleted messages are kept for 30 days
  (setting `cache.revokedRetentionDays`) and can be redisplayed with `/show`. Deleted statuses
  (texts/photos/videos) are also recovered, with the title `📸 DELETED STATUS DETECTED` and
  redisplayed with `/show -s`. With `/set show.alert.status off`, new status deletions are ignored:
  they neither generate an alert nor enter the deleted list.
- **Edited**: when someone edits a message, the bot stores the text from before and after (table
  `message_edits`) and alerts you **in your private chat** with the title
  `✏️ EDITED MESSAGE DETECTED` (turn the alert off with `/set show.alert.edited off`; the edit
  stays stored). Edits are kept for 30 days (setting `cache.editedRetentionDays`) and can be
  redisplayed with [`/show -e`](commands/show.md). Your own edits are ignored.
- **Reactions**: when someone removes a reaction (or swaps it for another), the bot alerts you **in
  your private chat** with the title `😶 REACTION REMOVED DETECTED` (or
  `🔄 REACTION CHANGED DETECTED`), with the previous reaction and the text of the message that was
  reacted to (turn the alert off with `/set show.alert.reaction off`; the reaction stays stored).
  They are kept for 30 days (setting `cache.reactionRetentionDays`) and can be redisplayed with
  [`/show -r`](commands/show.md#reactions).
- **Muting**: [`/mute`](commands/mute.md) cuts the alerts for deleted, edited, status and reaction
  events from a person, a group or a community (the message stays stored); when you reply to an
  alert, it mutes where it came from. Someone who is muted also doesn't generate a `/watch` alert in
  your private chat. [`/unmute`](commands/unmute.md) undoes it.
- **Automatic cleanup**: every 10 minutes the bot removes from the database/disk regular messages
  older than 68 h (the maximum window WhatsApp allows for deleting; the text is kept longer with
  `cache.messageRetentionHours` and the media with `cache.messageMediaRetentionHours`), deleted and
  edited ones, and reactions older than 30 days, `/watch` hits older than 30 days (setting
  `watch.hitsRetentionDays`), `/stats` counters older than 90 days (setting `stats.retentionDays`),
  polls older than 90 days (setting `poll.retentionDays`) and alerts skipped by `/mute` older
  than 30 days.
- **Contact monitor**: [`/monitor`](commands/monitor.md) checks up to five people, one at a time,
  in random order and waiting 1 to 15 seconds between checks. The minimum interval per person is
  five minutes by default (`monitor.pool`). It keeps up to 30 distinct timestamps per person
  (`monitor.maxRecords`) in the `monitor_contacts` and `monitor_history` tables. `/monitor` and
  `/monitor -l` show the observed history; `/monitor -l /Maria/` filters one person.
  `/monitor -add /Maria/ -alert` or `/monitor -alert /Maria/` enables online alerts in the bot
  owner's private chat, once per observed transition. `/monitor -rm all` clears the local
  registrations and histories. `/set monitor.enabled false` pauses the checks without deleting data.
  Timestamps may come from the cache and aren't confirmed; there is no guarantee that every access
  is recorded or that WhatsApp won't block the account.
- **Statistics**: each new message (and each deleted/edited one) adds 1 to a counter per chat, day,
  hour and sender (table `stats`), used by [`/stats`](commands/stats.md). Numbers only, no text;
  they are kept for 90 days (setting `stats.retentionDays`). Bot replies, your private chat and
  statuses are not counted. Turn it off with `/set stats.enable off`.
- **Price alerts**: `/stocks -alert USD > 5.30` and `/crypto -alert BTC < 90000` store the rule
  in the `price_alerts` table; every 5 minutes (setting `alert.intervalMin`) the bot checks the
  prices and alerts **your private chat** (or, with one or more `-to`, contacts, groups, numbers or
  email) when the rule is met; with `-msg`, a text of yours goes at the start of the alert. See
  [Price alerts](commands/stocks.md#price-alerts).
- **Notes**: [`/notes`](commands/notes.md) stores texts (and media: image, document, audio, video) in the
  `notes` table, each with an ID and, if you want, a `#tag` (tag descriptions live in
  `note_tags`). `-alert` alerts about a note at a date/time (once; the note stays), in your
  private chat or at the `-to` destinations, with one check per minute.
- **DeFi**: [`/defi`](commands/defi.md) reads on-chain the registered liquidity positions on Orca,
  Project X and Liquidswap (by wallet) (table `defi_positions`) and, with `-alert`, checks every 10
  minutes (setting `defi.alert.intervalMin`) and alerts (in your private chat or at the `-to`
  destinations) when a position leaves the range, when it comes back and, with `-fees`, when the
  fees to collect pass a value. `/defi morpho` and `/defi aave` show a wallet's position, loans and
  risk on Morpho (through the official API) and on Aave V3 (in the contracts, on-chain).
- **Polls**: the votes of your account's polls (`vote_update` event) go to the `polls` and
  `poll_votes` tables, and [`/poll -r`](commands/poll.md#result) shows the tally. They are
  kept for 90 days (setting `poll.retentionDays`).
- **Schedule**: the reminders and messages of [`/cron`](commands/cron.md) live in the `schedules` table; every 30 s the bot sends what is due (repeating ones
  move on to the next time). A `{/command}` in the text runs at send time and its reply takes its
  place.
- **Daily status**: with [`/bot -status 06h`](commands/bot.md#bot-status), a report of the last
  24 h (uptime, cache, watch, deleted, edited, `/mute`) arrives in your private chat every day.
- **Backup**: every day, at 3 am (setting `backup.hour`), the bot stores a compressed copy of the
  database in `cache/backups`; [`/backup`](commands/backup.md) also sends the daily backup to the
  `backup.to` destination, when set. The command lists, restores and sends the files (to your
  private chat, by email or, with one or more `-to`, to other chats).
- **Watch**: messages received from other accounts, outside recognized commands, are tested against
  the [`/watch`](commands/watch.md) rules (setting `watch.rules`); on a match, the hit is stored in
  the `watch_hits` table and you are alerted **in your private chat** (or at the rule's `-to`
  destinations: other chats or emails). Someone muted with `/mute` doesn't generate the private
  alert; the hit is stored all the same.
- **Settings (`settings`)**: general settings that can change at runtime (debug, `/crypto` coins,
  limits...) live in the generic SQLite `settings` table (`key` → `value` in JSON) and are changed
  with [`/set`](commands/set.md). At boot the defaults are written, if they don't exist yet, and
  everything is loaded into memory. See [Settings](settings.md).
- **Language**: the `zapbot.lang` setting (`en_US`, the default, or `pt_BR`) picks the language of
  the help, the replies, the alerts, the errors, and the dates and numbers. See
  [Language](configuration.md#language).
- **Commands**: defined in
  [`src/commands/definitions/`](https://github.com/jpereira/zapbot/tree/main/src/commands/definitions)
  (name, aliases, options, help, permission) and implemented in `src/commands/` (one file per
  command; see [Code structure](development.md#code-structure)). The ones that query the
  internet (`/gpt`, `/weather`, `/cve`, `/news`...) use the services in the
  [External services](configuration.md#external-services) table.
- **Control**: [`/bot`](commands/bot.md) shows the status (the 24 h report and the users), turns all
  commands on/off (`-on`/`-off`) and says who can use the bot: you, the
  [extra admins](commands/bot.md#extra-admins) (`+a`/`-a`) and the
  [users](commands/bot.md#users) (`+u`/`-u`: people and groups, with each one's commands limited
  by `+cmd`/`-cmd`, and with delegated `admin` commands, if you want); `-reset` goes back to the
  default, `-status 06h` sends the report every day (to your private chat, other chats or by
  email), `-info` shows the versions of what the bot uses and `-test` checks cache, disk, database,
  WhatsApp, internet, SMTP, IMAP and programs. Anyone who isn't an admin gets
  [flood protection](commands/bot.md#flood-protection). [`/whois`](commands/whois.md) tells
  each person's level in the chat.
- **Reconnection**: on an outage the client restarts by itself, except when the reason requires
  manual action (`LOGOUT`, `CONFLICT`, `UNPAIRED`...). Without internet, it retries, with
  increasing wait, until it connects ([Internet outage](operation.md#internet-outage)).
- **Health (heartbeat)**: every 30 s the bot checks that WhatsApp Web is responding and writes
  `/tmp/zapbot-heartbeat.json`; Docker's `HEALTHCHECK` marks the container as `unhealthy` if the
  file stops being updated. See [Container health](operation.md#container-health-heartbeat).
- **Startup notice**: when it's ready, the bot sends
  `🤖 ZapBot <version> (git+<commit>/<tag or HEAD>) started.` to `PHONE_NUMBER` (the commit is
  the one of the code that's running; see [`/version`](commands/version.md)).
- **Email alerts**: crash, outage, reconnection, authentication failure and other events also go by
  email, through the same SMTP as the QR Code (see [Email alerts](emails.md#email-alerts)).
  Enabled by default (setting `email.alerts`).
