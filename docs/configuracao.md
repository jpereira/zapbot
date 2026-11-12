# `config/.env` configuration

Compose reads the file on your machine (`env_file: ../config/.env`) and passes the variables to the
container when it creates it: the file doesn't go into the image. Never commit it (it's already in
`.gitignore`). To check the values the bot is using, send `/set` in your private chat (see
[`config/.env` variables](comandos/set.md#configenv-variables)).

Running outside Docker (`node app.js`), the bot reads the same file Compose uses: `config/.env`.
Variables already defined in the environment take priority over the ones in the file. Outside
Docker the bot still expects the programs at the image paths (Debian): Chromium at
`/usr/bin/chromium` (or at `PUPPETEER_EXECUTABLE_PATH`), `ffmpeg` at `/usr/bin/ffmpeg` and `yt-dlp`
at `/venv/bin/yt-dlp`; the supported way to run it is the
[Docker container](desenvolvimento.md#docker-makefile).

## Docker Compose

| Variable | Example | Description |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `zapbot` | Compose project name. Defines the volume prefix (`zapbot_wwebjs_auth`, `zapbot_app_cache`). |
| `COMPOSE_FILE` | `docker/docker-compose.yml` | Path to the compose file. Useful if you export/use this file as the Compose `.env`. |

## WhatsApp

| Variable | Example | Description |
|---|---|---|
| `PHONE_NUMBER` | `5521999999999` | **Required.** Number of the account to be paired, in the format `country code + area code + number`, without `+`, spaces or dashes. The bot sends the startup notice to it and, with debug on, the command misuse warnings. It also shows up (masked) in the QR email. |

## Advanced

| Variable | Example | Description |
|---|---|---|
| `ZAPBOT_CACHE_DIR` | `/tmp/zapbot-cache` | Directory of the database (`zapbot.db`) and the media. Default: `cache/` in the project root. The [tests](desenvolvimento.md#tests) use a temporary folder. **On Docker, don't set it**: the `app_cache` volume is mounted at `/app/cache`. |
| `ZAPBOT_COMMIT` | `4465374/vX.Y.Z` | Commit (and, after the `/`, the tag) shown in [`/version`](comandos/version.md) and in `/bot -info` (`X.Y.Z (git+4465374/vX.Y.Z)`); without the tag, it shows `X.Y.Z (devel) (git+7a89b92/HEAD)`. Usually empty: the bot reads both from `.git`, which goes into the image on every build. Only set it if you build the image without `.git`. |
| `ZAPBOT_HEARTBEAT_FILE` | `/tmp/zapbot-heartbeat.json` | [Heartbeat](operacao.md#container-health-heartbeat) file. Default: `zapbot-heartbeat.json` in the temporary directory. Read by `docker/app/healthcheck.js`. |
| `ZAPBOT_HEARTBEAT_MAX_AGE_S` | `90` | Maximum age, in seconds, of the heartbeat for the healthcheck to consider the bot healthy. |
| `ZAPBOT_EGRESS_FIREWALL` | `1` | Egress firewall (blocks access to the internal network, closing the SSRF in `/get`). Set in `docker/docker-compose.yml`, not in `config/.env`; needs `cap_add: NET_ADMIN`. Use `0` to turn it off. |

## Language

The bot's language is the `zapbot.lang` setting: `en_US` (default) or `pt_BR`
(`/set zapbot.lang pt_BR`). Today it translates the help (`-h` and `/help`); the replies of the
commands are still in Portuguese and are being migrated. The Portuguese command names
(`/desenhe`, `/tempo`...) are fixed aliases and work in either language.

## External services

Commands that query services on the internet. Only two need a key (OpenAI and GIPHY; the Aptos one is optional); the others work without any
configuration.

| Command | Service | Key |
|---|---|---|
| `/gpt`, `/tldr`, `/draw` | [OpenAI](https://platform.openai.com/) (pay per use) | `OPENAI_API_KEY` or setting `openai.api.key` |
| `/giphy` | [GIPHY](https://developers.giphy.com/) (beta key: 100 calls/hour) | `GIPHY_API_KEY` or setting `giphy.api.key` |
| `/translate` | [Google Translate](https://translate.google.com/) (free, unofficial access, no key; may be rate limited by IP) | — |
| `/weather` | [Open-Meteo](https://open-meteo.com/) | — |
| `/cve`, `/walissu` | [NVD](https://nvd.nist.gov/) (~5 queries every 30 s) | — |
| `/news` | RSS feeds (g1, Gazeta do Povo, The Hacker News...) | — |
| `/rates` | [Yahoo Finance](https://finance.yahoo.com/) (fallback: [AwesomeAPI](https://docs.awesomeapi.com.br/)) and [Binance](https://www.binance.com/) for USDT | — |
| `/crypto` | [Binance](https://www.binance.com/) | — |
| `/defi` | Solana RPC (setting `defi.solana.rpc`), the [Orca API](https://www.orca.so/), the HyperEVM RPC (setting `defi.hyperevm.rpc`, for Project X), the Aptos API (settings `defi.aptos.rpc` and `defi.aptos.indexer`, for Liquidswap), the [Morpho API](https://docs.morpho.org/) (setting `defi.morpho.api`) and the [Aave V3](https://aave.com/docs) contracts through the Ethereum and Base RPCs (`ETHEREUM_RPC_URL`, `BASE_RPC_URL`) | — |
| `/kernel` | [kernel.org](https://www.kernel.org/) | — |
| `/meme` | [imgflip](https://imgflip.com/) | — |
| `/pixelart` | [16colo.rs](https://16colo.rs/) | — |

For the keys, the `config/.env` variable takes priority; if it's empty, the setting is used, and you
can change it from WhatsApp with `/set` without restarting.

## OpenAI (optional)

| Variable | Example | Description |
|---|---|---|
| `OPENAI_ADMIN_KEY` | `sk-admin-...` | OpenAI **admin** key, only for `/gpt -usage` (the Usage API doesn't accept the regular key). If empty, the bot uses the `openai.admin.key` setting; with neither, `-usage` shows only the limits. Create it at platform.openai.com › Organization › Admin keys. |
| `OPENAI_API_KEY` | `sk-proj-...` | OpenAI key used by `/gpt` and `/tldr`. If empty, the bot uses the `openai.api.key` setting; with neither, questions and summaries are refused. Viewing and setting the model with `/gpt -m` remain available. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model for `/gpt` and `/tldr`. If empty, the bot uses the `openai.api.model` setting (default `gpt-4o-mini`), which you can change from WhatsApp with `/gpt -m`. When set, it takes priority over the setting. |
| `OPENAI_TIMEOUT_MS` | `60000` | Maximum time to wait for the response, in ms. If empty, the bot uses the `openai.timeout.ms` setting (60000). |

The cost estimate in the `-status` footer of `/gpt`, `/tldr` and `/draw` uses the `openai.pricing`
setting, which `openai.pricing.auto` keeps up to date (see [Settings](settings.md)).

## Aave V3 (optional)

| Variable | Example | Description |
|---|---|---|
| `AAVE_WALLET_ADDRESS` | `0x1234...abcd` | Wallet (public address, `0x` plus 40 hexadecimal characters) queried by [`/defi aave`](comandos/defi.md#aave-v3) when no wallet is registered (`/defi aave -wallet`). If empty, the bot uses the `defi.aave.wallet` setting. Never put a private key or seed here: the query is read-only. |
| `ETHEREUM_RPC_URL` | `https://eth-mainnet.g.alchemy.com/v2/<chave>` | Ethereum RPC for `/defi aave`. If empty, the `defi.ethereum.rpc` setting is used (the public one, which rate limits queries). |
| `BASE_RPC_URL` | `https://base-mainnet.g.alchemy.com/v2/<chave>` | Base RPC for `/defi aave`. If empty, the `defi.base.rpc` setting is used (the public one, which rate limits queries). |

## Aptos (optional)

| Variable | Example | Description |
|---|---|---|
| `APTOS_API_KEY` | `aptoslabs_...` | Aptos API key ([Geomi](https://geomi.dev/docs/start)) used by [`/defi liquidswap`](comandos/defi.md#aptos-api). Optional: without it, the anonymous per-IP limit applies. If empty, the bot uses the `defi.aptos.apikey` setting. |

## Morpho (optional)

| Variable | Example | Description |
|---|---|---|
| `MORPHO_WALLET_ADDRESS` | `0x1234...abcd` | Wallet (public address, `0x` plus 40 hexadecimal characters) queried by [`/defi morpho`](comandos/defi.md#morpho) when no wallet is registered (`/defi morpho -wallet`). If empty, the bot uses the `defi.morpho.wallet` setting. Never put a private key or seed here: the query is read-only. |

## GIPHY (optional)

| Variable | Example | Description |
|---|---|---|
| `GIPHY_API_KEY` | | GIPHY key used by `/giphy` ([developers.giphy.com](https://developers.giphy.com/)). If empty, the bot uses the `giphy.api.key` setting (`/set giphy.api.key <chave>`). |

### How to generate the GIPHY key

1. Create an account (or sign in) at [developers.giphy.com](https://developers.giphy.com/) and open
   the **Dashboard**.
2. Click **Create an API Key** and choose the **API** option (the SDK option is for mobile apps).
3. Give the app a name (e.g., `zapbot`) and a short description, accept the terms and confirm.
4. The key shows up in the Dashboard. Copy it and set it up in one of these ways:
   - in `config/.env`: `GIPHY_API_KEY=suachave` (takes effect on the next start), or
   - from WhatsApp, without restarting: `/set giphy.api.key suachave` (the `.env`
     `GIPHY_API_KEY`, if present, takes priority).

The **beta** key allows **100 calls per hour**, according to the
[GIPHY documentation](https://developers.giphy.com/docs/api/). When the query fails, the command
says it couldn't fetch the GIF. For a bigger quota, request approval for the app in the Dashboard
and check the service's production terms.

## Google Translate (optional)

No variable needed: `/translate` uses Google Translate with no key. The only cost is the possible
rate limit by IP.

## Email (QR Code and alerts)

| Variable | Example | Description |
|---|---|---|
| `QRCODE_EMAIL_ENABLE` | `"true"` / `"false"` | Turns on sending the QR Code by email. With `false`, it shows up only in the terminal. [Email alerts](emails.md#email-alerts) don't depend on it. |
| `QRCODE_EMAIL_FALLBACK_TERMINAL` | `"true"` / `"false"` | If sending the QR by email fails, shows the QR in the terminal. Default: `"true"`. |
| `QRCODE_EMAIL_SMTP_HOST` | `smtp.mail.yahoo.com` | SMTP server. |
| `QRCODE_EMAIL_SMTP_PORT` | `465` | SMTP port. **Use an implicit SSL/TLS port (465)**: the bot connects with `secure: true`, STARTTLS ports like 587 don't work. The server certificate is validated: servers with a self-signed/invalid certificate are refused, because a MITM would capture the password and the QR Code (which gives access to the account). |
| `QRCODE_EMAIL_IMAP_HOST` | `imap.mail.yahoo.com` | IMAP server (port 993, SSL). Optional: without it `/bot -flush-email` is disabled. Uses the SMTP login (`_USER` and `_PASS`). See [Clearing the email](comandos/bot.md#cleaning-the-email). |
| `QRCODE_EMAIL_SMTP_USER` | `minhaconta@yahoo.com.br` | SMTP login user. |
| `QRCODE_EMAIL_SMTP_PASS` | `abcd efgh ijkl mnop` | SMTP password. Use the SMTP credential the provider requires; on accounts with an app password, set that password instead of the login password. |
| `QRCODE_EMAIL_SMTP_FROM` | `ZapBot <minhaconta@yahoo.com.br>` | Sender. The address must be the same as the SMTP account, otherwise the provider rejects it or the email lands in spam. |
| `QRCODE_EMAIL_SMTP_TO` | `Fulano <fulano@gmail.com>` | Recipient that will get the QR (and the [email alerts](emails.md#email-alerts)). It's also the `email` destination of `-to`, used in alerts, backups, `/watch` and `/bot -status`. |
| `QRCODE_EMAIL_SMTP_ANTIPHISHING` | `MinhaFraseSecreta42` | Anti-phishing code shown in every email from the bot. See [Change the anti-phishing code](emails.md#change-the-anti-phishing-code). |

### Why you should set up email carefully

When `QRCODE_EMAIL_ENABLE="true"`, **email is where the QR shows up**: it isn't drawn in the
terminal, unless sending fails. If the host, port, user or password are wrong, sending fails (the
error shows up in the logs as `Erro ao enviar QR por email`) and, with
`QRCODE_EMAIL_FALLBACK_TERMINAL="true"` (the default), the QR goes to the logs so you can pair
anyway. With `"false"`, the bot sits waiting for a pairing you'll never be able to do.

Before enabling:

1. Check your provider's SSL host/port (e.g., Gmail `smtp.gmail.com:465`, Yahoo
   `smtp.mail.yahoo.com:465`).
2. Generate an app password and use it in `QRCODE_EMAIL_SMTP_PASS`.
3. Start the bot and check the logs for the line
   `QR Code #1 received at (...) and sent to '...' (messageId=...)`.
4. If something goes wrong, set `QRCODE_EMAIL_ENABLE="false"` and read the QR from the logs.

Also keep in mind that **whoever has access to this QR can hijack your WhatsApp account**: only send
it to an email that only you read.

## Full example

```dotenv
COMPOSE_PROJECT_NAME="zapbot"
COMPOSE_FILE=docker/docker-compose.yml

PHONE_NUMBER=5521999999999

QRCODE_EMAIL_ENABLE="true"
QRCODE_EMAIL_SMTP_HOST="smtp.gmail.com"
QRCODE_EMAIL_SMTP_PORT="465"
QRCODE_EMAIL_SMTP_USER="meubot@gmail.com"
QRCODE_EMAIL_SMTP_PASS="abcd efgh ijkl mnop"
QRCODE_EMAIL_SMTP_FROM="ZapBot <meubot@gmail.com>"
QRCODE_EMAIL_SMTP_TO="Eu <eu@exemplo.com>"
QRCODE_EMAIL_SMTP_ANTIPHISHING="TroqueEstaFrase-7f3a"
```
