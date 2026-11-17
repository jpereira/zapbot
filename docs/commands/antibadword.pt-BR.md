# `/antibadword` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /antibadword` ([Delegando](index.md#delegando-um-comando-admin)).

Só em grupos (fora deles responde `Só utilizável dentro de grupos.`). **Apaga as mensagens** de quem não é
admin do grupo que têm uma palavra (ou frase) da lista do grupo. É configurado por grupo e vem
**desligado**. Para o bot apagar mensagens dos outros, **a sua conta precisa ser admin do grupo**; sem isso
as mensagens ficam (e o `/antibadword` avisa).

```text
/antibadword [-off|-delete|-warn|-remove] [-add <palavra>] [-rm <palavra>] [-list]
```

| Opção | Valor | Descrição |
|---|---|---|
| `-off` | | Desliga neste grupo (o padrão) |
| `-delete` | | Apaga a mensagem, para todos |
| `-warn` | | Apaga e soma um aviso do [`/warn`](warn.md); no limite (`warn.max`) a pessoa é removida |
| `-remove` | | Apaga e remove a pessoa do grupo na hora |
| `-add` | `<palavra>` | Põe uma palavra na lista (até 100), uma por comando. Para uma frase, use aspas |
| `-rm` | `<palavra>` | Tira uma palavra da lista |
| `-list`, `-l` | | Mostra as palavras da lista |
| *(nada)* | | Mostra o modo e quantas palavras há |

```text
/antibadword -add idiota
✅ "idiota" entrou na lista.
🤬 Antibadword: desligado
📚 Palavras: 1

/antibadword -add "vai se ferrar"
/antibadword -delete
/antibadword -list
🤬 Antibadword: apagar
📚 Palavras: 2
idiota, vai se ferrar
/antibadword -rm idiota
```

Depois, no grupo:

```text
(Fulano, que não é admin)  você é um IDIOTA!!
🤬 Mensagem de Fulano apagada: palavra proibida.
```

- **Ignora maiúsculas, acentos e pontuação:** `IDIOTA`, `idiota!` e `ídiota` são a mesma palavra.
- **Só vale a palavra inteira:** com `cu` na lista, `cuidado` e `acusar` passam.
- **Quem nunca é pego:** os admins do grupo, você (o dono) e os admins do bot.
- Mensagem que começa com `/` (um comando) não é conferida.
- O `-warn` usa o [`/warn`](warn.md): cada mensagem conta como um aviso, e no `warn.max` a pessoa sai. O
  `-remove` tira a pessoa na primeira.
- A lista é **por grupo** e não é privada: qualquer admin do bot a vê com `-list`.
