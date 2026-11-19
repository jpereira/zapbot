# `/uptime`

Shows the version and how long the bot has been up and connected to WhatsApp (`Connected: not
connected` while it isn't connected). It can be used inside an [`/alias`](alias.md) or
[`/cron`](cron.md) with `{/uptime}`.

| Option | Value | Description |
|---|---|---|
| `-tts` | | Speaks the reply as a voice note, with the default voice of [`/tts`](tts.md) (same as `/tts -q {/uptime ...}`). Settings `tts.*` apply |

```text
/uptime
🤖 ZapBot 1.0.25 (devel) (git+7a89b92/HEAD)
━━━━━━━━━━━━━━━━━━
⚡ Online: 2 days, 3 hours
🔐 Connected: 2 days, 2 hours, 58 minutes
```
