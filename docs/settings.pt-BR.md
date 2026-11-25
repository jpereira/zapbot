# Settings

Configurações gerais do bot guardadas na tabela `settings` do SQLite. Mudam na hora, sem reiniciar,
e sobrevivem a reinícios. Para ver e alterar, use o [`/set`](commands/set.md) (as descrições dele são as mesmas daqui,
em português).

| Chave | Tipo | Padrão | Descrição |
|---|---|---|---|
| `alias.examples` | lista | *(vazio)* | Os arquivos `examples/*.zb` que o bot já carregou (uma vez cada, no primeiro boot depois que aparecem: um alias que você apagou não volta). Apague um nome para carregar de novo, ou use `/alias -examples <nome>` (mostra o que o arquivo cria) e `/alias -yes -examples <nome>` (carrega) |
| `ascii.defaultChar` | 1 caractere | `#` | Caractere do traço das letras do [`/ascii`](commands/ascii.md) quando `-char` não é informado |
| `backup.enabled` | on/off | `on` | [Backup automático](commands/backup.md#backup-automático) do banco, uma vez por dia |
| `backup.hour` | 0–23 | `3` | Hora (de Brasília) do backup automático |
| `backup.keep` | 1–90 | `7` | Quantos backups automáticos (e de antes de restaurar) guardar; os manuais ficam até um `/backup -rm` |
| `backup.to` | texto (pode ser vazio) | `""` | [Destino do backup diário](commands/backup.md#backup-automático), além da cópia local: contato, grupo, número ou e-mail, como no `-to`. Vazio: só local. Para vários, use `-to <destino> -to <destino>`. Envio automático, sem pedir `-yes` |
| `bot.admins` | lista | *(vazia)* | Outras pessoas que também usam os comandos `admin` e `owner`: número com DDI (`5521999999999`) ou, pelo `/set`, o nome do contato (`/Jorge Pereira/`) ou a menção. Só o dono altera; o `/bot +a`/`-a` é o atalho. Veja [Admins extras](commands/bot.md#admins-extras) |
| `bot.denied.enabled` | on/off | `on` | Quem digita um comando que não pode usar recebe a `bot.denied.message`, em vez do silêncio (sem repetir enquanto a pessoa insistir, veja `bot.denied.interval`). Desligado: o bot ignora em silêncio. Vem ligado. Veja [Aviso de comando negado](commands/bot.md#aviso-de-comando-negado) |
| `bot.denied.interval` | 0–1440 | `10` | Minutos de calma do aviso do `bot.denied.enabled`: se a pessoa já foi avisada (ou tentou algum comando) neste chat nos últimos X minutos, o bot fica quieto, e cada nova tentativa renova a espera. `0`: avisa a cada tentativa |
| `bot.denied.message` | texto (pode ser vazio) | `""` | Texto do aviso do `bot.denied.enabled`. `$cmd` é o comando digitado e `$admin`, o dono do bot (nome e telefone). Vazio: o texto padrão do idioma do bot (`zapbot.lang`): `🚫 Sem permissão para executar $cmd, fale com $admin` |
| `bot.flood.intervalCommand` | 1–3600 | `2` | Proteção contra flood: a janela, em segundos, em que se conta o `bot.flood.maxCommandRepeated`, e quanto tempo o bot ignora quem passou do limite. Veja [Proteção contra flood](commands/bot.md#proteção-contra-flood). O mesmo que `/bot -flood`. |
| `bot.flood.maxCommandRepeated` | 0–100 | `3` | Quantas vezes quem não é admin pode repetir o mesmo comando em `bot.flood.intervalCommand` segundos; passou, o bot avisa uma vez e ignora a pessoa até o intervalo acabar. `0` desliga. O mesmo que `/bot -flood`. |
| `bot.login` | texto (pode ser vazio) | `""` | Hash (scrypt) da senha do `/bot -login`, que faz quem é de fora virar admin. Vazio: login desligado. Defina pelo `/bot -passwd`, não pelo `/set`. Secreto |
| `bot.paused` | on/off | `off` | Bot desligado: todos os comandos ignorados, exceto o `/bot` (o mesmo do `/bot -on`/`-off`) |
| `bot.users` | lista | `false` | Quem usa os comandos comuns (os não-admin), além de você e do `bot.admins`: `false` (ninguém), `true` (todos) ou pessoas e grupos (num grupo, todos ali usam, mas só dentro dele); uma pessoa só num grupo fica como `telefone:id-do-grupo`. Só o dono altera; o `/bot +u`/`-u` é o atalho. Veja [Usuários](commands/bot.md#usuários) |
| `bot.users.cmds` | lista | *(vazia)* | Os comandos de cada usuário (o `/bot +cmd`/`-cmd`): `item=/a,/b` (só esses) ou `item=!/a,/b` (todos os comuns, menos esses), com o item do `bot.users`. Um comando `admin` (`/gpt`...) só vale na lista "só esses". Sem linha: todos os comuns. Veja [Comandos de cada usuário](commands/bot.md#comandos-de-cada-usuário) |
| `bot.users.limits` | lista | *(vazia)* | Limite de uso de cada usuário por comando (`/bot +cmd /gpt +limit 5/dia`): `item=/gpt:5/day,/tldr:3`. Veja [Limite de uso por usuário](commands/bot.md#limite-de-uso-por-usuário-limit) |
| `cache.editedRetentionDays` | 1–365 | `30` | Dias que as mensagens editadas ficam guardadas para o `/show -e` |
| `cache.messageMediaRetentionDays` | 3–90 | `3` | Dias que as mídias das mensagens comuns (fotos, vídeos, áudios, documentos) ficam no disco. Nunca passam do `cache.messageRetentionDays`: a mídia sai junto com a mensagem. Ocupam espaço em `cache/media`; `/cache -media` libera só elas |
| `cache.messageRetentionDays` | 3–90 | `3` | Dias que o texto das mensagens comuns fica no banco (3 cobre a janela de apagar para todos): quanto mais, mais o `/tldr` alcança. As mídias têm o seu prazo, o `cache.messageMediaRetentionDays` |
| `cache.reactionRetentionDays` | 1–365 | `30` | Dias que as reações removidas ou trocadas ficam guardadas para o `/show -r` |
| `cache.revokedRetentionDays` | 1–365 | `30` | Dias que as mensagens apagadas ficam guardadas para o `/show` |
| `calendar.addEmoji` | on/off | `on` | Começa o título do evento do `/calendar` com um emoji do tipo dele (`🩺 Consulta`, `🧗 Escalada`, `🏋🏽‍♂️ Treino`...). No `-gpt`, o ChatGPT escolhe. `off` desliga |
| `calendar.duration` | 5–1440 | `60` | Minutos do evento do [`/calendar`](commands/calendar.md) quando o texto não diz. O `-duration` muda na chamada |
| `calendar.engine` | texto | `local` | Motor do `/calendar`: `local` (rótulos e formato das datas, sem chave) ou `gpt` (o ChatGPT responde com o JSON do Google Calendar). `-gpt` e `-local` escolhem na chamada |
| `calendar.footer` | on/off | `on` | Termina a resposta do `/calendar` com a dica `💡 Processado por <motor>`. O `-quiet` esconde na chamada |
| `calendar.googleLink` | on/off | `on` | O `/calendar` manda o link "➕ Adicionar ao Google Agenda". O `-quiet` já esconde na chamada; este setting desliga sempre. O `.ics` continua indo (abre no Calendário da Apple e no Outlook) |
| `calendar.outputToPrivate` | on/off | `on` | Envia os avisos e o evento no privado ao responder uma mensagem com `/calendar`. Use `-d` para enviar na conversa atual |
| `calendar.timezone` | texto | `America/Sao_Paulo` | Fuso em que o `/calendar` lê as datas e horas do texto (nome IANA) |
| `call.allow` | lista | *(vazia)* | Números (com DDI) cujas ligações nunca são recusadas, mesmo com `call.reject` ligado. O `bot.admins` também passa sempre. O mesmo que `/call -allow`. |
| `call.message` | texto (pode ser vazio) | `""` | Mensagem enviada a quem teve a ligação recusada (no máximo uma a cada 10 minutos por pessoa). Vazio: o texto padrão do idioma do bot (`zapbot.lang`). `off`: recusa em silêncio. O mesmo que `/call -msg`: veja o [`/call`](commands/call.md) |
| `call.reject` | on/off | `off` | Recusa as ligações de voz e de vídeo que chegam (exceto `call.allow` e `bot.admins`) e responde com a `call.message`. Veja [Recusando ligações](commands/bot.md#recusando-ligações). O mesmo que `/call -on\|-off`. |
| `commands.disabled` | lista | `/cve`, `/kernel`, `/news`, `/walissu` | Comandos desativados em tempo de execução: o bot os ignora e eles somem do `/help`. **O `/cve`, o `/kernel`, o `/news` e o `/walissu` vêm desativados**: `/set -rm commands.disabled kernel` liga um (veja o [`/set`](commands/set.md)). O `/set` não pode ser desativado. Nomes desconhecidos são ignorados com aviso no log; aliases válidos são normalizados |
| `commands.seen` | on/off | `on` | Marca a conversa como lida (✓✓ azul) quando um comando é digitado nela, antes de responder, como uma pessoa faria. O "digitando..." também aparece enquanto o comando roda |
| `contacts.cache` | on/off | `on` | Guarda as fotos de perfil baixadas pelo `/contacts` em `cache/contacts` (entram no backup). Desligado: baixa a cada exportação e não guarda nada |
| `contacts.cacheDays` | 1–365 | `30` | Dias que uma foto em `cache/contacts` vale antes de ser baixada de novo (`/contacts -r` força) |
| `contacts.delayMs` | 0–5000 | `300` | Pausa, em milissegundos, entre uma foto e outra no `/contacts`, para não consultar o WhatsApp em rajada |
| `cron.max` | 1–500 | `50` | Máximo de itens do [`/cron`](commands/cron.md), somando lembretes e mensagens |
| `cron.msgPrepend` | texto | `⏰ ` | Texto literal antes das mensagens de `/cron`, na lista, na Web e no envio; mantém espaços no começo e no fim (`/set cron.msgPrepend " ⏰ ~> "`). Vazio: sem prefixo |
| `crypto.alert.intervalMin` | 1–60 | `5` | Intervalo, em minutos, entre as verificações dos [alertas de preço](commands/stocks.md#alertas-de-preço) do `/crypto` |
| `crypto.alert.max` | 1–100 | `20` | Máximo de alertas de preço do `/crypto` |
| `crypto.alert.msgPrepend` | texto | `🔔 ` | Texto literal antes das mensagens dos eventos do `/crypto -alert`, na lista, na Web e no envio; mantém os espaços nas pontas |
| `crypto.brl` | on/off | `on` | O [`/crypto`](commands/crypto.md) mostra também o preço de cada moeda em reais (o par da Binance contra o real, ou o preço em dólar × USDTBRL) |
| `crypto.coins` | lista | `BTC, ETH, SOL, HYPE` | Moedas do `/crypto` (só as suportadas); normalmente alterada pelo `/crypto -a`/`-d` |
| `cve.max` | 1–20 | `10` | Quantidade de CVEs exibidas pelo `/cve` (o `/cve <max>` sobrepõe) |
| `cve.maxDays` | 1–120 | `7` | Janela, em dias, do `/cve -highscore` |
| `debug.copyTo` | texto (pode ser vazio) | *(vazio)* | Chat que recebe a cópia dos logs; configure pelo [`/debug -copy-to`](commands/debug.md). Vazio: só console |
| `debug.enabled` | on/off | `off` | Modo debug (o mesmo do `/debug -on`/`-off`) |
| `debug.filter` | texto (pode ser vazio) | *(vazio)* | Filtro `/regex/flags` dos logs durante o debug. Vazio: sem filtro; `/debug -off` limpa. O filtro vale após a inicialização; matches são destacados no console com cores |
| `debug.level` | 0–3 | `0` | Nível do debug: 0 básico, 1 o que o bot está chamando (comandos, banco, requisições, processos, e-mail, WhatsApp), uma linha cada, 2 as mesmas chamadas com os parâmetros e todas as funções dos módulos, 3 resultados e Chromium. Veja [`/debug`](commands/debug.md) |
| `defi.aave.chains` | lista | `1 8453` | Redes (chain id) em que o [`/defi aave`](commands/defi.md#aave-v3) procura as posições: `1` (Ethereum), `8453` (Base) |
| `defi.aave.wallet` | texto (pode ser vazio) | *(vazio)* | Carteira do [`/defi aave`](commands/defi.md#aave-v3) quando não há carteira cadastrada, usada quando `AAVE_WALLET_ADDRESS` não está no `config/.env` |
| `defi.alert.intervalMin` | 1–1440 | `10` | Intervalo (minutos) entre as verificações do [`/defi -alert`](commands/defi.md#alerta-de-saída-da-faixa); consulta as posições na Solana e na HyperEVM, conforme o protocolo |
| `defi.aptos.apikey` | texto (pode ser vazio) | *(vazio)* | Chave da API da Aptos ([Geomi](https://geomi.dev/docs/start)) usada pelo [`/defi liquidswap`](commands/defi.md#liquidswap), quando `APTOS_API_KEY` não está no `config/.env`. Opcional: sem ela, vale o limite anônimo por IP, que basta para o uso do bot. Exibido mascarado |
| `defi.aptos.indexer` | URL | `https://api.mainnet.aptoslabs.com/v1/graphql` | Indexador GraphQL da Aptos usado pelo [`/defi liquidswap`](commands/defi.md#liquidswap) para achar as posições da carteira |
| `defi.aptos.rpc` | URL | `https://api.mainnet.aptoslabs.com/v1` | API REST do fullnode da Aptos usada pelo [`/defi liquidswap`](commands/defi.md#liquidswap) para ler as pools e os tokens. Exibido mascarado |
| `defi.base.rpc` | URL | `https://mainnet.base.org` | RPC da Base usado pelo [`/defi aave`](commands/defi.md#aave-v3), quando `BASE_RPC_URL` não está no `config/.env`. O público limita as consultas. Exibido mascarado |
| `defi.ethereum.rpc` | URL | `https://ethereum-rpc.publicnode.com` | RPC da Ethereum usado pelo [`/defi aave`](commands/defi.md#aave-v3), quando `ETHEREUM_RPC_URL` não está no `config/.env`. O público limita as consultas. Exibido mascarado |
| `defi.hyperevm.rpc` | URL | `https://rpc.hyperliquid.xyz/evm` | RPC da HyperEVM usado pelo [`/defi`](commands/defi.md) no Project X. O público limita as consultas; um RPC próprio costuma ter a chave na URL. Exibido mascarado |
| `defi.morpho.api` | URL | `https://api.morpho.org/graphql` | API GraphQL oficial do Morpho, usada pelo [`/defi morpho`](commands/defi.md#morpho) |
| `defi.morpho.chains` | lista | `8453` | Redes (chain id) em que o [`/defi morpho`](commands/defi.md#morpho) procura as posições: `8453` (Base), `1` (Ethereum)... |
| `defi.morpho.wallet` | texto (pode ser vazio) | *(vazio)* | Carteira do [`/defi morpho`](commands/defi.md#morpho) quando não há carteira cadastrada, usada quando `MORPHO_WALLET_ADDRESS` não está no `config/.env` |
| `defi.solana.rpc` | URL | `https://api.mainnet-beta.solana.com` | RPC da Solana usado pelo [`/defi`](commands/defi.md#rpc-da-solana). Exibido mascarado (a URL costuma levar a chave) |
| `draw.footer` | on/off | `on` | Acrescenta a dica "💡 Desenhado por ChatGPT" no aviso "imagem gerada abaixo" do /draw e do /gpt -img e -gif. O -quiet (-q) esconde na chamada. |
| `forward.delayMs` | 0–10000 | `1000` | Pausa (ms) entre as mensagens quando o [`/forward`](commands/forward.md) encaminha várias, para não encher o WhatsApp de uma vez |
| `forward.header` | on/off | `on` | Cabeçalho "Mensagem encaminhada pelo ZapBot!" no começo do que o [`/forward`](commands/forward.md) envia; desligado, vai só a mensagem. O `-status` força, o `-quiet` e o `-nohdr` tiram. Veja [Cabeçalho](commands/forward.md#cabeçalho) |
| `forward.max` | 1–50 | `10` | Máximo de mensagens que o [`/forward -N`](commands/forward.md#várias-mensagens--n) encaminha de uma vez |
| `forward.maxRecipients` | 1–200 | `30` | Máximo de destinatários de um [`/forward`](commands/forward.md#listas-de-destinatários) (listas e avulsos somados) e de cada lista |
| `forward.status` | on/off | `on` | O [`/forward`](commands/forward.md) mostra o status: o aviso enquanto envia e, no fim, `✉️ ... com sucesso!` com a lista de quem recebeu; desligado, só as falhas aparecem. O `-status` força, o `-quiet` tira |
| `get.cache.maxDays` | 1–365 | `2` | Dias que os downloads em cache (`get.cache.tmp`) ficam em `cache/tmp` antes de a limpeza periódica apagá-los |
| `get.cache.tmp` | on/off | `on` | Guarda em `cache/tmp` o que o yt-dlp baixa no `/get` e no `/sticker`: o mesmo link (e o mesmo trecho) não baixa de novo. Veja [Cache dos downloads](commands/get.md#cache-dos-downloads). `off` apaga o original a cada execução |
| `get.maxDownloadMB` | 10–2000 | `200` | Tamanho máximo baixado pelo yt-dlp no `/get` e no `/sticker`, antes da conversão |
| `get.maxInlineSizeMB` | 1–100 | `16` | Tamanho máximo para enviar mídias do `/get` inline; arquivos maiores vão como documento |
| `get.maxSizeMB` | 1–100 | `20` | Tamanho máximo do arquivo convertido pelo ffmpeg no `/get` e no `/sticker` |
| `get.showAsMedia` | on/off | `on` | Envia as mídias do `/get` inline para abrir no WhatsApp, em vez de documento para baixar |
| `giphy.api.key` | texto (pode ser vazio) | *(vazio)* | Chave do GIPHY, usada quando `GIPHY_API_KEY` não está no `config/.env`. Exibida mascarada (`••••1234`); `/set -reset giphy.api.key` apaga |
| `giphy.tag` | texto | `fail` | Tag padrão do `/giphy` |
| `gpt.admin.key` | texto (pode ser vazio) | *(vazio)* | Chave de admin da OpenAI (`sk-admin-...`) do `/gpt -usage`, usada quando `OPENAI_ADMIN_KEY` não está no `config/.env`. Exibida mascarada; `/set -reset gpt.admin.key` apaga |
| `gpt.api.key` | texto (pode ser vazio) | *(vazio)* | Chave da OpenAI, usada quando `OPENAI_API_KEY` não está no `config/.env`. Exibida mascarada (`••••1234`); `/set -reset gpt.api.key` apaga |
| `gpt.api.model` | texto (da lista) | `gpt-4o-mini` | Modelo do `/gpt`, usado quando `OPENAI_MODEL` não está no `config/.env`. Aceitos: os listados por `/gpt -m` |
| `gpt.credit.since` | texto (AAAA-MM-DD, pode ser vazio) | *(vazio)* | Data da compra dos créditos da OpenAI: o `/gpt -usage` soma o gasto desde ela para mostrar `$usado/$total` (vazio: os últimos 180 dias) |
| `gpt.credit.total` | 0–100000 | `0` | Total de créditos comprados na OpenAI, em dólares (a API não informa o saldo): o `/gpt -usage` mostra `$usado/$total`. `0`: não mostra |
| `gpt.footer` | on/off | `on` | Termina as respostas do /gpt com a dica "💡 Respondido por ChatGPT". O -quiet (-q) esconde na chamada. |
| `gpt.gif.frameMs` | 20–2000 | `200` | Quanto dura cada quadro do GIF do `/draw -gif` e do `/gpt -gif`, em ms (o total é quadros x ms) |
| `gpt.gif.frames` | 2–16 | `9` | Quantos quadros tem o GIF do `/draw -gif` e do `/gpt -gif` (quanto mais quadros, mais caro) |
| `gpt.image.gifModel` | texto | `gpt-image-2.6-flare` | Modelo que gera o GIF do `/draw -gif` e do `/gpt -gif` (só os `gpt-image-2.6-*` fazem GIF e pedem acesso à prévia): o id que a sua conta tem (se não existir, o bot lista os que a chave vê) |
| `gpt.image.model` | texto | `gpt-image-2` | Modelo que gera e edita a imagem do `/draw` e do `/gpt -img`: o id que a sua conta tem (se não existir, o bot lista os que a chave vê). O GIF tem o seu, o `gpt.image.gifModel` |
| `gpt.image.quality` | texto | `auto` | Qualidade da imagem do [`/draw`](commands/draw.md#qualidade-e-tamanho) e do `/gpt -img`: `low`, `medium`, `high` ou `auto` (a OpenAI escolhe). Quanto maior, mais cara. O `-quality` muda na chamada (dono e admins) |
| `gpt.image.size` | texto | `auto` | Tamanho da imagem do `/draw` e do `/gpt -img`: `auto` (a OpenAI escolhe), `square` (1024x1024), `landscape` (1536x1024), `portrait` (1024x1536) ou `LxA`. Quanto maior, mais cara. O `-size` muda na chamada (dono e admins) |
| `gpt.pricing` | lista `modelo=entrada/saída` | *(vazia)* (o `/gpt -prices` ou a atualização automática preenche) | Preço por 1M de tokens, em dólares, para o custo estimado do rodapé de status do `/gpt` e do `/tldr` (modelo sem preço: `custo n/d`). Vale o nome exato ou o prefixo mais longo |
| `gpt.pricing.auto` | liga/desliga | `on` | Atualiza o `gpt.pricing` sozinho a cada 15 dias, lendo o site da OpenAI (como o `/gpt -prices`); só roda com a chave da OpenAI configurada. Desligado: só à mão |
| `gpt.pricing.updated` | `AAAA-MM-DD` | *(vazio)* | Data da última atualização do `gpt.pricing` (gravada pelo bot): vazio: ainda não atualizou |
| `gpt.status` | liga/desliga | `on` | Rodapé de status nas respostas do `/gpt` e do `/tldr`: bytes enviados (TX) e recebidos (RX), tokens gastos, custo estimado e saldo (com ele desligado, o `-status` liga só naquela vez) |
| `gpt.timeout.ms` | 5000–300000 | `60000` | Timeout do `/gpt`, usado quando `OPENAI_TIMEOUT_MS` não está no `config/.env` |
| `gpt.transcribe.model` | texto | `gpt-transcribe` | Modelo que transcreve o áudio respondido com o `/gpt`: o id que a sua conta tem (o `whisper-1` sai do ar em fev/2027) |
| `gpt.tts.instructions` | texto | `Fale como um robô: voz metálica, monótona e pausada, sem emoção.` | Estilo da voz do `/gpt -voice` (só o `gpt-4o-mini-tts` usa) |
| `gpt.tts.model` | texto | `gpt-4o-mini-tts` | Modelo que gera a voz do `/gpt -voice`: o id que a sua conta tem (só os `gpt-4o-*` seguem o estilo) |
| `gpt.tts.speed` | 50–200 | `100` | Velocidade da voz do ChatGPT no `/gpt -voice` e no `/tts -gpt`, em % (`100` normal, `150` mais rápido). O `-speed` (`-sp`) muda na chamada; a voz local usa o `tts.speed` |
| `gpt.tts.voice` | texto (da lista) | `onyx` | Voz do `/gpt -voice`: `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer` ou `verse` |
| `me.maxRepeat` | 1–1000 | `500` | Máximo de repetições do [`/me -repeat`](commands/me.md) (`-r <n>`) |
| `monitor.enabled` | on/off | `on` | Consultas periódicas do [`/monitor`](commands/monitor.md); `off` pausa sem apagar contatos ou histórico |
| `monitor.max` | 1–5 | `5` | Máximo de contatos monitorados. Mais contatos aumentam as consultas e o risco de bloqueio; limite absoluto de 5. Remova contatos antes de reduzir abaixo do total cadastrado |
| `monitor.maxRecords` | 1–1000 | `30` | Máximo de horários guardados por contato e exibidos em `/monitor` e `/monitor -l`. Reduzir remove imediatamente os horários mais antigos excedentes |
| `monitor.pool` | 120–86400 | `300` | Intervalo mínimo em segundos por contato: padrão 5 min, mínimo 2 min. Intervalos curtos podem contribuir para bloqueio pelo WhatsApp; nenhum intervalo é garantidamente seguro |
| `news.brazil` | lista | 15 blogs do [feedspot](https://rss.feedspot.com/brazil_rss_feeds/) | Feeds RSS do `/news -brazil` |
| `news.g1` | lista | `https://g1.globo.com/dynamo/rss2.xml` | Feeds RSS do `/news -g1` |
| `news.gazeta` | lista | `https://www.gazetadopovo.com.br/feed/rss/brasil.xml` | Feeds RSS do `/news -gazeta` |
| `news.hack` | lista | The Hacker News, BleepingComputer, Krebs on Security | Feeds RSS do `/news -hack` |
| `news.max` | 1–10 | `5` | Manchetes exibidas pelo `/news` (o `/news <quantidade>` sobrepõe) |
| `notes.lockMinutes` | 1–120 | `5` | Minutos sem usar uma tag protegida ([`/notes -lock`](commands/notes.md#tags-protegidas--lock)) até ela travar sozinha |
| `notes.lockPrivateOnly` | on/off | `on` | Uma tag protegida ([`/notes -lock`](commands/notes.md#tags-protegidas--lock)) só abre no seu privado. `off`: abre em qualquer chat (nunca com `-to`; a senha continua sendo digitada só no seu privado) |
| `ocr.engine` | `local`, `gpt` | `local` | Motor do [`/ocr`](commands/ocr.md): `local` (Tesseract, sem chave) ou `gpt` (ChatGPT, visão da OpenAI). `-gpt` e `-local` escolhem na chamada |
| `ocr.footer` | on/off | `on` | Termina a resposta do /ocr com a dica "💡 Lido por <motor>". O -quiet (-q) esconde na chamada. |
| `ocr.language` | texto | `por+eng` | Idiomas do [`/ocr`](commands/ocr.md) local (Tesseract), separados por `+`: `por+eng`, `por`, `eng`, `spa`... O que não está na imagem Docker não é lido |
| `pixelart.maxParts` | 1–10 | `3` | Máximo de partes do [`/pixelart`](commands/pixelart.md) quando a arte é mais alta que 4096 px |
| `pixelart.packs` | lista | `chuck-norris-lvl` | Packs do 16colo.rs sorteados pelo [`/pixelart`](commands/pixelart.md) sem argumentos |
| `poll.retentionDays` | 1–365 | `90` | Dias que as enquetes e os votos ficam guardados para o [`/poll -r`](commands/poll.md#resultado) |
| `screenshot.timeout` | 5–120 | `30` | Segundos que o [`/screenshot`](commands/screenshot.md) espera a página carregar (a página que nunca "acalma" sai com o que já carregou) |
| `show.alert.deleted` | on/off | `on` | Avisa no seu privado quando alguém apaga uma mensagem; `off` só guarda para o `/show` |
| `show.alert.edited` | on/off | `on` | Avisa no seu privado quando alguém edita uma mensagem; `off` só guarda para o `/show -e` |
| `show.alert.reaction` | on/off | `on` | Avisa no seu privado quando alguém remove ou troca uma reação; `off` só guarda para o `/show -r` |
| `show.alert.status` | on/off | `on` | Recupera status apagados; `off` ignora (nem alerta, nem `/show`) |
| `show.delayMs` | 0–10000 | `700` | Intervalo entre os envios do `/show` |
| `show.max` | 1–100 | `20` | Máximo de mensagens por `/show -N` |
| `stats.enable` | on/off | `on` | Conta as mensagens de cada chat para o `/stats`; `off` para de contar (o histórico fica) |
| `stats.retentionDays` | 7–365 | `90` | Dias que os contadores do `/stats` ficam guardados (e período máximo do `/stats -N`) |
| `status.warnAfter` | 1–50 | `3` | A partir de quantas postagens no Status em 24 horas o `/status` avisa do risco de banimento (não bloqueia) |
| `sticker.author` | texto | `https://github.com/jpereira/zapbot/` | Autor das figurinhas |
| `sticker.name` | texto | `ZapBot` | Nome do pacote das figurinhas |
| `stocks.alert.intervalMin` | 1–60 | `5` | Intervalo, em minutos, entre as verificações dos [alertas de preço](commands/stocks.md#alertas-de-preço) do `/stocks` |
| `stocks.alert.max` | 1–100 | `20` | Máximo de alertas de preço do `/stocks` |
| `stocks.alert.msgPrepend` | texto | `🔔 ` | Texto literal antes das mensagens dos eventos do `/stocks -alert`, na lista, na Web e no envio; mantém os espaços nas pontas |
| `stocks.symbols` | lista | `USD, EUR, USDT, MSTR` | Símbolos exibidos pelo [`/stocks`](commands/stocks.md) : moedas contra o real (`USD`, `EUR`, `GBP`, `USDT`) e tickers do Yahoo Finance (`MSTR`, `NVDA`, `PETR4.SA`, `BRK-B`, `^GSPC`); normalmente alterada pelo `/stocks -a`/`-d` |
| `stt.beam` | 1–10 | `1` | Tamanho do beam da busca do faster-whisper no [`/stt`](commands/stt.md) (`1` é o mais rápido; mais pode acertar um pouco mais e demora mais). O `-beam` muda na chamada |
| `stt.engine` | `local`, `gpt` | `local` | Motor do [`/stt`](commands/stt.md) e do `/get -stt`: `local` (faster-whisper, sem chave) ou `gpt` (ChatGPT, API da OpenAI). `-gpt` e `-local` escolhem na chamada |
| `stt.footer` | on/off | `on` | Termina a transcrição do /stt e do /get -stt com a dica "💡 Transcrito por <motor>". O -quiet (-q) esconde na chamada. |
| `stt.language` | texto | `auto` | Idioma da fala no [`/stt`](commands/stt.md) (`pt`, `en`, `es`...). `auto`: o whisper detecta. O `-lang` muda na chamada |
| `stt.maxMinutes` | 1–180 | `20` | Duração máxima (minutos) do áudio que o `/get -stt` transcreve: usa a CPU do servidor |
| `stt.model` | texto | `small` | Modelo do faster-whisper no [`/stt`](commands/stt.md): `tiny`, `base`, `small`, `medium` ou `large-v3-turbo` (maior = melhor e mais lento). O `small` vem na imagem; outro é baixado na primeira vez. O `-model` muda na chamada |
| `stt.vad` | on/off | `on` | Pula o silêncio e a música antes de transcrever no [`/stt`](commands/stt.md) (onde o whisper inventa texto). O `-vad on\|off` muda na chamada |
| `tldr.footer` | on/off | `on` | Termina o resumo do /tldr com a dica "💡 Resumido por ChatGPT". O -quiet (-q) esconde na chamada. |
| `tldr.maxMsgs` | 10–2000 | `500` | Máximo de mensagens enviadas à OpenAI por [`/tldr`](commands/tldr.md) |
| `translate.lang` | texto | `pt` | Idioma de destino padrão do [`/translate`](commands/translate.md) (código: `pt`, `en`, `es`...) |
| `tts.engine` | `local`, `gpt` | `local` | Motor do [`/tts`](commands/tts.md): `local` (voz Piper, sem chave) ou `gpt` (ChatGPT, API de voz da OpenAI). `-gpt` e `-local` escolhem na chamada |
| `tts.footer` | on/off | `on` | Acrescenta a dica "💡 Gerado por <motor>" no aviso "áudio gerado abaixo" do /tts e do /gpt -voice. O -quiet (-q) esconde na chamada. |
| `tts.maxChars` | 100–100000 | `32000` | Máximo de caracteres do texto do [`/tts`](commands/tts.md) e do `/gpt -voice`. A voz local (Piper) fala tudo; o ChatGPT recebe em partes de 4096 (o limite da API) e o áudio é junto (quanto maior o texto, mais custa) |
| `tts.pause` | 0–3000 | `300` | O silêncio (ms) entre as linhas de um `/tts` com várias linhas ([um áudio só](commands/tts.md#várias-linhas-e-uma-batida)). Uma linha em branco dobra. O `-pause` muda na chamada |
| `tts.pitch` | -12–12 | `0` | Tom da voz do [`/tts`](commands/tts.md) e do `/gpt -voice`, em semitons (`0` normal, `3` mais agudo, `-3` mais grave). O `-pitch` (`-pi`) muda na chamada |
| `tts.speed` | 50–200 | `50` | Velocidade da voz local (Piper) do [`/tts`](commands/tts.md), em % (`100` é a velocidade original do motor, `150` mais rápido; o padrão `50` fala mais devagar, que fica melhor de ouvir). Com `-gpt` vale o `gpt.tts.speed`. O `-speed` (`-sp`) muda na chamada |
| `tts.voice.en` | texto | `en_US-lessac-medium` | Voz local (Piper) do [`/tts`](commands/tts.md) para texto em inglês: `en_US-lessac-medium`, `en_US-amy-medium`, `en_GB-alan-medium`... A que não está na imagem é baixada na primeira vez |
| `tts.voice.pt` | texto | `pt_BR-faber-medium` | Voz local (Piper) do [`/tts`](commands/tts.md) para texto em português: `pt_BR-faber-medium`, `pt_BR-edresson-low`, `pt_PT-tugão-medium`... A que não está na imagem é baixada na primeira vez |
| `tts.volume` | 20–300 | `100` | Volume da voz do [`/tts`](commands/tts.md) e do `/gpt -voice`, em % (`100` normal, `200` o dobro). O `-volume` (`-vol`) muda na chamada |
| `usage.footer` | on/off | `on` | Depois de um comando com limite de uso, avisa quantas chamadas restam (`📊 /gpt: restam 1 de 3 por dia`) |
| `usage.logDays` | 1–365 | `90` | Dias que o histórico das chamadas com limite (`/usage -l`) fica guardado |
| `warn.max` | 0–20 | `3` | Quantos avisos do [`/warn`](commands/warn.md) tiram a pessoa do grupo (o bot precisa ser admin dele). `0`: só conta, nunca remove |
| `watch.hitsRetentionDays` | 1–365 | `30` | Dias que as ocorrências do `/watch` ficam guardadas |
| `watch.max` | 1–100 | `20` | Máximo de regras do `/watch` |
| `watch.rules` | lista (uma por linha) | *(vazia)* | Regras do `/watch`: texto ou `/regex/flags`. Criadas por `/watch <regra>` e removidas por `/watch -rm N` |
| `watch.showMax` | 1–100 | `20` | Máximo de ocorrências exibidas pelo `/watch`, inclusive com `-N` e `-show` |
| `weather.city` | texto | `Niteroi, Rio de Janeiro, Brazil` | Cidade do `/weather` quando nenhuma é informada |
| `weather.maxDays` | 1–16 | `16` | Máximo de dias do `/weather N` (ou `Nd`), contando hoje; 16 é o limite da Open-Meteo |
| `weather.sources` | lista | `met`, `cptec` | Fontes extras do [`/weather`](commands/weather.md#outras-fontes), além da Open-Meteo: `met` (MET Norway) e `cptec` (CPTEC/INPE, só Brasil). Vazio: só a Open-Meteo |
| `zapbot.api.enabled` | on/off | `off` | Liga a API HTTP local ([API e MCP](api.md)): `/health`, `/status`, `/notes` e `/send`, com a `zapbot.api.key`. Vale ao reiniciar o bot |
| `zapbot.api.host` | texto | `127.0.0.1` | Endereço em que a API escuta. O padrão só atende a própria máquina; fora dele, configure um proxy com HTTPS na frente. Vale ao reiniciar |
| `zapbot.api.key` | texto (pode ser vazio) | *(vazio)* | A chave da API (cabeçalho `Authorization: Bearer <chave>` ou `X-API-Key`), com pelo menos 20 caracteres. Vazia: a API não inicia. Exibida mascarada; use uma chave longa e aleatória |
| `zapbot.api.port` | 1024–65535 | `3100` | Porta da API HTTP. Vale ao reiniciar |
| `zapbot.api.sendTo` | lista | *(vazia)* | Para onde o `POST /send` e o `send_message` do MCP podem mandar além do seu próprio chat: telefones com DDI, ids de grupo (`…@g.us`) ou `all` (qualquer destino: só se você confia em quem tem a chave) |
| `zapbot.client.userAgent` | texto | `ZapBot/$version ($build) ($revision)` | Modelo do User-Agent das chamadas HTTP externas e do `/screenshot`; expande `$version`, `$build` e `$revision` conforme a instalação |
| `zapbot.email.alerts` | on/off | `on` | Alertas por e-mail (crash, queda, reconexão...) pelo SMTP do QR Code. Veja [Alertas por e-mail](emails.md#alertas-por-e-mail) |
| `zapbot.lang` | `en_US`, `pt_BR` | `en_US` | Idioma do bot: a ajuda (`-h`, `/help`) e todas as respostas, avisos, erros, datas e números saem nele. `/set zapbot.lang pt_BR` (ou `/set zapbot.lang=pt_BR`) troca para o português; `pt-BR`, `pt` e `en` também valem. As descrições que o `/set` mostra de cada setting continuam em português |
| `zapbot.mcp.enabled` | on/off | `off` | **Experimental.** Liga o servidor MCP da API (`POST /mcp`), para um cliente de IA enviar mensagens (para o `zapbot.api.sendTo`) e ler as suas `/notes`. Exige `zapbot.api.enabled` e `zapbot.api.key` |
| `zapbot.web.enabled` | on/off | `off` | Liga a [interface web](web.md): o histórico do banco no estilo do WhatsApp Web, atrás de uma senha. Vale após reiniciar o bot |
| `zapbot.web.host` | texto | `127.0.0.1` | Endereço em que a interface web escuta. O padrão só atende a própria máquina; fora dele, configure um proxy com HTTPS na frente. No Docker, a variável `ZAPBOT_WEB_HOST` (`0.0.0.0` na imagem) vale mais. Vale após reiniciar |
| `zapbot.web.login` | texto (pode ser vazio) | *(vazio)* | O nome de login da [interface web](web.md), que você escolhe (3 a 40 caracteres: letras, dígitos, `.`, `-`, `_`, `@`): `/set zapbot.web.login <nome>`. Junto com a `zapbot.web.password`; vazio: a interface não inicia |
| `zapbot.web.pageSize` | 20–500 | `100` | Quantas mensagens a interface web carrega por vez (as mais antigas vêm ao rolar) |
| `zapbot.web.password` | texto (pode ser vazio) | *(vazio)* | A senha da interface web: `/set zapbot.web.password <senha>` (mínimo 8 caracteres); o bot guarda só o hash (scrypt). Vazia: a interface não inicia |
| `zapbot.web.port` | 1024–65535 | `3200` | Porta da interface web. Vale após reiniciar |
| `zapbot.web.refreshSeconds` | 0–300 | `15` | De quantos em quantos segundos a interface web busca as mensagens novas da conversa aberta (`0` desliga) |
| `zapbot.web.sessionHours` | 1–720 | `12` | Horas que um login web vale (depois pede a senha de novo). Reiniciar o bot encerra todos os logins |
| `zapbot.web.sessionTimeout` | 0–1440 | `30` | Minutos de inatividade antes de encerrar a sessão web. `0` desliga esse limite |
| `zapbot.web.totp` | texto (pode ser vazio) | *(vazio)* | Segredo em base32 do código de 6 dígitos (Google Authenticator, Authy...) pedido no login da web **além da senha**. Vazio: só a senha. O `/set zapbot.web.totp new` cria o segredo e manda o QR code no seu privado; liga quando você digita o código do app. Veja [Interface web](web.md#login-em-duas-etapas-2fa) |
| `zapbot.web.trustProxy` | on/off | `off` | Lê `X-Forwarded-For` e `X-Forwarded-Proto` dos proxies listados em `ZAPBOT_WEB_TRUSTED_PROXIES` |
| `zapbot.web.url` | texto (pode ser vazio) | *(vazio)* | O endereço pelo qual você abre a [interface web](web.md) (`http://192.168.1.253:3200`, `https://zap.exemplo.com`), mostrado pelo bot na mensagem de início. Vazio: o bot descobre o IP da máquina (no Docker, preencha: o container não sabe o IP do servidor; o compose lê o `ZAPBOT_WEB_URL` do `docker/.env`) |
| `zapbot.web.warnAccess` | on/off | `on` | Avisa (⚠️) no seu privado quando alguém que não está logado abre a página de login da interface web: um aviso por endereço a cada 10 minutos, no máximo 5 em 10 minutos. `off` desliga |
| `zapbot.web.warnChangedPhone` | on/off | `on` | A interface web mostra os avisos do WhatsApp de que o código de segurança de alguém mudou (`🔒 o código de segurança de <nome> mudou`). Desligado, eles somem do histórico e das contagens |

Uma chave nova é declarada em `SETTINGS_SCHEMA` (`src/settings.js`), **em ordem alfabética**, com
padrão, tipo, descrição e limites (`allowEmpty` para texto que pode ficar vazio, `secret` para
mascarar o valor no `/set` e nos logs), e lida com `getSetting('<chave>')`. Valores inválidos no
banco são ignorados no boot (vale o padrão, com aviso nos logs).

Um setting de texto aceita de 1 a 100 caracteres; os `secret` (chaves de API, como `gpt.api.key`)
aceitam até 500, porque as `sk-proj-` da OpenAI passam de 160.
