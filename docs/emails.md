# Bot emails (QR Code and alerts)

The bot uses the same SMTP (`QRCODE_EMAIL_SMTP_*`) for:

- QR Code, when `QRCODE_EMAIL_ENABLE="true"` (if sending fails, the QR shows up in the terminal;
  see `QRCODE_EMAIL_FALLBACK_TERMINAL`);
- [operational alerts](#email-alerts), like crash, outage and reconnection;
- backups sent with [`/backup -s -to`](comandos/backup.md#send-the-file) or through the
  destination set in `backup.to` for the daily backup;
- price alerts from `/rates` and `/crypto`, position and fee alerts from `/defi`, and note alerts
  from [`/notes -alerta`](comandos/notes.md#alerts);
- `/watch` hits and `/bot -status` reports with an email destination.

The `email` destination uses `QRCODE_EMAIL_SMTP_TO`; `-to voce@exemplo.com` picks another address.

## QR Code email

Subject: **`[ZapBot] WhatsApp QR Code Authentication`**

Example of the email fields:

| Field | Illustrative content |
|---|---|
| 🔢 QR Code | `#1` |
| 📱 Phone Number | `5521XXXX9999` |
| 🛡️ Anti-Phishing Code | `TroqueEstaFrase-7f3a` |
| 📅 Generated At | `2026-09-29 14:32:07 BRT` |

The QR shows up as a 300×300 pixel PNG image in the body and as an attachment (`qrcode-1.png`). The
email says this QR replaces the ones sent before.

- **QR Code #N**: counter of QRs sent since the container started. Always use the highest number.
- **Phone Number**: the `PHONE_NUMBER` with the middle digits masked.
- **Generated At**: generation time (`America/Sao_Paulo` timezone).

## Change the anti-phishing code

The `QRCODE_EMAIL_SMTP_ANTIPHISHING` field is a secret phrase that **only you know**. It comes in
every legitimate bot email. If an email "from ZapBot" asks you to scan a QR and the phrase is
missing or different, **it's a scam**: scanning someone else's QR connects *your* account to
*their* device.

- **Don't use the `.env.example` value**: it's public in the repository.
- Pick something personal and hard to guess, and change it if you suspect a leak.

## Email alerts

When WhatsApp goes down, the alert in your private chat doesn't arrive. That's why the important
events also go by email, through the same SMTP as the QR Code (`QRCODE_EMAIL_SMTP_*`, independent of
`QRCODE_EMAIL_ENABLE`). Enabled by default; turn it off with `/set email.alerts off`. Without
`QRCODE_EMAIL_SMTP_HOST`, `_USER` and `_TO` filled in, nothing is sent.

| Subject | When |
|---|---|
| `[ZapBot] 🟢 Bot iniciado` | The bot connected to WhatsApp after starting (it also says if it's turned off or only you can use commands, `bot.users` set to `false`) |
| `[ZapBot] 🔄 Reconectado` | Connected again after an outage (with the reason for the outage and, if it couldn't connect for a while, for how long and how many attempts failed) |
| `[ZapBot] 🔴 Desconectado` | WhatsApp disconnected; the client restarts by itself |
| `[ZapBot] 🔴 Desconectado (ação manual)` | Disconnected due to `LOGOUT`, `CONFLICT`, `UNPAIRED`...: the bot does **not** restart by itself |
| `[ZapBot] ⚠️ Estado do WhatsApp: <estado>` | WhatsApp Web entered a problem state (`CONFLICT`, `UNPAIRED`, `TOS_BLOCK`...) |
| `[ZapBot] ⛔ Falha de autenticação` | The saved session failed to authenticate |
| `[ZapBot] 🔑 Sessão perdida: novo QR Code` | It asked for a QR Code again after having authenticated |
| `[ZapBot] ♻️ Browser caiu` | Chromium died and the watchdog is restarting the client |
| `[ZapBot] 🩺 WhatsApp sem resposta` | Connected, but WhatsApp Web didn't answer `CONNECTED` in 3 consecutive [heartbeat](operacao.md#container-health-heartbeat) checks; the client restarts |
| `[ZapBot] ❌ Falha ao reiniciar` | The client restart failed (e.g. no internet); the bot tries again by itself, with increasing wait. Only one email, on the first failure ([Internet outage](operacao.md#internet-outage)) |
| `[ZapBot] 💾 Backup falhou` | The database [daily backup](comandos/backup.md#automatic-backup) failed (e.g. disk full) |
| `[ZapBot] 💾 Envio do backup falhou` | The daily file was saved locally, but sending it to `backup.to` failed |
| `[ZapBot] 💥 Crash` | Unhandled exception or rejected promise (with the stack). The process exits and Docker brings it back up |
| `[ZapBot] 🛑 Bot encerrado` | `docker stop`/`restart` or Ctrl+C (SIGTERM/SIGINT) |

Each email carries the time, the masked number, the version with the commit that's running
(`X.Y.Z (git+4465374/vX.Y.Z)`, see [`/version`](comandos/version.md)), the host, how long the
process has been up, and the anti-phishing code. The same event doesn't repeat within 5 minutes
(except crash and shutdown), so it doesn't flood the inbox during a reconnection loop.

## Pause after a login failure

If the provider refuses the login (`EAUTH`, for example Gmail with
`535 5.7.0 Too many bad auth attempts`), the bot stops using SMTP for **30 minutes**: any send in
that period fails right away, with `SMTP em pausa por falha de autenticação anterior`, without
opening a connection. Each wrong attempt counts toward the provider's block, and insisting (a new
QR, an alert, a reconnection) only makes it longer. Once the time is up, the bot tries again; if the
password is still wrong, the pause starts over.

To get out of it: check the app password in `QRCODE_EMAIL_SMTP_PASS`, wait for the block to pass,
and run [`/bot -test`](comandos/bot.md#bot-test), which only does the login (sends nothing) and
also respects the pause. Meanwhile, the QR keeps showing up in the logs, if
`QRCODE_EMAIL_FALLBACK_TERMINAL` is on.
