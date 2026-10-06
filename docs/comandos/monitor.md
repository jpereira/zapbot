# `/monitor` · admin · 🚧 em desenvolvimento

> 🚧 **Em desenvolvimento e desabilitado** (`"disabled": true` no
> `src/comandos/comandos.json`): o bot não responde a `/monitor`, o comando
> não aparece no `/help` e os avisos de "ficou online" ficam desligados, mesmo
> para números cadastrados antes. Para testar, remova a linha `"disabled": true`
> (ou mude para `false`), refaça o build e recrie o container.

Monitora números (máx. 20, setting `monitor.max`). Quando um deles fica online, você recebe no
`PHONE_NUMBER`: `🔔 *Fulano* (5521999999999) acabou de ficar online.` Cada evento também é registrado
no banco.

| Opção | Valor | Descrição |
|---|---|---|
| `-list` | | Lista os números monitorados |
| `-logs` | | Lista o histórico de eventos |
| `-add` | `<número>` | Adiciona um número |
| `-rem` | `<número>` | Remove um número |
| `-clean` | | Remove todos |

Aceita também a forma sem hífen:

```text
/monitor -add 5521999999999
/monitor add +55 21 99999-9999
/monitor -list
/monitor logs
/monitor -rem 5521999999999
/monitor -clean
```
