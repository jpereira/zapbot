# `/show` (`/s`) · admin

Reexibe as mensagens apagadas (padrão, ou `-d`) ou editadas (`-e`) deste chat
que ainda estão no cache: as apagadas por 30 dias (setting
`cache.revokedRetentionDays`), as editadas por 30 dias (setting
`cache.editedRetentionDays`). Os envios são espaçados por `show.delayMs`
(700 ms) para evitar flood.

Com o aviso no privado desligado (`/set show.alert.deleted off` ou
`/set show.alert.edited off`), as mensagens continuam sendo guardadas e o
`/show` as reexibe normalmente.

| Opção | Valor | Descrição |
|---|---|---|
| `-N` | | Quantidade (padrão 1, máx. 20, setting `show.max`). Ex.: `-3` |
| `-deleted`, `-d` | | Mensagens apagadas (o padrão) |
| `-edited`, `-e` | | Mensagens editadas, com o texto de antes e o de depois. Cada edição é um item: uma mensagem editada duas vezes aparece duas vezes |
| `-list`, `-l` | | Lista as apagadas **e as editadas** do cache por chat (em qualquer chat), marcando com `← este chat` o chat atual |
| `-pv` | | Envia no seu privado em vez de expor no chat atual |
| `-query`, `-q` | `<texto>` | Busca nas apagadas (ou nas editadas, com `-e`) as que têm o texto, sem diferenciar maiúsculas nem acentos: neste chat, no do `-c` ou, no seu privado, em todos. Sem `-N`: as 5 mais recentes. Veja [Buscar](#buscar) |
| `-chat`, `-c` | `<nº\|nome>` | Escolhe outro chat: nº da lista do tipo no `/show -l` (a de **deletadas**, ou a de **editadas** com `-e`) ou parte do nome. Funciona em qualquer chat; junte `-pv` para não expor as mensagens no chat atual |
| `-flush`, `-f` | | Remove as apagadas (ou as editadas, com `-e`) deste chat (no seu privado: de todos) |

O `-d` e o `-e` não podem ser usados juntos.

```
/show                → última mensagem apagada deste chat
/show -5             → as 5 últimas
/show -2 -d          → as 2 últimas apagadas (o -d é o padrão)
/show -2 -e          → as 2 últimas editadas
/s -3 -pv            → as 3 últimas apagadas, enviadas no seu privado
/show -l             → apagadas e editadas, por chat
/show -l -pv         → a mesma lista, enviada no seu privado
/show -c 2 -5        → 5 últimas do chat nº 2 da lista de deletadas
/show -e -c 1 -5     → 5 últimas do chat nº 1 da lista de editadas
/show -c família -pv → do chat cujo nome contém "família", no seu privado
/show -f             → apaga do cache as apagadas deste chat
/show -e -f          → apaga do cache as editadas deste chat
/show -q pix         → as apagadas com "pix" (no seu privado: de todos os chats)
/show -e -q "bom dia" -10 → até 10 editadas com "bom dia"
```

## Buscar

O `-q <texto>` filtra as apagadas (ou as editadas, com `-e`, pelo texto de antes
ou pelo de depois) pelo trecho, sem diferenciar maiúsculas nem acentos. Com
espaços, vai entre aspas (`-q "bom dia"`). O escopo é o de sempre: este chat, o
do `-c` ou, **no seu privado, todos os chats**. Sem `-N`, vêm as 5 mais
recentes que casam; o resumo diz quantas foram encontradas no total.

```
/show -q pix
♻️ 2 mensagens apagadas com "pix" (as 2 mais recentes de 4; use -N para mais)
💬 Chats: todos
```

O `-q` não combina com o `-l` nem com o `-f`.

O `-l` mostra os dois tipos, cada um com a sua numeração para o `-c`:

```
🗄️ Mensagens no cache

🗑️ Deletadas: 3 (1 com mídia · a mais antiga expira em 29 dias)
1. 👥 Família — 2 (última 30/09/2026, 10:02:11) ← este chat
2. 👤 Beltrano — 1 (última 30/09/2026, 09:40:05)

✏️ Editadas: 1 (a mais antiga expira em 30 dias)
1. 👥 Trabalho — 1 (última 30/09/2026, 11:15:42)

💡 /show -N reexibe as deletadas e /show -e -N as editadas deste chat (máx. 20).
💡 Junte -c <nº ou nome> para outro chat: o nº é o da lista do tipo (/show -c 2, /show -e -c 1).
💡 -pv envia no seu privado; -f remove do cache as deste chat (no seu privado: de todos).
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
