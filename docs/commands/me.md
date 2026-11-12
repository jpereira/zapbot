# `/me`

Sends the message you typed. Each `{/command args}` runs on the spot and the reply goes in its place,
as in [`/cron`'s commands in the text](cron.md#commands-in-the-text). A typed `\n` becomes a line break.

```text
/me [-repeat|-r <n>] <mensagem>
```

| Option | Value | Description |
|---|---|---|
| `-repeat`, `-r` | `<n>` | Repeats the text `n` times (from 1 to `me.maxRepeat`, default 500), back to back, in a single message: `/me -r 3 Haha!` sends `Haha!Haha!Haha!`. The `{/command}`s run only once |

```text
/me Minha mensagem
/me Linha 1\nLinha 2
/me -r 3 Haha!
/me O preço do Bitcoin está em {/crypto BTC}
```

- The message goes straight to the chat, without quoting the command you typed.
- Only `/cron`'s query commands run (`/rates`, `/crypto`, `/weather`...), without the options that
  change something. Whoever runs it needs permission for each one of them.
- A multi-line reply becomes a paragraph; a single-line one stays inline. Media (`/meme`, `/giphy`)
  goes out after the text.
- Works with [`/alias`](alias.md): `/alias -q /haha /me Hahaha vc e burro!`.
