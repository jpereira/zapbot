# `/alias` · admin

Salva atalhos no banco do bot: para um comando com argumentos ou para um texto com vários
`{/comando}`, como no [`/cron`](cron.md#comandos-no-texto). O dono e os admins cadastram e removem
aliases. Quem executa um atalho precisa ter permissão para os comandos de destino.

```text
/alias <nome> [-desc|-d "Descrição"] </comando argumentos>
/alias <nome> [-desc|-d "Descrição"] <texto com {/comando}>
/alias
/alias [-list|-l]
/alias [-rm|-rem] <nome|all>
```

| Opção | Valor | Descrição |
|---|---|---|
| `-desc`, `-d` | `<texto>` | Descrição opcional entre aspas, antes do comando de destino |
| `-list`, `-l` | | Lista os aliases; o mesmo que `/alias` sem argumentos |
| `-rem`, `-rm` | `<nome ou all>` | Remove o alias, com ou sem `/`; `all` remove todos |

```text
/alias /eita -desc "Meu teste para dólar" /cotacao USD
/alias /nome /crypto USD
/alias /eita2 /cotacao EUR
/alias eita3 /cotacao USDT
/alias dimdim -desc “Exibe Dinheiro" /cotacao
/alias -l
/eita
/eita2
/help alias
/alias -rm /eita
/alias -rem eita2
/alias -rm all
```

O nome aceita letras, números, `_` e `-`, com ou sem a barra no cadastro e na remoção. Para
executar, use a barra: `/eita`. Cadastrar novamente o mesmo nome substitui seu comando e sua
descrição. Sem `-desc`, a descrição fica vazia. A descrição aceita aspas retas ou curvas,
inclusive misturadas, como `-desc “Exibe Dinheiro"`.

O destino deve ser um comando ativo do bot, inclusive seus aliases fixos, como `/st`. Não pode
ser `/alias` nem outro atalho cadastrado. Nomes de comandos do bot são reservados, mesmo quando
estão desativados. O nome `all` também é reservado e não pode ser cadastrado. Argumentos, aspas
e opções do destino são preservados.

Argumentos digitados ao executar são acrescentados ao final do comando salvo:

```text
/alias /dolar /cotacao USD
/dolar -h                    → ajuda do /cotacao
```

As permissões, o controle de repetição e a desativação de comandos são os do comando de destino.
O `/help alias` lista os atalhos que você pode executar, com a descrição e o comando salvo.
O `/alias -h` ou `/alias -help` mostra a ajuda de cadastro. O `/alias` sem argumentos ou com
`-list`/`-l` lista todos os atalhos cadastrados, inclusive os de comandos desativados.

Antes de executar um alias, o bot imprime o nome do atalho e o comando que será chamado,
incluindo os argumentos adicionais. Por exemplo:

```text
/alias /dimdim -desc "Exibe o preço do dólar" /cotacao USD
/dimdim
```

O bot responde com o aviso abaixo e depois com o resultado de `/cotacao USD`:

```text
🔗 Alias /dimdim -> /cotacao USD
```

## Texto com comandos

Quando o que vem depois do nome (e da descrição) não começa com `/`, o alias guarda um texto. Cada
`{/comando args}` dele roda na hora em que o alias é chamado, e a resposta entra no lugar, como nos
[comandos no texto do `/cron`](cron.md#comandos-no-texto). Sai uma mensagem só, com todas as
respostas. Um `\n` digitado vira uma quebra de linha, e os espaços em volta dele são removidos.

```text
/alias nome2 Verificando Orca {/defi orca}\n Verificando Prjx {/defi prjx}
/alias bomdia -d "Resumo da manhã" Bom dia! ☀️ {/tempo Recife}\nCâmbio: {/cotacao USD EUR}\nCripto: {/crypto BTC ETH}
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
  pessoa não puder usar algum deles, o alias inteiro não roda: um comando só do dono, como o
  `/defi`, faz o alias ser ignorado em silêncio, e um comando fora da regra dela (`/bot -cmd`) mostra
  o aviso do limite. O `/help alias` só lista os aliases em que ela pode usar todos os comandos.
- Rodam os mesmos comandos de consulta do `/cron` (`/cotacao`, `/crypto`, `/cve`, `/defi`,
  `/tempo`...), sem as opções que mudam algo, como o `-add` do `/crypto`. Eles são conferidos no
  cadastro: um que não existe ou que não roda no texto dá erro na hora.
- Uma resposta de várias linhas vira um parágrafo, com uma linha em branco antes e depois; uma de
  uma linha só fica na frase. Mídias (`/meme`, `/giphy`) saem depois do texto.
- Argumentos digitados ao chamar um alias de texto são ignorados.
- O texto precisa de pelo menos um `{/comando}`; sem nenhum, o cadastro é recusado.
