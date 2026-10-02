# `/bot` · admin

Controla quem pode usar o bot e mostra o relatório dele
([Status do bot](#status-do-bot)) e as versões do que ele usa
([Informações do sistema](#informações-do-sistema)). Tudo sobrevive a reinícios:

- **Ligado/desligado** (setting `bot.paused`, padrão ligado): desligado, o bot
  ignora **todos** os comandos, inclusive os seus, exceto o próprio `/bot`.
- **Quem usa os comandos** (settings `bot.admins` e `bot.users`):
    - **Você** (o dono) usa tudo.
    - Os **admins** do [`bot.admins`](#admins-extras) também usam tudo.
    - Os **usuários** do [`bot.users`](#usuários) usam os comandos comuns (os
      sem ✅ na [tabela de comandos](index.md#resumo): `/get`, `/tempo`...).
    - Os outros são ignorados em silêncio. Por padrão o `bot.users` é `false`:
      só você (e os admins) usa comandos.

| Opção | Descrição |
|---|---|
| *(nenhuma)* | Mostra o estado e, numa lista só, quem usa: admins (👑 `+o`) e usuários (🗣️ `+v`), com o tipo (👤 pessoa ou 👥 grupo), o nome e o número |
| `-on` | Liga o bot |
| `-off` | Desliga o bot |
| `+admin`, `-admin` | `+admin`: só você (e os admins) usa comandos; a lista de usuários sai. `-admin`: todos usam os comandos comuns, em qualquer chat (o `/bot` mostra um aviso) |
| `+o`, `-o` | `[pessoa...]`: põe (`+o`) e tira (`-o`) admins. Sem ninguém, a pessoa do privado onde você digitou. Veja [Admins extras](#admins-extras) |
| `+v`, `-v` | `[pessoa\|grupo...]`: põe (`+v`) e tira (`-v`) usuários. Sem ninguém, o chat atual: o grupo ou a pessoa do privado. Veja [Usuários](#usuários) |
| `-reset`, `-r` | Volta ao padrão: bot ligado, sem admins extras e sem usuários. Não combina com as outras. Veja [Voltar ao padrão](#voltar-ao-padrão) |
| `-status`, `-s` | Relatório do bot e o envio diário dele (`[<hora>\|off]`). Não combina com as outras. Veja [Status do bot](#status-do-bot) |
| `-info`, `-i` | Versões do bot e dos programas que ele usa, e o sistema. Não combina com as outras. Veja [Informações do sistema](#informações-do-sistema) |

O `-on`/`-off` e o `+admin`/`-admin` combinam; `-on` com `-off` (ou `+admin`
com `-admin`) no mesmo comando é recusado. Os `+o`/`-o`/`+v`/`-v` vão
sozinhos, um de cada vez. A resposta mostra o estado final:

```
/bot
▶️ Bot: ativo
👥 Comandos: o dono e quem está na lista abaixo

Quem usa (4)
• 👑 +o · 👤 Jorge Pereira · +5521999999999
• 👑 +o 🗣️ +v · 👤 Ana Souza · +5511988887777
• 🗣️ +v · 👤 Camila Gama · +5521988887777
• 🗣️ +v · 👥 Grupo Familia
💡 👑 +o: admin, usa tudo (bot.admins) · 🗣️ +v: usuário, usa os comandos comuns (bot.users)
```

A lista de quem usa junta os admins e os usuários, como o resto do bot mostra
um destino: `👤 Nome · +número` (ou só `👤 +número`, sem o contato na agenda) e
`👥 Grupo`. Quem está nas duas aparece uma vez, com as duas marcas. Sem
ninguém, a lista não aparece.

Com todos liberados (`/bot -admin`), a lista mostra só os admins, e o `/bot`
avisa que qualquer pessoa está usando os comandos:

```
/bot
▶️ Bot: ativo
🔓 Comandos: todos usam os comuns
⚠️ Atenção: qualquer pessoa pode executar os comandos comuns do bot, em qualquer chat. Para restringir: /bot +admin (e depois /bot +v para liberar alguns).
```

Os outros:

```
/bot +admin        → 🔒 Comandos: só o dono
/bot -admin        → 🔓 Comandos: todos usam os comuns
/bot -off          → ⏸️ Bot: desligado (todos os comandos são ignorados)
/bot -on -admin    → liga o bot e libera os comandos comuns para todos de uma vez
/bot +v            → digitado num grupo: libera os comandos comuns ali
/bot -reset        → volta ao padrão (veja abaixo)
/bot -h            → ajuda do comando
```

Quando usar cada um:

| Situação | Comando |
|---|---|
| Alguém está abusando dos comandos num grupo | `/bot +admin` (ou tire o grupo: `/bot -v /Grupo/`) |
| Vários zapbots no mesmo grupo e você quer que só o seu responda a você | `/bot +admin` |
| Liberar o bot para a família, só no grupo dela | `/bot +v`, digitado no grupo (ou `/bot +v /Grupo Familia/` de qualquer chat) |
| Liberar para uma pessoa, em qualquer chat | `/bot +v /Camila Gama/` |
| Dar a alguém os comandos admin | `/bot +o /Jorge Pereira/` |
| Parar o bot por completo por um tempo, sem derrubar o container | `/bot -off` |
| Religar o bot e liberar os comandos para todos | `/bot -on -admin` |
| Desfazer tudo: só você de novo, sem admins nem usuários | `/bot -reset` |

Detalhes:

- Com o bot desligado o `/set` também é ignorado: para ligar use sempre o
  `/bot -on`.
- Se o bot reiniciar desligado, ou só com você usando comandos, a mensagem de
  inicialização no seu privado avisa.
- Só os **comandos** são afetados: a recuperação de mensagens apagadas e
  editadas, o `/watch`, os alertas de preço e as notificações do `/monitor`
  continuam funcionando.
- Comandos ignorados aparecem no log: `Comando '/ping' ignorado: bot
  desligado` (sempre) e `Comando '/ping' de Fulano ignorado: fora do bot.users`
  (só com o [debug](debug.md) ligado).
- "Você" é a conta pareada ao bot, de qualquer aparelho. Para desligar só
  alguns comandos, para todos, use o setting `commands.disabled`.
- Até a 2.2, isso era o setting `bot.adminMode`. Ao atualizar, ele vira o
  `bot.users`: o modo admin desligado (todos usavam) vira `true`; ligado, o
  padrão (`false`).

## Admins extras

Outras pessoas podem usar os comandos **admin** (os marcados com ✅ na
[tabela de comandos](index.md#resumo)), e também os comuns, se o número delas
estiver no setting `bot.admins`:

```
/bot +o /Jorge Pereira/               → acrescenta, pelo nome do contato
/bot +o +5521999999999                → ou pelo número
/bot +o @Fulano Da Silva              → ou, num grupo, mencionando a pessoa
/bot +o                               → no privado de alguém: essa pessoa
/bot -o /Jorge Pereira/               → tira
/bot                                  → a lista: 👑 +o · 👤 Jorge Pereira · +5521999999999
```

O nome é buscado como no `-to` ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)):
contato da sua agenda, e se mais de um servir, a lista para responder com o nº.
Nomes com espaço vão entre `/.../` ou aspas; vários de uma vez, separados por
espaço (`/bot +o /Jorge Pereira/ "Ana Souza" +5511988887777`). Fica
guardado o **telefone** (é ele que o bot compara com quem manda o comando), e a
lista mostra o nome ao lado. E-mail é recusado, e um contato de quem
o WhatsApp só informa o id interno (LID), sem o telefone, também: use o número.

- **Grupo não pode ser admin**: todo mundo ali mandaria no bot (`/set`,
  `/backup -send` com o banco inteiro...). O `/bot +o /Grupo/` (ou o `/bot +o`
  digitado num grupo) é recusado e sugere o `/bot +v`, que libera só os
  comandos comuns.
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

## Usuários

O setting `bot.users` diz quem, além de você e dos admins, usa os comandos
**comuns** (os sem ✅ na [tabela de comandos](index.md#resumo)). Os comandos
admin continuam só seus e dos admins.

| Estado | Quem usa os comandos comuns |
|---|---|
| Sem usuários, o padrão (`/bot +admin`) | Ninguém: só você e os admins |
| Todos (`/bot -admin`) | Qualquer pessoa, em qualquer chat (o `/bot` avisa) |
| Pessoas e grupos (`/bot +v`) | Só esses. A pessoa, em qualquer chat; o grupo, qualquer um dentro dele (no privado de cada um, não) |

```
/bot +v /Camila Gama/                      → a Camila, em qualquer chat
/bot +v /Grupo Familia/ @Fulano +5521999999999  → vários de uma vez
/bot +v                                    → digitado num grupo: o grupo; no privado de alguém: a pessoa
/bot -v /Grupo Familia/                    → tira
/bot -v                                    → tira o chat atual
/bot                                       → a lista: 🗣️ +v · 👤 Camila Gama · +5521988887777
```

- As pessoas são buscadas como no `bot.admins` (nome, menção ou número), e os
  grupos, pelo nome, como no `-to`. Fica guardado o telefone da pessoa e o id
  do grupo; a lista mostra os nomes.
- Com todos liberados (`/bot -admin`), o `/bot +v /Fulano/` é recusado: para
  liberar só alguns, `/bot +admin` antes.
- O `/bot +admin` esvazia a lista.
- O `/bot +v` sem ninguém no **seu** privado é recusado (você já usa tudo); num
  privado de quem o WhatsApp só informa o id interno (LID), sem o telefone,
  também: use o número.
- Só **você** altera os usuários, como os admins.

## Voltar ao padrão

O `/bot -reset` (`-r`) desfaz tudo o que o `/bot` mudou: liga o bot, tira os
admins extras e os usuários, e volta só você usando comandos. O envio diário
do [`-status`](#status-do-bot) fica como está. Só o dono usa, e sozinho (não
combina com as outras opções).

```
/bot -reset
♻️ Padrão restaurado: bot ligado, sem admins extras e sem usuários.

▶️ Bot: ativo
🔒 Comandos: só o dono
```

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
📊 Status do ZapBot 2.2 (devel) · últimas 24 h
qui 01/10 06:00

🤖 No ar: 2 dias, 3 horas · conectado: 2 dias, 2 horas
🗄️ Cache: 45.20 MB (banco 4.20 MB · mídias 40.10 MB) · 1.234 mensagens
👀 Watch: 5 ocorrências (#1 pix: 3, #2 boleto: 2)
🗑️ Apagadas: 12
✏️ Editadas: 4
📸 Status apagados: 2
🔇 Ignoradas (/mudo): 7 (apagadas 5, editadas 2) · 3 silenciados
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
- **Ignoradas (/mudo)**: os avisos que o `/mudo` cortou nas últimas 24 h, por tipo,
  e quantos estão silenciados agora. Com alguém silenciado, o 0 só quer dizer
  que nenhum aviso dele chegou nas 24 h.
- **Último backup**: o mais recente do [`/backup`](backup.md).
- **Status diário**: o horário e o próximo envio, ou `🔕 Status diário desligado`.

O envio diário fica na agenda do bot (tabela `schedules`), mas não aparece no
[`/cron`](cron.md) nem conta no limite dele. Se o bot estiver fora do ar
no horário, o relatório sai quando ele voltar.

## Informações do sistema

`/bot -info` (ou `-i`) mostra as versões do que o bot usa e onde ele está
rodando: útil para saber se a imagem precisa ser refeita (o `yt-dlp`, por
exemplo, muda com frequência) e para relatar um problema. Ele também avisa
quando há versão nova do `yt-dlp` e do `whatsapp-web.js`.

```
/bot -info
ℹ️ ZapBot 2.2 (devel) · informações do sistema

🤖 Bot
• ZapBot: 2.2 (devel) (git+9029cfb/HEAD) (APP_ENV=prod)
• Node.js: v24.9.0 (V8 13.6.233.10-node.27)
• whatsapp-web.js: 1.34.7 (commit 58ddf15) · ✅ a mais recente · ⬆️ 1 commit novo no main
• WhatsApp Web: 2.3000.1027123456
• SQLite: 3.50.4

🧰 Programas
• Chromium: Chromium 141.0.7390.54
• yt-dlp: 2026.09.21 · ⬆️ nova: 2026.9.30
• ffmpeg: 7.1.1

🖥️ Sistema
• Linux 9f2c1a7d3e4b 6.8.0-85-generic #85-Ubuntu SMP x86_64 Linux
• Host: 9f2c1a7d3e4b (Docker)
• CPU: 4× Intel(R) Core(TM) i5-8500T CPU @ 2.10GHz · carga 0.32 · 0.41 · 0.38
• Memória: 2.10 GB de 7.66 GB em uso · o bot usa 412.30 MB
• No ar: sistema há 12 dias, 3 horas · bot há 2 dias, 1 hora (PID 1)
```

- **ZapBot** traz o commit e a tag que estão rodando (`git+9029cfb/release-X.Y`;
  fora de uma release, `(devel)` e `/HEAD`), gravados na imagem a cada
  `docker compose build` (veja o [`/version`](version.md)).
- **WhatsApp Web** é a versão que o WhatsApp está servindo para o bot (só
  aparece conectado); o **Chromium** vem do navegador do Puppeteer, ou do
  binário quando ainda não conectou.
- **Versões novas**: o `yt-dlp` é comparado com a última do
  [PyPI](https://pypi.org/project/yt-dlp/), e o `whatsapp-web.js` com a última
  release do [GitHub](https://github.com/wwebjs/whatsapp-web.js/releases). Como o
  bot usa um commit fixado do `main` (no `package.json`), aparecem também os
  commits novos do `main` depois dele. As consultas ficam guardadas por 6 h; sem
  internet (ou com a API fora do ar), a linha sai sem a nota. Para atualizar o
  `yt-dlp`, refaça a imagem (`docker compose build --no-cache zapbot`).
- Um programa que não responde em 5 s (ou não existe, como o `yt-dlp` fora do
  Docker) aparece como _não encontrado_.
- **Carga** é a média de processos na fila do sistema em 1, 5 e 15 minutos.
