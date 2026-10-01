# `/set` (`/config`) · admin

Lista e altera as configurações do bot guardadas na tabela `settings` (veja
[Settings](../settings.md)). A mudança vale na hora e sobrevive a reinícios.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | Lista todas as chaves e valores e, no seu privado, as variáveis do `config/.env` |
| `<chave>` | | Mostra valor, padrão, tipo e descrição |
| `<trecho>` ou `/regex/` | | Não sendo uma chave: lista as chaves que contêm o trecho (sem diferenciar maiúsculas) ou casam com a regex. Ex.: `/set alerta`, `/set /^show\./` |
| `<chave> <valor>` | | Altera. Listas: itens separados por vírgula ou espaço (`watch.rules`: uma regra por linha); `""` esvazia |
| `-reset`, `-r` | `<chave>` | Volta ao valor padrão |
| `<VARIÁVEL>` | | Uma variável do `config/.env` (ex.: `OPENAI_MODEL`): mostra o valor, só no seu privado |

```
/set
/set show.max
/set alerta          → só as chaves com "alerta" (alerta.intervalMin, alerta.max)
/set /^news\./       → as que casam com a regex
/set show.max 10
/config show.max 10  → o mesmo, pelo alias
/set debug.enabled off
/set sticker.name "Meu Bot"
/set commands.disabled noffa todos
/set commands.disabled ""
/set -r crypto.coins
/set watch.rules ""
```

## Variáveis do `config/.env`

No seu privado (o chat com você mesmo), o `/set` mostra também as variáveis do
[`config/.env`](../configuracao.md) que o bot lê, **somente para leitura**:
elas mudam no arquivo, e valem quando o container é recriado. As chaves e as
senhas aparecem mascaradas (`••••1234`).

```
🔒 config/.env (somente leitura: mude no arquivo e recrie o container)

APP_ENV                         prod
GIPHY_API_KEY                   ••••a1b2
OPENAI_MODEL                    (vazio)
PHONE_NUMBER                    5521999999999@c.us
QRCODE_EMAIL_SMTP_PASS          ••••mnop
...
```

Em outro chat (um grupo, por exemplo), no lugar delas vem só o aviso
`🔒 As variáveis do config/.env (somente leitura) aparecem só no seu privado.`
Tentar alterar uma (`/set OPENAI_MODEL gpt-4.1`) é recusado.

