# `/alias` · admin

Salva atalhos para comandos com argumentos no banco do bot. O dono e os admins cadastram e
removem aliases. Quem executa um atalho precisa ter permissão para o comando de destino.

```text
/alias <nome> [-desc|-d "Descrição"] </comando argumentos>
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
