# `/set` · admin

Lista e altera as configurações do bot guardadas na tabela `settings` (veja
[Settings](../settings.md)). A mudança vale na hora e sobrevive a reinícios.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | Lista todas as chaves e valores |
| `<chave>` | | Mostra valor, padrão, tipo e descrição |
| `<chave> <valor>` | | Altera. Listas: itens separados por vírgula ou espaço (`watch.rules`: uma regra por linha); `""` esvazia |
| `-reset`, `-r` | `<chave>` | Volta ao valor padrão |

```
/set
/set show.max
/set show.max 10
/set debug.enabled off
/set sticker.name "Meu Bot"
/set commands.disabled noffa everyone
/set commands.disabled ""
/set -r crypto.coins
/set watch.rules ""
```
