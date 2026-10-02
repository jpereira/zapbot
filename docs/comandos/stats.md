# `/stats` · admin

Ranking do chat nos últimos N dias (padrão 7): total de mensagens, quem mais
fala, quem mais apaga e edita, mensagens por faixa de horário, horário e dia de
pico. Com `-me`, as **suas** mensagens somadas em todos os chats: em quais você
mais fala, quantas apagou, seus horários e seu dia de pico.

Os números vêm dos contadores da tabela `stats`, preenchidos a cada mensagem
recebida. As suas mensagens contam para o seu número em qualquer chat,
inclusive no privado. Não contam as respostas do próprio bot nem os avisos do
WhatsApp (alguém entrou no grupo, o nome mudou, a criptografia, uma chamada...),
que não têm autor.

| Opção | Valor | Descrição |
|---|---|---|
| `-N` | | Período em dias (padrão 7, máx. 90, setting `stats.retentionDays`). Ex.: `-30` |
| `-chat`, `-c` | `<nome>` | Estatísticas de outro chat, buscado pelo nome. Com `-me`, só as suas nesse chat |
| `-me` | | As suas estatísticas, somadas em todos os chats |
| `-pv` | | Envia no seu privado em vez de expor no chat atual |

```
/stats                 → últimos 7 dias deste chat
/stats -30             → últimos 30 dias
/stats -c família -pv  → do chat "família", no seu privado
/stats -me             → as suas, em todos os chats
/stats -me -c família  → as suas, só no chat "família"
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
