# `/show` (`/s`) · admin

Reexibe o que ainda está no cache: as mensagens apagadas (`-d`), as editadas
(`-e`) e os status apagados (`-s`). As apagadas e os status ficam 30 dias
(setting `cache.revokedRetentionDays`), as editadas também 30 dias (setting
`cache.editedRetentionDays`). Os envios são espaçados por `show.delayMs`
(700 ms) para evitar flood.

Mensagens de canais (`@newsletter`) são identificadas com `📰 Canal: <nome>`, nos avisos de
mensagens apagadas e editadas e na reexibição pelo `/show`. O `/show -l` marca canais com 📰;
eles podem ser selecionados pelo nome, regex ou número da lista, como os outros chats. Quando
o canal não pode ser consultado, a reexibição usa o nome salvo. Não há nome ou telefone de contato
nos itens de um canal. Status (`status@broadcast`) seguem o filtro `-s`.

Com o aviso no privado desligado (`/set show.alert.deleted off` ou
`/set show.alert.edited off`), as mensagens continuam sendo guardadas e o
`/show` as reexibe normalmente.

| Opção | Valor | Descrição |
|---|---|---|
| `-N` | | Quantidade (padrão 1, máx. 20, setting `show.max`). Ex.: `-3` |
| `chat` | | Outro chat: o nº da lista do `-l`, parte do nome, `@menção` ou `/regex/`. Veja [O chat](#o-chat) |
| `-deleted`, `-d` | | Mensagens apagadas (sem chat, o padrão) |
| `-edited`, `-e` | | Mensagens editadas, com o texto de antes e o de depois. Cada edição é um item: uma mensagem editada duas vezes aparece duas vezes |
| `-status`, `-s` | | Status apagados: num privado, os da pessoa; no seu privado, sem chat, os de todos |
| `-list`, `-l` | | Lista o que tem no cache por chat (em qualquer chat), numerado para o `/show <nº>`, marcando com `← este chat` o chat atual |
| `-query`, `-q` | `<texto>` | Busca as que têm o texto, sem diferenciar maiúsculas nem acentos: neste chat, no chat pedido ou, no seu privado, em todos. Sem `-N`: as 5 mais recentes. Veja [Buscar](#buscar) |
| `-flush`, `-f` | | Remove do cache as apagadas deste chat ou, com `-e`, `-s` ou chat, o que foi pedido (no seu privado, sem chat: de todos os chats) |

O `-d`, o `-e` e o `-s` se somam (`/show -d -s` traz apagadas e status). Sem
nenhum deles, sem chat vêm só as apagadas deste chat; com chat (ou na busca
no seu privado), vem tudo junto, por data.

```
/show                       → a última mensagem apagada deste chat
/show -5                    → as 5 últimas
/show -2 -e                 → as 2 últimas editadas
/show /^Camila/             → a última (apagada, editada ou status) do chat que começa com "Camila"
/show -2 Camila Gama        → as 2 últimas do chat com "Camila Gama" no nome
/show -5 -deleted /Carlos$/ → as 5 últimas apagadas do chat que termina com "Carlos"
/show -3 -edited @Jorge     → as 3 últimas editadas do privado com o Jorge
/show -s Marcio             → o último status apagado do Marcio
/show 2                     → do chat nº 2 do /show -l
/show -l                    → o que tem no cache, por chat
/show -f                    → apaga do cache as apagadas deste chat
/show -e -f                 → apaga do cache as editadas deste chat
/show -f Trabalho           → apaga do cache tudo do chat Trabalho
/show -q pix                → as apagadas com "pix" (no seu privado: tudo, de todos os chats)
/show -e -q "bom dia" -10   → até 10 editadas com "bom dia"
```

## O chat

O chat vem depois das opções (o `-N` pode vir antes ou depois dele) e é
buscado entre os que têm algo no cache, sem diferenciar maiúsculas nem
acentos:

- **`2`**: o nº da lista do último `/show -l`. Sem hífen: o `-2` é a quantidade.
- **`Camila Gama`** ou **`"Camila Gama"`**: o nome tem todas as palavras; o
  nome exato ganha.
- **`/^Camila/`**: uma regex no nome (aqui, os que começam com "Camila").
- **`@Camila`**: a menção (escolhida na lista do `@` do WhatsApp) é o privado
  com a pessoa; `@` digitado sem escolher na lista vale como nome.

Num privado, os status são os da pessoa. Se mais de um chat casar, o bot lista
e espera você responder só com o nº (em até 2 minutos). Funciona em qualquer
chat.

## Buscar

O `-q <texto>` filtra pelo trecho, sem diferenciar maiúsculas nem acentos (nas
editadas, pelo texto de antes ou pelo de depois). Com espaços, vai entre aspas
(`-q "bom dia"`). O escopo é o de sempre: este chat, o chat pedido ou, **no
seu privado, todos os chats** (e, sem `-d`, `-e` ou `-s`, todos os tipos). Sem
`-N`, vêm as 5 mais recentes que casam; o resumo diz quantas foram encontradas
no total.

```
/show -q pix
♻️ 2 mensagens apagadas com "pix" (as 2 mais recentes de 4; use -N para mais)
```

O `-q` não combina com o `-l` nem com o `-f`.

O `-l` mostra quanto tem de cada tipo e os chats, numerados para o `/show <nº>`:

```
🗄️ Mensagens no cache

🗑️ Apagadas: 3 (1 com mídia · a mais antiga expira em 29 dias)
✏️ Editadas: 1 (a mais antiga expira em 30 dias)
📸 Status: 1 (a mais antiga expira em 30 dias)

1. 👥 Família — 🗑️ 2 (última 30/09/2026, 10:02:11) ← este chat
2. 👤 Beltrano — 🗑️ 1 · 📸 1 (última 30/09/2026, 09:40:05)
3. 👥 Trabalho — ✏️ 1 (última 30/09/2026, 11:15:42)

💡 /show <nº, nome, @menção ou /regex/> reexibe as de um chat: apagadas, editadas e status juntos; -d, -e e -s filtram; -N para mais (máx. 20).
💡 -f remove do cache as deste chat (no seu privado: de todos).
```

Com chat e sem `-d`, `-e` ou `-s`, o resumo conta cada tipo:

```
/show -5 Beltrano
🗄️ 2 mensagens (🗑️ 1 · 📸 1) (pedidas 5, encontradas 2)
💬 Chat: Beltrano
```

Uma editada reexibida com `-e`:

```
✏️ MENSAGEM EDITADA (1/1)

👥 Grupo: Trabalho
👤 Nome: Fulano
📱 Número: +5521999999999
📅 Enviada em: 30/09/2026, 11:14:03
✏️ Editada em: 30/09/2026, 11:15:42
📝 Antes: "reunião às 14h"
💬 Depois: "reunião às 15h"
```
