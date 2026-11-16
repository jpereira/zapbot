# `/join` · admin

Joins a WhatsApp group through the invite link. With `-info`, shows the group (name, participants and
description) without joining. To leave, use [`/leave`](leave.md).

![Demo of /join](../assets/demo/04-join-leave.gif)

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
✅ Joined 👥 Family

/join -i chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv
👥 *Family*
👤 12 participants
📝 Announcements and photos
💡 _Join with /join chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv_

/join -l
👥 *GROUPS* (7)

1. 🍕 Friday night pizza · 9 participants
2. 📚 Book club · 14 participants
3. 🏔️ Trail crew 2026 · 38 participants
4. Neighborhood association · 212 participants
5. Surprise party for Ana · 1 participant
6. Old friends
7. Work · 40 participants

💡 *Tips*
/join <link> joins
/leave <no.|name> leaves
```

- No argument: the `Usage:` of the command and the `/join -h` hint.
- Not a link or code: `❌ Invalid invite link. E.g.: https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv`.
- Invalid, expired or revoked invite: `❌ Invalid, expired or revoked invite.`
- Groups that require an admin's approval may refuse the join; WhatsApp's reason comes in the
  reply (`❌ I could not join 👥 <group>: <reason>.`).
