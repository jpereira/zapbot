# `/stats` (`/estatisticas`) · admin

Role `admin`: only you and the extra admins. The owner grants it to a person or group with
`/bot +u +cmd /stats` ([Delegating](index.md#delegating-an-admin-command)).
Whoever receives it sees only the current chat and deletes nothing: `-l`, `/chat/`, `-me`, `-flush`
and `-flush-all` are for the owner and extra admins.

Chat ranking over the last N days (default 7): total messages, who talks the most, who deletes and
edits the most, messages per time-of-day slot, peak hour and peak day. With `-me`, **your** messages
summed across all chats: which ones you talk in the most, how many you deleted, your hours and your
peak day.

The numbers come from the counters in the `stats` table, filled on every received message. Your
messages count toward your number in any chat, including private chats with other people. The chat
with yourself and statuses are not included. The bot's own replies and WhatsApp notices (someone
joined the group, the name changed, encryption, a call...), which have no author, don't count either.

| Option | Value | Description |
|---|---|---|
| `-N` | | Period in days (default 7; maximum set by `stats.retentionDays`, default 90 and configurable from 7 to 365). Goes before or after the chat. E.g.: `-30` |
| *(chat)* | `/Grupo Família/` | Another chat instead of the current one: a group, or the private chat with a person, looked up by name (case- and accent-insensitive) among those that have statistics. In slashes or quotes when it has a space. Several with the name: the bot lists them and you reply with the number |
| `-me` | | Your statistics, summed across all chats (or only in the given chat) |
| `-list`, `-l` | | Lists the chats with statistics, from the one that talks the most to the least, with the total and the day of the last message |
| `-flush`, `-f` | `</chat/>` | Deletes a chat's statistics |
| `-flush-all` | | Deletes the statistics of all chats |

![Demonstração do /stats](../assets/demo/11-stats.gif)

```text
/stats                         → last 7 days of this chat
/stats -30                     → last 30 days
/stats /Grupo Família/         → of the group "Grupo Família"
/stats -10 /Grupo Família/     → of the group, over the last 10 days
/stats /Grupo Família/ -10     → the same
/stats -me                     → yours, across all chats
/stats -me /Família/           → yours, only in "Família"
/stats -l                      → the chats that have statistics
/stats -flush /Grupo Família/  → deletes the group's
/stats -flush-all              → deletes all of them
```

```text
/stats -l
📊 Chats com estatísticas (3)
Até 90 dias guardados

1. 👥 Família — 1.234 msgs (última em 02/10)
2. 👥 Trabalho — 456 msgs (última em 01/10)
3. 👤 Fulano — 78 msgs (última em 28/09)

💡 /stats /nome/ mostra um
💡 /stats -f /nome/ apaga as dele
```

```text
📊 Estatísticas de Família
Últimos 7 dias

💬 Mensagens: 78 (média 11/dia)
📎 Com mídia: 21
👥 Participantes ativos: 4

🏆 Quem mais fala
🥇 Tia — 40 (51%)
🥈 Tio — 25 (32%)
🥉 Primo — 10 (13%)
4. Vó — 3 (4%)

🗑️ Quem mais apaga
1. Tio — 2

✏️ Quem mais edita
1. Primo — 1

🕐 Por horário
09–12h █████      18
12–15h ██████████ 34
15–18h ████████   26
...
⏰ Horário de pico: 14h–15h (13 msgs)
📅 Dia mais movimentado: 30/09/2026 (16 msgs)
```

```text
/stats -me
📊 Suas estatísticas
Últimos 7 dias, todos os chats

💬 Mensagens: 17 (média 2/dia)
📎 Com mídia: 5
🗑️ Apagadas por você: 1
👥 Chats em que você falou: 2

🏆 Onde você mais fala
🥇 👥 Família — 12 (71%)
🥈 👤 Beltrano — 5 (29%)

🕐 Por horário
...
```
