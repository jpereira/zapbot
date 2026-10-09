# `/show` (`/s`) · admin

Sem parâmetros no privado, lista o cache de todos os chats, como `/show -l`. Em grupos, reexibe a
última mensagem apagada do grupo.

Reexibe o que ainda está no cache: as mensagens apagadas (`-d`), as editadas (`-e`) e os status
apagados (`-s`). As apagadas e os status ficam 30 dias (setting `cache.revokedRetentionDays`), as
editadas também 30 dias (setting `cache.editedRetentionDays`). Os envios são espaçados por
`show.delayMs` (700 ms) para evitar flood.

Mensagens de canais (`@newsletter`) são identificadas com `📰 Canal: <nome>`, nos avisos de mensagens
apagadas e editadas e na reexibição pelo `/show`. O `/show -l` marca canais com 📰; eles podem ser
selecionados pelo nome, regex ou número da lista, como os outros chats. Quando o canal não pode ser
consultado, a reexibição usa o nome salvo. Não há nome ou telefone de contato nos itens de um canal.
Status (`status@broadcast`) seguem o filtro `-s`.

Com o aviso no privado desligado (`/set show.alert.deleted off` ou `/set show.alert.edited off`), as
mensagens continuam sendo guardadas e o `/show` as reexibe normalmente. Com
`/set show.alert.status off`, novas exclusões de status são ignoradas: não geram aviso nem entram na
lista de apagados.

