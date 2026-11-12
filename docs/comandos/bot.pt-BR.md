# `/bot` · admin

Liga e desliga o bot, diz quem pode usá-lo e mostra o status dele (o relatório das últimas 24 h, os
usuários e o envio diário), as versões do que ele usa
([Informações do sistema](#informações-do-sistema)) e um teste geral com ✅/❌
([Teste do bot](#teste-do-bot)). Tudo sobrevive a reinícios:

- **Ligado/desligado** (padrão ligado): desligado, o bot ignora **todos** os comandos, inclusive os
  seus, exceto o próprio `/bot`. Os admins e os usuários continuam nas listas.
- **Quem usa os comandos**:
    - **Você** (o dono) usa tudo.
    - Os **admins** ([`+a`](#admins-extras)) também usam tudo.
    - Os **usuários** ([`+u`](#usuários)) usam os comandos de role `user` (veja a coluna Role da
      [tabela de comandos](index.md#resumo): `/get`, `/weather`...): em qualquer chat, só num grupo (o
      grupo inteiro) ou só uma pessoa num grupo. Um comando `admin` (`/gpt`, `/show`...) só com a
      [delegação](index.md#delegando-um-comando-admin) do `+cmd`.
    - Os outros são ignorados em silêncio. Por padrão não há usuários: só você (e os admins) usa
      comandos.

| Opção | Descrição |
|---|---|
| *(nenhuma)* | O status: o mesmo do `-status`. Veja [Status do bot](#status-do-bot) |
| `-on` | Liga o bot |
| `-off` | Desliga todos os comandos do bot, exceto o `/bot` (os admins e os usuários ficam nas listas) |
| `+a`, `-a` | `[pessoa...]`: adiciona (`+a`) e tira (`-a`) admins. Sem ninguém, a pessoa do privado onde você digitou. Veja [Admins extras](#admins-extras) |
| `+u`, `-u` | `[pessoa\|grupo...]`: adiciona (`+u`) e tira (`-u`) usuários. Digitado num grupo, o `+u` de uma pessoa vale só nesse grupo. Sem ninguém, o chat atual: o grupo ou a pessoa do privado. Veja [Usuários](#usuários) |
| `+cmd`, `-cmd` | `<comandos>`: os comandos de um usuário. Com o `+u`, define (`+cmd`: só esses; `-cmd`: todos, menos esses); sozinho, `+cmd` libera e `-cmd` tira. Veja [Comandos de cada usuário](#comandos-de-cada-usuário) |
| `-list-users`, `-lu` | `[all]`: os usuários deste chat; com `all`, todos, em qualquer chat (num grupo, o telefone de quem é de fora sai escondido). Aceita `-mask`. Veja [Lista de usuários](#lista-de-usuários) |
| `-reset`, `-r` | `[force]`: tira todos os usuários e os limites deles (os admins extras e o liga/desliga ficam). Com `force`, volta tudo ao padrão: também tira os admins extras e liga o bot. Os dois perguntam antes. Aceita `-mask`; as outras opções são recusadas. Só o dono. Veja [Voltar ao padrão](#voltar-ao-padrão) |
| `-status`, `-s` | O status agora e o envio diário dele (`[<hora>\|off]`). Aceita `-to` e `-mask`; as outras opções são recusadas. Veja [Status do bot](#status-do-bot) |
| `-to` | `<destino>`: junto com `-status`, para onde vai o relatório (pessoa, grupo ou e-mail; repita para vários). Veja [Status do bot](#status-do-bot) |
| `-info`, `-i` | Versões do bot e do que ele usa, e o sistema. Aceita `-mask`; as outras opções são recusadas. Veja [Informações do sistema](#informações-do-sistema) |
| `-test`, `-t` | Testa tudo (cache, disco, banco, WhatsApp, internet, velocidade, SMTP, IMAP e programas), com ✅ ou ❌ em cada item. As outras opções são recusadas. Veja [Teste do bot](#teste-do-bot) |
| `-passwd` | `<senha\|off>`: só o dono. Define a senha do `-login` (mín. 8 caracteres; só o hash scrypt fica no banco, no setting `bot.login`). Com `off`, desliga o login |
| `-login` | `<senha>`: para quem é de fora, só no privado. Com a senha certa, a pessoa entra no `bot.admins` e o dono é avisado por WhatsApp e e-mail. Erra 5 vezes, fica 15 min bloqueada. A senha é apagada do banco de mensagens. Para revogar: `/bot -a +número` |
| `-flush-email`, `-fe` | `[true]`: conecta no IMAP do e-mail (precisa de `QRCODE_EMAIL_IMAP_HOST`) e mostra quantas mensagens há em Sent e Trash; com `true`, apaga todas. Só o dono apaga. As outras opções são recusadas. Veja [Limpar o e-mail](#limpar-o-e-mail) |
| `-mask`, `-m` | Ofusca telefones na saída desta execução. Ex.: `+55219****44` |

Use `/bot -list-users -mask` para exibir nomes com telefones ofuscados. A máscara mantém os cinco
primeiros e os dois últimos dígitos, vale também para o relatório enviado com `-to` e não fica
ativada para os envios diários. As permissões e os destinos usam os números completos.

O `-on`/ `-off` combina com o `-list-users [all]` (`/bot -on -list-users` liga e mostra os
usuários); `-on` com `-off` no mesmo comando é recusado. Os `+a`/ `-a`/ `+u`/ `-u` vão um de cada
vez; junto deles, o `+cmd`/ `-cmd` (só com usuários) e o `-list-users all` (a resposta com todos).

## Lista de usuários

A lista sai no status (o `/bot` sem opção), no `-list-users [all]` e na resposta do `+a`/
`-a`/ `+u`/ `-u`. Ela junta os admins e os usuários, como o resto do bot mostra um destino:
`👤 Nome · +número` (ou só `👤 +número`, sem o contato na agenda) e `👥 Grupo`; quem só usa num grupo,
com `só em 👥 Grupo` (ou `só neste grupo`). Quem é admin e usuário aparece uma vez, com as duas
marcas; você, se estiver nela, com `🤖 dono`. Embaixo, as **Permissões** dizem o que cada marca quer
dizer.

```text
/bot -list-users               (no seu privado)
Usuários (4)
• 👑 +a · 👤 Jorge Pereira · +5521999999999
• 👑 +a 🗣️ +u · 👤 Ana Souza · +5511988887777
• 🗣️ +u · 👤 Maria Lucia · +5521999982222
• 🗣️ +u · 👤 Maria Lucia · +5521999986666 · só em 👥 Amigos Faculdade

Permissões
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns
```

### Quem aparece na lista

A lista é a do chat onde você digitou:

| Onde | Quem aparece |
|---|---|
| No seu privado | Todos |
| Num grupo | Quem participa dele, o próprio grupo e quem só usa nele |
| No privado de alguém | Só essa pessoa |
| Em qualquer lugar, com `-list-users all` (`-lu all`) | Todos |

Quando alguém fica de fora, a lista diz quantos e como ver todos, com o cuidado de não expor no
grupo quem não é de lá:

```text
/bot -list-users               (no grupo Amigos Faculdade)
Usuários (2) neste grupo
• 🗣️ +u · 👤 Jorge Chip L200 · +5521999983333
• 🗣️ +u · 👤 Sofia Izabel · +5521•••••7777 · só neste grupo

Permissões
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns

💡 Só quem é deste grupo; mais 1 fora daqui.
⚠️ Para listar todos: /bot -list-users all ou /bot -lu all. Cuidado: mostra também quem não é deste grupo.
```

Num grupo, o telefone de quem não participa dele sai escondido (o DDI, o DDD e os 4 últimos), também
com o `-list-users all`. No seu privado (ou no da pessoa), sai inteiro.

Com todos liberados (`/set bot.users true`), a lista mostra só os admins, e o `/bot` avisa que
qualquer pessoa está usando os comandos:

```text
▶️ Bot: ativo
🔓 Comandos: todos usam os comuns
⚠️ Atenção: qualquer pessoa pode executar os comandos comuns do bot, em qualquer chat. Para restringir: /set bot.users false (e depois /bot +u para liberar alguns).
```

Quando usar cada opção:

| Situação | Comando |
|---|---|
| Alguém está abusando dos comandos num grupo | `/bot -u`, digitado no grupo (ou `/bot -u /Grupo/`) |
| Liberar o bot para a família, só no grupo dela | `/bot +u`, digitado no grupo (ou `/bot +u /Grupo Familia/` de qualquer chat) |
| Liberar para uma pessoa, em qualquer chat | `/bot +u /Maria Lucia/` |
| Liberar só alguns comandos para alguém | `/bot +u +cmd /rates,/crypto /Sofia Izabel/` |
| Liberar só o `/gpt` para o grupo Familia | `/bot +u +cmd /gpt`, digitado no grupo (ou `/bot +u +cmd /gpt /Familia/`) |
| Dar a alguém os comandos admin | `/bot +a /Jorge Pereira/` |
| Parar o bot por completo por um tempo, sem derrubar o container | `/bot -off` |
| Tirar todos os usuários, de uma vez (os admins ficam) | `/bot -reset` |
| Desfazer tudo: só você de novo, sem admins nem usuários | `/bot -reset force` |

Detalhes:

- Com o bot desligado o `/set` também é ignorado: para ligar use sempre o `/bot -on`.
- Se o bot reiniciar desligado, ou só com você usando comandos, a mensagem de inicialização no seu
  privado avisa.
- Só os **comandos** são afetados: a recuperação de mensagens apagadas e editadas, o `/watch` e os
  alertas de preço continuam funcionando.
- Comandos ignorados aparecem no log: `Comando '/ping' ignorado: bot desligado` (sempre) e
  `Comando '/ping' de Fulano ignorado: fora do bot.users` (só com o [debug](debug.md) ligado).
- "Você" é a conta pareada ao bot, de qualquer aparelho. Para desligar só alguns comandos, para
  todos, use o setting `commands.disabled`.

## Admins extras

Outras pessoas podem usar os comandos **admin** (os com esse role na
[tabela de comandos](index.md#resumo)), e também os comuns, em qualquer chat, se você as tornar
admins:

```text
/bot +a /Jorge Pereira/               → acrescenta, pelo nome do contato
/bot +a +5521999999999                → ou pelo número
/bot +a @Fulano Da Silva              → ou, num grupo, mencionando a pessoa
/bot +a                               → no privado de alguém: essa pessoa
/bot -a /Jorge Pereira/               → tira
/bot -list-users                           → a lista: 👑 +a · 👤 Jorge Pereira · +5521999999999
```

O nome é buscado como no `-to` ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)):
contato da sua agenda, e se mais de um servir, a lista para responder com o nº. Nomes com espaço vão
entre `/.../` ou aspas; vários de uma vez, separados por espaço
(`/bot +a /Jorge Pereira/ "Ana Souza" +5511988887777`). Fica guardado o **telefone** (é ele que o
bot compara com quem manda o comando), e a lista mostra o nome ao lado. E-mail é recusado, e um
contato de quem o WhatsApp só informa o id interno (LID), sem o telefone, também: use o número.

- **Grupo não pode ser admin**: todo mundo ali mandaria no bot (`/set`, `/backup -send` com o banco
  inteiro...). O `/bot +a /Grupo/` (ou o `/bot +a` digitado num grupo) é recusado e sugere o
  `/bot +u`, que libera só os comandos comuns.
- Só **você** (o dono, a conta pareada) adiciona e tira admins: um admin extra não consegue se dar (nem
  dar a outros) esse acesso.
- O número é comparado com o telefone de quem mandou a mensagem. Se o WhatsApp só informar o LID (o
  id interno) da pessoa e o bot não conseguir o telefone, ela não é reconhecida como admin.
- Os comandos de um admin extra agem como os seus: os avisos que vão "para o seu privado" (alertas,
  `-pv`, `/watch`...) vão para o **seu** privado, não para o dele. Admins também gerenciam as moedas
  do `/rates` e do `/crypto`, os alertas de preço e a limpeza do `/show -f`.
- Numa lista de escolha (vários contatos com o nome), só quem deu o comando responde com o nº.
- Dê esse acesso só a quem você confia: um admin pode, por exemplo, apagar o cache (`/cache -a`) ou
  restaurar um backup.

## Usuários

Os usuários usam os comandos de role **`user`** (veja a coluna Role da
[tabela de comandos](index.md#resumo)). Os `admin` continuam só seus e dos admins, a menos que você
os [delegue](index.md#delegando-um-comando-admin) com o `+cmd` (só os marcados como delegáveis).

| Quem | Onde usa |
|---|---|
| Uma pessoa, posta no seu privado ou no dela (`/bot +u /Maria Lucia/`) | Em qualquer chat |
| Uma pessoa, posta num grupo (`/bot +u /Maria Lucia/`, digitado no grupo) | Só nesse grupo. No privado, o bot responde onde ela pode |
| Um grupo (`/bot +u`, digitado no grupo, ou `/bot +u /Amigos Faculdade/`) | Qualquer um, dentro do grupo (no privado de cada um, não) |
| Ninguém, o padrão (`/set bot.users false`) | Só você e os admins usam comandos |
| Todos (`/set bot.users true`) | Qualquer pessoa, em qualquer chat (o `/bot` avisa) |

```text
/bot +u /Maria Lucia/                      → no seu privado: a Maria, em qualquer chat
/bot +u /Maria Lucia/                      → no grupo Amigos Faculdade: a Maria, só nele
/bot +u                                    → digitado num grupo: o grupo; no privado de alguém: a pessoa
/bot +u /Amigos Faculdade/ @Fulano +5521999999999  → vários de uma vez
/bot -u /Maria Lucia/                      → no grupo: tira a permissão de lá
/bot -u /Maria Lucia/                      → no seu privado: tira todas as da Maria
/bot -u                                    → tira o chat atual
```

Quem só tem permissão em grupos e manda um comando no privado recebe:

```text
🚫 Sem permissão para comandos no privado. Permitido apenas em: 👥 Amigos Faculdade.
```

A resposta do `+a`/ `-a`/ `+u`/ `-u` é a [lista de usuários](#lista-de-usuários) do chat, com ✅ em
quem acabou de entrar; quem saiu vem numa linha 🗑️ em cima. Sem ninguém na lista, vem a linha de
quem usa os comandos (`🔒 Comandos: só o dono`):

```text
/bot +u /Sofia Izabel/    (no grupo Amigos Faculdade)
Usuários (2) neste grupo
• 🗣️ +u · 👤 Jorge Chip L200 · +5521999983333
• 🗣️ +u · 👤 Sofia Izabel · +5521•••••7777 · só neste grupo ✅

Permissões
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns

💡 Só quem é deste grupo; mais 1 fora daqui.
Listar usuários: /bot -list-users
```

```text
/bot -u /Sofia Izabel/    (no grupo Amigos Faculdade)
🗑️ 👤 Sofia Izabel · +5521•••••7777 · só neste grupo

Usuários (1) neste grupo
• 🗣️ +u · 👤 Jorge Chip L200 · +5521999983333
...
```

- As pessoas são buscadas como os admins (nome, menção ou número), e os grupos, pelo nome, como no
  `-to`. Fica guardado o telefone da pessoa e o id do grupo; a lista mostra os nomes.
- No grupo, o `-u` tira a permissão daquele grupo (ou, se a pessoa só tiver a de qualquer chat,
  essa); no seu privado, tira todas as da pessoa.
- Quem já usa em qualquer chat não ganha nada com o `+u` num grupo: o bot responde que ela já é
  usuária.
- Com todos liberados (`/set bot.users true`), o `/bot +u /Fulano/` é recusado: para liberar só
  alguns, `/set bot.users false` antes.
- O `/bot +u` sem ninguém no **seu** privado é recusado (você já usa tudo); num privado de quem o
  WhatsApp só informa o id interno (LID), sem o telefone, também: use o número.
- Só **você** adiciona e tira usuários, como os admins.

### Comandos de cada usuário

Um usuário (uma pessoa ou um grupo) pode ficar limitado a alguns comandos comuns, ou receber um
comando de role `admin` (o `/gpt`, o `/show`...). O `/help` e o `/whois` sempre passam (o `/help`
mostra só os dele).

```text
/bot +cmd /rates,/crypto,/meme +u /Sofia Izabel/  → a Sofia entra só com esses
/bot +u +cmd /rates                               → digitado num grupo: o grupo inteiro, só /rates
/bot +u -cmd /meme /Fulano/                         → o Fulano usa todos, menos /meme
/bot +cmd /weather /Sofia Izabel/                     → acrescenta /weather aos dela
/bot -cmd /rates /Fulano Pereira/                 → tira /rates dos dele
/bot -cmd /meme /Grupo Familia/ /Fulano da Silva/   → vários de uma vez
/bot -cmd /meme                                     → do chat atual (o grupo, ou a pessoa do privado)
/bot +cmd all /Sofia Izabel/                        → a Sofia volta a usar todos os comuns
/bot +u +cmd /gpt                                   → digitado num grupo: todos ali usam só o /gpt
```

- O `+cmd` em quem ainda não é usuário já adiciona a pessoa (ou o grupo), só com esses comandos. Em quem
  usa todos, não muda nada; em quem tem "Todos, menos", libera esses de novo.
- O `-cmd` em quem usa todos deixa "Todos, menos" esses. Tirar o último comando de uma lista é
  recusado: para tirar a pessoa, `/bot -u`; para liberar todos, `/bot +cmd all`.
- Os comandos vão pelo nome ou pelo alias (`/creptomoeda` vira `/crypto`), separados por vírgula.
  Um comando não delegável (`/set`, `/bot`...) não entra: o bot recusa. Um `admin` delegável
  (`/gpt`, `/show`...) entra só numa lista "Apenas": o `-cmd` ("Todos, menos") e o `bot.users = true` não o liberam, e
  quem já usa todos os comuns não o ganha com o `+cmd` (o bot recusa e pede a lista "Apenas").
  Para acrescentar um `admin` delegável a quem usa os comuns, liste os comandos dele: `+u +cmd /rates,/gpt`.
- O nome de um atalho do [`/alias`](alias.md) não entra no `+cmd`: o atalho herda a permissão do
  comando de destino (quem pode o `/gpt` usa os atalhos para ele).
- Num grupo, a pessoa é a de lá (como no `+u`); se ela for usuária em qualquer chat, é essa
  permissão que muda.
- Na lista, embaixo da pessoa, `→ Apenas: /rates, /crypto, /meme` ou `→ Todos, menos: /meme`:

```text
Usuários (2)
• 🗣️ +u · 👤 Jorge Chip L200 · +5521999983333
• 🗣️ +u · 👤 Sofia Izabel · +5521999987777 ✅
 → Apenas: /rates, /crypto, /meme

Permissões
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns
```

- Fora da lista, o bot responde `🚫 Limitado aos comandos: /rates, /crypto, /meme.` (ou
  `🚫 O /meme não está liberado para você.`).
- Se mais de uma permissão vale ali (a pessoa e o grupo, por exemplo), vale a mais ampla: uma sem
  limite libera todos os comuns.
- O `-u` e o `-reset` (com ou sem `force`) tiram os limites junto.

### Proteção contra flood

Quem não é admin (os usuários e, com `/set bot.users true`, todos) pode repetir o mesmo comando no
máximo 3 vezes em 2 segundos. Passou disso, o bot avisa uma vez e ignora todos os comandos da pessoa
até o intervalo acabar:

```text
⚠️ Não é permitido executar o mesmo comando mais de 3 vezes seguidas. Aguarde 2 segundos.
```

- Os aliases contam como o comando (`/noffa` e `/🌈` são o mesmo); comandos diferentes contam à
  parte.
- Você e os admins não têm limite.
- Os limites são settings: `/set flood.maxCommandRepeated 5` (`0` desliga) e
  `/set flood.intervalCommand 10` (em segundos). Veja [Settings](../settings.md).

## Voltar ao padrão

Dois níveis, os dois só do dono e os dois pedem confirmação: responda **sim** em até 10 segundos, no
mesmo chat (**não**, ou nada, deixa tudo como está; sem resposta, a pergunta vira
`⌛ Nada mudou: sem sim em 10 s.`).

| | `/bot -reset` (`-r`) | `/bot -reset force` |
|---|---|---|
| Usuários (`bot.users`) e os limites deles (`+cmd`/ `-cmd`) | Tira todos | Tira todos |
| Admins extras (`bot.admins`) | Ficam | Tira |
| Liga/desliga (`bot.paused`) | Fica como está | Volta ao padrão (ligado) |
| Envio diário do [`-status`](#status-do-bot) | Fica | Fica |

Aceitam `-mask`, mas não combinam com as outras opções.

```text
/bot -reset
⚠️ Tirar todos os usuários? Ficam só você e os admins extras usando comandos.
💡 Responda sim em 10 s para confirmar (ou /bot -r force, para voltar tudo ao padrão).

sim
🧹 Usuários removidos (4): ficam só você e os admins extras.
```

```text
/bot -reset force
⚠️ Voltar tudo ao padrão? Tira os usuários e os admins extras e liga o bot: só você usa comandos.
💡 Responda sim em 10 s para confirmar.

sim
♻️ Padrão restaurado: bot ligado, sem admins extras e sem usuários.

▶️ Bot: ativo
🔒 Comandos: só o dono
```

## Status do bot

O `/bot` sem opção (ou `/bot -status`) mostra o status: o estado do bot, o relatório das últimas 24
h, [os usuários](#lista-de-usuários) (a lista deste chat) e, no fim, o envio diário. Com uma hora, o
relatório sai todo dia nesse horário, no seu privado ou nos destinos do `-to`.

| Forma | Descrição |
|---|---|
| `/bot` ou `/bot -status` | O status agora |
| `/bot -status <hora>` | Hora do envio diário, no horário de Brasília: `06h`, `6h30`, `06:00` ou `às 18h`. Trocar a hora substitui a anterior (os destinos ficam) |
| `/bot -status <hora> -to <destino>` | O envio diário numa pessoa, num grupo ou por e-mail (`email` = o `QRCODE_EMAIL_SMTP_TO`), em vez do seu privado; repita o `-to` para vários |
| `/bot -status -to <destino>` | O relatório agora, nos destinos |
| `/bot -status off` | Desliga o envio diário |

```text
/bot                                     → o status agora
/bot -s                                  → o mesmo
/bot -status 06h                         → todo dia às 06:00, no seu privado
/bot -s 06h -to voce@exemplo.com         → todo dia às 06:00, por e-mail
/bot -s 7h -to /Grupo Familia/ -to email → no grupo e por e-mail
/bot -s às 18h30                         → todo dia às 18:30 (nos mesmos destinos)
/bot -s -to /Jorge Pereira/              → o relatório agora, no privado do contato
/bot -s off                              → para de enviar
```

```text
📊 Status do ZapBot 2.0.13 (devel) · últimas 24 h
qui 01/10 06:00

▶️ Bot: ativo
👥 Comandos: o dono e quem está na lista abaixo

🤖 No ar: 2 dias, 3 horas · conectado: 2 dias, 2 horas
🗄️ Cache: 45.20 MB (banco 4.20 MB · mídias 40.10 MB) · 1.234 mensagens
👀 Watch: 5 ocorrências (#1 pix: 3, #2 boleto: 2)
🗑️ Apagadas: 12
✏️ Editadas: 4
📸 Status apagados: 2
😶 Reações removidas ou trocadas: 1
🔇 Ignoradas (/mute): 8 (apagadas 5, editadas 2, watch 1) · 3 silenciados
💾 Último backup: qui 01/10 03:00 (automático)

Usuários (2)
• 🗣️ +u · 👤 Maria Lucia · +5521999982222
• 🗣️ +u · 👥 Grupo Familia

Permissões
👑 +a: admin, usa tudo
🗣️ +u: usuário, usa os comandos comuns

⏰ Status diário: todo dia às 06:00 → 📧 voce@exemplo.com, 👥 Grupo Familia
📅 Próximo: sex 02/10 06:00
💡 Mude com /bot -status <hora> ou desligue com /bot -status off.

ℹ️ Mais informações em /bot -h
```

O que entra:

- **No ar**: há quanto tempo o processo está rodando e há quanto tempo está conectado ao WhatsApp (o
  mesmo do [`/uptime`](uptime.md)).
- **Cache**: o tamanho de `cache/` (banco, mídias, backups e temporários) e quantas mensagens estão
  guardadas.
- **Watch**: ocorrências das regras do [`/watch`](watch.md), com o nº de cada regra (as 5 que mais
  casaram).
- **Apagadas**, **editadas**, **status apagados** e **reações removidas ou trocadas**: o que foi
  recuperado nas últimas 24 h, inclusive o que o [`/mute`](mute.md) silenciou. Com o aviso
  desligado (`show.alert.deleted`, `show.alert.edited`, `show.alert.status` ou `show.alert.reaction`
  em `off`), a linha diz como ligar de novo:
  `✏️ Editadas: 4 (aviso desligado; ligue com /set show.alert.edited on)`.
- **Ignoradas (/mute)**: os avisos que o `/mute` cortou nas últimas 24 h, por tipo (apagadas,
  editadas, status, reações e `watch`, os do [`/watch`](watch.md)), e quantos estão silenciados agora. Com
  alguém silenciado, o 0 só quer dizer que nenhum aviso dele chegou nas 24 h.
- **Último backup**: o mais recente do [`/backup`](backup.md).
- **Usuários**: a lista deste chat ([Quem aparece na lista](#quem-aparece-na-lista)). O relatório
  enviado pelo `-to` ou pelo envio diário vai sem ela.
- **Status diário**: o horário, os destinos (👤 pessoa, 👥 grupo ou 📧 e-mail; sem `-to`, o seu
  privado) e o próximo envio, ou `🔕 Status diário desligado`.

O envio diário fica na agenda do bot (tabela `schedules`), mas não aparece no [`/cron`](cron.md) nem
conta no limite dele. Se o bot estiver fora do ar no horário, o relatório sai quando ele voltar.

## Teste do bot

`/bot -test` (ou `-t`) roda uma bateria de testes e mostra ✅ ou ❌ em cada item. Serve para saber, na
hora, o que está ruim: disco cheio, internet lenta, senha do SMTP errada, WhatsApp desconectado...

```text
/bot -test
🧪 *TESTE DO BOT*

✅ Cache — escrita e leitura de 256 KB (3 ms)
✅ Disco — 48.2 GB livres (62%)
✅ Banco SQLite — íntegro (2 ms)
✅ WhatsApp — CONNECTED (180 ms)
✅ DNS — web.whatsapp.com → 157.240.0.60 (14 ms)
✅ Internet — HTTP 200 (96 ms)
❌ E-mail (SMTP) — Invalid login: 535 5.7.0 (#AUTH005) Too many bad auth attempts.
➖ E-mail (IMAP) — não configurado (QRCODE_EMAIL_IMAP_HOST)
✅ Chromium — Chromium 131.0.6778.204
✅ yt-dlp — 2026.10.01
✅ ffmpeg — 7.1.1
✅ Velocidade — ↓ 92.4 Mbps · ↑ 21.8 Mbps

❌ 1 de 11 com falha
```

- **Cache**: grava, lê e apaga um arquivo de 256 KB no diretório do cache. **Disco**: ❌ com menos de
  500 MB livres.
- **WhatsApp**: o estado da conexão (`CONNECTED`). **DNS** e **Internet**: resolvem e abrem o
  `web.whatsapp.com`.
- **Velocidade**: baixa 8 MB e sobe 1 MB no `speed.cloudflare.com`; ❌ se der erro ou ficar abaixo de
  1 Mbps. Roda por último, sozinho, e a primeira resposta (`🧪 Testando...`) avisa que demora.
- **E-mail (SMTP)**: só faz o login, sem enviar nada; ➖ se o SMTP não está configurado. Se o login
  falhou há pouco (`EAUTH`), o teste não tenta de novo durante a pausa de 30 minutos, para não
  prolongar o bloqueio do provedor.
- **E-mail (IMAP)**: conecta e faz o login, sem mexer em nada; ➖ se não há `QRCODE_EMAIL_IMAP_HOST`.
- **Chromium**, **yt-dlp** e **ffmpeg**: rodam o `--version`; ❌ se o programa não responde.
- Um teste que trava (20 s) ou lança erro vira ❌ com o motivo, sem derrubar os outros.

## Limpar o e-mail

O bot manda e-mails (QR Code, alertas, `/cron`...) e eles ficam em Sent. O `-flush-email` mostra
quanto isso ocupa e limpa.

```text
/bot -flush-email
📧 *Caixa de e-mail:* 128 em Sent e 14 em Trash
💡 /bot -flush-email true para apagar tudo

/bot -flush-email true
⏳ Limpando a caixa de e-mail...        (editada ao concluir)
🧹 *E-mail limpo:* 128 em Sent e 14 em Trash (142 no total)
```

- Sem `true`, só conta; com `true`, apaga tudo de Sent e depois de Trash (de forma definitiva). Só o
  dono apaga.
- Só funciona com `QRCODE_EMAIL_IMAP_HOST` no `config/.env` (ex.: `imap.mail.yahoo.com`); sem ele o
  bot avisa que não está configurado. O login é o do SMTP (`QRCODE_EMAIL_SMTP_USER` e `_PASS`). A
  conexão é IMAP com SSL (porta 993). É IMAP porque o POP3 só vê a caixa de entrada, sem Sent nem
  Trash.
- As pastas são achadas pelo atributo `\Sent`/`\Trash` do servidor ou, sem ele, pelo nome comum
  (`Sent`, `Sent Items`, `[Gmail]/Trash`, `Lixeira`...).

## Informações do sistema

`/bot -info` (ou `-i`) mostra as versões do que o bot usa e onde ele está rodando: útil para saber
se a imagem precisa ser refeita (o `yt-dlp`, por exemplo, muda com frequência) e para relatar um
problema. Ele também avisa quando há versão nova do `yt-dlp` e do `whatsapp-web.js`.

```text
/bot -info
ℹ️ ZapBot 2.0.13 (devel) · informações do sistema

🤖 Bot
• ZapBot: 2.0.13 (devel) (git+7a89b92/HEAD)
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

- **ZapBot** traz o commit e a tag que estão rodando (`git+4465374/vX.Y.Z`; fora de uma
  release, `(devel)` e `/HEAD`), gravados na imagem a cada `docker compose build` (veja o
  [`/version`](version.md)).
- **WhatsApp Web** é a versão que o WhatsApp está servindo para o bot (só aparece conectado); o
  **Chromium** vem do navegador do Puppeteer, ou do binário quando ainda não conectou.
- **Versões novas**: o `yt-dlp` é comparado com a última do
  [PyPI](https://pypi.org/project/yt-dlp/), e o `whatsapp-web.js` com a última release do
  [GitHub](https://github.com/wwebjs/whatsapp-web.js/releases). Como o bot usa um commit fixado do
  `main` (no `package.json`), aparecem também os commits novos do `main` depois dele. As consultas
  ficam guardadas por 6 h; sem internet (ou com a API fora do ar), a linha sai sem a nota. Para
  atualizar o `yt-dlp`, refaça a imagem (`docker compose build --no-cache zapbot`).
- Um programa que não responde em 5 s (ou não existe, como o `yt-dlp` fora do Docker) aparece como
  _não encontrado_.
- **Carga** é a média de processos na fila do sistema em 1, 5 e 15 minutos.
