# Desenvolvimento

## Ambiente de desenvolvimento (Docker)

O serviço `zapbot-dev` monta o código-fonte em `/workspace` e usa
`config/.env.dev`. O `Makefile` tem atalhos:

```bash
make help    # lista todos os alvos
make build   # build da imagem zapbot-dev
make shell   # shell dentro do container de dev; rode "node app.js" lá dentro
make clean   # remove a imagem zapbot-dev
make destroy # clean + apaga os volumes de dev (sessão do WhatsApp e cache!)
make docs    # site da documentação local (veja Documentação)
```

Os alvos `deploy.*` do `Makefile` fazem deploy num Docker remoto via SSH;
ajuste `DOCKER_REMOTE_SERVER` para o seu host antes de usá-los. Eles usam
`docker --context homelab` em cada comando, sem trocar o contexto global do
Docker. O `make deploy.destroy` remove do servidor os containers (mesmo rodando),
as imagens do zapbot (inclusive as de builds e nomes antigos) e os volumes: a
sessão do WhatsApp e o cache se perdem, e o próximo `make deploy.up` pede o QR
Code de novo.

## Estrutura do código

O `app.js` só faz o bootstrap (carrega o `.env`, prepara o banco, cria o
cliente, registra os eventos e inicia as tarefas periódicas). O código fica em
`src/`:

```
app.js                  bootstrap, na ordem de inicialização
src/
  constantes.js         diretórios, janelas de tempo, APP_ENV
  versao.js             a versão com o commit e a tag (ou HEAD e o (devel)) que estão rodando, lidos do .git
  estado.js             estado da conexão, compartilhado entre os módulos
  log.js                print* coloridos (e a linha dos comandos desconhecidos)
  db.js                 SQLite (dbGet/dbAll/dbRun) e o sinal dbPronto
  inicializacao.js      tabelas + carga dos settings
  settings.js           SETTINGS_SCHEMA, getSetting/setSetting e a migração dos renomeados
  botConfig.js          src/comandos/comandos.json carregado
  cliente.js            cliente do whatsapp-web.js e a marca dos envios do bot
  conexao.js            QR Code, eventos de conexão, reinício e watchdog
  backup.js             backup do banco (/backup): criação, diário, retenção e restauração
  email.js              SMTP e alertas por e-mail
  enquetes.js           votos das enquetes (vote_update) e o placar do /enquete -r
  heartbeat.js          prova de vida para o HEALTHCHECK do Docker
  processo.js           crash e sinais (docker stop)
  limpeza.js            retenção e limpeza periódica
  stats.js              contadores do /stats
  status.js             relatório do /bot -status e o envio diário (pela agenda)
  sistema.js            /bot -info: versões (Node.js, whatsapp-web.js, Chromium, yt-dlp, ffmpeg...), as novas e o sistema
  moedas.js, cotacoes.js, alertasPreco.js   /crypto, /cotacao e alertas de preço
  agenda.js             /cron (e /lembrete): leitura, lista e envio na hora
  agendaComandos.js     os {/comando} no texto do /cron: conferidos ao criar e rodados no envio
  openai.js             modelos aceitos pelo /gpt
  openaiChat.js         chamada ao chat da OpenAI (/gpt e /tldr)
  contatos.js, opcoes.js                    contatos/@lid e o parser de opções
  destinos.js           o -to/alvo: contato ou grupo pelo nome, menção (@), número ou e-mail, e o envio ao destino
  escolhas.js           a lista numerada para escolher (vários contatos/grupos) e a resposta com o nº (só de quem deu o comando)
  mudo.js               /mudo: quem está silenciado e os avisos cortados
  defi/                 Solana e HyperEVM (RPC), a Orca e o Project X (/defi) e o -alerta de saída da faixa
  watch/                regras e verificação do /watch
  eventos/              message_create, apagadas, editadas, presença
  comandos/             comandos.json (definição), um arquivo por comando,
                        index.js (HANDLERS) e base.js (ajuda e utilitários)
  util/                 arquivos, formatação, datas digitadas (quando.js), processos externos, URLs
tests/                  testes automatizados (veja Testes)
```

## Testes

Os testes usam o test runner do próprio Node (`node:test`), sem dependência
extra, e rodam em menos de um segundo. Fora do Docker precisam do **Node 22.13
ou mais novo** (por causa do `node:sqlite`) e das dependências instaladas
(`PUPPETEER_SKIP_DOWNLOAD=true npm install`); no container de dev (`make shell`)
é só rodar `npm test`.

