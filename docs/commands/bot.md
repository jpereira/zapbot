# `/bot` · admin

Controla quem pode usar o bot. Tem dois interruptores independentes, que
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
