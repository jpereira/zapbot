# `/show` (`/undo`, `/s`) · admin

Reexibe mensagens apagadas deste chat que ainda estão no cache (30 dias,
setting `cache.revokedRetentionDays`). Os envios são espaçados por
`show.delayMs` (700 ms) para evitar flood.

| Opção | Valor | Descrição |
|---|---|---|
| `-N` | | Quantidade (padrão 1, máx. 20, setting `show.max`). Ex.: `-3` |
| `-list`, `-l` | | Lista as apagadas **e as editadas** do cache por chat (em qualquer chat), marcando com `← este chat` o chat atual. É a mesma lista do `/edit -l` |
| `-pv` | | Envia no seu privado em vez de expor no chat atual |
| `-chat`, `-c` | `<nº\|nome>` | Escolhe outro chat: nº da lista de **deletadas** do `/show -l` ou parte do nome. Funciona em qualquer chat; junte `-pv` para não expor as mensagens no chat atual |
| `-flush`, `-f` | | Remove as apagadas deste chat (no seu privado: de todos) |

```
/show                → última mensagem apagada deste chat
/show -5             → as 5 últimas
/undo -3 -pv         → as 3 últimas, enviadas no seu privado
/show -l             → apagadas e editadas, por chat
/show -l -pv         → a mesma lista, enviada no seu privado
/show -c 2 -5        → 5 últimas do chat nº 2 da lista de deletadas
/show -c família -pv → do chat cujo nome contém "família", no seu privado
/show -f             → apaga do cache as apagadas deste chat
```

O `-l` (no `/show` ou no `/edit`) mostra os dois tipos, cada um com a sua
numeração para o `-c`:

```
🗄️ Mensagens no cache

🗑️ Deletadas: 3 (1 com mídia · a mais antiga expira em 29 dias)
1. 👥 Família — 2 (última 30/09/2026, 10:02:11) ← este chat
2. 👤 Beltrano — 1 (última 30/09/2026, 09:40:05)

✏️ Editadas: 1 (a mais antiga expira em 30 dias)
1. 👥 Trabalho — 1 (última 30/09/2026, 11:15:42)

💡 /show -N reexibe as deletadas e /edit -N as editadas deste chat (máx. 20).
💡 Junte -c <nº ou nome> para outro chat: o nº é o da lista do tipo (/show -c 2, /edit -c 1).
💡 -pv envia no seu privado; -f remove do cache as deste chat (no seu privado: de todos).
```
