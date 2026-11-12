# `/ascii`

O texto em letras grandes de ASCII, num bloco de código (monoespaçado no WhatsApp). As letras têm 3
colunas de largura e 5 linhas de altura, e o texto quebra em várias linhas de letras para caber na
tela do celular: 30 colunas por padrão.

```text
/ascii [-width|-w <colunas>] [-char|-c <caractere>] <texto>
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `<texto>` | Até 40 caracteres (`\n` quebra a linha): letras (sem acento), números e `! ? . , : - + _ /`. Maiúsculas e minúsculas saem iguais; o que não tem desenho é ignorado. Sem texto, usa o da mensagem respondida |
| `-width`, `-w` | `<colunas>` | Colunas por linha de letras, de 10 a 60 (padrão 30) |
| `-char`, `-c` | `<caractere>` | O caractere do traço das letras (padrão: setting `ascii.defaultChar`, `#`) |

```text
/ascii Jorge!
/ascii -w 20 Feliz aniversario
/ascii -c @ Oi
/ascii Jorge\nPereira
```

```text
/ascii Jorge!
```

```text
  # ### ##   ## ### #
  # # # # # #   #   #
  # # # ##  # # ##  #
# # # # # # # # #
 #  ### # #  ## ### #
```

Textos longos quebram em várias linhas de letras, separadas por uma linha em branco:

```text
/ascii Feliz aniversario
```

```text
### ### #   ### ###     #  ##
#   #   #    #    #    # # # #
##  ##  #    #   #     ### # #
#   #   #    #  #      # # # #
#   ### ### ### ###    # # # #

### # # ### ##   ##  #  ##
 #  # # #   # # #   # # # #
 #  # # ##  ##   #  ### ##
 #  # # #   # #   # # # # #
###  #  ### # # ##  # # # #

### ###
 #  # #
 #  # #
 #  # #
### ###
```

Erros: sem texto (e sem mensagem respondida) mostra o uso; mais de 40 caracteres, `-width` fora de
10 a 60 e `-char` com mais de um caractere são recusados; um texto sem nada desenhável (ex.: `#$%`)
responde `❌ Nada para desenhar`.

Não depende de serviço externo e pode ser usado dentro de um [`/alias`](alias.md) ou do
[`/cron`](cron.md) com `{/ascii Oi}`. Dentro deles as opções `-width` e `-char` não são aceitas:
use o setting `ascii.defaultChar`.
