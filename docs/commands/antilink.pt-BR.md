# `/antilink` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /antilink` ([Delegando](index.md#delegando-um-comando-admin)).

Só em grupos (fora deles responde `Só utilizável dentro de grupos.`). **Apaga os links** mandados por quem
não é admin do grupo. Fica configurado por grupo e vem **desligado**. Para o bot apagar a mensagem dos
outros, **a sua conta precisa ser admin do grupo**; sem isso os links ficam (e o `/antilink` avisa).

```text
/antilink [-off|-delete|-warn|-remove] [-allow <domínio>] [-deny <domínio>]
```

| Opção | Valor | Descrição |
|---|---|---|
| `-off` | | Desliga neste grupo (o padrão) |
| `-delete` | | Apaga a mensagem com o link, para todos |
| `-warn` | | Apaga e soma um aviso do [`/warn`](warn.md); no limite (`warn.max`) a pessoa é removida |
| `-remove` | | Apaga e remove a pessoa do grupo na hora |
| `-allow` | `<domínio>` | Libera um domínio (e os subdomínios): links para ele não são apagados |
| `-deny` | `<domínio>` | Tira um domínio da lista de liberados |
| *(nenhuma)* | | Mostra o modo atual e os domínios liberados |

## Ligando

```text
/antilink
🔗 Antilink: desligado
✅ Liberados: nenhum

/antilink -delete -allow youtube.com
🔗 Modo: apagar.
✅ youtube.com liberado.
🔗 Antilink: apagar
✅ Liberados: youtube.com

/antilink -deny youtube.com        → tira o youtube.com da lista de liberados
/antilink -off                      → desliga neste grupo
```

Depois, no grupo:

```text
(Fulano, que não é admin)  olha isso https://golpe.xyz/promo
🔗 Link de Fulano apagado.

(Fulano)  https://m.youtube.com/watch?v=1       → fica: o youtube.com está liberado
(Fulano)  bom dia, tudo bem?                     → fica: não tem link
```

## Os modos

```text
/antilink -warn
(Fulano)  www.golpe.xyz
🔗 Link de Fulano apagado.
⚠️ Aviso 1/3 para Fulano: mandou link        (o 3º remove, como em qualquer /warn)

/antilink -remove
(Fulano)  https://golpe.xyz
🚪 Fulano mandou link e foi removido do grupo.
```

## O que conta como link

- links `http://` e `https://`, `www.` e convites de grupo (`chat.whatsapp.com/...`);
- domínios soltos com finais comuns (`site.com`, `exemplo.com.br`, `foo.io`, ...). Palavras como
  `arquivo.txt` ou `versão 2.5` não são links;
- um domínio liberado libera também os subdomínios (`youtube.com` libera `m.youtube.com`), mas não o
  `notyoutube.com`.

## Quem nunca é pego

Admins do grupo, você e os admins extras do bot (`bot.admins`), e tudo que começa com `/` (um comando).
Mensagens de um grupo com o modo `off` nem são olhadas.

!!! warning "Cuidado com o `-remove`"
    Um falso positivo remove uma pessoa. Comece com `-delete` ou `-warn` e veja funcionar antes de usar
    o `-remove`.
