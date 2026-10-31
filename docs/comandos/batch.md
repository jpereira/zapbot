# `/batch` · admin

Executa vários comandos de uma mensagem só, um depois do outro, e responde um resumo. Serve para
mandar de uma vez o que você mandaria em vários blocos (ex.: várias anotações pelo seu
[alias](alias.md)). Também funciona respondendo uma mensagem com os comandos.

```text
/batch [-stop] [-dry]
<comandos, nas linhas de baixo>
```

| Opção | Valor | Descrição |
|---|---|---|
| `-stop` | | Para no primeiro bloco que falhar (o padrão é seguir com os outros) |
| `-dry` | | Só mostra como os blocos foram separados, sem executar |

## Como separa os blocos

Uma linha que começa com um comando (ou alias) abre um bloco. O que vem depois, linhas em branco
inclusas, é do mesmo bloco. Uma linha com `/` que não é comando nem alias (ex.: `/etc/hosts`)
continua sendo texto do bloco, e o que vier antes do primeiro comando é ignorado (com um aviso).

```text
/batch
/ideia Preciso ver sobre isso

http://minha.com/?124

/ideia Quando puder ler o link sobre isso.
http://g1.com/labala
```

Aqui são dois blocos: a URL de cima é do primeiro `/ideia` e a de baixo, do segundo.

- Cada bloco passa pelo mesmo caminho de uma mensagem normal (alias, `$1`, opções). Quem tem
  `$1` no alias junta o texto numa linha só, como já faz fora do `/batch`.
- Sai uma resposta só: `✅`/`❌` por bloco, com o começo do que o comando respondeu.
- Máximo de 50 blocos; `/batch` dentro de `/batch` é recusado.
