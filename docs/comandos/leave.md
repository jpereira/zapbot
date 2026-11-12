# `/leave` · admin

Leaves one or more WhatsApp groups. With nothing, lists the groups you're in, numbered. To come back,
you need a new invite ([`/join`](join.md)).

![Demonstração do /leave](../assets/demo/04-join-leave.gif)

```text
/leave <grupo|nº>...  ou  /leave -l
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `<grupo\|nº>...` | The groups, separated by space or comma, by name or part of it, like in `-to` ([Destinations](index.md#destinations-contact-group-number-or-email); if several fit: you choose from the list), or by the no. from the last `-l` list (name with spaces between `/.../` or quotes; loose words, with no no., slashes or quotes, are a single name) |
| `-list`, `-l` | | Lists the groups you're in (same as `/leave` with nothing) |

```text
/leave -l
👥 *GROUPS* (2)

1. Family · 12 participants
2. Work · 40 participants

💡 *Tips*
/join <link> joins
/leave <no.|name> leaves

/leave 2
👋 Left 👥 Work

/leave 2 1 /Group L200/  → several at once
```

- The numbers are from the last list you saw. A number outside it:
  `❌ No. 9 is out of the list; see the groups with /leave -l.`
- A failure doesn't hold up the others: each one that fails gets its own line
  (`❌ I could not leave 👥 <group>: <reason>.`).
- Leaving several, the confirmation lists the groups (`👋 Left 2 groups:`).

When leaving the very group where the command was given, the confirmation may not arrive (you're no
longer there).
