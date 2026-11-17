# `/warn` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /warn` ([Delegando](index.md#delegando-um-comando-admin)).

Só em grupos (fora deles responde `Só utilizável dentro de grupos.`). Soma um **aviso** a alguém do grupo,
com um motivo se quiser. Quando a pessoa chega no limite (setting `warn.max`, **3** por padrão), o bot a
**remove** do grupo e zera a contagem. Para remover, **a sua conta precisa ser admin do grupo**; senão o bot
avisa e diz que não conseguiu remover.

```text
/warn [/contato/|@menção|+número] [motivo]
/warn -list|-clear [pessoa]
```

| Opção | Valor | Descrição |
|---|---|---|
| `-list`, `-l` | | Lista os avisos do grupo (quem tem quantos) ou, com uma pessoa, cada um com data e motivo |
| `-clear`, `-c` | | Zera os avisos de uma pessoa (ou de quem escreveu a mensagem respondida) |
| *(nenhuma)* | `[/contato/\|@menção\|+número] [motivo]` | Quem avisar: um contato (nome com espaço entre `/.../`), alguém mencionado com `@` ou um número, e depois o motivo. Respondendo uma mensagem, a pessoa é a autora dela e o texto todo é o motivo |

## Avisando alguém

```text
/warn @Fulano mandou link
⚠️ Aviso 1/3 para Fulano: mandou link

/warn /Fulano de Tal/
⚠️ Aviso 2/3 para Fulano de Tal

(respondendo a uma mensagem)  /warn fora do assunto
⚠️ Aviso 3/3 para Fulano de Tal: fora do assunto
🚪 Fulano de Tal chegou a 3 avisos e foi removido do grupo.
```

- Admins do grupo (e o próprio bot) não levam aviso: `❌ Fulano é admin do grupo: não leva aviso.`
- Com o bot sem ser admin: `🚫 Fulano chegou a 3 avisos, mas não consegui remover: o bot precisa ser admin do
  grupo.` A contagem fica, então o próximo `/warn` tenta de novo.
- `/set warn.max 5` muda o limite; **`0` só conta** e nunca remove.
- Os avisos são por grupo: a mesma pessoa pode ter 2 num grupo e nenhum em outro.

## Listando e zerando

```text
/warn -l
⚠️ Avisos do grupo (2)

1. Fulano de Tal — 2/3
2. Ciclano — 1/3

💡 Veja os motivos com /warn -l @pessoa; zere com /warn -c @pessoa.

/warn -l @Fulano
⚠️ Avisos de Fulano de Tal (2/3)

1. ter 17/11 14:02 · mandou link
2. ter 17/11 14:05

/warn -c @Fulano
✅ Avisos de Fulano de Tal zerados (2).
```

Quem foi removido começa do zero se voltar.
