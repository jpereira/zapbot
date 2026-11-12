# Settings

General bot settings stored in the SQLite `settings` table. They change right away, with no restart,
and survive restarts. To view and change them, use [`/set`](comandos/set.md).

| Key | Type | Default | Description |
|---|---|---|---|
| `agenda.max` | 1–500 | `50` | Max items in [`/cron`](comandos/cron.md), counting reminders and messages together |
| `alerta.intervalMin` | 1–60 | `5` | Interval, in minutes, between [price alert](comandos/rates.md#price-alerts) checks |
| `alerta.max` | 1–100 | `20` | Max price alerts (`/rates` and `/crypto` combined) |
| `ascii.defaultChar` | 1 character | `#` | Character used for the strokes of [`/ascii`](comandos/ascii.md) letters when `-char` is not given |
| `backup.enabled` | on/off | `on` | [Automatic backup](comandos/backup.md#automatic-backup) of the database, once a day |
| `backup.hour` | 0–23 | `3` | Hour (Brasília time) of the automatic backup |
| `backup.keep` | 1–90 | `7` | How many automatic backups (and pre-restore ones) to keep; manual ones stay until a `/backup -rm` |
| `backup.to` | text (can be empty) | `""` | [Destination of the daily backup](comandos/backup.md#automatic-backup), besides the local copy: contact, group, number or email, like `-to`. Empty: local only. For several, use `-to <destination> -to <destination>`. Sent automatically, without asking for `-sim` |
| `bot.admins` | list | *(empty)* | Other people who can also use the `admin` and `owner` commands: number with country code (`5521999999999`) or, through `/set`, the contact name (`/Jorge Pereira/`) or the mention. Only the owner can change it; `/bot +a`/`-a` is the shortcut. See [Extra admins](comandos/bot.md#extra-admins) |
| `bot.login` | text (can be empty) | `""` | Hash (scrypt) of the `/bot -login` password, which turns an outsider into an admin. Empty: login disabled. Set it with `/bot -passwd`, not `/set`. Secret |
| `bot.paused` | on/off | `off` | Bot turned off: all commands ignored, except `/bot` (same as `/bot -on`/`-off`) |
| `bot.users` | list | `false` | Who uses the regular (non-admin) commands, besides you and `bot.admins`: `false` (nobody), `true` (everybody) or people and groups (for a group, everyone in it can use them, but only inside it); a person in just one group is stored as `phone:group-id`. Only the owner can change it; `/bot +u`/`-u` is the shortcut. See [Users](comandos/bot.md#users) |
| `bot.users.cmds` | list | *(empty)* | Each user's commands (`/bot +cmd`/`-cmd`): `item=/a,/b` (only those) or `item=!/a,/b` (all regular ones, except those), with the `bot.users` item. An `admin` command (`/gpt`...) only works in the "only those" list. No line: all regular commands. See [Each user's commands](comandos/bot.md#each-users-commands) |
| `cache.editedRetentionDays` | 1–365 | `30` | Days edited messages are kept for `/show -e` |
| `cache.messageMediaRetentionHours` | 68–2160 | `68` | Hours the media of regular messages (photos, videos, audios, documents) stays on disk (68; up to 2160 = 90 days). Never longer than `cache.messageRetentionHours`: the media goes away with the message. It takes space in `cache/media`; `/cache -media` frees only it |
| `cache.messageRetentionHours` | 68–2160 | `68` | Hours the text of regular messages stays in the database (68, the delete-for-everyone window; up to 2160 = 90 days): the more, the further back `/tldr` reaches. Media has its own limit, `cache.messageMediaRetentionHours` |
| `cache.reactionRetentionDays` | 1–365 | `30` | Days removed or changed reactions are kept for `/show -r` |
| `cache.revokedRetentionDays` | 1–365 | `30` | Days deleted messages are kept for `/show` |
| `commands.disabled` | list | *(empty)* | Commands disabled at runtime: the bot ignores them and they disappear from `/help`. `/set` cannot be disabled. Unknown names are ignored with a warning in the log; valid aliases are normalized |
| `cotacao.coins` | list | `EUR, USDT` | Currencies enabled in `/rates` (`USD`, `EUR`, `GBP`, `USDT`); usually changed with `/rates -a`/`-d` |
| `crypto.coins` | list | `BTC, ETH, SOL, HYPE` | Coins in `/crypto` (supported ones only); usually changed with `/crypto -a`/`-d` |
| `cve.max` | 1–20 | `10` | Number of CVEs shown by `/cve` (`/cve <max>` overrides it) |
| `cve.maxDays` | 1–120 | `7` | Window, in days, of `/cve -highscore` |
| `debug.copyTo` | text (can be empty) | *(empty)* | Chat that receives a copy of the logs; set it with [`/debug -copy-to`](comandos/debug.md). Empty: console only |
| `debug.enabled` | on/off | `off` | Debug mode (same as `/debug -on`/`-off`) |
| `debug.filter` | text (can be empty) | *(empty)* | `/regex/flags` filter for the logs during debug. Empty: no filter; `/debug -off` clears it. The filter applies after startup; matches are highlighted in the console with colors |
| `debug.level` | 0–3 | `0` | Cumulative level: basic, functions and commands, integrations, development. See [`/debug`](comandos/debug.md) |
| `defi.aave.chains` | list | `1 8453` | Networks (chain id) where [`/defi aave`](comandos/defi.md#aave-v3) looks for positions: `1` (Ethereum), `8453` (Base) |
| `defi.aave.wallet` | text (can be empty) | *(empty)* | Wallet for [`/defi aave`](comandos/defi.md#aave-v3) when no wallet is registered, used when `AAVE_WALLET_ADDRESS` is not in `config/.env` |
| `defi.alerta.intervalMin` | 1–1440 | `10` | Interval (minutes) between [`/defi -alerta`](comandos/defi.md#out-of-range-alert) checks; it queries the positions on Solana and HyperEVM, depending on the protocol |
| `defi.aptos.apikey` | text (can be empty) | *(empty)* | Aptos API key ([Geomi](https://geomi.dev/docs/start)) used by [`/defi liquidswap`](comandos/defi.md#liquidswap), when `APTOS_API_KEY` is not in `config/.env`. Optional: without it, the anonymous per-IP limit applies, which is enough for the bot. Shown masked |
| `defi.aptos.indexer` | URL | `https://api.mainnet.aptoslabs.com/v1/graphql` | Aptos GraphQL indexer used by [`/defi liquidswap`](comandos/defi.md#liquidswap) to find the wallet's positions |
| `defi.aptos.rpc` | URL | `https://api.mainnet.aptoslabs.com/v1` | Aptos fullnode REST API used by [`/defi liquidswap`](comandos/defi.md#liquidswap) to read pools and tokens. Shown masked |
| `defi.base.rpc` | URL | `https://mainnet.base.org` | Base RPC used by [`/defi aave`](comandos/defi.md#aave-v3), when `BASE_RPC_URL` is not in `config/.env`. The public one limits queries. Shown masked |
| `defi.ethereum.rpc` | URL | `https://ethereum-rpc.publicnode.com` | Ethereum RPC used by [`/defi aave`](comandos/defi.md#aave-v3), when `ETHEREUM_RPC_URL` is not in `config/.env`. The public one limits queries. Shown masked |
| `defi.hyperevm.rpc` | URL | `https://rpc.hyperliquid.xyz/evm` | HyperEVM RPC used by [`/defi`](comandos/defi.md) on Project X. The public one limits queries; a private RPC usually has the key in the URL. Shown masked |
| `defi.morpho.api` | URL | `https://api.morpho.org/graphql` | Official Morpho GraphQL API, used by [`/defi morpho`](comandos/defi.md#morpho) |
| `defi.morpho.chains` | list | `8453` | Networks (chain id) where [`/defi morpho`](comandos/defi.md#morpho) looks for positions: `8453` (Base), `1` (Ethereum)... |
| `defi.morpho.wallet` | text (can be empty) | *(empty)* | Wallet for [`/defi morpho`](comandos/defi.md#morpho) when no wallet is registered, used when `MORPHO_WALLET_ADDRESS` is not in `config/.env` |
| `defi.solana.rpc` | URL | `https://api.mainnet-beta.solana.com` | Solana RPC used by [`/defi`](comandos/defi.md#solana-rpc). Shown masked (the URL usually carries the key) |
| `email.alerts` | on/off | `on` | Email alerts (crash, outage, reconnection...) through the QR Code SMTP. See [Email alerts](emails.md#email-alerts) |
| `enquete.retentionDays` | 1–365 | `90` | Days polls and votes are kept for [`/poll -r`](comandos/poll.md#result) |
| `flood.intervalCommand` | 1–3600 | `2` | Flood protection: the window, in seconds, in which `flood.maxCommandRepeated` is counted, and how long the bot ignores whoever went over the limit. See [Flood protection](comandos/bot.md#flood-protection) |
| `flood.maxCommandRepeated` | 0–100 | `3` | How many times a non-admin can repeat the same command within `flood.intervalCommand` seconds; past that, the bot warns once and ignores the person until the interval ends. `0` turns it off |
| `get.cache.maxDays` | 1–365 | `2` | Days cached downloads (`get.cache.tmp`) stay in `cache/tmp` before the periodic cleanup deletes them |
| `get.cache.tmp` | on/off | `on` | Keeps in `cache/tmp` what yt-dlp downloads in `/get` and `/sticker`: the same link (and the same clip) is not downloaded again. See [Download cache](comandos/get.md#download-cache). `off` deletes the original on every run |
| `get.maxDownloadMB` | 10–2000 | `200` | Max size downloaded by yt-dlp in `/get` and `/sticker`, before conversion |
| `get.maxSizeMB` | 1–100 | `20` | Max size of the file converted by ffmpeg in `/get` and `/sticker` |
| `gif.tag` | text | `fail` | Default tag for `/giphy` |
| `giphy.api.key` | text (can be empty) | *(empty)* | GIPHY key, used when `GIPHY_API_KEY` is not in `config/.env`. Shown masked (`••••1234`); `/set -reset giphy.api.key` clears it |
| `me.maxRepeat` | 1–1000 | `500` | Max repetitions of [`/me -repeat`](comandos/me.md) (`-r <n>`) |
| `monitor.enabled` | on/off | `on` | Periodic checks of [`/monitor`](comandos/monitor.md); `off` pauses without deleting contacts or history |
| `monitor.max` | 1–5 | `5` | Max monitored contacts. More contacts mean more queries and a higher risk of being blocked; hard limit of 5. Remove contacts before lowering it below the number registered |
| `monitor.maxRecords` | 1–1000 | `30` | Max timestamps kept per contact and shown in `/monitor` and `/monitor -l`. Lowering it immediately removes the oldest excess timestamps |
| `monitor.pool` | 120–86400 | `300` | Minimum interval in seconds per contact: default 5 min, minimum 2 min. Short intervals may contribute to WhatsApp blocking; no interval is guaranteed to be safe |
| `news.brasil` | list | 15 blogs from [feedspot](https://rss.feedspot.com/brazil_rss_feeds/) | RSS feeds for `/news -brasil` |
| `news.g1` | list | `https://g1.globo.com/dynamo/rss2.xml` | RSS feeds for `/news -g1` |
| `news.gazeta` | list | `https://www.gazetadopovo.com.br/feed/rss/brasil.xml` | RSS feeds for `/news -gazeta` |
| `news.hack` | list | The Hacker News, BleepingComputer, Krebs on Security | RSS feeds for `/news -hack` |
| `news.max` | 1–10 | `5` | Headlines shown by `/news` (`/news <count>` overrides it) |
| `openai.admin.key` | text (can be empty) | *(empty)* | OpenAI admin key (`sk-admin-...`) for `/gpt -usage`, used when `OPENAI_ADMIN_KEY` is not in `config/.env`. Shown masked; `/set -reset openai.admin.key` clears it |
| `openai.api.key` | text (can be empty) | *(empty)* | OpenAI key, used when `OPENAI_API_KEY` is not in `config/.env`. Shown masked (`••••1234`); `/set -reset openai.api.key` clears it |
| `openai.api.model` | text (from the list) | `gpt-4o-mini` | `/gpt` model, used when `OPENAI_MODEL` is not in `config/.env`. Accepted: the ones listed by `/gpt -m` |
| `openai.credit.since` | text (YYYY-MM-DD, can be empty) | *(empty)* | Purchase date of the OpenAI credits: `/gpt -usage` adds up the spending since then to show `$used/$total` (empty: the last 180 days) |
| `openai.credit.total` | 0–100000 | `0` | Total OpenAI credits purchased, in dollars (the API doesn't report the balance): `/gpt -usage` shows `$used/$total`. `0`: doesn't show it |
| `openai.gif.frameMs` | 20–2000 | `200` | How long each frame of the `/draw -gif` and `/gpt -gif` GIF lasts, in ms (the total is frames x ms) |
| `openai.gif.frames` | 2–16 | `9` | How many frames the `/draw -gif` and `/gpt -gif` GIF has (the more frames, the more expensive) |
| `openai.image.gifModel` | text | `gpt-image-2.6-flare` | Model that generates the `/draw -gif` and `/gpt -gif` GIF (only the `gpt-image-2.6-*` ones make GIFs and require preview access): the id your account has (if it doesn't exist, the bot lists the ones the key sees) |
| `openai.image.model` | text | `gpt-image-2` | Model that generates and edits the image for `/draw` and `/gpt -img`: the id your account has (if it doesn't exist, the bot lists the ones the key sees). The GIF has its own, `openai.image.gifModel` |
| `openai.pricing` | list `model=input/output` | *(empty)* (`/gpt -prices` or the automatic update fills it in) | Price per 1M tokens, in dollars, for the estimated cost in the status footer of `/gpt` and `/tldr` (model without a price: `custo n/d`). The exact name or the longest prefix applies |
| `openai.pricing.auto` | on/off | `on` | Updates `openai.pricing` by itself every 15 days, reading the OpenAI website (like `/gpt -prices`); only runs with the OpenAI key configured. Off: manual only |
| `openai.pricing.updated` | `YYYY-MM-DD` | *(empty)* | Date of the last `openai.pricing` update (written by the bot): empty: not updated yet |
| `openai.status` | on/off | `on` | Status footer in `/gpt` and `/tldr` replies: bytes sent (TX) and received (RX), tokens spent, estimated cost and balance (with it off, `-status` turns it on just that once) |
| `openai.timeout.ms` | 5000–300000 | `60000` | `/gpt` timeout, used when `OPENAI_TIMEOUT_MS` is not in `config/.env` |
| `openai.transcribe.model` | text | `gpt-transcribe` | Model that transcribes the audio replied to with `/gpt`: the id your account has (`whisper-1` goes offline in Feb/2027) |
| `openai.tts.instructions` | text | `Fale como um robô: voz metálica, monótona e pausada, sem emoção.` | Voice style for `/gpt -voz` (only `gpt-4o-mini-tts` uses it) |
| `openai.tts.model` | text | `gpt-4o-mini-tts` | Model that generates the voice for `/gpt -voz`: the id your account has (only the `gpt-4o-*` ones follow the style) |
| `openai.tts.voice` | text (from the list) | `onyx` | Voice for `/gpt -voz`: `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer` or `verse` |
| `pixelart.maxParts` | 1–10 | `3` | Max parts of [`/pixelart`](comandos/pixelart.md) when the art is taller than 4096 px |
| `pixelart.packs` | list | `chuck-norris-lvl` | 16colo.rs packs picked at random by [`/pixelart`](comandos/pixelart.md) with no arguments |
| `show.alert.deleted` | on/off | `on` | Alerts you in your private chat when someone deletes a message; `off` only stores it for `/show` |
| `show.alert.edited` | on/off | `on` | Alerts you in your private chat when someone edits a message; `off` only stores it for `/show -e` |
| `show.alert.reaction` | on/off | `on` | Alerts you in your private chat when someone removes or changes a reaction; `off` only stores it for `/show -r` |
| `show.alert.status` | on/off | `on` | Recovers deleted statuses; `off` ignores them (no alert, no `/show`) |
| `show.delayMs` | 0–10000 | `700` | Interval between `/show` sends |
| `show.max` | 1–100 | `20` | Max messages per `/show -N` |
| `stats.enable` | on/off | `on` | Counts each chat's messages for `/stats`; `off` stops counting (the history stays) |
| `stats.retentionDays` | 7–365 | `90` | Days the `/stats` counters are kept (and the max period of `/stats -N`) |
| `sticker.author` | text | `https://github.com/jpereira/zapbot/` | Sticker author |
| `sticker.name` | text | `ZapBot` | Sticker pack name |
| `tempo.city` | text | `Niteroi, Rio de Janeiro, Brazil` | `/weather` city when none is given |
| `tempo.maxDays` | 1–16 | `16` | Max days of `/weather N` (or `Nd`), counting today; 16 is the Open-Meteo limit |
| `tldr.maxMsgs` | 10–2000 | `500` | Max messages sent to OpenAI per [`/tldr`](comandos/tldr.md) |
| `traduzir.lang` | text | `pt` | Default target language of [`/translate`](comandos/translate.md) (code: `pt`, `en`, `es`...) |
| `watch.hitsRetentionDays` | 1–365 | `30` | Days `/watch` hits are kept |
| `watch.max` | 1–100 | `20` | Max `/watch` rules |
| `watch.rules` | list (one per line) | *(empty)* | `/watch` rules: text or `/regex/flags`. Created with `/watch <rule>` and removed with `/watch -rm N` |
| `watch.showMax` | 1–100 | `20` | Max hits shown by `/watch`, including with `-N` and `-show` |

A new key is declared in `SETTINGS_SCHEMA` (`src/settings.js`), **in alphabetical order**, with
default, type, description and limits (`allowEmpty` for text that can be empty, `secret` to mask
the value in `/set` and in the logs), and read with `getSetting('<key>')`. Invalid values in the
database are ignored at boot (the default applies, with a warning in the logs).

A text setting accepts 1 to 100 characters; `secret` ones (API keys, like `openai.api.key`)
accept up to 500, because OpenAI's `sk-proj-` keys go past 160.
