# `/backup` (`/bkp`) · admin

Backup do banco (`cache/bot_database.db`): um automático por dia, e pelo
WhatsApp você cria, lista, compara, restaura, recebe o arquivo ou apaga. Sem
opção, mostra o banco atual e os backups.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | Banco atual (tamanho e entradas de cada tabela), quantos backups há, o último e o próximo automático |
| `-now`, `-n` | | Cria um backup agora (manual: fica até ser apagado) |
| `-list`, `-l` | | Lista os backups, numerados do mais novo para o mais antigo, com data, tamanho e motivo |
| `-info`, `-i` | `<nº>` | Detalhes do backup: data, motivo, versão do bot que o criou (com o commit, ex.: `X.Y (git+9029cfb/release-X.Y)`) e as entradas de cada tabela, comparadas com o banco atual |
| `-restore`, `-r` | `<nº\|nome>` | Restaura o backup. Sem `-sim`, só mostra o que vai acontecer e o comando para confirmar |
| `-sim` | | Confirma: junto com `-restore`, a restauração; junto com `-send -to` outro chat, o envio |
| `-send`, `-s` | `[nº]` | Envia o arquivo do backup (sem nº: o mais recente) no seu privado ou nos destinos do `-to`. Veja [Enviar o arquivo](#enviar-o-arquivo) |
| `-to` | `<destino>` | Junto com `-send`: por e-mail, como anexo (`email` é o `QRCODE_EMAIL_SMTP_TO`, ou um endereço), ou noutro chat: um contato (`/Jorge Pereira/`), uma menção (`@Fulano Da Silva`), um grupo (`/Grupo L200/`) ou um número (`+5521999999999`) (pede `-sim`). Repita para vários. Veja [Destinos](index.md#destinos-contato-grupo-número-ou-e-mail) |
| `-rm` | `<nº\|all>` | Apaga o backup nº N (ou todos) |

```
/backup                                 → o banco atual e os backups
/backup -now                            → cria um agora
/bkp -l                                 → a lista
/backup -i 2                            → o que tem no nº 2, comparado com o banco atual
/backup -r 2                            → mostra o que vai acontecer e pede confirmação
/backup -r zapbot-20261001-030000 -sim  → restaura
/backup -s                              → o arquivo do mais recente no seu privado
/backup -s -to eu@gmail.com             → o mais recente, por e-mail
/backup -s 2 -to email                  → o nº 2, para o QRCODE_EMAIL_SMTP_TO
/backup -s -to /Jorge Pereira/ -sim     → no privado de um contato
/backup -s -to @Fulano Da Silva -sim    → num grupo, mencionando a pessoa
/backup -s -to email -to /Jorge Pereira/ -sim  → por e-mail e no privado do contato
/backup -rm 3                           → apaga o nº 3
```

```
💾 Backup

🗄️ Banco atual: 4.20 MB
   message_edits 12 · messages 1.234 · polls 3 · price_alerts 2 · settings 47 · stats 980 · ...
📦 Backups: 7 (8.40 MB) em /app/cache/backups
🕐 Último: qui 01/10 03:00 (automático, 1.10 MB)
⏭️ Próximo automático: sex 02/10 03:00 (todo dia às 3h, guarda 7)
```

```
/backup -l
💾 Backups (3)

1. qui 01/10 03:00 · 1.10 MB · automático
2. qua 30/09 15:20 · 1.00 MB · manual
3. qua 30/09 03:00 · 1.00 MB · automático
```

## Backup automático

Todo dia, a partir das 3h de Brasília (setting `backup.hour`), o bot cria um
backup. Se estiver fora do ar nesse horário, o backup sai assim que ele voltar,
no mesmo dia. Desligue com `/set backup.enabled off`.

Ficam os 7 automáticos mais recentes (setting `backup.keep`); os mais antigos
são apagados a cada backup novo. A mesma conta vale para os backups "antes de
restaurar". Os **manuais** (`-now`) nunca são apagados sozinhos.

Se o backup diário falhar (ex.: disco cheio), o erro vai para o log e para os
[alertas por e-mail](../emails.md#alertas-por-e-mail) (`💾 Backup falhou`).

## O que entra

O banco inteiro: mensagens guardadas (inclusive as apagadas e as editadas),
settings, regras e ocorrências do `/watch`, alertas de preço, lembretes e
mensagens agendadas, enquetes, estatísticas e os números do `/monitor`. A cópia
é feita com o `VACUUM INTO` do SQLite (consistente, sem parar o bot) e
compactada com gzip.

**As mídias (`cache/media`) não entram**: depois de uma restauração, uma
apagada com mídia que não está mais no disco avisa que o arquivo não está
disponível. A sessão do WhatsApp (volume `wwebjs_auth`) também não.

Cada backup são dois arquivos em `cache/backups/`, no volume `app_cache`:

- `zapbot-AAAAMMDD-HHMMSS.db.gz`: o banco compactado;
- `zapbot-AAAAMMDD-HHMMSS.json`: data, motivo, versão do bot e as entradas de
  cada tabela.

## Restaurar

`/backup -r <nº>` mostra a data e o motivo e pede a confirmação, já com o nome
do backup (um backup novo no meio do caminho mudaria os números):

```
/backup -r 2 -sim
♻️ Backup restaurado: qua 30/09 15:20
message_edits 10 · messages 1.180 · settings 47 · ...

💾 O estado anterior ficou no backup zapbot-20261001-101530: para desfazer, /backup -r zapbot-20261001-101530 -sim
```

- O banco inteiro volta àquele momento; o que entrou depois se perde. Por isso,
  antes de restaurar, o bot faz um backup do estado atual (motivo "antes de
  restaurar"), e a resposta já traz o comando para desfazer.
- Os settings são recarregados na hora, sem reiniciar.
- Um backup de uma versão anterior também serve: as tabelas e colunas que ele
  não tinha ficam vazias.

## Enviar o arquivo

O `-send` manda o arquivo `.db.gz` no seu privado. Com o `-to`, vai para outro
lugar, como nos outros comandos ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)):

- **E-mail**: `-to email` (o `QRCODE_EMAIL_SMTP_TO`) ou um ou mais endereços
  (`-to "a@x.com, b@y.com"`). Vai como anexo, pelo mesmo SMTP do QR Code e dos
  alertas (`QRCODE_EMAIL_SMTP_*`, veja [Configuração](../configuracao.md#e-mail-qr-code-e-alertas)).
- **Outro chat**: um contato, um grupo ou um número. Como o banco tem as
  mensagens guardadas de **todos** os chats, o bot pede confirmação: repita com
  `-sim`.
- **Vários**: repita o `-to`. Os e-mails de todos vão num e-mail só; cada chat
  recebe o arquivo (se falhar num, os outros recebem assim mesmo).

```
/backup -s -to fulano@gmail.com
📧 Backup de qui 01/10 03:00 enviado para fulano@gmail.com.

/backup -s -to /Jorge Pereira/
⚠️ O backup tem o banco inteiro: as mensagens guardadas de todos os chats, as apagadas, os settings...
Para enviar mesmo em 👤 Jorge Pereira, repita com -sim: /backup -send -to /Jorge Pereira/ -sim

/backup -s -to email -to /Jorge Pereira/ -to /Grupo L200/
⚠️ O backup tem o banco inteiro: as mensagens guardadas de todos os chats, as apagadas, os settings...
Para enviar mesmo em 👤 Jorge Pereira, 👥 Grupo sobre L200, repita com -sim: /backup -send -to email -to /Jorge Pereira/ -to /Grupo L200/ -sim
```

- O e-mail traz o código anti-phishing, como os outros do bot, e as instruções
  para restaurar.
- Backups acima de 20 MB não vão por e-mail (os provedores recusam anexos
  grandes): use o `-s` sem `-to`.
- Sem o SMTP configurado (`QRCODE_EMAIL_SMTP_HOST` e `_USER`), o bot avisa.
- A forma antiga, com os e-mails direto no `-s` (`/backup -s 2 email`), ainda
  funciona.

## Guardar fora do servidor

Os backups ficam no mesmo volume do banco: se o volume for apagado (ex.:
`make DOCK_REMOTE=1 destroy`), eles vão junto. O [`/cache -a`](cache.md) e o
`/cache -b` também apagam os backups. Para guardar uma cópia fora, use
`/backup -s` (o arquivo chega no seu WhatsApp), mande por e-mail
(`/backup -s -to seu@email.com`) ou copie a pasta:

```bash
docker cp zapbot:/app/cache/backups ./backups-zapbot
```
