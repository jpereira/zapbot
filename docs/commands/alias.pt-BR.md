# `/alias` · admin

Salva atalhos no banco do bot: para um comando com argumentos ou para um texto com vários
`{/comando}`, como no [`/cron`](cron.md#comandos-no-texto). O dono e os admins cadastram e removem
aliases. Quem executa um atalho precisa ter permissão para os comandos de destino.

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
| `-desc`, `-d` | `<texto>` | Descrição opcional entre aspas, antes do comando ou do texto; sem comando, atualiza só a descrição de um alias existente |
| `-list`, `-l` | | Lista os aliases; o mesmo que `/alias` sem argumentos. Só com um nome (`/alias /eita`), mostra o que aquele alias faz (descrição e comando); se o nome não for um alias, o bot responde com um erro |
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
