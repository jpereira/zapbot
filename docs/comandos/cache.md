# `/cache` (`/c`) · admin

Mostra o espaço ocupado em `cache/` (banco, mídias, temporários, backups) e
limpa o cache. Na ajuda do comando (`/cache -h`) os caminhos aparecem completos (no
Docker, `/app/cache` e `/app/cache/media`).

| Opção | Descrição |
|---|---|
| `-all`, `-a` | Apaga **tudo** em `cache/`: as mensagens (inclusive as guardadas para o `/show`), os temporários, as mídias baixadas em `cache/media` e os backups do [`/backup`](backup.md) em `cache/backups`, e compacta o banco. Números e logs do `/monitor`, ocorrências do `/watch`, contadores do `/stats`, enquetes, alertas de preço e settings são mantidos |
| `-backup`, `-b` | Apaga os backups do [`/backup`](backup.md) em `cache/backups` (o banco fica como está) |
| `-clean`, `-c` | Remove só o que passou da janela de retenção (68 h / `cache.revokedRetentionDays` para apagadas / `cache.editedRetentionDays` para editadas / `watch.hitsRetentionDays` para ocorrências do `/watch` / `stats.retentionDays` para os contadores do `/stats` / `enquete.retentionDays` para as enquetes) |
| `-media`, `-m` | Apaga as mídias baixadas em `cache/media` (fotos, vídeos, áudios e documentos guardados para recuperar apagadas). As mensagens ficam: uma apagada recuperada depois avisa que o arquivo não está mais disponível |

```
/cache           → lista o conteúdo de cache/ e o total de mensagens
/c -clean        → limpeza normal (retenção)
/cache -m        → só as mídias
/cache -c -m     → limpeza normal e as mídias
/cache -b        → só os backups
/cache -a        → tudo, inclusive os backups
```

Sem opções, mostra os arquivos e diretórios do primeiro nível em ordem alfabética.
O tamanho de cada diretório inclui seu conteúdo; o total soma arquivos e diretórios.
As contagens de mensagens, apagadas, edições e backups aparecem abaixo da árvore.

Exemplo:

```text
🗂️ Exibindo conteúdo de /app/cache/*

├── 📁 backups/       118.33 KB
├── bot_database.db   704.00 KB
├── 📁 media/         404.77 MB
└── 📁 tmp/                 0 B
───────────────────────────────
Total:                405.57 MB

🗄️ 1150 mensagens no cache.
🗑️ 79 apagadas.
✏️ 3 edições.
📦 Backups: 3 (veja /backup).
```

O `-a` não deixa nenhum backup para trás: se quiser guardar uma cópia antes,
use `/backup -s` (o arquivo chega no seu privado). As opções `-c`, `-m` e `-b`
podem ser usadas juntas.
