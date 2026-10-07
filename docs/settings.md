# Settings

Configurações gerais do bot guardadas na tabela `settings` do SQLite. Mudam na hora, sem reiniciar,
e sobrevivem a reinícios. Para ver e alterar, use o [`/set`](comandos/set.md).

| Chave | Tipo | Padrão | Descrição |
|---|---|---|---|
| `agenda.max` | 1–500 | `50` | Máximo de itens do [`/cron`](comandos/cron.md), somando lembretes e mensagens |
| `alerta.intervalMin` | 1–60 | `5` | Intervalo, em minutos, entre as verificações dos [alertas de preço](comandos/cotacao.md#alertas-de-preço) |
| `alerta.max` | 1–100 | `20` | Máximo de alertas de preço (somando `/cotacao` e `/crypto`) |
| `backup.enabled` | on/off | `on` | [Backup automático](comandos/backup.md#backup-automático) do banco, uma vez por dia |
| `backup.hour` | 0–23 | `3` | Hora (de Brasília) do backup automático |
| `backup.keep` | 1–90 | `7` | Quantos backups automáticos (e de antes de restaurar) guardar; os manuais ficam até um `/backup -rm` |
| `backup.to` | texto (pode ser vazio) | `""` | [Destino do backup diário](comandos/backup.md#backup-automático), além da cópia local: contato, grupo, número ou e-mail, como no `-to`. Vazio: só local. Para vários, use `-to <destino> -to <destino>`. Envio automático, sem pedir `-sim` |
| `bot.admins` | lista | *(vazia)* | Outras pessoas que também usam os comandos admin: número com DDI (`5521999999999`) ou, pelo `/set`, o nome do contato (`/Jorge Pereira/`) ou a menção. Só o dono altera; o `/bot +o`/`-o` é o atalho. Veja [Admins extras](comandos/bot.md#admins-extras) |
| `bot.paused` | on/off | `off` | Bot desligado: todos os comandos ignorados, exceto o `/bot` (o mesmo do `/bot -on`/`-off`) |
| `bot.users` | lista | `false` | Quem usa os comandos comuns (os não-admin), além de você e do `bot.admins`: `false` (ninguém), `true` (todos) ou pessoas e grupos (num grupo, todos ali usam, mas só dentro dele); uma pessoa só num grupo fica como `telefone:id-do-grupo`. Só o dono altera; o `/bot +v`/`-v` é o atalho. Veja [Usuários](comandos/bot.md#usuários) |
| `bot.users.cmds` | lista | *(vazia)* | Os comandos de cada usuário (o `/bot +cmd`/`-cmd`): `item=/a,/b` (só esses) ou `item=!/a,/b` (todos os comuns, menos esses), com o item do `bot.users`. Sem linha: todos os comuns. Veja [Comandos de cada usuário](comandos/bot.md#comandos-de-cada-usuário) |
| `cache.editedRetentionDays` | 1–365 | `30` | Dias que as mensagens editadas ficam guardadas para o `/show -e` |
| `cache.revokedRetentionDays` | 1–365 | `30` | Dias que as mensagens apagadas ficam guardadas para o `/show` |
| `commands.disabled` | lista | *(vazia)* | Comandos desativados em tempo de execução: o bot os ignora e eles somem do `/help`. O `/set` não pode ser desativado. Nomes desconhecidos são ignorados com aviso no log; aliases válidos são normalizados |
| `cotacao.coins` | lista | `EUR, USDT` | Moedas habilitadas no `/cotacao` (`USD`, `EUR`, `GBP`, `USDT`); normalmente alterada pelo `/cotacao -a`/`-d` |
| `crypto.coins` | lista | `BTC, ETH, SOL, HYPE` | Moedas do `/crypto` (só as suportadas); normalmente alterada pelo `/crypto -a`/`-d` |
| `cve.max` | 1–20 | `10` | Quantidade de CVEs exibidas pelo `/cve` (o `/cve <max>` sobrepõe) |
| `cve.maxDays` | 1–120 | `7` | Janela, em dias, do `/cve -highscore` |
| `debug.copyTo` | texto (pode ser vazio) | *(vazio)* | Chat que recebe a cópia dos logs; configure pelo [`/debug -copy-to`](comandos/debug.md). Vazio: só console |
| `debug.enabled` | on/off | `on` se `APP_ENV=dev` | Modo debug (o mesmo do `/debug -on`/`-off`) |
| `debug.filter` | texto (pode ser vazio) | *(vazio)* | Filtro `/regex/flags` dos logs durante o debug. Vazio: sem filtro; `/debug -off` limpa. O filtro vale após a inicialização; matches são destacados no console com cores |
| `debug.level` | 0–3 | `0` | Nível cumulativo: básico, funções e comandos, integrações, desenvolvimento. Veja [`/debug`](comandos/debug.md) |
| `defi.aave.chains` | lista | `1 8453` | Redes (chain id) em que o [`/defi aave`](comandos/defi.md#aave-v3) procura as posições: `1` (Ethereum), `8453` (Base) |
| `defi.aave.wallet` | texto (pode ser vazio) | *(vazio)* | Carteira do [`/defi aave`](comandos/defi.md#aave-v3) quando não há carteira cadastrada, usada quando `AAVE_WALLET_ADDRESS` não está no `config/.env` |
| `defi.alerta.intervalMin` | 1–1440 | `10` | Intervalo (minutos) entre as verificações do [`/defi -alerta`](comandos/defi.md#alerta-de-saída-da-faixa); consulta as posições na Solana e na HyperEVM, conforme o protocolo |
| `defi.aptos.apikey` | texto (pode ser vazio) | *(vazio)* | Chave da API da Aptos ([Geomi](https://geomi.dev/docs/start)) usada pelo [`/defi liquidswap`](comandos/defi.md#liquidswap), quando `APTOS_API_KEY` não está no `config/.env`. Opcional: sem ela, vale o limite anônimo por IP, que basta para o uso do bot. Exibido mascarado |
| `defi.aptos.indexer` | URL | `https://api.mainnet.aptoslabs.com/v1/graphql` | Indexador GraphQL da Aptos usado pelo [`/defi liquidswap`](comandos/defi.md#liquidswap) para achar as posições da carteira |
| `defi.aptos.rpc` | URL | `https://api.mainnet.aptoslabs.com/v1` | API REST do fullnode da Aptos usada pelo [`/defi liquidswap`](comandos/defi.md#liquidswap) para ler as pools e os tokens. Exibido mascarado |
| `defi.base.rpc` | URL | `https://mainnet.base.org` | RPC da Base usado pelo [`/defi aave`](comandos/defi.md#aave-v3), quando `BASE_RPC_URL` não está no `config/.env`. O público limita as consultas. Exibido mascarado |
| `defi.ethereum.rpc` | URL | `https://ethereum-rpc.publicnode.com` | RPC da Ethereum usado pelo [`/defi aave`](comandos/defi.md#aave-v3), quando `ETHEREUM_RPC_URL` não está no `config/.env`. O público limita as consultas. Exibido mascarado |
| `defi.hyperevm.rpc` | URL | `https://rpc.hyperliquid.xyz/evm` | RPC da HyperEVM usado pelo [`/defi`](comandos/defi.md) no Project X. O público limita as consultas; um RPC próprio costuma ter a chave na URL. Exibido mascarado |
| `defi.morpho.api` | URL | `https://api.morpho.org/graphql` | API GraphQL oficial do Morpho, usada pelo [`/defi morpho`](comandos/defi.md#morpho) |
| `defi.morpho.chains` | lista | `8453` | Redes (chain id) em que o [`/defi morpho`](comandos/defi.md#morpho) procura as posições: `8453` (Base), `1` (Ethereum)... |
| `defi.morpho.wallet` | texto (pode ser vazio) | *(vazio)* | Carteira do [`/defi morpho`](comandos/defi.md#morpho) quando não há carteira cadastrada, usada quando `MORPHO_WALLET_ADDRESS` não está no `config/.env` |
| `defi.solana.rpc` | URL | `https://api.mainnet-beta.solana.com` | RPC da Solana usado pelo [`/defi`](comandos/defi.md#rpc-da-solana). Exibido mascarado (a URL costuma levar a chave) |
| `email.alerts` | on/off | `on` | Alertas por e-mail (crash, queda, reconexão...) pelo SMTP do QR Code. Veja [Alertas por e-mail](emails.md#alertas-por-e-mail) |
| `enquete.retentionDays` | 1–365 | `90` | Dias que as enquetes e os votos ficam guardados para o [`/enquete -r`](comandos/enquete.md#resultado) |
| `flood.intervalCommand` | 1–3600 | `2` | Proteção contra flood: a janela, em segundos, em que se conta o `flood.maxCommandRepeated`, e quanto tempo o bot ignora quem passou do limite. Veja [Proteção contra flood](comandos/bot.md#proteção-contra-flood) |
| `flood.maxCommandRepeated` | 0–100 | `3` | Quantas vezes quem não é admin pode repetir o mesmo comando em `flood.intervalCommand` segundos; passou, o bot avisa uma vez e ignora a pessoa até o intervalo acabar. `0` desliga |
| `get.maxDownloadMB` | 10–2000 | `200` | Tamanho máximo baixado pelo yt-dlp no `/get`, antes da conversão |
| `get.maxSizeMB` | 1–100 | `20` | Tamanho máximo do arquivo do `/get` |
| `gif.tag` | texto | `fail` | Tag padrão do `/giphy` |
| `giphy.api.key` | texto (pode ser vazio) | *(vazio)* | Chave do GIPHY, usada quando `GIPHY_API_KEY` não está no `config/.env`. Exibida mascarada (`••••1234`); `/set -reset giphy.api.key` apaga |
| `monitor.max` | 1–1000 | `20` | Máximo de números monitorados |
| `news.brasil` | lista | 15 blogs do [feedspot](https://rss.feedspot.com/brazil_rss_feeds/) | Feeds RSS do `/news -brasil` |
| `news.g1` | lista | `https://g1.globo.com/dynamo/rss2.xml` | Feeds RSS do `/news -g1` |
| `news.gazeta` | lista | `https://www.gazetadopovo.com.br/feed/rss/brasil.xml` | Feeds RSS do `/news -gazeta` |
| `news.hack` | lista | The Hacker News, BleepingComputer, Krebs on Security | Feeds RSS do `/news -hack` |
| `news.max` | 1–10 | `5` | Manchetes exibidas pelo `/news` (o `/news <quantidade>` sobrepõe) |
| `openai.api.key` | texto (pode ser vazio) | *(vazio)* | Chave da OpenAI, usada quando `OPENAI_API_KEY` não está no `config/.env`. Exibida mascarada (`••••1234`); `/set -reset openai.api.key` apaga |
| `openai.api.model` | texto (da lista) | `gpt-4o-mini` | Modelo do `/gpt`, usado quando `OPENAI_MODEL` não está no `config/.env`. Aceitos: os listados por `/gpt -m` |
| `openai.timeout.ms` | 5000–300000 | `60000` | Timeout do `/gpt`, usado quando `OPENAI_TIMEOUT_MS` não está no `config/.env` |
| `pixelart.maxParts` | 1–10 | `3` | Máximo de partes do [`/pixelart`](comandos/pixelart.md) quando a arte é mais alta que 4096 px |
| `pixelart.packs` | lista | `chuck-norris-lvl` | Packs do 16colo.rs sorteados pelo [`/pixelart`](comandos/pixelart.md) sem argumentos |
| `show.alert.deleted` | on/off | `on` | Avisa no seu privado quando alguém apaga uma mensagem; `off` só guarda para o `/show` |
| `show.alert.edited` | on/off | `on` | Avisa no seu privado quando alguém edita uma mensagem; `off` só guarda para o `/show -e` |
| `show.alert.status` | on/off | `on` | Recupera status apagados; `off` ignora (nem alerta, nem `/show`) |
| `show.delayMs` | 0–10000 | `700` | Intervalo entre os envios do `/show` |
| `show.max` | 1–100 | `20` | Máximo de mensagens por `/show -N` |
| `stats.enable` | on/off | `on` | Conta as mensagens de cada chat para o `/stats`; `off` para de contar (o histórico fica) |
| `stats.retentionDays` | 7–365 | `90` | Dias que os contadores do `/stats` ficam guardados (e período máximo do `/stats -N`) |
| `sticker.author` | texto | `https://github.com/jpereira/zapbot/` | Autor das figurinhas |
| `sticker.name` | texto | `ZapBot` | Nome do pacote das figurinhas |
| `tempo.city` | texto | `Niteroi, Rio de Janeiro, Brazil` | Cidade do `/tempo` quando nenhuma é informada |
| `tempo.maxDays` | 1–16 | `16` | Máximo de dias do `/tempo N` (ou `Nd`), contando hoje; 16 é o limite da Open-Meteo |
| `tldr.maxMsgs` | 10–2000 | `500` | Máximo de mensagens enviadas à OpenAI por [`/tldr`](comandos/tldr.md) |
| `traduzir.api.key` | texto (pode ser vazio) | *(vazio)* | Chave do Google Cloud Translation, usada quando `GOOGLE_TRANSLATE_API_KEY` não está no `config/.env`. Exibida mascarada (`••••1234`); `/set -reset traduzir.api.key` apaga |
| `traduzir.lang` | texto | `pt` | Idioma de destino padrão do [`/traduzir`](comandos/traduzir.md) (código: `pt`, `en`, `es`...) |
| `watch.hitsRetentionDays` | 1–365 | `30` | Dias que as ocorrências do `/watch` ficam guardadas |
| `watch.max` | 1–100 | `20` | Máximo de regras do `/watch` |
| `watch.rules` | lista (uma por linha) | *(vazia)* | Regras do `/watch`: texto ou `/regex/flags`. Criadas por `/watch <regra>` e removidas por `/watch -rem N` |
| `watch.showMax` | 1–100 | `20` | Máximo de ocorrências exibidas pelo `/watch`, inclusive com `-N` e `-show` |

Uma chave nova é declarada em `SETTINGS_SCHEMA` (`src/settings.js`), **em ordem alfabética**, com
padrão, tipo, descrição e limites (`allowEmpty` para texto que pode ficar vazio, `secret` para
mascarar o valor no `/set` e nos logs), e lida com `getSetting('<chave>')`. Valores inválidos no
banco são ignorados no boot (vale o padrão, com aviso nos logs).
