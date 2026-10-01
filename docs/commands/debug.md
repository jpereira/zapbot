# `/debug` (`/d`, `/dbg`) · admin

Liga/desliga o modo debug (logs detalhados no container). O estado fica salvo
no setting `debug.enabled` e sobrevive a reinícios. No primeiro boot começa
ligado só com `APP_ENV=dev`.

| Opção | Descrição |
|---|---|
| `-on` | Ativa o debug |
| `-off` | Desativa o debug |

```
/debug -on      → 🪲 Debug Ativado.
/dbg -off       → 🪲 Debug Desativado.
/debug          → mostra o estado atual
```
