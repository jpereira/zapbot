# Day-to-day operation

Run the Docker commands from the project root:

| Action | Command |
|---|---|
| View logs | `docker logs -f zapbot` |
| Restart | `docker compose -f docker/docker-compose.yml restart zapbot` |
| Stop | `docker compose -f docker/docker-compose.yml stop zapbot` |
| Shell in the container | `docker exec -it zapbot bash -l` |
| Query the database | `docker exec -it zapbot sqlite3 cache/zapbot.db` |
| View settings | `docker exec -it zapbot sqlite3 cache/zapbot.db "SELECT * FROM settings"` |
| Clear messages/media | From WhatsApp: `/cache -a` (everything, including backups), `/cache -m` (media only) or `/cache -b` (backups only). See [`/cache`](comandos/cache.md) |
| Bot status (up, cache, deleted...) | From WhatsApp: `/bot -status` (or `/bot -status 06h` to get it every day). See [`/bot -status`](comandos/bot.md#bot-status) |
| Versions (Node.js, Chromium, yt-dlp, ffmpeg...) and system | From WhatsApp: `/bot -info`. See [System information](comandos/bot.md#system-information) |
| Test everything (cache, disk, database, WhatsApp, internet, speed, SMTP, programs) | From WhatsApp: `/bot -test`, with ✅ or ❌ on each item. See [Bot test](comandos/bot.md#bot-test) |
| Contact monitor | From WhatsApp: `/monitor -l` (list and history), `/set monitor.enabled false` (pause), `/monitor -rm all` (delete local registrations and histories). See [`/monitor`](comandos/monitor.md) |
| Database backup | From WhatsApp: `/backup -now` (create), `/backup -s` (send the file). See [`/backup`](comandos/backup.md) |
| **Force a new QR** (deletes the session) | `docker compose -f docker/docker-compose.yml down && docker volume rm zapbot_wwebjs_auth && docker compose -f docker/docker-compose.yml up -d zapbot` |

The container uses `restart: unless-stopped`, so it comes back on its own after a host reboot.

## Container health (heartbeat)

`restart: unless-stopped` only kicks in when the process **dies**. For when the bot hangs with the
process still alive (Node stuck, Chromium not responding, session in a bad state), there's a
heartbeat:

1. Every 30 s the bot (`src/heartbeat.js`) checks whether it's working and, if so, writes
   `/tmp/zapbot-heartbeat.json` with the time and the state. "Working" means: connected and WhatsApp
   Web answering `CONNECTED` within 10 s; or not connected yet (boot, waiting for the QR Code,
   reconnecting), in which case a live process is enough; or restarting for less than 5 minutes.
2. The image's `HEALTHCHECK` (`docker/app/healthcheck.js`) only looks at the file's age: stale for
   more than 90 s, and the container becomes `unhealthy` (there's a 2 min grace period on boot).
3. Connected but without `CONNECTED` 3 times in a row, the bot itself restarts the WhatsApp client
   and warns by email (`🩺 WhatsApp not responding`).

On a restart (and on an `initialize` failure), the bot closes the client and, if Chromium lost the
connection but is still alive (it holds the session directory and every following `initialize` would
fail with `browser is already running`), kills the process with `SIGKILL` (`Matando o Chromium órfão
(PID ...)` in the log). The container starts with `init: true` (tini as PID 1), which reaps the
Chromium processes that turn into zombies.

### Internet outage

Without internet, the restart fails (`initialize falhou: net::ERR_NAME_NOT_RESOLVED`). The bot
doesn't stop: it tries again on its own, with growing waits (15 s, 30 s, 1 min, 2 min and then every
5 min), until it connects. Same on a boot without internet.

```text
♻️ Reiniciando cliente. Motivo: heartbeat: OPENING
initialize falhou: net::ERR_NAME_NOT_RESOLVED at https://web.whatsapp.com/
♻️ Nova tentativa de conectar em 15s (falhas seguidas: 1).
♻️ Reiniciando cliente. Motivo: nova tentativa nº 2 (heartbeat: OPENING)
...
🤖 ZapBot 2.0.13 (devel) inicializado!
```

- Only one email, on the first failure (`❌ Restart failed`); with the internet down, it fails
  too, and the `🔄 Reconnected` says how long the bot went without being able to connect and how
  many attempts failed.
- While it keeps trying, the heartbeat keeps beating, with the state
  `reconectando (N falhas seguidas)`: restarting the container wouldn't bring the internet back.
- If the page opens but the connection doesn't finish within 3 minutes (the network dropped midway),
  the bot restarts the client. While waiting for someone to scan the QR Code, it doesn't.

```bash
docker ps                                          # STATUS: Up 2 hours (healthy)
docker inspect --format '{{json .State.Health}}' zapbot
docker exec zapbot cat /tmp/zapbot-heartbeat.json
```

Docker (outside Swarm) **only marks** the container as `unhealthy`: it doesn't restart it. To
restart automatically, run [autoheal](https://github.com/willfarrell/docker-autoheal) next to the
bot and add the label `autoheal=true` to the `zapbot` service:

```yaml
  autoheal:
    image: willfarrell/autoheal
    restart: unless-stopped
    environment:
      AUTOHEAL_CONTAINER_LABEL: autoheal
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `env file .../config/.env not found` | Create the file from the example: `cp config/.env.example config/.env`. |
| QR doesn't show up in the logs | `QRCODE_EMAIL_ENABLE` is `"true"`: the QR goes by email and only lands in the logs if sending fails (`QRCODE_EMAIL_FALLBACK_TERMINAL`, default `"true"`). Check your email or set it to `"false"`. |
| `Erro ao enviar QR por email` | Wrong SMTP host/port/user/password. Use port 465 and an app password. With `QRCODE_EMAIL_FALLBACK_TERMINAL="true"` (default), the QR shows up in the logs anyway. |
| `Too many bad auth attempts` (`535 5.7.0`, `EAUTH`) or `SMTP paused` | The provider blocked the login because of wrong attempts (wrong or revoked app password). The bot stops trying for 30 minutes so it doesn't make things worse. Check the password, wait for the block to pass and test with `/bot -test`. See [Pause after a login failure](emails.md#pause-after-a-login-failure). |
| `Erro ao enviar QR por email: ... self-signed certificate` / `unable to verify` | The SMTP certificate isn't valid. Use the provider's official host (the name has to match the certificate). |
| QR email lands in spam | `QRCODE_EMAIL_SMTP_FROM` is different from the SMTP account. |
| Email alerts don't arrive | Check `QRCODE_EMAIL_SMTP_HOST`, `_USER` and `_TO` (nothing is sent without them) and the `email.alerts` setting (`/set email.alerts`). SMTP failures show up in the log as `Alerta por e-mail '...' falhou`. |
| A command doesn't respond | Check the logs for `executed unknown command`: the name is wrong or the command is disabled (`commands.disabled`, or `disabled: true` in the command definition). For the others, it only shows up with [`/debug`](comandos/debug.md) on. |
| `docker ps` shows `(unhealthy)` | The bot stopped writing the heartbeat. Find out why with `docker inspect --format '{{json .State.Health}}' zapbot` and the logs; restart with `docker compose -f docker/docker-compose.yml restart zapbot`. See [Container health](#container-health-heartbeat). |
| `make test`: `No such built-in module: node:sqlite` | Old Node: the tests need Node 22.13+. |
| `Motivo 'LOGOUT' exige ação manual` | Session disconnected from the phone. Restart the container to generate a new QR. |
| `Motivo 'CONFLICT' ...` | WhatsApp Web was opened somewhere else with the same session, or there are two containers running. |
| `browser is already running` | Stale Chromium lock; the entrypoint cleans it up on boot and, on a restart, the bot kills the orphan Chromium on its own (`Matando o Chromium órfão`). If it persists, restart the container. |
| No command responds to anyone else | `bot.users` is `false`: only you can use commands until `/bot +u <person\|group>` (some of them, see [Users](comandos/bot.md#users)) or `/set bot.users true` (everyone). The `owner` and `admin` commands stay yours only, unless the person is in `bot.admins` (`/bot +a <person>`, see [Extra admins](comandos/bot.md#extra-admins)). See [Permissions](comandos/index.md#permissions-role). |
| I enabled `/gpt` (or another `admin` command) and the person or group can't use it | An `admin` command only goes into an "Only" list: `/bot +u +cmd /gpt` (in the group) or `/bot +u +cmd /gpt /Grupo/`. Whoever already uses all the regular commands doesn't get an `admin` one with `+cmd`; list its commands (`+cmd /rates,/gpt`). An `owner` command (`/set`, `/bot`...) can't be delegated. See [Delegating](comandos/index.md#delegating-an-admin-command). |
| `/get` fails on some site | The site changed; rebuild (`--no-cache`) to get the latest yt-dlp. The version in use shows up in `/bot -info`. |

---

Made by **Jorge Pereira**. Contributions are welcome via issues and pull requests.
