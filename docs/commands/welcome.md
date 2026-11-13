# `/welcome` · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /welcome` ([Delegating](index.md#delegating-an-admin-command)).

Groups only (anywhere else it replies `Only usable inside groups.`). The message the bot sends in
the group when someone joins (by invite link or added by an admin). It is **per group**, and it only exists where you turned it on. See
also [`/goodbye`](goodbye.md).

```text
/welcome [-on|-off|-test] [<text>]
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `[<text>]` | The message (up to 1000 characters, it can have several lines). With it, turns the message on in this group. Without it, shows the current one |
| `-on` | | Turns it on with the default text |
| `-off` | | Turns it off in this group |
| `-test`, `-t` | | Sends the message as it would look, with you in place of whoever joins, using the text you gave or the current one |

```text
/welcome                         → shows this group's message
/welcome Welcome to {group}, {name}!
/welcome -on                     → the default text
/welcome -test                   → preview
/welcome -off                    → turns it off
```

- `{name}` is the person and `{group}`, the group name. In the message, `{name}` becomes a **mention** of the person who joined.
- The default text is `👋 Welcome to {group}, {name}!` (in the language of `zapbot.lang`).
- The bot's own account entering a group doesn't trigger it.
- It depends on the WhatsApp events of the account, so it works in the groups where your account
  is a member.
