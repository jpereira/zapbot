# `/call` · admin

Rejects the voice and video calls that reach the bot account and replies once with a text of yours, and can also
**always reject one person's calls**, with a message just for them. It is the same as the settings `call.reject`,
`call.message` and `call.allow`, but with commands. The general rejection is off by default.

| Option | Value | Description |
|---|---|---|
| *(none)* | | How it is: on or off, the message, who always rings and who is always rejected |
| `-on` | | Turns the rejection on (`call.reject`) |
| `-off` | | Turns it off: the calls ring again |
| `-msg`, `-m` | `<text\|off\|reset>` | The message sent to whoever had the call rejected (`call.message`). With `off`, it rejects in silence; with `reset`, it brings back the default text. Together with `-deny`, it is the message of those people only |
| `-allow`, `-a` | `<person...>` | People whose calls always ring (`call.allow`): `/name/`, `@mention` or `+number` |
| `-deny`, `-d` | `<person...>` | People whose calls are **always rejected**, even with the rejection off: `/name/`, `@mention` or `+number`. With `-msg`, the message is theirs; without it, a default text for the denied ones |
| `-rm`, `-r` | `<person...>` | Takes the people off the two lists (the ones that always ring and the ones always rejected) |

```text
/call                                   → how it is now
/call -on                               → rejects the calls
/call -msg I don't take calls here, send a message or an audio 🙏
/call -on -msg Call me back by text!    → on and with the new message, in one command
/call -msg off                          → rejects in silence (no message)
/call -msg reset                        → the default text again
/call -allow /Maria Lucia/ +5521999999999
/call -rm /Maria Lucia/
/call -deny /Fulano/ +5521977777777 -msg "I don't want to talk now!"
/call -d /Fulano/                       → rejected with the default text for the denied ones
/call -deny +5521977777777 -msg off     → rejected in silence
/call -rm /Fulano/                      → back to the general rule
/call -off                              → the calls ring again
```

## Reject one person, with their own message

`-deny` (or `-d`) rejects the calls of those people **even with the general rejection off**. The message goes after
`-msg`, with or without quotes (it runs up to the next option), and can come before or after the people:

```text
/call -deny /Fulano/ +5521977777777 -msg "I don't want to talk now!"
/call -msg Not now, text me -d /Fulano/
/call -d /Fulano/                         → no -msg: the default text for the denied ones
/call -d /Fulano/ -msg off                → rejects in silence, with no message
/call -rm /Fulano/                        → the calls ring again
```

The default text for the denied ones follows the bot's language (`I can't talk right now. Send me a message!`).
Without `-deny`, `-msg` is the general message, the one everybody gets when the general rejection is on.

## What the status shows

```text
📵 Reject calls: on
📝 I don't take calls here, send a message or an audio 🙏
✅ Always ring: +5521988887777, +5521999999999 (and the bot admins)
🚷 Always rejected: +5521977777777 (I don't want to talk now!)
💡 /call -on|-off · -msg <text|off|reset> · -allow|-deny|-rm <people>
```

- The bot replies once to each person, at most one message every 10 minutes, so someone who calls ten times doesn't
  get ten texts.
- The calls of the `bot.admins` and of the people in `call.allow` always ring.
- **`-deny`** is the opposite: the calls of those people are rejected **even with `/call -off`**, each one with its
  own message (the default text for the denied ones is `I can't talk right now. Send me a message!`). It also takes
  the person off the "always ring" list, and `-allow` takes off the denied list. The same one-message-per-10-minutes
  rule applies.
- It rejects calls from groups too, and for the caller it looks like a missed call, not a block.
- The general settings still work with [`/set`](set.md) (`call.reject`, `call.message`, `call.allow`); the list of
  the denied ones and their messages is only in `/call`. The [`/bot`](bot.md#rejecting-calls) page has the details.
- `call.message` comes empty, which means the default text of the bot's language; `/call -msg off` rejects in silence.

## If nothing happens

Every call WhatsApp reports to the bot goes to the log (`make logs`), even the ones that ring normally:

```text
[Call] evento 'call': de 5521977777777@c.us, voz
[Call] ligação de 5521977777777 (5521977777777@c.us), negado pelo /call -deny; call.reject desligado
[Call] ligação de 5521977777777 recusada
```

No `evento 'call'` line when someone calls means WhatsApp Web did not tell the bot about the call.