```bash
npm test                                   # toda a suíte
npm run lint                               # ESLint (regras recomendadas, eslint.config.js)
node --test tests/watch.test.js            # um arquivo
DEBUG_TESTES=1 npm test                    # mostra o log do bot durante os testes
node --test --experimental-test-coverage --test-coverage-include='src/**' tests/*.test.js
```

No GitHub, o workflow **Testes** (`.github/workflows/ci.yml`) roda o
`npm run lint`, o `npm test` e o `mkdocs build --strict` a cada push no `main` e
em cada pull request; o selo no topo do README e da página inicial mostra o
resultado do último run.

Dois avisos de versão nova ficam no GitHub:

- **Dependabot** (`.github/dependabot.yml`): toda segunda de manhã, abre PRs com
  as versões novas das dependências npm (as de desenvolvimento num PR só) e da
  imagem base do Docker (`docker/app`). Ficam de fora o `whatsapp-web.js`, que é
  um commit fixado do `main` (o [`/bot -info`](comandos/bot.md#informações-do-sistema)
  avisa as novidades dele), e a troca de major do Node, que é manual.
- **yt-dlp** (`.github/workflows/yt-dlp.yml`): todo dia às 09:00, confere a última
  versão no PyPI e, se for nova, abre a issue "yt-dlp X disponível", com os
  comandos para refazer a imagem, e fecha a da versão anterior. A imagem instala
  a última a cada build: o aviso é para saber quando refazer.

Quando um alerta de segurança é numa dependência indireta que ainda pede a
versão vulnerável, a correção vai no `overrides` do `package.json`, que força a
versão no lock. Hoje há um:

- `basic-ftp` `^6.2.1`
  ([GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r)):
  vem de `whatsapp-web.js → puppeteer → … → get-uri`, que ainda pede `^5.3.1`.
  Tire o override quando o `get-uri` passar a aceitar a 6 (`npm ls basic-ftp`
  mostra quem pede o quê).

Nada sai da máquina: o `tests/helpers/ambiente.js` troca, antes de carregar o
bot, o WhatsApp (um cliente falso que guarda o que o bot enviou), o SQLite (em
memória), a rede (`axios` com respostas registradas por URL; uma URL sem
resposta falha o teste), o SMTP, o `yt-dlp`/`ffmpeg` e o `sharp`. O banco e as
mídias ficam numa pasta temporária (`ZAPBOT_CACHE_DIR`), nunca no `cache/`.

As mensagens passam pelo `message_create` de verdade (gravação, `/stats`,
`/watch`, permissões e o parser de opções), e o teste falha se o bot registrar
um erro inesperado no log. O `tests/helpers/bot.js` tem os atalhos:
`bot.responder('/show -2')` devolve o que o bot respondeu, `bot.apagar(msg)` e
`bot.editar(msg, 'novo')` disparam os eventos, `bot.reiniciar()` limpa tudo
entre os casos.

| Arquivo | O que cobre |
|---|---|
| `configuracao.test.js` | `comandos.json`, settings (e a migração dos renomeados), parser de opções, ajuda (uma forma do uso e um exemplo por linha) e a coerência entre config, código, README e `docs/` (inclusive a ordem alfabética, os links e a versão estável da instalação) |
| `mensagens.test.js` | Gravação, roteamento, permissões (`onlyAdmin`, modo admin, bot desligado, admins extras do `bot.admins`), o log dos comandos desconhecidos e a contagem do `/stats` |
| `comandos.test.js` | `/help`, `/debug`, `/uptime`, `/version`, `/ping`, `/noffa`, `/bot` (e o `-info`, com as versões novas do yt-dlp e do whatsapp-web.js), `/set` (e o `-append`/`-rem`) |
| `apagadas-editadas.test.js` | Eventos de apagar/editar (e os avisos `show.alert.*`) e o `/show` (apagadas e editadas, e a busca `-q`) |
| `mudo.test.js` | `/mudo`: avisos silenciados por pessoa ou grupo (só o alvo é o `-a`), e a busca do alvo (contato antes de grupo, menção, a lista para escolher pelo nº) |
| `stats.test.js`, `watch.test.js`, `monitor.test.js` | `/stats`, `/watch` (e o `-to`), `/monitor` e o aviso de presença |
| `status.test.js` | `/bot -status`: o relatório (com o aviso `show.alert.*` desligado e os silenciados do `/mudo`) e o envio diário |
| `agenda.test.js` | Datas digitadas (`6h`, `+2h`, `às 18h`, `sexta`...) e o `/cron`, nos modos mensagem e lembrete, com vários `-to`, `-edit`, `-pause`/`-resume` e os `{/comando}` no texto (e o `-test`) |
| `backup.test.js` | `/backup` (criação, lista, restauração, envio no privado, por e-mail e com `-to`) e o backup diário |
| `cotacoes.test.js` | `/cotacao`, `/crypto` (e o filtro por moeda) e os alertas de preço (com o `-to`) |
| `defi.test.js` | Solana (base58, PDA), contas da Orca (conferidas com o SDK oficial), o Project X (HyperEVM simulada) e o `/defi`: o `-s` por protocolo, o `-rm` de vários, a lista (inteira só no privado, com o 🔔 e o limite) e o `-alerta` (saída e volta da faixa, o `-taxas` e o `-alerta` no cadastro) |
| `externos.test.js` | `/cve`, `/tempo`, `/news`, `/gpt`, `/tldr`, `/traduzir`, `/giphy`, `/meme`, `/joke`, `/kernel`, `/pixelart` |
| `grupo.test.js` | `/todos`, `/boletos`, `/listageral`, `/walissu`, `/enquete` (e o `-r`), `/sticker` |
| `get-cache.test.js` | `/get` (e o anti-SSRF), `/cache` e a limpeza periódica |
| `conexao-email.test.js` | Eventos de conexão, reinício, watchdog, alertas por e-mail, crash e `docker stop` |
| `heartbeat.test.js` | Heartbeat e o `docker/app/healthcheck.js` (executado de verdade) |
| `util.test.js` | Formatação, contatos/`@lid`, menções, arquivos do cache e a versão com o commit e o `(devel)` (`versao.js`) |

Um comando ou opção novos entram com os testes deles; o
`configuracao.test.js` falha se o comando não tiver a página dele em
`docs/comandos/`, se estiver fora de ordem ou se algum link estiver quebrado.

## Documentação

Esta documentação fica em `docs/`, em Markdown, e vira o site
[jpereira.github.io/zapbot](https://jpereira.github.io/zapbot/) com o
[MkDocs Material](https://squidfunk.github.io/mkdocs-material/) (`mkdocs.yml`
tem o menu e o tema). O site é publicado **só nas releases**: o workflow
`.github/workflows/docs.yml` roda quando uma tag `release-*` chega ao GitHub,
então ele sempre mostra a versão estável.

Para ver o site com o conteúdo atual (o HEAD, não a última release):

```bash
make docs                     # 📖 Documentação em http://127.0.0.1:8000/zapbot/
make docs DOCS_PORT=8001      # em outra porta (DOCS_HOST=0.0.0.0 abre para a rede)
```

Na primeira vez ele cria o virtualenv `.venv-docs` com o Python 3.12 (o mesmo
do CI; no 3.14 o `mkdocs serve` ainda não instala) e o recria quando o
`docs/requirements.txt` muda. Outro Python: `make docs DOCS_PYTHON=python3.13`.
A página recarrega sozinha ao salvar um arquivo em `docs/` ou o `mkdocs.yml`.

Para conferir o que o workflow gera (falha em link ou âncora quebrados):

```bash
.venv-docs/bin/mkdocs build --strict
```

Ao mudar um comando, mude a página dele em `docs/comandos/` e as tabelas
Resumo (a do [site](comandos/index.md#resumo) e a do README); um comando novo
também entra no `nav` do `mkdocs.yml`, em ordem alfabética.

## Nova versão

Uma execução do `./bump.sh` **fecha** a versão atual (a do `package.json`) e
**abre** a próxima:

```
... commits da X.Y ── Release X.Y (tag release-X.Y) ── Bump para X.Z ── commits da X.Z ...
```

1. **Release X.Y** (pula se a tag `release-X.Y` já existe): a versão estável do
   README e da instalação (o `release-X.Y` sem `/` antes: `hoje a release-…`,
   `git checkout release-…`) passa para a atual, com a data de hoje ao lado em
   `release-X.Y (de DD/MM/AAAA)`. Os exemplos de saída perdem o rótulo
   `(devel)`: `X.Y (devel) (git+<commit>/HEAD)` vira `X.Y (git+<commit>/release-X.Y)`.
   Commit `Release X.Y`, com a tag anotada `release-X.Y` nele.
2. **Bump para X.Z** (X.Y+1, ou a versão informada: `./bump.sh 3.0`): o
   `package.json` e o `package-lock.json` passam para a nova, e os exemplos
   voltam a ser da versão em desenvolvimento, com o rótulo: `X.Y (git+…/release-X.Y)`
   vira `X.Z (devel) (git+…/HEAD)` e `ZapBot X.Y` vira `ZapBot X.Z (devel)`. A
   versão estável continua a release que acabou de sair. Commit `Bump para X.Z`,
   sem tag.
3. Grava as refs no `.git/packed-refs` (`git pack-refs --all`), para a imagem
   Docker saber o commit da tag (o [`/version`](comandos/version.md) mostra
   `(git+<commit>/<tag>)`).

O bot mostra o mesmo rótulo sozinho: fora de uma tag `release-*`, a versão vem
como `X.Y (devel)` no `/version`, no `/bot -info`, no boot e nos e-mails.

Precisa do working tree limpo e não faz push. A troca fica **só** no README e
no `docs/`, e pula as linhas que citam o próprio `bump.sh` (os exemplos abaixo).
As que explicam o formato usam `X.Y`, que o `bump.sh` não troca. No código e
nos testes, o mesmo número pode ser outra coisa, como a versão da API do NVD ou
do JSON-RPC da Solana: os testes conferem as duas.

```bash
./bump.sh -n        # dry-run: mostra o que seria alterado nos dois passos
./bump.sh           # Release X.Y (com a tag) + Bump para X.Y+1
./bump.sh 3.0       # Release X.Y (com a tag) + Bump para 3.0
git push && git push origin release-X.Y   # o push da tag publica o site
```

O push da tag dispara o workflow da [documentação](#documentação), que publica
o site da release em alguns minutos (acompanhe em **Actions › Documentação**).
As notas ficam na release do GitHub (`gh release create release-X.Y`), com o
que mudou desde a anterior (`git log release-X.W..release-X.Y`).

## Adicionando ou alterando comandos

Os comandos são definidos em `src/comandos/comandos.json`, ao lado dos
handlers. O arquivo tem uma chave `_about` (metadados do projeto, ignorada pelo
bot) e a lista `commands`. Cada entrada de `commands` segue este formato:

```jsonc
{
  "cmd": "/get",                     // nome principal
  "usage": "/get [OPTION]... <url>", // linha "Usage:" no -help (outras formas: "  ou  ", uma por linha)
  "aliases": ["/download"],          // nomes alternativos
  "help": "Baixa vídeo ou áudio...", // descrição curta
  "cmd_opts": [
    { "opts": ["audio", "a"], "values": [], "desc": "..." },          // flag
    { "opts": ["startSec", "ss"], "values": ["<segundo>"], "desc": "..." }, // opção com valor
    { "argv": ["<url>"], "desc": "..." },                             // argumento posicional (só doc)
    { "opts": ["add"], "values": ["<x>"], "desc": "...", "cron": false } // opcional; não roda num {/comando} do /cron
  ],
  "cron": true,                      // opcional; true = roda num {/comando} do texto do /cron
  "onlyAdmin": false,                // true = só a conta do bot pode usar
  "disabled": false                  // opcional; true = o bot ignora o comando
}
```

- `"cron": true` deixa o comando rodar dentro do texto do
  [`/cron`](comandos/cron.md#comandos-no-texto) (`{/crypto}`), na hora do envio.
  Só para comandos de consulta, que respondem com `msg.reply` (o texto entra no
  lugar e as mídias saem depois). Uma opção que muda algo (`-add`, `-alerta`...)
  leva `"cron": false` e é recusada ao criar o item.
- Alterar `help`, `usage`, `aliases`, descrições, `onlyAdmin` ou `disabled`
  não exige código: basta refazer o build e recriar o container.
- No `-h`, cada forma do `usage` separada por `"  ou  "` sai numa linha, e os
  exemplos de um `desc` depois do `Ex:`, separados por vírgula
  (`Ex: /defi -s, /defi -s 2`), saem um por linha, à esquerda (no celular, a
  coluna da descrição fica longe). Cada exemplo começa com `/` ou `-`; uma vírgula dentro de um exemplo
  (`/tempo Niteroi, Sergipe`) não o divide.
- Os textos (`usage`, `help` e `desc`) podem citar `${CACHE_DIR}`,
  `${MEDIA_DIR}` e `${TMP_DIR}`: a ajuda troca pelo caminho real (ex.: o
  `/cache -h`).
- Com `"disabled": true` o comando não é carregado: o bot não responde a ele
  nem aos aliases, e ele some do `/help`. No boot aparece nos logs
  `Disabled N callers (...)`. Para desativar sem rebuild, use o setting
  `commands.disabled` (`/set commands.disabled noffa`).
- Um comando **novo** precisa de um arquivo em `src/comandos/` e de uma
  entrada no objeto `HANDLERS` de `src/comandos/index.js`. No boot, o bot avisa
  nos logs se existir comando no JSON sem handler. Comandos, handlers, a
  tabela [Resumo](comandos/index.md#resumo) e as páginas de `docs/comandos/` ficam em **ordem
  alfabética** (o menu do `mkdocs.yml` também).
