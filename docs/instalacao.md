# Installation

## Requirements

- Docker with the **Docker Compose v2** plugin (`docker compose ...`)
- Git
- A phone with WhatsApp to pair
- (Optional) An SMTP account, for the QR Code and email alerts

You don't need Node, Chromium, ffmpeg or yt-dlp installed: everything ships inside the image.

## Installation (Docker)

The current stable version is `v2.0.12` (from 2026-11-05); the steps below install that version. The
notes for each one are in [Releases](https://github.com/jpereira/zapbot/releases).

```bash
# 1. Clone the project and go to the latest stable version
git clone https://github.com/jpereira/zapbot.git
cd zapbot
git checkout v2.0.12

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
[`/version`](comandos/version.md)), and after you read the QR Code you should see:

```text
[!] 🤖 Starting ZapBot X.Y.Z (git+4465374/vX.Y.Z)...
...
[+] 🔐 Whatsapp authentication success!
[+] 🤖 ZapBot X.Y.Z (git+4465374/vX.Y.Z) inicializado! Informando 5521999999999
```

and get the same message on your WhatsApp. Send `/ping` to any chat: the bot should reply `pong`.

### Update to a new version

The **stable version** is the latest release, currently `v2.0.12` (each one has its notes in
[Releases](https://github.com/jpereira/zapbot/releases)). To move to it:

```bash
git fetch --tags
git checkout v2.0.12
git describe --tags        # checks the version: v2.0.12
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

On the first run (or if the session expires) WhatsApp requires reading a QR Code. ZapBot offers two
modes, chosen by `QRCODE_EMAIL_ENABLE`:

| Mode | `QRCODE_EMAIL_ENABLE` | Where the QR shows up |
|------|------|------|
| Terminal | `false` | Drawn in ASCII in the container logs (`docker logs -f zapbot`) |
| Email   | `true`  | Sent as a PNG image to `QRCODE_EMAIL_SMTP_TO` (if sending fails, it falls back to the terminal too) |

Email mode is the **recommended** one, especially when the bot runs on a remote server/homelab and
you don't want to keep watching logs: the QR lands in your inbox, you open it on your computer and
read it with your phone in **WhatsApp › Linked devices › Link a device**. WhatsApp renews the QR
periodically; each new QR generates a new numbered email (`#1`, `#2`...) and **only the latest one
is valid**.
