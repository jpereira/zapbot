# `/tldr` (`/resumo`) · admin

Role `admin`: only you and the extra admins. The owner enables it for a person or group with
`/bot +u +cmd /tldr` ([Delegating](index.md#delegating-an-admin-command)).
Whoever gets it summarizes only the current chat, right there: `-chat` and `-pv` are for the owner
and the extra admins.

Summarizes a chat's conversation with ChatGPT: main topics, decisions, agreements and pending items,
in bullets. Uses the same key and the same model as [`/gpt`](gpt.md) (see
[Setting up the key](gpt.md#setting-up-the-key)). ChatGPT's text goes through the same Markdown to
WhatsApp formatting conversion as `/gpt` (see
[Formatting on WhatsApp](gpt.md#formatting-on-whatsapp)).

| Option | Value | Description |
|---|---|---|
| `[período]` | | A time, as in [`/cron`](cron.md) (`30m`, `2h`, `1d`, `1h30m`, `2d4h`): the messages from that time until now; a number (`300`): the last 300 (default limit 500, configurable up to 2000 in `tldr.maxMsgs`). Default: the last 100. The `-` in front is optional (`-2h`) |
| *(replying)* | | Summarizes from the replied message until now; a typed period or `-chat` win |
| `-chat`, `-c` | `<name>` | Summarizes another chat, looked up by name: all the words, in any order, ignoring accents. A name with a space goes in quotes: `-c "trabalho rio"` |
| `-status`, `-s` | | Adds the call's usage to the footer: TX/RX bytes and tokens (see [Status](gpt.md#status--status)) |
| `-pv` | | Sends to your private chat instead of exposing it in the current chat |

```text
/tldr                → the last 100 messages of this chat
/tldr 2h             → the ones from the last 2 hours
/resumo 30m          → the ones from the last 30 minutes (via the alias)
/tldr 1d             → the ones from the last day (1h30m, 2d4h... work; the database keeps 68 h, or `cache.messageRetentionHours`)
/tldr 30             → the last 30 messages (without the letter, it's a count)
/tldr 300 -pv        → the last 300, in your private chat
/tldr -c família 3h -pv
(respondendo uma mensagem)  /tldr  → from it until now
```

Replying to a message, `/tldr` summarizes the conversation **starting from it** (inclusive) until
now, like a "where I stopped reading". If you type a period (`2h`, `300`) or use `-chat`, the
replied message is ignored. The messages are still the ones in the database (68 h, or
`cache.messageRetentionHours`) and the `tldr.maxMsgs` limit applies: above it, the summary takes the
most recent ones and warns.

```text
🤖 Resumo de Família
42 mensagens · 30/09, 18:02 a 30/09, 20:47

• Tia propôs o almoço de domingo na casa da Vó; todos confirmaram, menos o Primo.
• Tio fica com a churrasqueira; a Tia leva a sobremesa.
• Pendente: quem busca a Vó (o Tio responde até sábado).
```

## Fuller summaries

!!! tip "Want a fuller `/tldr`?"
    By default the database keeps only 68 h of conversation, so `/tldr 7d` is cut to 2 days and 20
    hours. To summarize longer periods, set these keys (see the [settings](../settings.md)):

    ```text
    /set cache.messageRetentionHours 720        → message text for 30 days (up to 2160 h = 90 days)
    /set cache.messageMediaRetentionHours 720   → media for 30 days (audio goes into the summary, transcribed)
    /set tldr.maxMsgs 2000                      → how many messages a summary reads at most (default 500)
    ```

    **Watch your disk.** Text is light, but media (photos, videos, audio, documents) stays in
    `cache/media` and, kept for weeks, can make `cache/` grow **a lot** (the size depends on how busy
    your chats are, and groups with lots of photos and videos fill the disk fast). Before increasing,
    check the free space and keep an eye on the size with [`/cache`](cache.md); `/cache -media` frees
    only the media, and `/cache -clean` applies the retention right away.
    If the goal is just reading more days of text, increase only `cache.messageRetentionHours` and
    leave the media at the default: the summary only loses the old audio that hadn't been transcribed.

    A longer period also spends more OpenAI credits: each summary reads up to 60 thousand characters.

Details:

- It needs at least three eligible messages in the period; without them, the bot warns in the chat.

- The summary uses the text already saved in the database. Regular messages stay for 68 h (the
  window in which WhatsApp lets you delete), so longer periods are cut and the bot warns. To reach
  more days, increase `cache.messageRetentionHours` (up to 2160 h = 90 days):
  `/set cache.messageRetentionHours 720` keeps 30 days of messages. Media has its own period,
  `cache.messageMediaRetentionHours` (default 68 h): an audio without a file and without a
  transcription stops going into the summary.
- While it processes, the notice says what it's summarizing: `⏳ Processando o /tldr das 87
  mensagens de Família do período de 2 horas, aguarde.` (or `das últimas 100 mensagens de ...`, or
  `... desde a mensagem respondida (há 3 horas)`).
- Commands, deleted messages and media without a caption are left out. Your messages show up with
  your profile name; the bot's replies (which go out through your account) count as yours.
- Each message goes up to 500 characters, and the total up to 60 thousand: above that, the oldest
  ones drop out.
- It's restricted to the owner and the extra admins (`+a`): each summary spends OpenAI credits, and
  the conversations' text goes to OpenAI.
