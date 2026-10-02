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

Um comando que não existe (ou que está desativado) aparece no log: o seu,
sempre; o dos outros, só com o debug ligado (senão, qualquer texto começando com
`/` num grupo encheria o log):

```
[!] ⚠️ 'Jorge' executed unknown command: '/tapioca'
[DEBUG] ⚠️ 'Fulano' executed unknown command: '/tapioca'
```
