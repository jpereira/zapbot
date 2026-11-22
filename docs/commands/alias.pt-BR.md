# `/alias` · admin

Salva atalhos no banco do bot: para um comando com argumentos ou para um texto com vários
`{/comando}`, como no [`/cron`](cron.md#comandos-no-texto). O dono e os admins cadastram e removem
aliases. Quem executa um atalho precisa ter permissão para os comandos de destino. Um usuário (`+u`) vê os atalhos que
levam a comandos que ele pode usar no fim do seu [`/help`](help.md) (o comando para o qual leva e o `-desc`), então
escreva um bom `-desc`.

```text
/alias <nome> [-quiet|-q] [-desc|-d "Descrição"] </comando argumentos>
/alias <nome> [-quiet|-q] [-desc|-d "Descrição"] <texto com {/comando}>
/alias
/alias [-list|-l]
/alias <nome>
/alias -move|-m <nome atual> <novo nome>
/alias -rm <nome...|all>
```

| Opção | Valor | Descrição |
|---|---|---|
| `-quiet`, `-q` | | Ao executar, omite o cabeçalho `🔗 Alias ...`; vale antes ou depois do nome |
| `-private`, `-p` | | Torna o alias privado: só o dono o vê e o executa (fora das listas, fora do [`/help`](help.md), e para os outros ele não existe). Sem um comando, altera o alias que existe (`/alias -p /end.froes`). Veja [Aliases privados](#aliases-privados) |
| `-public`, `-pub` | | Tira o cadeado de um alias privado (`/alias -public /end.froes`) |
| `-desc`, `-d` | `<texto>` | Descrição opcional entre aspas, antes do comando ou do texto; sem comando, atualiza só a descrição de um alias existente |
| `-list`, `-l` | | Lista os aliases; o mesmo que `/alias` sem argumentos. Só com um nome (`/alias /eita`), mostra o que aquele alias faz (descrição e comando); se o nome não for um alias, lista os que têm aquele texto no nome (`/alias dol` acha `/dolar`, `/dolar2` e `/meu.dol`; até 10), ou um erro se nenhum casar |
| `-examples`, `-ex` | `[<arquivo>]` | Sem nome, lista os arquivos de exemplos (`examples/*.zb`: aliases prontos para usar). Com um nome, carrega aquele arquivo; um alias que já existe fica como está, a menos que use `-yes` (`-y`): aí a definição do arquivo troca a dele (para aplicar uma versão mais nova de um exemplo) |
| `-move`, `-m` | `<nome atual> <novo nome>` | Renomeia um alias, mantendo comando, descrição e quiet; o novo nome não pode existir |
| `-rm` | `<nome...\|all>` | Remove um ou mais aliases (separados por espaço ou vírgula), com ou sem `/`; `all` remove todos |

```text
/alias /eita -d "Meu teste para dólar" /stocks USD
/alias /nome /crypto USD
/alias /eita2 /stocks EUR
/alias eita3 /stocks USDT
/alias dimdim -d “Exibe Dinheiro" /stocks
/alias -l
/alias /eita
/eita
/eita2
/help alias
/alias -m /eita /eita3
/alias /eita -d "Novo texto"
/alias -rm /eita
/alias -rm eita2
/alias -rm eita eita2 /dolar
/alias -rm all
```

A lista (`/alias -l`) mostra cada atalho com a descrição (📝), o comando que ele roda (→) e, com 🔇, os que
rodam sem o cabeçalho `🔗 Alias ...` (`-q`):

```text
🔗 *ALIASES* (4)

*/bitcoin* 🔇
→ /crypto BTC

*/dolar*
📝 Preço do dólar
→ /stocks USD

*/endereco* 🔇
📝 Meu endereço
→ /me
   Rua das Flores, 123
   Centro, Rio de Janeiro - RJ

*/vai* 🔇
→ /ascii -c # VAMOS!

💡 *Dicas*
/alias <nome> </comando args> cria
/alias -rm <nome...> remove
🔇 = sem o cabeçalho ao executar
```

O começo do nome de um alias salvo também completa (`/dol` roda o `/dolar`, se for o único;
com vários, o bot lista).

O nome aceita letras, números, `_`, `-` e `.` (`/alias meu.comando /me Olá`), com ou sem a barra no cadastro e na remoção. Para
executar, use a barra: `/eita`. Cadastrar novamente o mesmo nome substitui seu comando e sua
descrição. Sem `-desc`, a descrição fica vazia. A descrição aceita aspas retas ou curvas,
inclusive misturadas, como `-desc “Exibe Dinheiro"`.

No alias de comando, o destino deve ser um comando ativo do bot, inclusive seus aliases fixos. Não pode ser `/alias` nem outro atalho
cadastrado. Nomes de comandos do bot são reservados, mesmo quando estão desativados. O nome `all` também é reservado e não pode ser cadastrado. Argumentos, aspas
e opções do destino são preservados.

Argumentos digitados ao executar são acrescentados ao final do comando salvo:

```text
/alias /dolar /stocks USD
/dolar -h                    → ajuda do /stocks
```

### Parâmetros `$1`, `$N`

No alias de comando, `$1`, `$2`... pegam os argumentos digitados ao executar, na ordem. Os usados
saem da lista; os que sobram continuam indo para o fim do comando. Um `$N` sem argumento fica vazio,
a não ser que tenha um valor padrão: `${N:-valor}`.

```text
/alias /rec /sticker -ss $1 -es $2
/rec 10 20 http://minhaurl/foo   → /sticker -ss 10 -es 20 http://minhaurl/foo

/alias /dolar /stocks ${1:-USD}
/dolar                           → /stocks USD
/dolar EUR                       → /stocks EUR

/alias nopt /forward ${1:--l} #nopt
/nopt                            → /forward -l #nopt
/nopt -dry                       → /forward -dry #nopt
```

O `$@` (ou `$*`) são **todos** os argumentos digitados, em cada lugar onde aparece, e nada sobra para o fim:
é o certo para um atalho de [`/batch`](batch.md), onde cada linha precisa do texto inteiro. O `${@:-padrão}` é o
padrão quando nada é digitado.

```text
/alias /vfazol /batch -q
  /tts -q -l -v cadu $@
  /tts -q -l -v faber $@
/vfazol FAZ O L!           → as duas vozes falam "FAZ O L!"
```

O padrão vem depois do `:-`, então um padrão que ele mesmo começa com `-` leva dois hifens: `${1:--l}`. O
teclado do celular troca `--` por `—` (travessão): o bot entende `${1:—l}` como `${1:--l}` e salva já
corrigido.

Com `$N`, o que sobra dos argumentos vai para o fim do comando separado por um espaço, então as
quebras de linha do texto viram espaço. Sem `$N`, o texto vai como foi digitado, quebras de linha
inclusas. Para executar vários atalhos de uma vez, veja o [`/batch`](batch.md).

As permissões, o controle de repetição e a desativação de comandos são os do comando de destino.
Quem pode usar o `/gpt` (ex.: `/bot +u +cmd /gpt`) usa também todo atalho para ele, sem liberar o
atalho à parte; o `/bot +cmd` não aceita o nome de um atalho, só de comandos. Num atalho de texto,
a pessoa precisa poder todos os `{/comando}`.
O `/help alias` lista os atalhos que você pode executar, com a descrição e o comando salvo.
O `/alias -h` ou `/alias -help` mostra a ajuda de cadastro. O `/alias` sem argumentos ou com
`-list`/`-l` lista todos os atalhos cadastrados, inclusive os de comandos desativados.

Antes de executar um alias, o bot imprime o nome do atalho e o comando que será chamado,
incluindo os argumentos adicionais. Por exemplo:

```text
/alias /dimdim -d "Exibe o preço do dólar" /stocks USD
/dimdim
```

O bot responde com o aviso abaixo e depois com o resultado de `/stocks USD`:

```text
🔗 Alias /dimdim -> /stocks USD
```

Com `-quiet` (ou `-q`), o cabeçalho não é impresso e só o resultado aparece:

```text
/alias -q /haha /me Hahahahahahhahahaha vc e burro!
/haha  → Hahahahahahhahahaha vc e burro!
```

## Um atalho para encaminhar

Um alias do `/forward` transforma "mande isso para os meus amigos" num reply só: `/alias -q nopt /forward -q #nopt` e,
daí em diante, `/nopt` respondendo uma mensagem (ou `/nopt Olha isso!`, com um texto seu) manda para todos da lista
`#nopt`, sem cabeçalho e sem status. O passo a passo todo está em
[Um atalho para um grupo de amigos](forward.md#um-atalho-para-um-grupo-de-amigos).

```text
/forward -add #nopt /Fulano/ /Lourival Neto/ /Grupo Faculdade/
/alias -q nopt /forward -q #nopt
(respondendo algo interessante)  /nopt Olha isso!
```

## Atalhos para cotações

As cotações ([`/crypto`](crypto.md) e [`/stocks`](stocks.md)) são os comandos que você mais chama, então viram bons
atalhos: uma palavra no lugar de `/crypto BTC`. Com `-q`, só a cotação aparece, sem o cabeçalho `🔗 Alias ...`:

```text
/alias -q /btc /crypto BTC
/alias -q /eth /crypto ETH
/alias -q /sol /crypto SOL            (o mesmo para /solana: um alias para cada nome que você gostar)
/alias -q /xaut /crypto XAUT          → o ouro (o token Tether Gold)
/alias -q /mstr /stocks MSTR
/alias -q /dolar /stocks USD
/alias -q /euro /stocks EUR
/alias -q /usdt /stocks USDT
```

Depois disso, `/btc`, `/xaut`, `/mstr`, `/dolar`... respondem direto com a cotação. Mais duas ideias:

- **Vários de uma vez:** `/alias -q /cripto /crypto BTC ETH SOL XAUT` e `/alias -q /mercado /stocks USD EUR MSTR` trazem o
  grupo todo numa mensagem só.
- **Cotação falada:** com `-tts` a resposta vem em um áudio (veja o [`/tts`](tts.md#comandos-no-texto)):
  `/alias -q /horadobtc /crypto -tts BTC` e o `/horadobtc` fala "BTC $90,123.45". Vale igual para
  `/stocks -tts USD`, `/weather -tts` e `/uptime -tts`.
- **Um alias para qualquer moeda ou ticker**, com o [parâmetro](#parâmetros-1-n) `${1:-...}`:

```text
/alias -q /moeda /crypto ${1:-BTC}
/moeda                 → /crypto BTC
/moeda eth             → /crypto ETH
/moeda xaut            → /crypto XAUT

/alias -q /cot /stocks ${1:-MSTR}
/cot                   → /stocks MSTR
/cot nvda              → /stocks NVDA
/cot PETR4.SA          → /stocks PETR4.SA
```

## Um comando longo, em várias linhas

Um `/alias` com um `-desc` longo fica mais fácil de digitar em duas linhas. Em **qualquer mensagem de comando** (ela
precisa começar com `/`), um `\` no fim da linha junta ela com a próxima, com um espaço só (o recuo da linha seguinte some),
como nos [arquivos `.zb`](#arquivos-de-exemplos-zb):

```text
/alias -q -p /stash.view -desc "Libera a tag protegida #stash e mostra as notas" \
    /notes -v -lock $1 #stash
```

é o mesmo que `/alias -q -p /stash.view -desc "..." /notes -v -lock $1 #stash`. Um `\n` que você digita (uma barra invertida e um
`n` no meio da linha) continua sendo a quebra de linha de um [alias de texto](#texto-com-comandos), e um texto que não
começa com `/` mantém o `\`.

## Arquivos de exemplos (`.zb`)

O bot traz arquivos `.zb` na pasta `examples/`: os comandos que você digitaria aqui, guardados num
arquivo. Cada arquivo é carregado **uma vez só**, no primeiro boot depois que ele aparece (o setting
`alias.examples` guarda quais já foram, então um alias que você apagou não volta). Para carregar um na mão,
ou ver quais existem: `/alias -examples` e `/alias -examples tts-voices`. Um alias que já existe nunca é
sobrescrito na carga do primeiro boot; na mão, `/alias -examples tts-voices -yes` troca os que existem pelos do arquivo
(use quando vier uma versão mais nova de um exemplo).

```text
# um comentário: uma linha que começa com #

/alias /dolar -d "Cotação de moeda, USD por padrão" \
    /stocks ${1:-USD}

/alias /test.tts.vozes /batch -q
    /tts -q -l -v cadu $@
    /tts -q -l -v faber $@
```

- Um comando começa numa linha sem recuo que começa com `/`; as linhas com recuo embaixo dele fazem parte
  dele (como digitadas, igual às linhas de um atalho de [`/batch`](batch.md)).
- Um `\` no fim da linha junta ela com a próxima (com um espaço só).
- Uma linha que começa com `#` é comentário; para começar uma linha com um `#` de verdade, escreva `\#`.
- Só roda a forma `/alias [-q] <nome> [-desc "texto"] <comando>`, então um arquivo só consegue **definir** atalhos: `-rm`, `-move`, `-list`
  e parecidos são recusados, e qualquer outro comando também. Um arquivo é limitado a 128 KB e 200 aliases, e link simbólico não é lido.
  Mesmo assim, um `.zb` é código de confiança (ele cria atalhos que qualquer pessoa autorizada pode rodar): leia um arquivo antes de colocá-lo em `examples/`.
- Só rodam blocos `/alias`, então um arquivo só consegue definir atalhos. Os que vêm estão em
  [Atalhos prontos](#atalhos-prontos-examples).

## Atalhos prontos (`examples/`)

Os arquivos `.zb` que acompanham o bot estão na pasta [`examples/`](https://github.com/jpereira/zapbot/tree/main/examples) do GitHub:

| Arquivo | O que tem | Carga |
|---|---|---|
| [`tts-voices.zb`](https://github.com/jpereira/zapbot/blob/main/examples/tts-voices.zb) | `/test.tts.voices` e `/test.tts.vozes`: uma frase em todas as vozes locais, uma nota de voz cada | no primeiro boot |
| [`shortcuts.zb`](https://github.com/jpereira/zapbot/blob/main/examples/shortcuts.zb) | `/dollar` (cotação de moeda) e `/idea` (nota com `#ideas`) | no primeiro boot |
| [`secret-notes.zb`](https://github.com/jpereira/zapbot/blob/main/examples/secret-notes.zb) | `/stash.add`, `/stash.view` e `/stash.lock`: uma tag protegida (cifrada) `#stash` em uma palavra cada, com os cenários de privacidade no `-desc` (veja [tags protegidas](notes.md#tags-protegidas--lock)) | só à mão: `/alias -examples secret-notes` |
| [`my-shortcuts.zb`](https://github.com/jpereira/zapbot/blob/main/examples/my-shortcuts.zb) | Os atalhos do autor, abaixo (os endereços e os contatos foram trocados por exemplos) | só na mão: `/alias -examples my-shortcuts` |

Um arquivo com `# @manual` nas primeiras linhas não carrega no boot, só com `/alias -examples <nome>`.

### Os atalhos do autor (`my-shortcuts.zb`)

A maioria usa `-q` (sem o cabeçalho "🔗 Alias"). Pegue o arquivo inteiro com `/alias -examples my-shortcuts` ou copie só as linhas de que gostar.

**Cotações (cripto, ações, DeFi)**

| Atalho | Executa |
|---|---|
| `/bitcoio` | `/crypto BTC` |
| `/btc` | `/crypto BTC` |
| `/creptomoeda` | `/crypto` |
| `/dolar` | `/stocks USD` |
| `/eth` | `/crypto ETH` |
| `/euro` | `/stocks EUR` |
| `/gold` | `/crypto XAUT` |
| `/hype` | `/crypto HYPE` |
| `/mkt` | `/stocks ${1:-MSTR}` |
| `/mstr` | `/stocks MSTR` |
| `/sol` | `/crypto SOL` |
| `/solana` | `/crypto SOL` |
| `/taxas` | `/defi -fees` |
| `/usdt` | `/stocks USDT` |
| `/xaut` | `/crypto XAUT` |

**Letreiros com `/ascii`**

| Atalho | Executa |
|---|---|
| `/arrombado` | `/ascii -w 60 -c # ARROMBADO!` |
| `/bora` | `/ascii -c # BORA!` |
| `/fazol` | `/ascii  FAZ O L!` |
| `/fazolp` | `/ascii -c # FAZ O L\nPORRA!` |
| `/fodase` | `/ascii -c # FODA-SE!` |
| `/fuck` | `/ascii -w 60 FUCK\nTHE\nPRIVACY!` |
| `/fuckyou` | `/ascii -w 60 -c # FUCK YOU!` |
| `/partiu` | `/ascii -c # PARTIU!` |
| `/recua` | `/ascii RECUA  - FACISTE!` |
| `/viado` | `/ascii -c # VIADO` |

**Traduções**

| Atalho | Executa |
|---|---|
| `/en` | `/translate -p en $1` |
| `/toen` | `/translate -p en` |
| `/toes` | `/translate -p es` |
| `/topt` | `/translate -p pt` |
| `/txt2en` | `/translate -p en` |
| `/txt2es` | `/translate -p es` |
| `/txt2pt` | `/translate -p pt` |

**Notas**

| Atalho | Executa |
|---|---|
| `/ideias` | `/notes #ideias` |
| `/n` | `/notes` |
| `/pt` | `/notes #pt $1` |

**Voz (`/tts` e `/gpt -voice`)**

| Atalho | Executa |
|---|---|
| `/gptvoz` | `/gpt -voice` |
| `/tovoz` | `/gpt -voice` |
| `/tuga` | `/tts -q -l -v tugão $@` |
| `/tuga.btc` | `/tts -q -sp 75 -l -v tugão $@ {/crypto -q BTC}` |
| `/vf` | `/batch -q` + `/tts -q -l -v $@` com as vozes tugão, cadu, edresson, faber |
| `/vfazol` | `/batch -q` + `/tts -q -l -v $@` com as vozes cadu, edresson, faber |

**Debug (`/debug`)**

| Shortcut | Runs |
|---|---|
| `/dbg.off` | `/debug -off` |
| `/dbg.on` | `/debug -on -level 1` |
| `/dbg.on2` | `/debug -on -level 2` |
| `/dbg.on3` | `/debug -on -level 3` |

**Envio (`/me`, `/forward`) e outros**

| Atalho | Executa |
|---|---|
| `/end.home` | `/me` + o texto do endereço |
| `/end.work` | `/me` + o texto do endereço |
| `/flood` | `/me  -r 30 $1` |
| `/funny` | `/forward -q /Contact 1/ /Contact 2/ /Contact 3/` |
| `/gptusage` | `/gpt -usage` |
| `/haha` | `/me -r 15 AHHAhaₕₐₐₕahAHHAhaₕₐₐₕah` |
| `/nopt` | `/forward -q #nopt` |
| `/nopt.add` | `/forward -add #nopt` |
| `/rec` | `/sticker -ss $1` |
| `/sts` | `/sticker -ss` |

## Aliases privados

O `-private` (`-p`) faz de um alias **do dono**: só você o vê e o executa. Para qualquer outra pessoa ele **não existe**:
não está no `/alias`, nem no `/help alias`, nem no fim do [`/help`](help.md) do usuário, o bot responde como para um comando
que não existe, e ele não pode ser chamado dentro do `{/comando}` de um texto, de um `/cron` ou de um `/batch` de outra
pessoa. Um admin extra (`+a`) também não o vê e não consegue sobrescrever, renomear nem remover (o nome está ocupado).

```text
/alias -q -p /meu /me só eu vejo isso     → cria um alias privado (vale com o -q, em qualquer ordem)
/alias -p /end.froes                      → torna privado o que já existe
/alias -public /end.froes                 → tira o cadeado (quem pode rodar o destino volta a vê-lo)
/alias /end.froes                         → mostra, com 🔒
```

Um exemplo pronto com aliases privados é o [`examples/secret-notes.zb`](https://github.com/jpereira/zapbot/blob/main/examples/secret-notes.zb)
(`/stash.add`, `/stash.view` e `/stash.lock`, todos `-q -p`). Só o dono usa o `-p` e o `-public`. Num arquivo `.zb` ([exemplos](#arquivos-de-exemplos-zb)) a linha
`/alias -q -p /meu /me só eu vejo isso` também carrega um alias privado. Um atalho que leva a um comando que o usuário
pode usar aparece no `/help` dele; marque os pessoais (a sua voz, os seus contatos) com `-p`.

## Texto com comandos

Quando o que vem depois do nome (e da descrição) não começa com `/`, o alias guarda um texto. Cada
`{/comando args}` dele roda na hora em que o alias é chamado, e a resposta entra no lugar, como nos
[comandos no texto do `/cron`](cron.md#comandos-no-texto). Sai uma mensagem só, com todas as
respostas. Um `\n` digitado vira uma quebra de linha, e os espaços em volta dele são removidos.

```text
/alias nome2 Verificando Orca {/defi orca}\n Verificando Prjx {/defi prjx}
/alias bomdia -d "Resumo da manhã" Bom dia! ☀️ {/weather Recife}\nCâmbio: {/stocks USD EUR}\nCripto: {/crypto BTC ETH}
/alias carteira {/defi orca}\n{/defi prjx}\n{/defi morpho}\n{/defi aave}
/alias risco CVEs críticas: {/cve -highscore}
```

O `/nome2` roda o `/defi orca` e o `/defi prjx` e responde:

```text
🔗 Alias /nome2 -> /defi orca, /defi prjx
```

```text
Verificando Orca

🌊 Orca · SOL/cbBTC · taxa 0.16%
   ...

Verificando Prjx

🌊 Project X · UBTC/USD₮0 · taxa 0.05%
   ...
```

- Os comandos rodam no chat em que o alias foi chamado, com as permissões de quem chamou. Se a
  pessoa não puder usar algum deles, o alias inteiro não roda: um comando acima do nível dela, como o
  `/defi`, faz o alias ser ignorado em silêncio, e um comando fora da regra dela (`/bot -cmd`) mostra
  o aviso do limite. O `/help alias` só lista os aliases em que ela pode usar todos os comandos.
- Rodam os mesmos comandos de consulta do `/cron` (`/stocks`, `/crypto`, `/cve`, `/defi`,
  `/weather`...), sem as opções que mudam algo, como o `-add` do `/crypto`. Eles são conferidos no
  cadastro: um que não existe ou que não roda no texto dá erro na hora.
- Uma resposta de várias linhas vira um parágrafo, com uma linha em branco antes e depois; uma de
  uma linha só fica na frase. Mídias (`/meme`, `/giphy`) saem depois do texto.
- Argumentos digitados ao chamar um alias de texto são ignorados.
- O texto precisa de pelo menos um `{/comando}`; sem nenhum, o cadastro é recusado.
- O `{/comando}` pode ser outro alias de comando (com `$N`), mas não um alias de texto.
