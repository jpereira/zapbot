# Installation

## Requirements

- Docker with the **Docker Compose v2** plugin (`docker compose ...`)
- Git
- A phone with WhatsApp to pair
- (Optional) An SMTP account, for the QR Code and email alerts

You don't need Node, Chromium, ffmpeg or yt-dlp installed: everything ships inside the image.

Run `docker compose version` before starting. Compose must support
`env_file.required` for the optional `docker/.env` file.

## Installation (Docker)

The current stable version is `v1.0.26` (from 2026-11-26); the steps below install that version. The
notes for each one are in [Releases](https://github.com/jpereira/zapbot/releases).

```bash
# 1. Clone the project and go to the latest stable version
git clone https://github.com/jpereira/zapbot.git
cd zapbot
git checkout v1.0.26

# 2. Create the config file from the example and edit it
cp config/.env.example config/.env
vim config/.env            # PHONE_NUMBER and, recommended, the QR Code email (see below)

# 3. Build the image
docker compose -f docker/docker-compose.yml build zapbot

# 4. Start the container in the background
docker compose -f docker/docker-compose.yml up -d zapbot

# 5. Follow the logs (and read the QR Code, if in terminal mode)
docker logs -f zapbot
```

> 💡 To avoid repeating `-f docker/docker-compose.yml` in every command:
> `export COMPOSE_FILE=docker/docker-compose.yml`

Right at the start of the logs the version shows up, with the commit and the tag (see
[`/version`](commands/version.md)), and after you read the QR Code you should see:

```text
[!] 🤖 Starting ZapBot X.Y.Z (git+4465374/vX.Y.Z)...
...
[+] 🔐 Whatsapp authentication success!
[+] 🤖 ZapBot X.Y.Z (git+4465374/vX.Y.Z) ready! Reporting to 5521999999999
```

and get a message on your WhatsApp (`🤖 ZapBot X.Y.Z (git+4465374/vX.Y.Z) started.`). Send `/ping` to any chat: the bot should reply `pong`.

### Update to a new version

The **stable version** is the latest release, currently `v1.0.26` (each one has its notes in
[Releases](https://github.com/jpereira/zapbot/releases)). To move to it:

```bash
git fetch --tags
git checkout v1.0.26
git describe --tags        # checks the version: v1.0.21
docker compose -f docker/docker-compose.yml build zapbot
docker compose -f docker/docker-compose.yml up -d --force-recreate zapbot
```

Checking out a tag leaves the repository in *detached HEAD*; git's warning is expected and harmless.
The WhatsApp session and the database live in volumes, so they survive the rebuild.

#### Development version (HEAD)

The `main` branch has the latest changes, which haven't become a release yet: it may have
incomplete or broken features. Use it only to test or develop.

```bash
git checkout main
git pull
docker compose -f docker/docker-compose.yml build zapbot
docker compose -f docker/docker-compose.yml up -d --force-recreate zapbot
```

To go back to the stable one, repeat the commands above (`git fetch --tags` and the `git checkout`
of the latest tag).

## Authentication: QR Code in the terminal or by email

On the first run (or if the session expires) WhatsApp requires reading a QR Code. It can show up in
three places:

| Place | Turned on by | Where the QR shows up |
|------|------|------|
| Terminal | the default (`QRCODE_EMAIL_ENABLE="false"`) | Drawn in ASCII in the container logs (`docker logs -f zapbot`) |
| Email   | `QRCODE_EMAIL_ENABLE="true"`  | Sent as a PNG image to `QRCODE_EMAIL_SMTP_TO` (if sending fails, it falls back to the terminal too, unless `QRCODE_EMAIL_FALLBACK_TERMINAL` is `false`) |
| Web | the [web interface](web.md) on | In **🩺 Health**, behind the web login, with a bar on the other pages; always, and the terminal and the email give its direct address, `<web>/qr` |

With the web on, how they combine:

| `config/.env` | The QR goes to | The terminal says |
|---|---|---|
| nothing (the default) | the terminal and the web | the QR, and `QR Code #1: also on the web: https://zap.example.com/qr` |
| `QRCODE_EMAIL_ENABLE="true"` | the email and the web (the email has the address too) | `... sent to 'you@...'` and `QR Code #1: also on the web: https://zap.example.com/qr` |
| `QRCODE_WEB_ONLY="true"` | only the web (neither the terminal nor the email) | `QR Code #1: sent only to the web (QRCODE_WEB_ONLY): https://zap.example.com/qr` |

With the web off, the web is simply not there: the terminal or the email, as always. `QRCODE_WEB_ONLY="true"` with
the web off is ignored, with an error in the log (`QRCODE_WEB_ONLY is true, but the web interface is off`): a QR that
reaches nowhere would leave the bot waiting for a pairing nobody can do.

For example, a homelab where you always open the web from the phone and never look at the logs:

```bash
# config/.env
QRCODE_WEB_ONLY="true"
ZAPBOT_WEB_ENABLED="true"
```

and, in the logs, one line per code (WhatsApp renews it about every 20 s):

```text
[2026-11-26 15:28:41] [!] QR Code #1: sent only to the web (QRCODE_WEB_ONLY): https://zap.example.com/qr
[2026-11-26 15:29:01] [!] QR Code #2: sent only to the web (QRCODE_WEB_ONLY): https://zap.example.com/qr
```

The address is `zapbot.web.url` (or `ZAPBOT_WEB_URL`) with `/qr`: it opens Health, through the login. When the
session is lost, the web shows **📲 WhatsApp needs to be paired** on top of every page, and the phones with the
[push notices](web.md#the-installable-app-and-the-notices-on-the-device) of the connection on get a notification
that opens it. See [Pairing from the web](web.md#pairing-from-the-web).

Email mode is the **recommended** one, especially when the bot runs on a remote server/homelab and
you don't want to keep watching logs: the QR lands in your inbox, you open it on your computer and
read it with your phone in **WhatsApp › Linked devices › Link a device**. WhatsApp renews the QR
periodically; each new QR generates a new numbered email (`#1`, `#2`...) and **only the latest one
is valid**.