| Opção | Valor | Descrição |
|---|---|---|
| `-N` | | Quantidade (padrão 1, limite padrão 20, configurável até 100 em `show.max`). Ex.: `-3` |
| `chat` | | Outro chat: o nº da lista do `-l`, parte do nome, `@menção` ou `/regex/`. Veja [O chat](#o-chat) |
| `-deleted`, `-d` | | Mensagens apagadas (sem chat, o padrão) |
| `-edited`, `-e` | | Mensagens editadas, com o texto de antes e o de depois. Cada edição é um item: uma mensagem editada duas vezes aparece duas vezes |
| `-status`, `-s` | | Status apagados: num privado, os da pessoa; no seu privado, sem chat, os de todos |
| `-list`, `-l` | `[chat]` | Lista todos os chats com conteúdo no cache (em qualquer chat), numerado para o `/show <nº>`, marcando com `← este chat` o chat atual. Com chat (nº, nome, `@menção` ou `/regex/`), só os que casam. Veja [Listar](#listar) |
| `-query`, `-q` | `<texto\|/regex/flags>` | Busca as que têm o texto (sem diferenciar maiúsculas nem acentos) ou que casam com a regex: neste chat, no chat pedido ou, no seu privado, em todos. Sem `-N`: as 5 mais recentes. Veja [Buscar](#buscar) |
| `-flush`, `-f` | | Remove do cache as apagadas deste chat ou, com `-e`, `-s` ou chat, o que foi pedido (no seu privado, sem chat: de todos os chats) |
| `-mask`, `-m` | | Ofusca telefones nos textos e nas legendas desta execução. Ex.: `+55219****44` |

Com `/show -mask`, os telefones exibidos mantêm os cinco primeiros e os dois últimos dígitos. A
máscara vale para esta execução; os dados guardados no cache permanecem completos.

O `-d`, o `-e` e o `-s` se somam (`/show -d -s` traz apagadas e status). Sem nenhum deles, com
opções mas sem chat vêm só as apagadas deste chat; com chat (ou na busca no seu privado), vem tudo
junto, por data.

```text
/show                       → no privado, lista o cache; no grupo, a última apagada
/show -5                    → as 5 últimas
/show -2 -e                 → as 2 últimas editadas
/show /^Camila/             → a última (apagada, editada ou status) do chat que começa com "Camila"
/show -2 Camila Gama        → as 2 últimas do chat com "Camila Gama" no nome
/show -5 -deleted /Carlos$/ → as 5 últimas apagadas do chat que termina com "Carlos"
/show -3 -edited @Jorge     → as 3 últimas editadas do privado com o Jorge
/show -s Marcio             → o último status apagado do Marcio
/show 2                     → do chat nº 2 do /show -l
/show -l                    → o que tem no cache, por chat
/show -l /^Camila/          → o mesmo, só dos chats que começam com "Camila"
/show -f                    → apaga do cache as apagadas deste chat
/show -e -f                 → apaga do cache as editadas deste chat
/show -f Trabalho           → apaga do cache tudo do chat Trabalho
/show -q pix                → as apagadas com "pix" (no seu privado: tudo, de todos os chats)
/show -e -q "bom dia" -10   → até 10 editadas com "bom dia"
/show -5 -q /pix|boleto/i   → até 5 apagadas que casam com a regex
```

No seu privado, quando não há nada deste chat, o bot sugere os próximos passos, um por linha:

```text
/show -e
✏️ Nenhuma mensagem editada neste chat.
💡 Para ver as de outro chat: /show -l e depois /show -e -N <chat>
💡 Para buscar em todos: /show -e -q <texto|/regex/>
```

## O chat

O chat vem depois das opções (o `-N` pode vir antes ou depois dele) e é buscado entre os que têm
algo no cache, sem diferenciar maiúsculas nem acentos:

- **`2`**: o nº da lista do último `/show -l`. Sem hífen: o `-2` é a quantidade.
- **`Camila Gama`** ou **`"Camila Gama"`**: o nome tem todas as palavras; o nome exato ganha.
- **`/^Camila/`**: uma regex no nome (aqui, os que começam com "Camila").
- **`@Camila`**: a menção (escolhida na lista do `@` do WhatsApp) é o privado com a pessoa; `@`
  digitado sem escolher na lista vale como nome.

Num privado, os status são os da pessoa. Se mais de um chat casar, o bot lista e espera você
responder só com o nº (em até 2 minutos). Funciona em qualquer chat.

## Buscar

O `-q <texto>` filtra pelo trecho, sem diferenciar maiúsculas nem acentos (nas editadas, pelo texto
de antes ou pelo de depois). Com espaços, vai entre aspas (`-q "bom dia"`). O escopo é o de sempre:
este chat, o chat pedido ou, **no seu privado, todos os chats** (e, sem `-d`, `-e` ou `-s`, todos os
tipos). Sem `-N`, vêm as 5 mais recentes que casam; o resumo diz quantas foram encontradas no total.

Com barras, é uma regex do JavaScript, com flags (`-q /pix|boleto/i`). Ela testa o texto como veio:
sem a flag `i`, diferencia maiúsculas, e os acentos contam. As flags `g` e `y` são ignoradas.

```text
/show -q pix
♻️ 2 mensagens apagadas com "pix" (as 2 mais recentes de 4; use -N para mais)

/show -5 -q /\bpix\b|boleto/i
♻️ 2 mensagens apagadas com "/\bpix\b|boleto/i"
```

O `-q` não combina com o `-l` nem com o `-f`. Sem o texto, ou com uma regex inválida, o bot avisa:

```text
/show -q
❌ Informe o que buscar: /show -q <texto|/regex/flags>
💡 Com espaços, entre aspas: -q "bom dia"
```

## Listar

O `-l` mostra quanto tem de cada tipo e os chats, numerados para o `/show <nº>`. As dicas do fim vêm
uma por linha:

```text
🗄️ Mensagens no cache

🗑️ Apagadas: 3 (1 com mídia · a mais antiga expira em 29 dias)
✏️ Editadas: 1 (a mais antiga expira em 30 dias)
📸 Status: 1 (a mais antiga expira em 30 dias)

1. 👥 Família — 🗑️ 2 (última 30/09/2026, 10:02:11) ← este chat
2. 👤 Beltrano — 🗑️ 1 · 📸 1 (última 30/09/2026, 09:40:05)
3. 👥 Trabalho — ✏️ 1 (última 30/09/2026, 11:15:42)

💡 /show <nº, nome, @menção ou /regex/> reexibe as de um chat: apagadas, editadas e status juntos.
   -d, -e e -s filtram
   -N para mais (máx. 20)
   -l <chat> lista só os que casam
   -f remove do cache as deste chat (no seu privado: de todos)
```

Com chat (`/show -l <nº, nome, @menção ou /regex/>`), o `-l` mostra só os chats que casam (todos,
sem perguntar qual), mantendo o nº da lista completa, e as contas por tipo passam a ser só deles.
O título traz o nome do chat quando casa um só; com vários, o que foi digitado. Na `@menção`, entram
o privado e os status da pessoa:

```text
/show -l trab
🗄️ Mensagens no cache de: Trabalho

🗑️ Apagadas: 0
✏️ Editadas: 1 (a mais antiga expira em 30 dias)
📸 Status: 0

3. 👥 Trabalho — ✏️ 1 (última 30/09/2026, 11:15:42)

💡 /show <nº, nome, @menção ou /regex/> reexibe as de um chat: apagadas, editadas e status juntos.
   …
```

## Exemplos de saída

Com chat e sem `-d`, `-e` ou `-s`, o resumo conta cada tipo:

```text
/show -5 Beltrano
🗄️ 2 mensagens (🗑️ 1 · 📸 1) (pedidas 5, encontradas 2)
💬 Chat: Beltrano
```

Uma editada reexibida com `-e`:

```text
✏️ MENSAGEM EDITADA (1/1)

👥 Grupo: Trabalho
👤 Nome: Fulano
📱 Número: +5521999999999
📅 Enviada em: 30/09/2026, 11:14:03
✏️ Editada em: 30/09/2026, 11:15:42
📝 Antes: "reunião às 14h"
💬 Depois: "reunião às 15h"
```
