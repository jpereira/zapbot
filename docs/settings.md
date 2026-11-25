# Settings

General bot settings stored in the SQLite `settings` table. They change right away, with no restart,
and survive restarts. To view and change them, use [`/set`](commands/set.md) (the descriptions it
shows are in Portuguese; the ones here are in English).

| Key | Type | Default | Description |
|---|---|---|---|
| `alias.examples` | list | *(empty)* | The `examples/*.zb` files the bot already loaded (once each, on the first boot after they appear: an alias you removed doesn't come back). Remove a name to load it again, or use `/alias -examples <name>` (it shows what the file creates) and `/alias -yes -examples <name>` (it loads) |
| `ascii.defaultChar` | 1 character | `#` | Character used for the strokes of [`/ascii`](commands/ascii.md) letters when `-char` is not given |
| `backup.enabled` | on/off | `on` | [Automatic backup](commands/backup.md#automatic-backup) of the database, once a day |
| `backup.hour` | 0–23 | `3` | Hour (Brasília time) of the automatic backup |
| `backup.keep` | 1–90 | `7` | How many automatic backups (and pre-restore ones) to keep; manual ones stay until a `/backup -rm` |
| `backup.to` | text (can be empty) | `""` | [Destination of the daily backup](commands/backup.md#automatic-backup), besides the local copy: contact, group, number or email, like `-to`. Empty: local only. For several, use `-to <destination> -to <destination>`. Sent automatically, without asking for `-yes` |
| `bot.admins` | list | *(empty)* | Other people who can also use the `admin` and `owner` commands: number with country code (`5521999999999`) or, through `/set`, the contact name (`/Jorge Pereira/`) or the mention. Only the owner can change it; `/bot +a`/`-a` is the shortcut. See [Extra admins](commands/bot.md#extra-admins) |
| `bot.denied.enabled` | on/off | `on` | Whoever types a command they can't use gets the `bot.denied.message` instead of silence (without repeating while the person insists, see `bot.denied.interval`). Off: the bot ignores in silence. It comes on. See [Notice for denied commands](commands/bot.md#notice-for-denied-commands) |
| `bot.denied.interval` | 0–1440 | `10` | Minutes of calm for the `bot.denied.enabled` notice: if the person was already notified (or tried some command) in this chat in the last X minutes, the bot stays quiet, and each new attempt renews the wait. `0`: notifies on every attempt |
| `bot.denied.message` | text (can be empty) | `""` | Text of the `bot.denied.enabled` notice. `$cmd` is the typed command and `$admin`, the bot's owner (name and phone). Empty: the default text of the bot's language (`zapbot.lang`): `🚫 No permission to run $cmd, talk to $admin` |
| `bot.flood.intervalCommand` | 1–3600 | `2` | Flood protection: the window, in seconds, in which `bot.flood.maxCommandRepeated` is counted, and how long the bot ignores whoever went over the limit. See [Flood protection](commands/bot.md#flood-protection). Same as `/bot -flood`. |
| `bot.flood.maxCommandRepeated` | 0–100 | `3` | How many times a non-admin can repeat the same command within `bot.flood.intervalCommand` seconds; past that, the bot warns once and ignores the person until the interval ends. `0` turns it off. Same as `/bot -flood`. |
| `bot.login` | text (can be empty) | `""` | Hash (scrypt) of the `/bot -login` password, which turns an outsider into an admin. Empty: login disabled. Set it with `/bot -passwd`, not `/set`. Secret |
| `bot.paused` | on/off | `off` | Bot turned off: all commands ignored, except `/bot` (same as `/bot -on`/`-off`) |
| `bot.users` | list | `false` | Who uses the regular (non-admin) commands, besides you and `bot.admins`: `false` (nobody), `true` (everybody) or people and groups (for a group, everyone in it can use them, but only inside it); a person in just one group is stored as `phone:group-id`. Only the owner can change it; `/bot +u`/`-u` is the shortcut. See [Users](commands/bot.md#users) |
| `bot.users.cmds` | list | *(empty)* | Each user's commands (`/bot +cmd`/`-cmd`): `item=/a,/b` (only those) or `item=!/a,/b` (all regular ones, except those), with the `bot.users` item. An `admin` command (`/gpt`...) only works in the "only those" list. No line: all regular commands. See [Each user's commands](commands/bot.md#each-users-commands) |
| `bot.users.limits` | list | *(empty)* | Usage limit of each user per command (`/bot +cmd /gpt +limit 5/day`): `item=/gpt:5/day,/tldr:3`. See [Usage limits per user](commands/bot.md#usage-limits-per-user-limit) |
| `cache.editedRetentionDays` | 1–365 | `30` | Days edited messages are kept for `/show -e` |
| `cache.messageMediaRetentionDays` | 3–90 | `3` | Days the media of regular messages (photos, videos, audios, documents) stays on disk. Never longer than `cache.messageRetentionDays`: the media goes away with the message. It takes space in `cache/media`; `/cache -media` frees only it |
| `cache.messageRetentionDays` | 3–90 | `3` | Days the text of regular messages stays in the database (3 covers the delete-for-everyone window): the more, the further back `/tldr` reaches. Media has its own limit, `cache.messageMediaRetentionDays` |
| `cache.reactionRetentionDays` | 1–365 | `30` | Days removed or changed reactions are kept for `/show -r` |
| `cache.revokedRetentionDays` | 1–365 | `30` | Days deleted messages are kept for `/show` |
| `calendar.addEmoji` | on/off | `on` | Starts the `/calendar` event title with an emoji of its kind (`🩺 Consulta`, `🧗 Escalada`, `🏋🏽‍♂️ Treino`...). With `-gpt`, ChatGPT picks it. `off` turns it off |
| `calendar.duration` | 5–1440 | `60` | Minutes of the [`/calendar`](commands/calendar.md) event when the text does not say. `-duration` changes it per call |
| `calendar.engine` | text | `local` | Engine of `/calendar`: `local` (labels and shape of the dates, no key) or `gpt` (ChatGPT answers with the Google Calendar JSON). `-gpt` and `-local` choose per call |
| `calendar.footer` | on/off | `on` | Ends the `/calendar` reply with the `💡 Processed by <engine>` tip. `-quiet` hides it per call |
| `calendar.googleLink` | on/off | `on` | `/calendar` sends the "➕ Add to Google Calendar" link. `-quiet` already hides it per call; this setting turns it off always. The `.ics` still goes (opens in Apple Calendar and Outlook) |
| `calendar.outputToPrivate` | on/off | `on` | Sends notices and the event privately when `/calendar` replies to a message. Use `-d` to send to the current chat |
| `calendar.timezone` | text | `America/Sao_Paulo` | Time zone in which `/calendar` reads the dates and times of the text (IANA name) |
| `call.allow` | list | *(empty)* | Numbers (with country code) whose calls are never rejected, even with `call.reject` on. `bot.admins` always get through too. Same as `/call -allow`. |
| `call.message` | text (can be empty) | `""` | Message sent to whoever had the call rejected (at most one every 10 minutes per person). Empty: the default text of the bot's language (`zapbot.lang`). `off`: rejects in silence. Same as `/call -msg`: see [`/call`](commands/call.md) |
| `call.reject` | on/off | `off` | Rejects incoming voice and video calls (except `call.allow` and `bot.admins`) and replies with `call.message`. See [Rejecting calls](commands/bot.md#rejecting-calls). Same as `/call -on\|-off`. |
| `commands.disabled` | list | `/cve`, `/kernel`, `/news`, `/walissu` | Commands disabled at runtime: the bot ignores them and they disappear from `/help`. **`/cve`, `/kernel`, `/news` and `/walissu` come disabled**: `/set -rm commands.disabled kernel` turns one on (see [`/set`](commands/set.md)). `/set` cannot be disabled. Unknown names are ignored with a warning in the log; valid aliases are normalized |
| `commands.seen` | on/off | `on` | Marks the chat as read (blue ✓✓) when a command is typed in it, before replying, as a person would. The "typing..." also shows while the command runs |
| `contacts.cache` | on/off | `on` | Keeps the profile photos downloaded by `/contacts` in `cache/contacts` (also in the backup). Off: downloads on every export and saves nothing |
| `contacts.cacheDays` | 1–365 | `30` | Days a photo in `cache/contacts` stays valid before being downloaded again (`/contacts -r` forces it) |
| `contacts.delayMs` | 0–5000 | `300` | Pause, in milliseconds, between photos in `/contacts`, to avoid hitting WhatsApp in a burst |
| `cron.max` | 1–500 | `50` | Max items in [`/cron`](commands/cron.md), counting reminders and messages together |
| `cron.msgPrepend` | text | `⏰ ` | Literal text before `/cron` messages in the list, Web and notifications; leading/trailing spaces are kept (`/set cron.msgPrepend " ⏰ ~> "`). Empty: no prefix |
| `crypto.alert.intervalMin` | 1–60 | `5` | Interval, in minutes, between [price alert](commands/stocks.md#price-alerts) checks of `/crypto` |
| `crypto.alert.max` | 1–100 | `20` | Max price alerts of `/crypto` |
| `crypto.alert.msgPrepend` | text | `🔔 ` | Literal text before `/crypto -alert` event messages in the list, Web and notifications; leading/trailing spaces are kept |
| `crypto.brl` | on/off | `on` | [`/crypto`](commands/crypto.md) also shows the price of each coin in reais (the Binance pair against the real, or the dollar price × USDTBRL) |
| `crypto.coins` | list | `BTC, ETH, SOL, HYPE` | Coins in `/crypto` (supported ones only); usually changed with `/crypto -a`/`-d` |
| `cve.max` | 1–20 | `10` | Number of CVEs shown by `/cve` (`/cve <max>` overrides it) |
| `cve.maxDays` | 1–120 | `7` | Window, in days, of `/cve -highscore` |
| `debug.copyTo` | text (can be empty) | *(empty)* | Chat that receives a copy of the logs; set it with [`/debug -copy-to`](commands/debug.md). Empty: console only |
| `debug.enabled` | on/off | `off` | Debug mode (same as `/debug -on`/`-off`) |
| `debug.filter` | text (can be empty) | *(empty)* | `/regex/flags` filter for the logs during debug. Empty: no filter; `/debug -off` clears it. The filter applies after startup; matches are highlighted in the console with colors |
| `debug.level` | 0–3 | `0` | Debug level: 0 basic, 1 what the bot is calling (commands, database, requests, processes, email, WhatsApp), one line each, 2 the same calls with their arguments and every function of the modules, 3 results and Chromium. See [`/debug`](commands/debug.md) |
| `defi.aave.chains` | list | `1 8453` | Networks (chain id) where [`/defi aave`](commands/defi.md#aave-v3) looks for positions: `1` (Ethereum), `8453` (Base) |
| `defi.aave.wallet` | text (can be empty) | *(empty)* | Wallet for [`/defi aave`](commands/defi.md#aave-v3) when no wallet is registered, used when `AAVE_WALLET_ADDRESS` is not in `config/.env` |
| `defi.alert.intervalMin` | 1–1440 | `10` | Interval (minutes) between [`/defi -alert`](commands/defi.md#out-of-range-alert) checks; it queries the positions on Solana and HyperEVM, depending on the protocol |
| `defi.aptos.apikey` | text (can be empty) | *(empty)* | Aptos API key ([Geomi](https://geomi.dev/docs/start)) used by [`/defi liquidswap`](commands/defi.md#liquidswap), when `APTOS_API_KEY` is not in `config/.env`. Optional: without it, the anonymous per-IP limit applies, which is enough for the bot. Shown masked |
| `defi.aptos.indexer` | URL | `https://api.mainnet.aptoslabs.com/v1/graphql` | Aptos GraphQL indexer used by [`/defi liquidswap`](commands/defi.md#liquidswap) to find the wallet's positions |
| `defi.aptos.rpc` | URL | `https://api.mainnet.aptoslabs.com/v1` | Aptos fullnode REST API used by [`/defi liquidswap`](commands/defi.md#liquidswap) to read pools and tokens. Shown masked |
| `defi.base.rpc` | URL | `https://mainnet.base.org` | Base RPC used by [`/defi aave`](commands/defi.md#aave-v3), when `BASE_RPC_URL` is not in `config/.env`. The public one limits queries. Shown masked |
| `defi.ethereum.rpc` | URL | `https://ethereum-rpc.publicnode.com` | Ethereum RPC used by [`/defi aave`](commands/defi.md#aave-v3), when `ETHEREUM_RPC_URL` is not in `config/.env`. The public one limits queries. Shown masked |
| `defi.hyperevm.rpc` | URL | `https://rpc.hyperliquid.xyz/evm` | HyperEVM RPC used by [`/defi`](commands/defi.md) on Project X. The public one limits queries; a private RPC usually has the key in the URL. Shown masked |
| `defi.morpho.api` | URL | `https://api.morpho.org/graphql` | Official Morpho GraphQL API, used by [`/defi morpho`](commands/defi.md#morpho) |
| `defi.morpho.chains` | list | `8453` | Networks (chain id) where [`/defi morpho`](commands/defi.md#morpho) looks for positions: `8453` (Base), `1` (Ethereum)... |
| `defi.morpho.wallet` | text (can be empty) | *(empty)* | Wallet for [`/defi morpho`](commands/defi.md#morpho) when no wallet is registered, used when `MORPHO_WALLET_ADDRESS` is not in `config/.env` |
| `defi.solana.rpc` | URL | `https://api.mainnet-beta.solana.com` | Solana RPC used by [`/defi`](commands/defi.md#solana-rpc). Shown masked (the URL usually carries the key) |
| `draw.footer` | on/off | `on` | Adds the tip "💡 Drawn by ChatGPT" to the "image generated below" notice of /draw and /gpt -img and -gif. -quiet (-q) hides it on the call. |
| `forward.delayMs` | 0–10000 | `1000` | Pause (ms) between messages when [`/forward`](commands/forward.md) forwards several, so WhatsApp isn't flooded |
| `forward.header` | on/off | `on` | Header "Message forwarded by ZapBot!" at the start of what [`/forward`](commands/forward.md) sends; off, only the message goes. `-status` forces it, `-quiet` and `-nohdr` drop it. See [Header](commands/forward.md#header) |
| `forward.max` | 1–50 | `10` | Most messages [`/forward -N`](commands/forward.md#several-messages--n) forwards at once |
| `forward.maxRecipients` | 1–200 | `30` | Most recipients of one [`/forward`](commands/forward.md#recipient-lists) (lists and single recipients together) and of each list |
| `forward.status` | on/off | `on` | [`/forward`](commands/forward.md) shows the status: the notice while it sends and, at the end, `✉️ ... successfully!` with the list of who received it; off, only failures show up. `-status` forces it, `-quiet` drops it |
| `get.cache.maxDays` | 1–365 | `2` | Days cached downloads (`get.cache.tmp`) stay in `cache/tmp` before the periodic cleanup deletes them |
| `get.cache.tmp` | on/off | `on` | Keeps in `cache/tmp` what yt-dlp downloads in `/get` and `/sticker`: the same link (and the same clip) is not downloaded again. See [Download cache](commands/get.md#download-cache). `off` deletes the original on every run |
| `get.maxDownloadMB` | 10–2000 | `200` | Max size downloaded by yt-dlp in `/get` and `/sticker`, before conversion |
| `get.maxInlineSizeMB` | 1–100 | `16` | Max size for sending `/get` media inline; larger files are sent as documents |
| `get.maxSizeMB` | 1–100 | `20` | Max size of the file converted by ffmpeg in `/get` and `/sticker` |
| `get.showAsMedia` | on/off | `on` | Sends `/get` media inline so it opens in WhatsApp, instead of as documents to download |
| `giphy.api.key` | text (can be empty) | *(empty)* | GIPHY key, used when `GIPHY_API_KEY` is not in `config/.env`. Shown masked (`••••1234`); `/set -reset giphy.api.key` clears it |
| `giphy.tag` | text | `fail` | Default tag for `/giphy` |
| `gpt.admin.key` | text (can be empty) | *(empty)* | OpenAI admin key (`sk-admin-...`) for `/gpt -usage`, used when `OPENAI_ADMIN_KEY` is not in `config/.env`. Shown masked; `/set -reset gpt.admin.key` clears it |
| `gpt.api.key` | text (can be empty) | *(empty)* | OpenAI key, used when `OPENAI_API_KEY` is not in `config/.env`. Shown masked (`••••1234`); `/set -reset gpt.api.key` clears it |
| `gpt.api.model` | text (from the list) | `gpt-4o-mini` | `/gpt` model, used when `OPENAI_MODEL` is not in `config/.env`. Accepted: the ones listed by `/gpt -m` |
| `gpt.credit.since` | text (YYYY-MM-DD, can be empty) | *(empty)* | Purchase date of the OpenAI credits: `/gpt -usage` adds up the spending since then to show `$used/$total` (empty: the last 180 days) |
| `gpt.credit.total` | 0–100000 | `0` | Total OpenAI credits purchased, in dollars (the API doesn't report the balance): `/gpt -usage` shows `$used/$total`. `0`: doesn't show it |
| `gpt.footer` | on/off | `on` | Ends the /gpt replies with the tip "💡 Answered by ChatGPT". -quiet (-q) hides it on the call. |
| `gpt.gif.frameMs` | 20–2000 | `200` | How long each frame of the `/draw -gif` and `/gpt -gif` GIF lasts, in ms (the total is frames x ms) |
| `gpt.gif.frames` | 2–16 | `9` | How many frames the `/draw -gif` and `/gpt -gif` GIF has (the more frames, the more expensive) |
| `gpt.image.gifModel` | text | `gpt-image-2.6-flare` | Model that generates the `/draw -gif` and `/gpt -gif` GIF (only the `gpt-image-2.6-*` ones make GIFs and require preview access): the id your account has (if it doesn't exist, the bot lists the ones the key sees) |
| `gpt.image.model` | text | `gpt-image-2` | Model that generates and edits the image for `/draw` and `/gpt -img`: the id your account has (if it doesn't exist, the bot lists the ones the key sees). The GIF has its own, `gpt.image.gifModel` |
| `gpt.image.quality` | text | `auto` | Image quality of [`/draw`](commands/draw.md#quality-and-size) and `/gpt -img`: `low`, `medium`, `high` or `auto` (OpenAI chooses). The higher, the more expensive. `-quality` changes it per call (owner and admins) |
| `gpt.image.size` | text | `auto` | Image size of `/draw` and `/gpt -img`: `auto` (OpenAI chooses), `square` (1024x1024), `landscape` (1536x1024), `portrait` (1024x1536) or `WxH`. The bigger, the more expensive. `-size` changes it per call (owner and admins) |
| `gpt.pricing` | list `model=input/output` | *(empty)* (`/gpt -prices` or the automatic update fills it in) | Price per 1M tokens, in dollars, for the estimated cost in the status footer of `/gpt` and `/tldr` (model without a price: `custo n/d`). The exact name or the longest prefix applies |
| `gpt.pricing.auto` | on/off | `on` | Updates `gpt.pricing` by itself every 15 days, reading the OpenAI website (like `/gpt -prices`); only runs with the OpenAI key configured. Off: manual only |
| `gpt.pricing.updated` | `YYYY-MM-DD` | *(empty)* | Date of the last `gpt.pricing` update (written by the bot): empty: not updated yet |
| `gpt.status` | on/off | `on` | Status footer in `/gpt` and `/tldr` replies: bytes sent (TX) and received (RX), tokens spent, estimated cost and balance (with it off, `-status` turns it on just that once) |
| `gpt.timeout.ms` | 5000–300000 | `60000` | `/gpt` timeout, used when `OPENAI_TIMEOUT_MS` is not in `config/.env` |
| `gpt.transcribe.model` | text | `gpt-transcribe` | Model that transcribes the audio replied to with `/gpt`: the id your account has (`whisper-1` goes offline in Feb/2027) |
| `gpt.tts.instructions` | text | `Fale como um robô: voz metálica, monótona e pausada, sem emoção.` | Voice style for `/gpt -voice` (only `gpt-4o-mini-tts` uses it) |
| `gpt.tts.model` | text | `gpt-4o-mini-tts` | Model that generates the voice for `/gpt -voice`: the id your account has (only the `gpt-4o-*` ones follow the style) |
| `gpt.tts.speed` | 50–200 | `100` | Speed of the ChatGPT voice in `/gpt -voice` and `/tts -gpt`, in % (`100` normal, `150` faster). `-speed` (`-sp`) changes it per call; the local voice uses `tts.speed` |
| `gpt.tts.voice` | text (from the list) | `onyx` | Voice for `/gpt -voice`: `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer` or `verse` |
| `me.maxRepeat` | 1–1000 | `500` | Max repetitions of [`/me -repeat`](commands/me.md) (`-r <n>`) |
| `monitor.enabled` | on/off | `on` | Periodic checks of [`/monitor`](commands/monitor.md); `off` pauses without deleting contacts or history |
| `monitor.max` | 1–5 | `5` | Max monitored contacts. More contacts mean more queries and a higher risk of being blocked; hard limit of 5. Remove contacts before lowering it below the number registered |
| `monitor.maxRecords` | 1–1000 | `30` | Max timestamps kept per contact and shown in `/monitor` and `/monitor -l`. Lowering it immediately removes the oldest excess timestamps |
| `monitor.pool` | 120–86400 | `300` | Minimum interval in seconds per contact: default 5 min, minimum 2 min. Short intervals may contribute to WhatsApp blocking; no interval is guaranteed to be safe |
| `news.brazil` | list | 15 blogs from [feedspot](https://rss.feedspot.com/brazil_rss_feeds/) | RSS feeds for `/news -brazil` |
| `news.g1` | list | `https://g1.globo.com/dynamo/rss2.xml` | RSS feeds for `/news -g1` |
| `news.gazeta` | list | `https://www.gazetadopovo.com.br/feed/rss/brasil.xml` | RSS feeds for `/news -gazeta` |
| `news.hack` | list | The Hacker News, BleepingComputer, Krebs on Security | RSS feeds for `/news -hack` |
| `news.max` | 1–10 | `5` | Headlines shown by `/news` (`/news <count>` overrides it) |
| `notes.lockMinutes` | 1–120 | `5` | Minutes without using a protected tag ([`/notes -lock`](commands/notes.md#protected-tags--lock)) until it locks by itself |
| `notes.lockPrivateOnly` | on/off | `on` | A protected tag ([`/notes -lock`](commands/notes.md#protected-tags--lock)) only opens in your own private chat. `off`: it opens in any chat (never with `-to`; the password is still typed only in your private chat) |
| `ocr.engine` | `local`, `gpt` | `local` | Engine of [`/ocr`](commands/ocr.md): `local` (Tesseract, no key) or `gpt` (ChatGPT, OpenAI vision). `-gpt` and `-local` pick it per call |
| `ocr.footer` | on/off | `on` | Ends the /ocr reply with the tip "💡 Read by <engine>". -quiet (-q) hides it on the call. |
| `ocr.language` | text | `por+eng` | Languages of the local [`/ocr`](commands/ocr.md) (Tesseract), joined by `+`: `por+eng`, `por`, `eng`, `spa`... One that is not in the Docker image is not read |
| `pixelart.maxParts` | 1–10 | `3` | Max parts of [`/pixelart`](commands/pixelart.md) when the art is taller than 4096 px |
| `pixelart.packs` | list | `chuck-norris-lvl` | 16colo.rs packs picked at random by [`/pixelart`](commands/pixelart.md) with no arguments |
| `poll.retentionDays` | 1–365 | `90` | Days polls and votes are kept for [`/poll -r`](commands/poll.md#result) |
| `screenshot.timeout` | 5–120 | `30` | Seconds [`/screenshot`](commands/screenshot.md) waits for the page to load (a page that never settles is shot with what it has) |
| `show.alert.deleted` | on/off | `on` | Alerts you in your private chat when someone deletes a message; `off` only stores it for `/show` |
| `show.alert.edited` | on/off | `on` | Alerts you in your private chat when someone edits a message; `off` only stores it for `/show -e` |
| `show.alert.reaction` | on/off | `on` | Alerts you in your private chat when someone removes or changes a reaction; `off` only stores it for `/show -r` |
| `show.alert.status` | on/off | `on` | Recovers deleted statuses; `off` ignores them (no alert, no `/show`) |
| `show.delayMs` | 0–10000 | `700` | Interval between `/show` sends |
| `show.max` | 1–100 | `20` | Max messages per `/show -N` |
| `stats.enable` | on/off | `on` | Counts each chat's messages for `/stats`; `off` stops counting (the history stays) |
| `stats.retentionDays` | 7–365 | `90` | Days the `/stats` counters are kept (and the max period of `/stats -N`) |
| `status.warnAfter` | 1–50 | `3` | From how many Status posts in 24 hours `/status` warns about the risk of a ban (it doesn't block) |
| `sticker.author` | text | `https://github.com/jpereira/zapbot/` | Sticker author |
| `sticker.name` | text | `ZapBot` | Sticker pack name |
| `stocks.alert.intervalMin` | 1–60 | `5` | Interval, in minutes, between [price alert](commands/stocks.md#price-alerts) checks of `/stocks` |
| `stocks.alert.max` | 1–100 | `20` | Max price alerts of `/stocks` |
| `stocks.alert.msgPrepend` | text | `🔔 ` | Literal text before `/stocks -alert` event messages in the list, Web and notifications; leading/trailing spaces are kept |
| `stocks.symbols` | list | `USD, EUR, USDT, MSTR` | Symbols shown by [`/stocks`](commands/stocks.md) : currencies against the real (`USD`, `EUR`, `GBP`, `USDT`) and Yahoo Finance tickers (`MSTR`, `NVDA`, `PETR4.SA`, `BRK-B`, `^GSPC`); usually changed with `/stocks -a`/`-d` |
| `stt.beam` | 1–10 | `1` | Beam size of the faster-whisper search in [`/stt`](commands/stt.md) (`1` is the fastest; more can get a little more right and takes longer). `-beam` changes it per call |
| `stt.engine` | `local`, `gpt` | `local` | Engine of [`/stt`](commands/stt.md) and `/get -stt`: `local` (faster-whisper, no key) or `gpt` (ChatGPT, OpenAI API). `-gpt` and `-local` pick it per call |
| `stt.footer` | on/off | `on` | Ends the /stt and /get -stt transcription with the tip "💡 Transcribed by <engine>". -quiet (-q) hides it on the call. |
| `stt.language` | text | `auto` | Language of the speech in [`/stt`](commands/stt.md) (`pt`, `en`, `es`...). `auto`: whisper detects it. `-lang` changes it per call |
| `stt.maxMinutes` | 1–180 | `20` | Longest audio (minutes) `/get -stt` transcribes: it uses the server CPU |
| `stt.model` | text | `small` | faster-whisper model of [`/stt`](commands/stt.md): `tiny`, `base`, `small`, `medium` or `large-v3-turbo` (bigger is better and slower). `small` comes in the image; another one is downloaded the first time. `-model` changes it per call |
| `stt.vad` | on/off | `on` | Skips the silence and the music before transcribing in [`/stt`](commands/stt.md) (where whisper invents text). `-vad on\|off` changes it per call |
| `tldr.footer` | on/off | `on` | Ends the /tldr summary with the tip "💡 Summarized by ChatGPT". -quiet (-q) hides it on the call. |
| `tldr.maxMsgs` | 10–2000 | `500` | Max messages sent to OpenAI per [`/tldr`](commands/tldr.md) |
| `translate.lang` | text | `pt` | Default target language of [`/translate`](commands/translate.md) (code: `pt`, `en`, `es`...) |
| `tts.engine` | `local`, `gpt` | `local` | Engine of [`/tts`](commands/tts.md): `local` (Piper voice, no key) or `gpt` (ChatGPT, OpenAI speech API). `-gpt` and `-local` pick it per call |
| `tts.footer` | on/off | `on` | Adds the tip "💡 Generated by <engine>" to the "audio generated below" notice of /tts and /gpt -voice. -quiet (-q) hides it on the call. |
| `tts.maxChars` | 100–100000 | `32000` | Max characters of the text of [`/tts`](commands/tts.md) and `/gpt -voice`. The local voice (Piper) speaks it all; ChatGPT gets it in parts of 4096 (the API limit) and the audio is joined (the longer the text, the more it costs) |
| `tts.pause` | 0–3000 | `300` | Silence (ms) between the lines of a `/tts` with several lines ([one audio](commands/tts.md#several-lines-and-a-beat)). A blank line doubles it. `-pause` changes it per call |
| `tts.pitch` | -12–12 | `0` | Pitch of the [`/tts`](commands/tts.md) and `/gpt -voice` voice, in semitones (`0` normal, `3` higher, `-3` lower). `-pitch` (`-pi`) changes it per call |
| `tts.speed` | 50–200 | `50` | Speed of the local (Piper) voice of [`/tts`](commands/tts.md), in % (`100` is the engine's original speed, `150` faster; the default `50` speaks slower, which is nicer to hear). With `-gpt`, `gpt.tts.speed` applies. `-speed` (`-sp`) changes it per call |
| `tts.voice.en` | text | `en_US-lessac-medium` | Local (Piper) voice of [`/tts`](commands/tts.md) for English text: `en_US-lessac-medium`, `en_US-amy-medium`, `en_GB-alan-medium`... One that is not in the image is downloaded the first time |
| `tts.voice.pt` | text | `pt_BR-faber-medium` | Local (Piper) voice of [`/tts`](commands/tts.md) for Portuguese text: `pt_BR-faber-medium`, `pt_BR-edresson-low`, `pt_PT-tugão-medium`... One that is not in the image is downloaded the first time |
| `tts.volume` | 20–300 | `100` | Volume of the [`/tts`](commands/tts.md) and `/gpt -voice` voice, in % (`100` normal, `200` twice as loud). `-volume` (`-vol`) changes it per call |
| `usage.footer` | on/off | `on` | After a command with a usage limit, says how many calls are left (`📊 /gpt: 1 of 3 per day left`) |
| `usage.logDays` | 1–365 | `90` | Days the history of limited calls (`/usage -l`) is kept |
| `warn.max` | 0–20 | `3` | How many [`/warn`](commands/warn.md) warnings remove someone from the group (the bot has to be an admin of it). `0`: only counts, never removes |
| `watch.hitsRetentionDays` | 1–365 | `30` | Days `/watch` hits are kept |
| `watch.max` | 1–100 | `20` | Max `/watch` rules |
| `watch.rules` | list (one per line) | *(empty)* | `/watch` rules: text or `/regex/flags`. Created with `/watch <rule>` and removed with `/watch -rm N` |
| `watch.showMax` | 1–100 | `20` | Max hits shown by `/watch`, including with `-N` and `-show` |
| `weather.city` | text | `Niteroi, Rio de Janeiro, Brazil` | `/weather` city when none is given |
| `weather.maxDays` | 1–16 | `16` | Max days of `/weather N` (or `Nd`), counting today; 16 is the Open-Meteo limit |
| `weather.sources` | list | `met`, `cptec` | Extra sources of [`/weather`](commands/weather.md#other-sources), besides Open-Meteo: `met` (MET Norway) and `cptec` (CPTEC/INPE, Brazil only). Empty: Open-Meteo only |
| `zapbot.api.enabled` | on/off | `off` | Turns on the local HTTP API ([API and MCP](api.md)): `/health`, `/status`, `/notes` and `/send`, with `zapbot.api.key`. Takes effect after restarting the bot |
| `zapbot.api.host` | text | `127.0.0.1` | Address the API listens on. The default only serves the machine itself; elsewhere, put an HTTPS proxy in front. Takes effect after restarting |
| `zapbot.api.key` | text (can be empty) | *(empty)* | The API key (`Authorization: Bearer <key>` or `X-API-Key` header), at least 20 characters. Empty: the API does not start. Shown masked; use a long random key |
| `zapbot.api.port` | 1024–65535 | `3100` | Port of the HTTP API. Takes effect after restarting |
| `zapbot.api.sendTo` | list | *(empty)* | Where `POST /send` and the MCP `send_message` may send besides your own chat: phone numbers with country code, group ids (`…@g.us`) or `all` (any destination: only if you trust whoever has the key) |
| `zapbot.client.userAgent` | text | `ZapBot/$version ($build) ($revision)` | User-Agent template for external HTTP requests and `/screenshot`; expands `$version`, `$build` and `$revision` for the installed build |
| `zapbot.email.alerts` | on/off | `on` | Email alerts (crash, outage, reconnection...) through the QR Code SMTP. See [Email alerts](emails.md#email-alerts) |
| `zapbot.lang` | `en_US`, `pt_BR` | `en_US` | Language of the bot: the help (`-h`, `/help`) and all the replies, alerts, errors, dates, and numbers are shown in it. `/set zapbot.lang pt_BR` (or `/set zapbot.lang=pt_BR`) switches to Portuguese; `pt-BR`, `pt` and `en` are accepted too. The descriptions that `/set` shows for each setting stay in Portuguese |
| `zapbot.mcp.enabled` | on/off | `off` | **Experimental.** Turns on the API's MCP server (`POST /mcp`), so an AI client can send messages (to `zapbot.api.sendTo`) and read your `/notes`. Needs `zapbot.api.enabled` and `zapbot.api.key` |
| `zapbot.web.enabled` | on/off | `off` | Turns on the [web interface](web.md): the history of the database in the style of WhatsApp Web, behind a password. Takes effect after restarting the bot |
| `zapbot.web.host` | text | `127.0.0.1` | Address the web interface listens on. The default only serves the machine itself; elsewhere, put an HTTPS proxy in front. In Docker the `ZAPBOT_WEB_HOST` variable (`0.0.0.0` in the image) wins. Takes effect after restarting |
| `zapbot.web.login` | text (can be empty) | *(empty)* | The login name of the [web interface](web.md), chosen by you (3 to 40 characters: letters, digits, `.`, `-`, `_`, `@`): `/set zapbot.web.login <name>`. Together with `zapbot.web.password`; empty: the interface does not start |
| `zapbot.web.pageSize` | 20–500 | `100` | How many messages the web interface loads at a time (the older ones come as you scroll) |
| `zapbot.web.password` | text (can be empty) | *(empty)* | The web interface password: `/set zapbot.web.password <password>` (at least 8 characters); the bot stores only the scrypt hash. Empty: the interface does not start |
| `zapbot.web.port` | 1024–65535 | `3200` | Port of the web interface. Takes effect after restarting |
| `zapbot.web.refreshSeconds` | 0–300 | `15` | How often (seconds) the web interface looks for new messages in the open chat (`0` turns it off) |
| `zapbot.web.sessionHours` | 1–720 | `12` | Hours a web login lasts (then it asks for the password again). Restarting the bot ends every login |
| `zapbot.web.sessionTimeout` | 0–1440 | `30` | Idle minutes before a web session expires. `0` disables this limit |
| `zapbot.web.totp` | text (can be empty) | *(empty)* | Base32 secret of the 6-digit code (Google Authenticator, Authy...) asked at the web login **besides the password**. Empty: only the password. `/set zapbot.web.totp new` makes it and sends the QR code in your private chat; it turns on when you type the code of the app. See [Web interface](web.md#two-step-login-2fa) |
| `zapbot.web.trustProxy` | on/off | `off` | Reads `X-Forwarded-For` and `X-Forwarded-Proto` from the proxies listed in `ZAPBOT_WEB_TRUSTED_PROXIES` |
| `zapbot.web.url` | text (can be empty) | *(empty)* | The address you open the [web interface](web.md) at (`http://192.168.1.253:3200`, `https://zap.example.com`), shown by the bot in the startup message. Empty: the bot finds the machine's IP (in Docker, set it: the container does not know the server IP; the compose reads `ZAPBOT_WEB_URL` from `docker/.env`) |
| `zapbot.web.warnAccess` | on/off | `on` | Warns you (⚠️) in your private chat when someone who is not logged in opens the login page of the web interface: one notice per address every 10 minutes, at most 5 in 10 minutes. `off` turns it off |
| `zapbot.web.warnChangedPhone` | on/off | `on` | The web interface shows the WhatsApp notices that someone's security code changed (`🔒 <name>'s security code changed`). Off: they leave the history and the counts |

A new key is declared in `SETTINGS_SCHEMA` (`src/settings.js`), **in alphabetical order**, with
default, type, description and limits (`allowEmpty` for text that can be empty, `secret` to mask
the value in `/set` and in the logs), and read with `getSetting('<key>')`. Invalid values in the
database are ignored at boot (the default applies, with a warning in the logs).

A text setting accepts 1 to 100 characters; `secret` ones (API keys, like `gpt.api.key`)
accept up to 500, because OpenAI's `sk-proj-` keys go past 160.
