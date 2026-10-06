# `/stats` · admin

Ranking do chat nos últimos N dias (padrão 7): total de mensagens, quem mais
fala, quem mais apaga e edita, mensagens por faixa de horário, horário e dia de
pico. Com `-me`, as **suas** mensagens somadas em todos os chats: em quais você
mais fala, quantas apagou, seus horários e seu dia de pico.

Os números vêm dos contadores da tabela `stats`, preenchidos a cada mensagem
recebida. As suas mensagens contam para o seu número em qualquer chat,
inclusive no privado com outras pessoas. O chat consigo mesmo e os status não
entram. Também não contam as respostas do próprio bot nem os avisos do
WhatsApp (alguém entrou no grupo, o nome mudou, a criptografia, uma chamada...),
que não têm autor.

| Opção | Valor | Descrição |
|---|---|---|
| `-N` | | Período em dias (padrão 7, máx. 90, setting `stats.retentionDays`). Vem antes ou depois do chat. Ex.: `-30` |
| *(chat)* | `/Grupo Família/` | Outro chat em vez do atual: um grupo, ou o privado com uma pessoa, buscado pelo nome (sem diferenciar maiúsculas e acentos) entre os que têm estatísticas. Entre barras ou aspas quando tem espaço. Vários com o nome: o bot lista e você responde com o nº |
| `-me` | | As suas estatísticas, somadas em todos os chats (ou só no chat informado) |
| `-list`, `-l` | | Lista os chats com estatísticas, do que mais fala para o que menos, com o total e o dia da última mensagem |
| `-flush`, `-f` | `</chat/>` | Apaga as estatísticas de um chat |
| `-flush-all` | | Apaga as estatísticas de todos os chats |

```
/stats                         → últimos 7 dias deste chat
/stats -30                     → últimos 30 dias
/stats /Grupo Família/         → do grupo "Grupo Família"
/stats -10 /Grupo Família/     → do grupo, nos últimos 10 dias
/stats /Grupo Família/ -10     → o mesmo
/stats -me                     → as suas, em todos os chats
/stats -me /Família/           → as suas, só no "Família"
/stats -l                      → os chats que têm estatísticas
/stats -flush /Grupo Família/  → apaga as do grupo
/stats -flush-all              → apaga todas
```

```
/stats -l
📊 Chats com estatísticas (3)
Até 90 dias guardados

1. 👥 Família — 1.234 msgs (última em 02/10)
2. 👥 Trabalho — 456 msgs (última em 01/10)
3. 👤 Fulano — 78 msgs (última em 28/09)

💡 /stats /nome/ mostra um; /stats -f /nome/ apaga as dele.
```

```
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

```
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
