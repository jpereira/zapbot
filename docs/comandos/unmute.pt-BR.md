# `/unmute` (`/desmutar`) · admin

Desfaz o silêncio do [`/mute`](mute.md): os avisos de mensagens apagadas, editadas, de status
apagados e de reações removidas ou trocadas da pessoa, do grupo ou da comunidade voltam.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[/contato ou grupo/\|@menção\|+número\|nº]` | Quem: buscado como no `/mute`, ou o nº da lista do `/mute`. Sem ninguém, respondendo um aviso, de onde ele veio. Sem nada, a lista |
| `-all`, `-a` | | Desfaz todos os silenciados |

```text
/unmute /Jorge Pereira/     → os avisos do contato voltam
/unmute /Grupo L200/        → os do grupo
/unmute 2                   → o nº 2 da lista do /mute
/unmute                     → respondendo um aviso: de onde ele veio (a pessoa, o grupo ou a comunidade)
/unmute -all                → todos (o mesmo que /unmute -a ou /mute -rm all)
```

- Quem não está silenciado: o bot avisa (`ℹ️ 👤 Fulano não está silenciado.`, com a dica de ver a
  lista do `/mute`).
- O `/unmute -all` responde quantos foram removidos (`🔊 2 silenciados removidos: os avisos voltam.`).
- Um nº que não está na lista: `❌ Nº 9 não existe. Veja a lista com /mute`.
- Sem nada (e sem responder um aviso), mostra a lista do `/mute`.
