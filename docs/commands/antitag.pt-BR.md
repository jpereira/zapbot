# `/antitag` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /antitag` ([Delegando](index.md#delegando-um-comando-admin)).

Só em grupos (fora deles responde `Só utilizável dentro de grupos.`). **Apaga as mensagens** de quem não é
admin do grupo que marcam muita gente de uma vez, o abuso de "marcar todo mundo". É configurado por grupo e
vem **desligado**. Para o bot apagar mensagens dos outros, **a sua conta precisa ser admin do grupo**; sem
isso as mensagens ficam (e o `/antitag` avisa).

```text
/antitag [-off|-delete|-warn|-remove] [-min <n>]
```

| Opção | Valor | Descrição |
|---|---|---|
| `-off` | | Desliga neste grupo (o padrão) |
| `-delete` | | Apaga a mensagem, para todos |
| `-warn` | | Apaga e soma um aviso do [`/warn`](warn.md); no limite (`warn.max`) a pessoa é removida |
| `-remove` | | Apaga e remove a pessoa do grupo na hora |
| `-min` | `<n>` | A partir de quantas marcações a mensagem é pega (3 a 1000; padrão 10). Num grupo pequeno, 80% dos membros, mas nunca menos de 3 |
| *(nada)* | | Mostra o modo e o mínimo de agora |

```text
/antitag
🏷️ Antitag: desligado
📏 Mínimo: 10 marcações numa mensagem

/antitag -delete -min 6
🔗 Modo: apagar.
📏 Mínimo: 6 marcações.
🏷️ Antitag: apagar
📏 Mínimo: 6 marcações numa mensagem
```

Depois, no grupo:

```text
(Fulano, que não é admin)  @Ana @Beto @Caio @Duda @Edu @Fabi bom dia, pessoal!
🏷️ Mensagem de Fulano apagada: marcou gente demais.
```

- **Quem nunca é pego:** os admins do grupo, você (o dono) e os admins do bot.
- Mensagem que começa com `/` (um comando) não é conferida.
- O `-warn` usa o [`/warn`](warn.md): cada "marcar todo mundo" conta como um aviso, e no `warn.max` a pessoa
  sai. O `-remove` tira a pessoa na primeira.
- O mínimo é o que a mensagem **marca**, não o que ela diz: um "@todos" escrito sem menções não é pego.
