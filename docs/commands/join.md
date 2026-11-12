# `/join` · admin

Joins a WhatsApp group through the invite link. With `-info`, shows the group (name, participants and
description) without joining. To leave, use [`/leave`](leave.md).

![Demonstração do /join](../assets/demo/04-join-leave.gif)

```text
/join <invite link>  or  /join -info|-i <link>  or  /join -l
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `<invite link>` | The link (`https://chat.whatsapp.com/<code>`, with or without `https://`) or just the code |
| `-info`, `-i` | | Shows the invite's group (name, participants and description) without joining |
| `-list`, `-l` | | Lists the groups you're in, numbered (same as `/leave -l`) |

```text
/join https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv
✅ Joined 👥 Família

/join -info chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv
👥 *Família*
👤 12 participants
📝 Avisos e fotos
💡 _Join with /join chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv_

/join -l
👥 *GROUPS* (2)

1. Família · 12 participants
2. Trabalho · 40 participants

💡 *Tips*
/join <link> joins
/leave <no.|name> leaves
```

- No argument: `❌ Use: /join [-info] <invite link (chat.whatsapp.com/...)> or /join -l`.
- Not a link or code: `❌ Invalid invite link. E.g.: https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv`.
- Invalid, expired or revoked invite: `❌ Invalid, expired or revoked invite.`
- Groups that require an admin's approval may refuse the join; WhatsApp's reason comes in the
  reply (`❌ I could not join 👥 <group>: <reason>.`).
