# `/ascii`

O texto em letras grandes de ASCII, num bloco de código (monoespaçado no WhatsApp). As letras têm 3
colunas de largura e 5 linhas de altura, e o texto quebra em várias linhas de letras para caber na
tela do celular: 30 colunas por padrão.

```text
/ascii [-width|-w <colunas>] [-char|-c <caractere>] <texto>
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `<texto>` | Até 40 caracteres: letras (sem acento), números e `! ? . , : - + _ /`. Maiúsculas e minúsculas saem iguais; o que não tem desenho é ignorado. Sem texto, usa o da mensagem respondida |
| `-width`, `-w` | `<colunas>` | Colunas por linha de letras, de 10 a 60 (padrão 30) |
| `-char`, `-c` | `<caractere>` | O caractere do traço das letras (padrão `#`) |

```text
/ascii Jorge!
/ascii -w 20 Feliz aniversario
/ascii -c @ Oi
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

Não depende de serviço
externo e pode ser usado dentro de um [`/alias`](alias.md) ou do [`/cron`](cron.md) com
`{/ascii Oi}`.
