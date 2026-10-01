# `/edit` (`/e`) · admin

Reexibe mensagens editadas deste chat que ainda estão no cache (30 dias,
setting `cache.editedRetentionDays`), com o texto de antes e o de depois.
Funciona como o `/show`: mesmas opções, mesmo limite (`show.max`) e mesmo
intervalo entre os envios (`show.delayMs`). Cada edição é um item: uma
mensagem editada duas vezes aparece duas vezes.

| Opção | Valor | Descrição |
|---|---|---|
| `-N` | | Quantidade (padrão 1, máx. 20, setting `show.max`). Ex.: `-3` |
| `-list`, `-l` | | A mesma lista do `/show -l`: apagadas e editadas por chat |
| `-pv` | | Envia no seu privado em vez de expor no chat atual |
| `-chat`, `-c` | `<nº\|nome>` | Escolhe outro chat: nº da lista de **editadas** do `/edit -l` ou parte do nome |
| `-flush`, `-f` | | Remove as editadas deste chat (no seu privado: de todos) |

```
/edit                → última mensagem editada deste chat
/e -3 -pv            → as 3 últimas, enviadas no seu privado
/edit -c 1 -5        → 5 últimas do chat nº 1 da lista de editadas
/edit -f             → apaga do cache as editadas deste chat
```

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
