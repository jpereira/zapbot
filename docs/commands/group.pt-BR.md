# `/group` · admin

## Namespace de grupos

Use `/g <ação>`, `/g.<ação>` ou `/group <ação>`. Para descobrir as ações disponíveis,
envie `/g -h`. Para a ajuda de uma ação, use `/g members -h`. Um prefixo único com pelo menos
dois caracteres funciona nas duas grafias. Se houver mais de uma opção, o bot lista as
correspondências que você tem permissão de usar.

```text
/g members
/g.members
/g.mem
/g invite -revoke
/g.warn spam
```

- Configuração do grupo atual: `info`, `name`, `desc`, `photo`, `remove-photo`, `admins`, `send`,
  `edit` e `add`. Exemplo: `/g send admins -for 30m`.
- Participantes e moderação: `members`, `invite`, `promote`, `demote`, `warn`, `antilink`,
  `antibadword`, `antitag`, `welcome`, `goodbye` e `mention-all`.
- Participação da conta: `join`, `leave` e `list`.

Cada ação mantém as permissões do comando correspondente. Para delegar uma ação, use o
nome completo, por exemplo `/bot +u +cmd /g.members`. Responder a uma mensagem continua
selecionando o autor nas ações que aceitam reply, como `/g.warn spam`. A sintaxe com opções
de `/group` e os comandos avulsos continuam disponíveis.

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /group` ([Delegando](index.md#delegando-um-comando-admin)).

Só em grupos (fora deles responde `Só utilizável dentro de grupos.`). **Mostra e muda o grupo** onde você
digitou: nome, descrição, foto e quem pode mandar mensagem, editar as informações e adicionar pessoas. Para
mudar qualquer coisa, **a sua conta precisa ser admin do grupo**. O link de convite está no
[`/invite`](invite.md).

| Opção | Valor | Descrição |
|---|---|---|
| `-info`, `-i` | | As informações do grupo (o mesmo que `/group` sem nada) |
| `-admins`, `-a` | | Lista os admins (👑 criador, ⭐ admin) |
| `-name` | `<texto>` | Muda o nome do grupo. Vai até o fim do comando (pode ter espaços) |
| `-desc` | `[texto]` | Muda a descrição. Sem texto, apaga |
| `-pic` | | Define a foto do grupo com a imagem que você respondeu (ou a enviada com `/group -pic` na legenda) |
| `-rmpic` | | Tira a foto do grupo |
| `-send` | `<admins\|all>` | Quem pode mandar mensagem: `admins` fecha o grupo para os outros |
| `-edit` | `<admins\|all>` | Quem pode mudar o nome, a descrição e a foto |
| `-add` | `<admins\|all>` | Quem pode adicionar pessoas ao grupo |
| `-for` | `<tempo>` | Com `-send admins`: fecha só por esse tempo (`30m`, `2h`, `1d`, `1h30m`) |

```text
/group
/group -admins
/group -name Amigos da L200
/group -desc Regras: sem brigas, sem spam
/group -desc                              → apaga a descrição
(respondendo uma foto)  /group -pic
/group -rmpic
/group -send admins                       → só admins falam
/group -send admins -for 30m              → fecha e reabre sozinho em 30 minutos
/group -send all                          → todos voltam a falar
/group -edit admins -add admins           → vários de uma vez
```

## As informações

```text
/group
👥 Amigos da L200
👤 24 membros · ⭐ 3 admins
👑 Criador: +5521999999999 - Jorge Pereira
📅 Criado em 15/03/2024 10:30

📝 Regras: sem brigas, sem spam

💬 Enviar mensagens: todos
✏️ Editar as informações do grupo: só admins
➕ Adicionar pessoas: só admins
🤖 Sua conta é admin
```

## Fechar por um tempo

O `/group -send admins -for 30m` fecha o grupo (só admin fala) e **reabre sozinho**, avisando
`🔓 O grupo está aberto de novo`. O horário fica salvo no banco, então vale mesmo se o bot reiniciar no
meio: na próxima checagem (a cada 30 segundos) ele reabre o que estiver vencido. Um `/group -send all`
antes disso cancela o agendamento.

```text
/group -send admins -for 1h
🔒 Só admins podem mandar mensagem. Reabre sozinho em 17/11 16:30.
```

## Observações

- O `-name` e o `-desc` levam o resto do comando como texto, então use um de cada vez.
- Se o WhatsApp recusar uma mudança, a resposta diz qual (`❌ O WhatsApp recusou o -name (a sua conta é
  admin?)`) e as outras continuam.
- Ver as informações ou os admins (`-info`, `-admins`) não exige que a sua conta seja admin.
- Mensagens temporárias (24 h, 7 d) ficaram de fora: o `whatsapp-web.js` não tem chamada para elas.
