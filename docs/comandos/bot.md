# `/bot` · admin

Controla quem pode usar o bot e mostra o relatório dele
([Status do bot](#status-do-bot)) e as versões do que ele usa
([Informações do sistema](#informações-do-sistema)). Tem dois interruptores independentes, que
sobrevivem a reinícios:

- **Ligado/desligado** (setting `bot.paused`, padrão ligado): desligado, o bot
  ignora **todos** os comandos, inclusive os seus, exceto o próprio `/bot`.
- **Modo admin** (setting `bot.adminMode`, padrão ligado): ligado, só você
  (e os [admins extras](#admins-extras)) usa comandos; os de qualquer outra
  pessoa são ignorados em silêncio, mesmo os que normalmente são liberados
  (`/get`, `/tempo`...).

| Opção | Descrição |
|---|---|
| *(nenhuma)* | Mostra o estado dos dois |
| `-on` | Liga o bot |
| `-off` | Desliga o bot |
| `+admin` | Liga o modo admin: só você (e os admins do [`bot.admins`](#admins-extras)) usa comandos |
| `-admin` | Desliga o modo admin (cada comando volta a seguir a coluna *Admin* da [tabela de comandos](index.md#resumo)) |
| `-status`, `-s` | Relatório do bot e o envio diário dele (`[<hora>\|off]`). Não combina com as outras. Veja [Status do bot](#status-do-bot) |
| `-info`, `-i` | Versões do bot e dos programas que ele usa, e o sistema. Não combina com as outras. Veja [Informações do sistema](#informações-do-sistema) |

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

## Admins extras

Outras pessoas podem usar os comandos **admin** (os marcados com ✅ na
[tabela de comandos](index.md#resumo)), e também os comandos no modo admin, se
o número delas estiver no setting `bot.admins`:

```
/set -a bot.admins /Jorge Pereira/    → acrescenta, pelo nome do contato
/set -a bot.admins +5521999999999     → ou pelo número
/set -a bot.admins @Fulano Da Silva   → ou, num grupo, mencionando a pessoa
/set -rem bot.admins /Jorge Pereira/  → tira
/set bot.admins                       → a lista: 5521999999999 (Jorge Pereira)
```

O nome é buscado como no `-to` ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)):
contato da sua agenda, e se mais de um servir, a lista para responder com o nº.
Nomes com espaço vão entre `/.../` ou aspas; vários de uma vez, separados por
espaço (`/set -a bot.admins /Jorge Pereira/ "Ana Souza" +5511988887777`). Fica
guardado o **telefone** (é ele que o bot compara com quem manda o comando), e a
lista mostra o nome ao lado. Grupo e e-mail são recusados, e um contato de quem
o WhatsApp só informa o id interno (LID), sem o telefone, também: use o número.

- Só **você** (o dono, a conta pareada) altera o `bot.admins`: um admin extra
  não consegue se dar (nem dar a outros) esse acesso.
- O número é comparado com o telefone de quem mandou a mensagem. Se o WhatsApp
  só informar o LID (o id interno) da pessoa e o bot não conseguir o telefone,
  ela não é reconhecida como admin.
- Os comandos de um admin extra agem como os seus: os avisos que vão "para o
  seu privado" (alertas, `-pv`, `/watch`...) vão para o **seu** privado, não
  para o dele. As checagens internas que eram só do dono (moedas do `/cotacao`
  e do `/crypto`, alertas de preço, `/show -f`) também valem para os admins.
- Numa lista de escolha (vários contatos com o nome), só quem deu o comando
  responde com o nº.
- Dê esse acesso só a quem você confia: um admin pode, por exemplo, apagar o
  cache (`/cache -a`) ou restaurar um backup.

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
/bot -s                  → o mesmo, pelo atalho
/bot -status 06h         → todo dia às 06:00
/bot -s às 18h30         → todo dia às 18:30 (no lugar das 06:00)
/bot -s off              → para de enviar
```

```
📊 Status do ZapBot 2.2 · últimas 24 h
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
  últimas 24 h, inclusive o que o [`/mudo`](mudo.md) silenciou. Com o aviso
  desligado (`show.alert.deleted`, `show.alert.edited` ou `show.alert.status`
  em `off`), a linha diz como ligar de novo:
  `✏️ Editadas: 4 (aviso desligado; ligue com /set show.alert.edited on)`.
- **Ignoradas (/mudo)**: os avisos que o `/mudo` cortou, por tipo.
- **Último backup**: o mais recente do [`/backup`](backup.md).
- **Status diário**: o horário e o próximo envio, ou `🔕 Status diário desligado`.

O envio diário fica na agenda do bot (tabela `schedules`), mas não aparece no
[`/cron`](cron.md) nem conta no limite dele. Se o bot estiver fora do ar
no horário, o relatório sai quando ele voltar.

## Informações do sistema

`/bot -info` (ou `-i`) mostra as versões do que o bot usa e onde ele está
rodando: útil para saber se a imagem precisa ser refeita (o `yt-dlp`, por
exemplo, muda com frequência) e para relatar um problema.

```
/bot -info
ℹ️ ZapBot 2.2 · informações do sistema

🤖 Bot
• ZapBot: 2.2 (git+9029cfb/release-2.2) (APP_ENV=prod)
• Node.js: v24.9.0 (V8 13.6.233.10-node.27)
• whatsapp-web.js: 1.34.7 (commit 58ddf15)
• WhatsApp Web: 2.3000.1027123456
• SQLite: 3.50.4

🧰 Programas
• Chromium: Chromium 141.0.7390.54
• yt-dlp: 2026.09.21
• ffmpeg: 7.1.1

🖥️ Sistema
• Linux 9f2c1a7d3e4b 6.8.0-85-generic #85-Ubuntu SMP x86_64 Linux
• Host: 9f2c1a7d3e4b (Docker)
• CPU: 4× Intel(R) Core(TM) i5-8500T CPU @ 2.10GHz · carga 0.32 · 0.41 · 0.38
• Memória: 2.10 GB de 7.66 GB em uso · o bot usa 412.30 MB
• No ar: sistema há 12 dias, 3 horas · bot há 2 dias, 1 hora (PID 1)
```

- **ZapBot** traz o commit e a tag que estão rodando (`git+9029cfb/release-2.2`;
  fora de uma release, `/HEAD`), gravados na imagem a cada `docker compose build`
  (veja o [`/version`](version.md)).
- **WhatsApp Web** é a versão que o WhatsApp está servindo para o bot (só
  aparece conectado); o **Chromium** vem do navegador do Puppeteer, ou do
  binário quando ainda não conectou.
- Um programa que não responde em 5 s (ou não existe, como o `yt-dlp` fora do
  Docker) aparece como _não encontrado_.
- **Carga** é a média de processos na fila do sistema em 1, 5 e 15 minutos.
