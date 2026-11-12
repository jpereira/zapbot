# `/whois` (`/who`, `/id`)

Shows who someone is and what they can do in the bot, **in this chat**: 🤖 owner, 👑 admin (`+a`),
🗣️ user (`+u`) or 🚫 no permission. On its own, it shows you; with people (or replying to a message),
it shows them, but only for the owner and admins.

| Argument | Description |
|---|---|
| *(none)* | You: your level in this chat |
| `[person...]` | Owner and admins only: `/name/`, `@mention` or `+number`, several at once. The lookup is the same as `-to` ([Destinations](index.md#destinations-contact-group-number-or-email)) |
| *(replying to a message)* | Owner and admins only: who wrote the message being replied to |

```text
/whois
Who is it? (1)
• 🗣️ +u · 👤 Rafael Silva · +15559998888

Permissions
👑 +a: admin, uses everything
🗣️ +u: user, uses the regular commands

Type /help to see which commands are available.
```

```text
/whois                          → you
/who /Rafael Silva/ @Fulano     → (owner and admins) those people
/id +5521999999999              → (owner and admins) by number
/whois                          → replying to a message: who wrote it (owner and admins)
```

The level is the highest one that applies **in the chat where you typed it**:

| Level | When |
|---|---|
| 🤖 owner | It's the bot's account: uses everything |
| 👑 +a | Is an admin (`/bot +a`): uses everything |
| 🗣️ +u | Is a user (`/bot +u`): uses the regular commands in any chat, and the `admin` role ones the owner delegates (`+cmd`) |
| 🗣️ everyone | Everyone is allowed (`/set bot.users true`) |
| 🗣️ +u by group | The group where you typed is allowed: everyone there uses the regular ones, only inside it |
| 🗣️ +u in this group | The person is a user only in this group (the `/bot +u` typed in it) |
| 🚫 no permission here (only in 👥 …) | The person is a user only in other groups: here, the bot ignores their commands |
| 🚫 no permission | None of the above: the bot ignores the person's commands |

- Anyone with no permission at all can't use `/whois` (the bot ignores their commands); anyone who
  has some finds out their own level, even limited to a few commands (`/whois` and `/help` are
  always allowed). The owner and admins see anyone's.
- Groups and e-mails are refused (`/whois` is for people), and so is a contact whose phone the
  WhatsApp didn't tell (use the number instead: `/whois +5521999999999`).
- In a group, the phone number of someone who isn't in it is hidden (`+5521•••••2222`), like in
  [`/bot`](bot.md#who-shows-up-in-the-list).
- Anyone limited to a few commands ([`/bot +cmd`](bot.md#each-users-commands)) has the rule
  below: `→ Only: /rates, /crypto` or `→ All but: /meme`.
- To see the admins and users at once: [`/bot -list-users`](bot.md#user-list) (the ones in
  this chat) or `/bot -list-users all` (everyone).
