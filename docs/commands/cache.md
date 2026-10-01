# `/cache` (`/c`) · admin

Mostra o espaço ocupado em `cache/` (banco, mídias, temporários) e limpa o
cache. Na ajuda do comando (`/cache -h`) os caminhos aparecem completos (no
Docker, `/app/cache` e `/app/cache/media`).

| Opção | Descrição |
|---|---|
| `-all`, `-a` | Apaga **todo** o cache em `cache/`: as mensagens (inclusive as guardadas para o `/show` e o `/edit`), os temporários e as mídias baixadas em `cache/media`, e compacta o banco. Números e logs do `/monitor`, ocorrências do `/watch`, contadores do `/stats` e settings são mantidos |
| `-clean`, `-c` | Remove só o que passou da janela de retenção (68 h / `cache.revokedRetentionDays` para apagadas / `cache.editedRetentionDays` para editadas / `watch.hitsRetentionDays` para ocorrências do `/watch` / `stats.retentionDays` para os contadores do `/stats`) |
| `-media`, `-m` | Apaga as mídias baixadas em `cache/media` (fotos, vídeos, áudios e documentos guardados para recuperar apagadas). As mensagens ficam: uma apagada recuperada depois avisa que o arquivo não está mais disponível |

```
/cache           → lista o conteúdo de cache/ e o total de mensagens
/c -clean        → limpeza normal (retenção)
/cache -m        → só as mídias
/cache -c -m     → limpeza normal e as mídias
/cache -a        → tudo
```
