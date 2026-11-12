# `/whois` (`/who`, `/id`)

Shows who someone is and what they can do in the bot, **in this chat**: 🤖 owner, 👑 admin (`+a`),
🗣️ user (`+u`) or 🚫 no permission. On its own, it shows you; with people (or replying to a message),
it shows them, but only for the owner and admins.

| Argument | Description |
|---|---|
| *(none)* | You: your level in this chat |
| `[pessoa...]` | Owner and admins only: `/Nome/`, `@menção` or `+número`, several at once. The lookup is the same as `-to` ([Destinations](index.md#destinations-contact-group-number-or-email)) |
| *(replying to a message)* | Owner and admins only: who wrote the message being replied to |

```text
/whois
Quem é? (1)
• 🗣️ +u · 👤 Rafael Silva · +15559998888

Permissões
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns (e os admin que o dono liberou)

Digite /help para saber quais comandos estão disponíveis.
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
| 🗣️ todos | Everyone is allowed (`/set bot.users true`) |
| 🗣️ +u pelo grupo | The group where you typed is allowed: everyone there uses the regular ones, only inside it |
| 🗣️ +u neste grupo | The person is a user only in this group (the `/bot +u` typed in it) |
| 🚫 sem permissão aqui (só em 👥 …) | The person is a user only in other groups: here, the bot ignores their commands |
| 🚫 sem permissão | None of the above: the bot ignores the person's commands |

- Anyone with no permission at all can't use `/whois` (the bot ignores their commands); anyone who
  has some finds out their own level. The owner and admins see anyone's.
- In a group, the phone number of someone who isn't in it is hidden (`+5521•••••2222`), like in
  [`/bot`](bot.md#who-shows-up-in-the-list).
- Anyone limited to a few commands ([`/bot +cmd`](bot.md#each-users-commands)) has the rule
  below: `→ Apenas: /rates, /crypto` or `→ Todos, menos: /meme`.
- To see the admins and users at once: [`/bot -list-users`](bot.md#user-list) (the ones in
  this chat) or `/bot -list-users all` (everyone).
