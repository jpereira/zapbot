# `/search` · admin

Searches messages in the WhatsApp Web history, using the same search as WhatsApp's search box: it
covers the messages WhatsApp Web has, including ones that never went through the bot's cache.
[`/show -q`](show.md#search) searches only the cache (deleted, edited, status and reactions).

```text
/search [-N] <text>
/search -read <id>
```

| Option | Value | Description |
|---|---|---|
| `-N` | | Number of messages (default 10, max 50). E.g.: `-30` |
| *(none)* | `<text>` | What to search for, like in WhatsApp's search (case-insensitive) |
| `-read`, `-r` | `<id>` | Shows the full message for an id from the search list. Same scope as the search |
| `-mask`, `-m` | | Obfuscates phone numbers in this run's output. E.g.: `+55219****44` |

The scope is **this chat**; in **your private chat**, all chats, and each result says which chat it's
from. Results come from newest to oldest, with the date, who sent it and the text (for media, the
type and the caption). Long texts are cut at 200 characters.

```text
/search pix                 → the 10 most recent with "pix" in this chat
/search -30 boleto          → up to 30
/search bom dia             → with spaces, no quotes (/search is the same as /search)
```

```text
/search pix
🔎 2 messages matching "pix" (all chats)

1. 📅 10/13/2026, 11:02:10 · 💬 Family · 👤 Fulano
   "send the pix and I'll pay"
   🆔 false_5521988887777@c.us_3EB0A1B2

2. 📅 10/12/2026, 18:40:05 · 💬 Work · 👤 You
   📎 [image] "pix receipt"
   🆔 true_120363000000000000@g.us_3EB0C3D4

📖 To read one in full: /search -read <id>.
```

```text
/search -read false_5521988887777@c.us_3EB0A1B2
📅 10/13/2026, 11:02:10 · 💬 Family · 👤 Fulano

send the pix and I'll pay, the whole text, no cut
```

- Each result carries the `🆔` for `-read`. With `-mask`, the id is obfuscated too (it won't work
  for `-read`).
- `-read` works only for this chat; in your private chat, for any chat. For media, it shows the type
  and the caption.
- Above 50, `-N` is capped at 50 and the reply says so. `-N` has to be 1 or more.
- `-mask` obfuscates numbers with 10 to 15 consecutive digits, keeping the first five and the last
  two.
- The `/search` message itself doesn't show up in the results.
- When as many results come back as `-N`, the bot warns that there may be more.
- Anything WhatsApp Web hasn't loaded from the phone yet doesn't show up: it's the same limitation
  as WhatsApp Web's search.
