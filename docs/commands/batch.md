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

Aqui são dois blocos: a URL de cima é do primeiro `/ideia` e a de baixo, do segundo. O `/ideia`
é um alias, por exemplo `/alias /ideia /notes #ideias $1`.

A resposta é um resumo só:

```text
📦 BATCH · 2/2 ok

✅ 1 · /ideia Preciso ver sobre isso http://minha.com/?124
   ↳ 📝 #77 · #ideias · Preciso ver sobre isso http://minha.com/?124
✅ 2 · /ideia Quando puder ler o link sobre isso. http://g1.com/labala
   ↳ 📝 #78 · #ideias · Quando puder ler o link sobre isso. http://g1.com/labala
```

Com `-dry`, nada roda; ele só mostra como separou:

```text
/batch -dry
📦 BATCH (2) · só a separação, nada executado

1. /ideia Preciso ver sobre isso (+2 linhas)
2. /ideia Quando puder ler o link sobre isso. (+1 linhas)
```

- Cada bloco passa pelo mesmo caminho de uma mensagem normal (alias, `$1`, opções). Quem tem
  `$1` no alias junta o texto numa linha só, como já faz fora do `/batch`.
- Sai uma resposta só: `✅`/`❌` por bloco, com o começo do que o comando respondeu.
- Um bloco falha quando a resposta do comando começa com ❌ ou ⚠️, ou quando ele dá erro. Os outros
  seguem, a menos que você use `-stop`: ele para no primeiro e avisa quantos não rodaram.
- Cada bloco leva só o texto dele: uma mídia ou a mensagem respondida do `/batch` não passam para os
  comandos de dentro.
- Máximo de 50 blocos; `/batch` dentro de `/batch` é recusado.
