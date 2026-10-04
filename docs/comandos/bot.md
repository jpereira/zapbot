# `/bot` (`/b`) · admin

Liga e desliga o bot, diz quem pode usá-lo e mostra o status dele (o
relatório das últimas 24 h, os usuários e o envio diário) e as versões do que
ele usa ([Informações do sistema](#informações-do-sistema)). Tudo sobrevive a
reinícios:

- **Ligado/desligado** (padrão ligado): desligado, o bot ignora **todos** os
  comandos, inclusive os seus, exceto o próprio `/bot`. Os admins e os
  usuários continuam nas listas.
- **Quem usa os comandos**:
    - **Você** (o dono) usa tudo.
    - Os **admins** ([`+o`](#admins-extras)) também usam tudo.
    - Os **usuários** ([`+v`](#usuários)) usam os comandos comuns (os sem ✅ na
      [tabela de comandos](index.md#resumo): `/get`, `/tempo`...): em qualquer
      chat, só num grupo (o grupo inteiro) ou só uma pessoa num grupo.
    - Os outros são ignorados em silêncio. Por padrão não há usuários: só você
      (e os admins) usa comandos.

| Opção | Descrição |
|---|---|
| *(nenhuma)* | O status: o mesmo do `-status`. Veja [Status do bot](#status-do-bot) |
| `-on` | Liga o bot |
| `-off` | Desliga o bot (os admins e os usuários ficam) |
| `+o`, `-o` | `[pessoa...]`: põe (`+o`) e tira (`-o`) admins. Sem ninguém, a pessoa do privado onde você digitou. Veja [Admins extras](#admins-extras) |
| `+v`, `-v` | `[pessoa\|grupo...]`: põe (`+v`) e tira (`-v`) usuários. Digitado num grupo, o `+v` de uma pessoa vale só nesse grupo. Sem ninguém, o chat atual: o grupo ou a pessoa do privado. Veja [Usuários](#usuários) |
| `+cmd`, `-cmd` | `<comandos>`: os comandos de um usuário. Com o `+v`, define (`+cmd`: só esses; `-cmd`: todos, menos esses); sozinho, `+cmd` libera e `-cmd` tira. Veja [Comandos de cada usuário](#comandos-de-cada-usuário) |
| `-users`, `-u` | Os usuários deste chat. Veja [Lista de usuários](#lista-de-usuários) |
| `-all-users`, `-au` | Todos os usuários, em qualquer chat (num grupo, o telefone de quem é de fora sai escondido). Veja [Lista de usuários](#lista-de-usuários) |
| `-reset`, `-r` | `[force]`: volta ao padrão (bot ligado, sem admins extras e sem usuários). Pergunta antes; com `force`, volta direto. Não combina com as outras opções. Veja [Voltar ao padrão](#voltar-ao-padrão) |
| `-status`, `-s` | O status agora e o envio diário dele (`[<hora>\|off]`). Não combina com as outras opções. Veja [Status do bot](#status-do-bot) |
| `-to` | `<destino>`: junto com `-status`, para onde vai o relatório (pessoa, grupo ou e-mail; repita para vários). Veja [Status do bot](#status-do-bot) |
| `-info`, `-i` | Versões do bot e do que ele usa, e o sistema. Não combina com as outras opções. Veja [Informações do sistema](#informações-do-sistema) |

O `-on`/`-off` combina com o `-users` e o `-all-users` (`/bot -on -users` liga e
mostra os usuários); `-on` com `-off` no mesmo comando é recusado. Os
`+o`/`-o`/`+v`/`-v` vão um de cada vez; junto deles, o `+cmd`/`-cmd` (só com
usuários) e o `-all-users` (a resposta com todos).

## Lista de usuários

A lista sai no status (o `/bot` sem opção), no `-users`, no `-all-users` e na
resposta do `+o`/`-o`/`+v`/`-v`. Ela junta os admins e os usuários, como o
resto do bot mostra um destino: `👤 Nome · +número` (ou só `👤 +número`, sem o
contato na agenda) e `👥 Grupo`; quem só usa num grupo, com `só em 👥 Grupo`
(ou `só neste grupo`). Quem é admin e usuário aparece uma vez, com as duas
marcas; você, se estiver nela, com `🤖 dono`. Embaixo, as **Permissões** dizem
o que cada marca quer dizer.

```
/bot -users               (no seu privado)
Usuários (4)
• 👑 +o · 👤 Jorge Pereira · +5521999999999
• 👑 +o 🗣️ +v · 👤 Ana Souza · +5511988887777
• 🗣️ +v · 👤 Camila Gama · +5521999982222
• 🗣️ +v · 👤 Maria Lucia · +5521999986666 · só em 👥 Amigos Faculdade

Permissões
👑 +o: admin, usa tudo
🗣️ +v: usuário, usa os comandos comuns
```

### Quem aparece na lista

A lista é a do chat onde você digitou:

| Onde | Quem aparece |
|---|---|
| No seu privado | Todos |
| Num grupo | Quem participa dele, o próprio grupo e quem só usa nele |
| No privado de alguém | Só essa pessoa |
| Em qualquer lugar, com `-all-users` (`-au`) | Todos |

Quando alguém fica de fora, a lista diz quantos e como ver todos, com o
cuidado de não expor no grupo quem não é de lá:

```
/bot -users               (no grupo Amigos Faculdade)
Usuários (2) neste grupo
• 🗣️ +v · 👤 Jorge Chip L200 · +5521999983333
• 🗣️ +v · 👤 Sofia Izabel · +5521•••••7777 · só neste grupo

Permissões
👑 +o: admin, usa tudo
🗣️ +v: usuário, usa os comandos comuns

💡 Só quem é deste grupo; mais 1 fora daqui.
⚠️ Para listar todos: /bot -all-users ou /bot -au. Cuidado: mostra também quem não é deste grupo.
```

Num grupo, o telefone de quem não participa dele sai escondido (o DDI, o DDD e
os 4 últimos), também com o `-all-users`. No seu privado (ou no da pessoa), sai
inteiro.

Com todos liberados (`/set bot.users true`), a lista mostra só os admins, e o
`/bot` avisa que qualquer pessoa está usando os comandos:

```
▶️ Bot: ativo
🔓 Comandos: todos usam os comuns
⚠️ Atenção: qualquer pessoa pode executar os comandos comuns do bot, em qualquer chat. Para restringir: /set bot.users false (e depois /bot +v para liberar alguns).
```

Quando usar cada opção:

| Situação | Comando |
|---|---|
| Alguém está abusando dos comandos num grupo | `/bot -v`, digitado no grupo (ou `/bot -v /Grupo/`) |
| Liberar o bot para a família, só no grupo dela | `/bot +v`, digitado no grupo (ou `/bot +v /Grupo Familia/` de qualquer chat) |
| Liberar para uma pessoa, em qualquer chat | `/bot +v /Camila Gama/` |
| Liberar só alguns comandos para alguém | `/bot +v +cmd /cotacao,/crypto /Sofia Izabel/` |
| Dar a alguém os comandos admin | `/bot +o /Jorge Pereira/` |
| Parar o bot por completo por um tempo, sem derrubar o container | `/bot -off` |
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

## Admins extras

Outras pessoas podem usar os comandos **admin** (os marcados com ✅ na
[tabela de comandos](index.md#resumo)), e também os comuns, em qualquer chat,
se você as puser como admins:

```
/bot +o /Jorge Pereira/               → acrescenta, pelo nome do contato
/bot +o +5521999999999                → ou pelo número
/bot +o @Fulano Da Silva              → ou, num grupo, mencionando a pessoa
/bot +o                               → no privado de alguém: essa pessoa
/bot -o /Jorge Pereira/               → tira
/bot -users                           → a lista: 👑 +o · 👤 Jorge Pereira · +5521999999999
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
- Só **você** (o dono, a conta pareada) põe e tira admins: um admin extra não
  consegue se dar (nem dar a outros) esse acesso.
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

Os usuários usam os comandos **comuns** (os sem ✅ na
[tabela de comandos](index.md#resumo)); os comandos admin continuam só seus e
dos admins.

| Quem | Onde usa |
|---|---|
| Uma pessoa, posta no seu privado ou no dela (`/bot +v /Camila Gama/`) | Em qualquer chat |
| Uma pessoa, posta num grupo (`/bot +v /Maria Lucia/`, digitado no grupo) | Só nesse grupo. No privado, o bot responde onde ela pode |
| Um grupo (`/bot +v`, digitado no grupo, ou `/bot +v /Amigos Faculdade/`) | Qualquer um, dentro do grupo (no privado de cada um, não) |
| Ninguém, o padrão (`/set bot.users false`) | Só você e os admins usam comandos |
| Todos (`/set bot.users true`) | Qualquer pessoa, em qualquer chat (o `/bot` avisa) |

```
/bot +v /Camila Gama/                      → no seu privado: a Camila, em qualquer chat
/bot +v /Maria Lucia/                      → no grupo Amigos Faculdade: a Maria, só nele
/bot +v                                    → digitado num grupo: o grupo; no privado de alguém: a pessoa
/bot +v /Amigos Faculdade/ @Fulano +5521999999999  → vários de uma vez
/bot -v /Maria Lucia/                      → no grupo: tira a permissão de lá
/bot -v /Camila Gama/                      → no seu privado: tira todas as da Camila
/bot -v                                    → tira o chat atual
```

Quem só tem permissão em grupos e manda um comando no privado recebe:

```
🚫 Sem permissão para comandos no privado. Permitido apenas em: 👥 Amigos Faculdade.
```

A resposta do `+o`/`-o`/`+v`/`-v` é a [lista de usuários](#lista-de-usuários)
do chat, com ✅ em quem acabou de entrar; quem saiu vem numa linha 🗑️ em cima.
Sem ninguém na lista, vem a linha de quem usa os comandos (`🔒 Comandos: só o
dono`):

```
/bot +v /Sofia Izabel/    (no grupo Amigos Faculdade)
Usuários (2) neste grupo
• 🗣️ +v · 👤 Jorge Chip L200 · +5521999983333
• 🗣️ +v · 👤 Sofia Izabel · +5521•••••7777 · só neste grupo ✅

Permissões
👑 +o: admin, usa tudo
🗣️ +v: usuário, usa os comandos comuns

💡 Só quem é deste grupo; mais 1 fora daqui.
Listar usuários: /bot -users ou /bot -u
```

```
/bot -v /Sofia Izabel/    (no grupo Amigos Faculdade)
🗑️ 👤 Sofia Izabel · +5521•••••7777 · só neste grupo

Usuários (1) neste grupo
• 🗣️ +v · 👤 Jorge Chip L200 · +5521999983333
...
```

- As pessoas são buscadas como os admins (nome, menção ou número), e os
  grupos, pelo nome, como no `-to`. Fica guardado o telefone da pessoa e o id
  do grupo; a lista mostra os nomes.
- No grupo, o `-v` tira a permissão daquele grupo (ou, se a pessoa só tiver a
  de qualquer chat, essa); no seu privado, tira todas as da pessoa.
- Quem já usa em qualquer chat não ganha nada com o `+v` num grupo: o bot
  responde que ela já é usuária.
- Com todos liberados (`/set bot.users true`), o `/bot +v /Fulano/` é
  recusado: para liberar só alguns, `/set bot.users false` antes.
- O `/bot +v` sem ninguém no **seu** privado é recusado (você já usa tudo); num
  privado de quem o WhatsApp só informa o id interno (LID), sem o telefone,
  também: use o número.
- Só **você** põe e tira usuários, como os admins.

### Comandos de cada usuário

Um usuário (uma pessoa ou um grupo) pode ficar limitado a alguns comandos
comuns. O `/help` e o `/whois` sempre passam (o `/help` mostra só os dele).

```
/bot +cmd /cotacao,/crypto,/meme +v /Sofia Izabel/  → a Sofia entra só com esses
/bot +v +cmd /cotacao                               → digitado num grupo: o grupo inteiro, só /cotacao
/bot +v -cmd /meme /Fulano/                         → o Fulano usa todos, menos /meme
/bot +cmd /tempo /Sofia Izabel/                     → acrescenta /tempo aos dela
/bot -cmd /cotacao /Fulano Pereira/                 → tira /cotacao dos dele
/bot -cmd /meme /Grupo Familia/ /Fulano da Silva/   → vários de uma vez
/bot -cmd /meme                                     → do chat atual (o grupo, ou a pessoa do privado)
/bot +cmd all /Sofia Izabel/                        → a Sofia volta a usar todos os comuns
```

- O `+cmd` em quem ainda não é usuário já põe a pessoa (ou o grupo), só com
  esses comandos. Em quem usa todos, não muda nada; em quem tem "Todos,
  menos", libera esses de novo.
- O `-cmd` em quem usa todos deixa "Todos, menos" esses. Tirar o último
  comando de uma lista é recusado: para tirar a pessoa, `/bot -v`; para
  liberar todos, `/bot +cmd all`.
- Os comandos vão pelo nome ou pelo alias (`/creptomoeda` vira `/crypto`),
  separados por vírgula. Comandos admin não entram (o usuário não os usa de
  qualquer jeito).
- Num grupo, a pessoa é a de lá (como no `+v`); se ela for usuária em qualquer
  chat, é essa permissão que muda.
- Na lista, embaixo da pessoa, `→ Apenas: /cotacao, /crypto, /meme` ou
  `→ Todos, menos: /meme`:

```
Usuários (2)
• 🗣️ +v · 👤 Jorge Chip L200 · +5521999983333
• 🗣️ +v · 👤 Sofia Izabel · +5521999987777 ✅
 → Apenas: /cotacao, /crypto, /meme

Permissões
👑 +o: admin, usa tudo
🗣️ +v: usuário, usa os comandos comuns
```

- Fora da lista, o bot responde `🚫 Limitado aos comandos: /cotacao, /crypto,
  /meme.` (ou `🚫 O /meme não está liberado para você.`).
- Se mais de uma permissão vale ali (a pessoa e o grupo, por exemplo), vale a
  mais ampla: uma sem limite libera todos os comuns.
- O `-v` e o `-reset` tiram os limites junto.

### Proteção contra flood

Quem não é admin (os usuários e, com `/set bot.users true`, todos) pode repetir
o mesmo comando no máximo 3 vezes em 2 segundos. Passou disso, o bot avisa uma
vez e ignora todos os comandos da pessoa até o intervalo acabar:

```
⚠️ Não é permitido executar o mesmo comando mais de 3 vezes seguidas. Aguarde 2 segundos.
```

- Os aliases contam como o comando (`/noffa` e `/🌈` são o mesmo); comandos
  diferentes contam à parte.
- Você e os admins não têm limite.
- Os limites são settings: `/set flood.maxCommandRepeated 5` (`0` desliga) e
  `/set flood.intervalCommand 10` (em segundos). Veja [Settings](../settings.md).

## Voltar ao padrão

O `/bot -reset` (`-r`) desfaz tudo o que o `/bot` mudou: liga o bot, tira os
admins extras, os usuários e os limites de comandos deles, e volta só você
usando comandos. Antes, ele
pergunta: responda **sim** em até 10 segundos, no mesmo chat, para confirmar
(**não**, ou nada, deixa tudo como está). Com `force`, volta direto, sem
perguntar. O envio diário do [`-status`](#status-do-bot) fica como está. Só o
dono usa, e sozinho (não combina com as outras opções).

```
/bot -reset
⚠️ Voltar ao padrão? O bot fica ligado, sem admins extras e sem usuários.
💡 Responda sim em 10 s para confirmar (ou /bot -r force, sem perguntar).

sim
♻️ Padrão restaurado: bot ligado, sem admins extras e sem usuários.

▶️ Bot: ativo
🔒 Comandos: só o dono
```

```
/bot -r force             → volta direto, sem perguntar
```

## Status do bot

O `/bot` sem opção (ou `/bot -status`) mostra o status: o estado do bot, o
relatório das últimas 24 h, [os usuários](#lista-de-usuários) (a lista deste chat) e, no
fim, o envio diário. Com uma hora, o relatório sai todo dia nesse horário, no
seu privado ou nos destinos do `-to`.

| Forma | Descrição |
|---|---|
| `/bot` ou `/bot -status` | O status agora |
| `/bot -status <hora>` | Hora do envio diário, no horário de Brasília: `06h`, `6h30`, `06:00` ou `às 18h`. Trocar a hora substitui a anterior (os destinos ficam) |
| `/bot -status <hora> -to <destino>` | O envio diário numa pessoa, num grupo ou por e-mail (`email` = o `QRCODE_EMAIL_SMTP_TO`), em vez do seu privado; repita o `-to` para vários |
| `/bot -status -to <destino>` | O relatório agora, nos destinos |
| `/bot -status off` | Desliga o envio diário |

```
/bot                                     → o status agora
/bot -s                                  → o mesmo
/bot -status 06h                         → todo dia às 06:00, no seu privado
/bot -s 06h -to voce@exemplo.com         → todo dia às 06:00, por e-mail
/bot -s 7h -to /Grupo Familia/ -to email → no grupo e por e-mail
/bot -s às 18h30                         → todo dia às 18:30 (nos mesmos destinos)
/bot -s -to /Jorge Pereira/              → o relatório agora, no privado do contato
/bot -s off                              → para de enviar
```

```
📊 Status do ZapBot 2.2 (devel) · últimas 24 h
qui 01/10 06:00

▶️ Bot: ativo
👥 Comandos: o dono e quem está na lista abaixo

🤖 No ar: 2 dias, 3 horas · conectado: 2 dias, 2 horas
🗄️ Cache: 45.20 MB (banco 4.20 MB · mídias 40.10 MB) · 1.234 mensagens
👀 Watch: 5 ocorrências (#1 pix: 3, #2 boleto: 2)
🗑️ Apagadas: 12
✏️ Editadas: 4
📸 Status apagados: 2
🔇 Ignoradas (/mute): 7 (apagadas 5, editadas 2) · 3 silenciados
💾 Último backup: qui 01/10 03:00 (automático)

Usuários (2)
• 🗣️ +v · 👤 Camila Gama · +5521999982222
• 🗣️ +v · 👥 Grupo Familia

Permissões
👑 +o: admin, usa tudo
🗣️ +v: usuário, usa os comandos comuns

⏰ Status diário: todo dia às 06:00 → 📧 voce@exemplo.com, 👥 Grupo Familia
📅 Próximo: sex 02/10 06:00
💡 Mude com /bot -status <hora> ou desligue com /bot -status off.

ℹ️ Mais informações em /bot -h
```

O que entra:

- **No ar**: há quanto tempo o processo está rodando e há quanto tempo está
  conectado ao WhatsApp (o mesmo do [`/uptime`](uptime.md)).
- **Cache**: o tamanho de `cache/` (banco e mídias) e quantas mensagens estão
  guardadas.
- **Watch**: ocorrências das regras do [`/watch`](watch.md), com o nº de cada
  regra (as 5 que mais casaram).
- **Apagadas**, **editadas** e **status apagados**: o que foi recuperado nas
  últimas 24 h, inclusive o que o [`/mute`](mute.md) silenciou. Com o aviso
  desligado (`show.alert.deleted`, `show.alert.edited` ou `show.alert.status`
  em `off`), a linha diz como ligar de novo:
  `✏️ Editadas: 4 (aviso desligado; ligue com /set show.alert.edited on)`.
- **Ignoradas (/mute)**: os avisos que o `/mute` cortou nas últimas 24 h, por tipo,
  e quantos estão silenciados agora. Com alguém silenciado, o 0 só quer dizer
  que nenhum aviso dele chegou nas 24 h.
- **Último backup**: o mais recente do [`/backup`](backup.md).
- **Usuários**: a lista deste chat ([Quem aparece na lista](#quem-aparece-na-lista)).
  O relatório enviado pelo `-to` ou pelo envio diário vai sem ela.
- **Status diário**: o horário, os destinos (👤 pessoa, 👥 grupo ou 📧 e-mail; sem
  `-to`, o seu privado) e o próximo envio, ou `🔕 Status diário desligado`.

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
