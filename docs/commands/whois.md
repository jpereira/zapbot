# `/whois`

Shows who someone is and what they can do in the bot, **in this chat**: 🤖 owner, 👑 admin (`+a`),
🗣️ user (`+u`) or 🚫 no permission. On its own, it shows you; with people (or replying to a message),
it shows them, but only for the owner and admins.

| Option | Value | Description |
|---|---|---|
| `-id` | | The ids instead of the level: the chat's and each person's (phone, `@c.us` and, when WhatsApp sent it, the internal `@lid`) |

| Argument | Description |
|---|---|
| *(none)* | You: your level in this chat |
| `[person...]` | Owner and admins only: `/name/`, `@mention` or `+number`, several at once. The lookup is the same as `-to` ([Destinations](index.md#destinations-contact-group-number-or-email)) |
| *(replying to a message)* | Owner and admins only: who wrote the message being replied to |

```text
/whois
Who is it? (1)
• 🗣️ +u · 👤 Rafael Silva · +15559998888
 → Only: /joke, /noffa
 ✅ Can use (5): /help, /joke, /noffa, /usage, /whois
 ⏱️ /joke  0/5 per day · renews Fri 11/20 00:00

Permissions
👑 +a: admin, uses everything
🗣️ +u: user, uses the regular commands

Type /help to see which commands are available.
```

The **✅ Can use** line is the list of commands you can run in this chat, already with the `+cmd` rule applied (the
rule shows above it and the usage limits below). The admins and the owner see "Can use all the commands".

```text
/whois                          → you
/whois /Rafael Silva/ @Fulano     → (owner and admins) those people
/whois +5521999999999              → (owner and admins) by number
/whois                          → replying to a message: who wrote it (owner and admins)
```

## The ids (`-id`)

The bot talks to WhatsApp by **ids**, not by names: a private chat is `<phone>@c.us`, a group is
`<number>@g.us`, and WhatsApp sometimes hides the phone behind an internal `@lid`. `-id` shows them,
which helps when you need the group id for a setting or want to know which number someone really is:

```text
/whois -id
*🆔 IDs*
👥 Group: 120363012345678901@g.us
• 📞 +5521911111111
  🪪 5521911111111@c.us
  🔗 98765432109876@lid
```

```text
/whois -id +5521999999999       → (owner and admins) the ids of that number
/whois -id                      → replying to a message: the ids of who wrote it
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
  below: `→ Only: /stocks, /crypto` or `→ All but: /meme`.
- Anyone with a [usage limit](bot.md#usage-limits-per-user-limit) (`/bot +cmd /gpt +limit 5/day`) has
  the line `⏱️` with what was used and when it renews (the user sees the same with [`/usage`](usage.md)):

```text
/whois +5521911111111
*Who is it?* (1)
• 🗣️ +u · 👤 Fulano · +5521911111111
 → Only: /gpt, /tldr
 ⏱️ /gpt  3/3 per day · renews Tue 17/11 00:00; /tldr  0/3 per day · renews Tue 17/11 00:00

*Permissions*
👑 +a: admin, uses everything
🗣️ +u: user, uses the regular commands

Type /help to see which commands are available.
```

- To see the admins and users at once: [`/bot -list-users`](bot.md#user-list) (the ones in
  this chat) or `/bot -list-users all` (everyone).
