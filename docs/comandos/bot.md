# `/bot` · admin

Controla quem pode usar o bot e mostra o relatório dele
([Status do bot](#status-do-bot)). Tem dois interruptores independentes, que
sobrevivem a reinícios:

- **Ligado/desligado** (setting `bot.paused`, padrão ligado): desligado, o bot
  ignora **todos** os comandos, inclusive os seus, exceto o próprio `/bot`.
- **Modo admin** (setting `bot.adminMode`, padrão ligado): ligado, só você
  usa comandos; os de qualquer outra pessoa são ignorados em silêncio, mesmo
  os que normalmente são liberados (`/get`, `/tempo`...).

| Opção | Descrição |
|---|---|
| *(nenhuma)* | Mostra o estado dos dois |
| `-on` | Liga o bot |
| `-off` | Desliga o bot |
| `+admin` | Liga o modo admin |
| `-admin` | Desliga o modo admin (cada comando volta a seguir a coluna *Admin* da [tabela de comandos](index.md#resumo)) |
| `-status` | Relatório do bot e o envio diário dele (`[<hora>\|off]`). Não combina com as outras. Veja [Status do bot](#status-do-bot) |

As opções combinam; `-on` com `-off` (ou `+admin` com `-admin`) no mesmo
comando é recusado. A resposta sempre mostra o estado final:

```
/bot               → ▶️ Bot: ativo
                     🔓 Modo admin: desligado
/bot +admin        → ▶️ Bot: ativo
                     🔒 Modo admin: ligado (só o dono usa comandos)
/bot -admin        → volta a liberar os comandos públicos para todos
/bot -off          → ⏸️ Bot: desligado (todos os comandos são ignorados)
/bot -on -admin    → liga o bot e desliga o modo admin de uma vez
/bot -h            → ajuda do comando
```

Quando usar cada um:

| Situação | Comando |
|---|---|
| Alguém está abusando dos comandos num grupo | `/bot +admin` |
| Vários zapbots no mesmo grupo e você quer que só o seu responda a você | `/bot +admin` |
| Parar o bot por completo por um tempo, sem derrubar o container | `/bot -off` |
| Religar o bot e liberar os comandos para todos | `/bot -on -admin` |

Detalhes:

- Com o bot desligado o `/set` também é ignorado: para ligar use sempre o
  `/bot -on`. Com ele ligado, `/set bot.paused` e `/set bot.adminMode` têm o
  mesmo efeito das opções.
- Se o bot reiniciar desligado ou em modo admin, a mensagem de inicialização
  no seu privado avisa.
- Só os **comandos** são afetados: a recuperação de mensagens apagadas e
  editadas, o `/watch`, os alertas de preço e as notificações do `/monitor`
  continuam funcionando.
- Comandos ignorados aparecem no log: `Comando '/ping' ignorado: bot
  desligado` (sempre) e `Comando '/ping' de Fulano ignorado: modo admin` (só
  com o [debug](debug.md) ligado).
- "Você" é a conta pareada ao bot, de qualquer aparelho. Para desligar só
  alguns comandos, para todos, use o setting `commands.disabled`.

## Status do bot

Relatório do bot nas últimas 24 h. Mande `/bot -status` para ver agora, ou
`/bot -status 06h` para receber todo dia nesse horário, no seu privado. No fim
do relatório vem o horário do envio diário e o próximo (ou que ele está
desligado).

| Forma | Descrição |
|---|---|
| `/bot -status` | O relatório agora, com o envio diário no fim |
| `/bot -status <hora>` | Hora do envio diário, no horário de Brasília: `06h`, `6h30`, `06:00` ou `às 18h`. Trocar a hora substitui a anterior |
| `/bot -status off` | Desliga o envio diário |

```
/bot -status             → o relatório agora
/bot -status 06h         → todo dia às 06:00
/bot -status às 18h30    → todo dia às 18:30 (no lugar das 06:00)
/bot -status off         → para de enviar
```

```
📊 Status do ZapBot 2.0 · últimas 24 h
qui 01/10 06:00

🤖 No ar: 2 dias, 3 horas · conectado: 2 dias, 2 horas
🗄️ Cache: 45.20 MB (banco 4.20 MB · mídias 40.10 MB) · 1.234 mensagens
👀 Watch: 5 ocorrências (#1 pix: 3, #2 boleto: 2)
🗑️ Apagadas: 12
✏️ Editadas: 4
📸 Status apagados: 2
🔇 Ignoradas (/mudo): 7 (apagadas 5, editadas 2)
💾 Último backup: qui 01/10 03:00 (automático)

⏰ Status diário: todo dia às 06:00, no seu privado.
📅 Próximo: sex 02/10 06:00
💡 Mude com /bot -status <hora> ou desligue com /bot -status off.
```

O que entra:

- **No ar**: há quanto tempo o processo está rodando e há quanto tempo está
  conectado ao WhatsApp (o mesmo do [`/uptime`](uptime.md)).
- **Cache**: o tamanho de `cache/` (banco e mídias) e quantas mensagens estão
  guardadas.
- **Watch**: ocorrências das regras do [`/watch`](watch.md), com o nº de cada
  regra (as 5 que mais casaram).
- **Apagadas**, **editadas** e **status apagados**: o que foi recuperado nas
  últimas 24 h, inclusive o que o [`/mudo`](mudo.md) silenciou.
- **Ignoradas (/mudo)**: os avisos que o `/mudo` cortou, por tipo.
- **Último backup**: o mais recente do [`/backup`](backup.md).
- **Status diário**: o horário e o próximo envio, ou `🔕 Status diário desligado`.

O envio diário fica na agenda do bot (tabela `schedules`), mas não aparece no
[`/cron`](cron.md) nem conta no limite dele. Se o bot estiver fora do ar
no horário, o relatório sai quando ele voltar.
