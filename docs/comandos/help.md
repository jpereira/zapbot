# `/help` (`/h`, `/ajuda`)

Shows the command menu, or the help for a single command. Everyone sees only what they can use:

- **You** (the owner) and the [extra admins](bot.md#extra-admins): all commands.
- **Everyone else** (the [users](bot.md#users)): only the `user` role commands, the `user` ones
  in the [command table](index.md#summary). The menu has `(os comandos que você pode usar)` in the
  title, and the `/help` of an `admin` or `owner` command replies
  `⛔ O /show é só do dono do bot (e dos admins).`
  Anyone limited to a few commands ([`/bot +cmd`](bot.md#each-users-commands)) sees only
  those, and an `admin` command the owner delegated (`/bot +u +cmd /gpt`) shows up for whoever
  received it.

`/help` on its own lists one command per line, with just what it does (the `summary` from the
command definition), in a monospaced block (to keep the alignment on mobile), and ends with a tip on
how to see the rest:

````text
/help

```
 /alias - Salva atalhos para comandos com argumentos
 /ascii - O texto em letras grandes de ASCII
 ...
```

💡 Utilize */help /comando* ou */comando -h* para mais informações.
````

| Option | Value | Description |
|---|---|---|
| `-role`, `-r` | | Lists the commands split by role, only the ones you can use |

With `-role` (or `-r`), the menu comes split by role (`owner`, `admin` and `user`, in that order),
with only the ones you can use (a role with no visible commands doesn't show up; today no command is
`owner`):

````text
/help -r

```
Role: admin
 /alias - Salva atalhos para comandos com argumentos
 ...

Role: user
 /ascii - O texto em letras grandes de ASCII
 ...
```
````

For the full help of a command:

```text
/help get
/help alias        → lists the registered shortcuts you can run
/h /show
/help defi orca    → only the Orca help in /defi (same as /defi orca -help)
/help defi aave    → only the Aave V3 help
/alias -help       → help for registering, listing and removing shortcuts
/watch -help       → /watch help, including rules, sources and destinations
/show -h           → /show help
```

All active commands and their aliases accept `-h` and `-help`. The help shows the usage, options,
arguments and aliases. `[]` means something optional; `<>`, a value to fill in; `...`, something that
can be repeated. A line starting with `Ex:` is an example command.

Unknown or disabled commands get a reply to the message for the owner, admins and users with
permission in the chat: `⚠️ Comando '/comando' desconhecido, tente: /help`.
