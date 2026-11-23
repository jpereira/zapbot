# API and MCP

The bot has an optional **local HTTP API**, off by default, to integrate it with scripts, cron
jobs, Home Assistant, n8n and the like: send a message, read your notes, ask whether it is online.
On top of it there is an **experimental MCP server**, so an AI client (Claude Desktop, for example)
can send messages and read your `/notes`.

!!! danger "It speaks for your WhatsApp account"
    Whoever has the `zapbot.api.key` sends messages **as you**. Treat it like a password: long, random, in
    no repository. The API only listens on `127.0.0.1` by default; to open it to the network, put an
    HTTPS reverse proxy in front.

!!! warning "The MCP server is experimental"
    The MCP protocol and the tools may change between versions, and an AI with access to them can
    act on your account. It is off by default (`zapbot.mcp.enabled`), sends only to the destinations in
    `zapbot.api.sendTo` and is limited to **10 messages per minute**.

## Turning it on

The settings, all with [`/set`](commands/set.md) (they take effect after restarting the bot):

```text
/set zapbot.api.key <your-random-key>
/set zapbot.api.port 3100
/set zapbot.api.enabled on
```

Generate your own random key, for example with `openssl rand -hex 32`.

With Docker, publish the port only on the machine itself, in `docker-compose.yml`:

```yaml
ports:
  - "127.0.0.1:3100:3100"
```

`zapbot.api.host` is `127.0.0.1` by default; inside a container, set it to `0.0.0.0` (the published port
above is what keeps it closed to the network).

Without `zapbot.api.key` the API does not start (the log says so), and it needs at least 20 characters: a short
one is brute-forced too fast.

## Endpoints

Every call (except `/health`) sends the key in the `Authorization: Bearer <key>` header (or in
`X-API-Key`). 5 wrong keys from the same address block it for 15 minutes, the same as the web interface's login. The API counts the
address of the direct connection, so clients behind one proxy share that limit.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/health` | `{ "ok": true, "connected": true }`, **without a key** (for health checks) |
| `GET` | `/status` | Version, whether WhatsApp is connected and whether MCP is on |
| `GET` | `/notes?limit=N` | The latest notes of [`/notes`](commands/notes.md) (default 20, up to 100) |
| `POST` | `/send` | `{ "to": "5521999999999", "text": "..." }`: sends a text message |
| `POST` | `/mcp` | The MCP server (only with `zapbot.mcp.enabled`) |

```text
$ curl -s http://127.0.0.1:3100/health
{"ok":true,"connected":true}

$ curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:3100/status
{"name":"zapbot","version":"1.0.25","connected":true,"mcp":false}

$ curl -s -H "Authorization: Bearer $KEY" "http://127.0.0.1:3100/notes?limit=2"
[{"id":12,"text":"call the bank #tomorrow","createdAt":1794800000000,"alertAt":null},
 {"id":11,"text":"buy milk","createdAt":1794790000000,"alertAt":null}]
```

### Sending a message

```text
$ curl -s -X POST http://127.0.0.1:3100/send \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d '{"to":"5521999999999","text":"Backup done ✅"}'
{"ok":true,"to":"5521999999999@c.us"}
```

`to` is a phone number with country code (checked against WhatsApp) or an id (`…@c.us`, `…@g.us`).
It can only be **your own chat** or something in the [`zapbot.api.sendTo`](settings.md) list; the group
ids are shown by [`/whois -id`](commands/whois.md#the-ids--id):

```text
/set -a zapbot.api.sendTo +5521999999999
/set -a zapbot.api.sendTo 120363012345678901@g.us
```

| Status | When |
|---|---|
| `200` | Sent |
| `400` | Missing/invalid `to` or `text`, text over 4000 characters, or invalid JSON |
| `401` | Wrong or missing key |
| `403` | The destination is not in `zapbot.api.sendTo` |
| `404` | The number is not on WhatsApp, or the path does not exist |
| `413` | Body over 64 KB |
| `429` | More than 10 messages in a minute |
| `503` | WhatsApp is not connected |

## MCP server (experimental)

With `zapbot.mcp.enabled` on, `POST /mcp` speaks JSON-RPC 2.0 of the [Model Context
Protocol](https://modelcontextprotocol.io) (the `initialize`, `ping`, `tools/list` and `tools/call`
methods, answered as JSON in the same POST). The tools:

| Tool | What it does |
|---|---|
| `send_message` | Sends a text (`to`, `text`), with the same rules as `POST /send` |
| `list_notes` | The latest notes (`limit`) |
| `get_note` | One note by its number (`id`) |
| `get_status` | Version and connection |

```text
/set zapbot.mcp.enabled on
```

Claude Desktop connects to local servers by command line; to use this HTTP one, go through the
`mcp-remote` bridge, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zapbot": {
      "command": "npx",
      "args": [
        "mcp-remote", "http://127.0.0.1:3100/mcp",
        "--header", "Authorization: Bearer ${ZAPBOT_KEY}"
      ],
      "env": { "ZAPBOT_KEY": "the same value as zapbot.api.key" }
    }
  }
}
```

Then ask, for example: *"read my last 3 notes and send me a summary on WhatsApp"*. The tool
descriptions carry the `[EXPERIMENTAL]` tag, and `send_message` only reaches your own chat unless
you add more destinations to `zapbot.api.sendTo`.

## Good practice

- Keep `zapbot.api.sendTo` empty unless you need it, and **never** use `all` with a key that other people
  or programs can read.
- Keep the port closed to the internet. If you must open it, use HTTPS and a firewall.
- Sending many messages in a row is what gets WhatsApp accounts banned: the 10-per-minute limit
  exists for that, don't try to work around it.
- Rotate the key when in doubt: `/set zapbot.api.key <new>` and restart the bot.
