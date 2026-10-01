# `/cache` (`/c`) · admin

Mostra o espaço ocupado em `cache/` (banco, mídias, temporários).

| Opção | Descrição |
|---|---|
| `-clean`, `-c` | Remove só o que passou da janela de retenção (68 h / `cache.revokedRetentionDays` para apagadas / `cache.editedRetentionDays` para editadas / `watch.hitsRetentionDays` para ocorrências do `/watch` / `stats.retentionDays` para os contadores do `/stats`) |
| `-force`, `-f` | Junto com `-clean`: apaga **todas** as mensagens (inclusive as guardadas para o `/show` e o `/edit`), mídias e temporários, e compacta o banco. Números e logs do `/monitor`, ocorrências do `/watch` e contadores do `/stats` são mantidos |

```
/cache           → lista o conteúdo de cache/ e total de mensagens
/c -clean        → limpeza normal
/cache -c -f     → limpeza geral
```
