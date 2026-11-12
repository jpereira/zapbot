# `/tldr` (`/resumo`) · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /tldr` ([Delegando](index.md#delegando-um-comando-admin)).
Quem recebe resume só o chat atual, aqui mesmo: `-chat` e `-pv` são do dono e dos admins extras.

Resume a conversa de um chat pelo ChatGPT: assuntos principais, decisões, combinados e pendências,
em tópicos. Usa a mesma chave e o mesmo modelo do [`/gpt`](gpt.md) (veja
[Configurando a chave](gpt.md#configurando-a-chave)). O texto do ChatGPT passa pela mesma conversão do
Markdown para a formatação do WhatsApp do `/gpt` (veja [Formatação no WhatsApp](gpt.md#formatação-no-whatsapp)).

| Opção | Valor | Descrição |
|---|---|---|
| `[período]` | | Um tempo, como no [`/cron`](cron.md) (`30m`, `2h`, `1d`, `1h30m`, `2d4h`): as mensagens desse tempo para cá; um número (`300`): as últimas 300 (limite padrão 500, configurável até 2000 em `tldr.maxMsgs`). Padrão: as últimas 100. O `-` na frente é opcional (`-2h`) |
| *(respondendo)* | | Resume da mensagem respondida até agora; o período digitado ou o `-chat` ganham |
| `-chat`, `-c` | `<nome>` | Resume outro chat, buscado pelo nome: todas as palavras, em qualquer ordem, sem diferenciar acentos. Nome com espaço vai entre aspas: `-c "trabalho rio"` |
| `-status`, `-s` | | Acrescenta no rodapé o consumo da chamada: bytes TX/RX e tokens (veja [Status](gpt.md#status--status)) |
| `-pv` | | Envia no seu privado em vez de expor no chat atual |

```text
/tldr                → as últimas 100 mensagens deste chat
/tldr 2h             → as das últimas 2 horas
/resumo 30m          → as dos últimos 30 minutos (pelo alias)
/tldr 1d             → as do último dia (1h30m, 2d4h... valem; o banco guarda 68 h, ou o `cache.messageRetentionHours`)
/tldr 30             → as últimas 30 mensagens (sem a letra, é quantidade)
/tldr 300 -pv        → as últimas 300, no seu privado
/tldr -c família 3h -pv
(respondendo uma mensagem)  /tldr  → dela até agora
```

Respondendo uma mensagem, o `/tldr` resume a conversa **a partir dela** (inclusive) até agora, como um
"onde parei de ler". Se você digitar um período (`2h`, `300`) ou usar o `-chat`, o respondido é
ignorado. As mensagens ainda são as do banco (68 h, ou o `cache.messageRetentionHours`) e vale o limite `tldr.maxMsgs`: acima dele, o
resumo pega as mais recentes e avisa.

```text
🤖 Resumo de Família
42 mensagens · 30/09, 18:02 a 30/09, 20:47

• Tia propôs o almoço de domingo na casa da Vó; todos confirmaram, menos o Primo.
• Tio fica com a churrasqueira; a Tia leva a sobremesa.
• Pendente: quem busca a Vó (o Tio responde até sábado).
```

## Resumos mais completos

!!! tip "Quer um `/tldr` mais completo?"
    Por padrão o banco guarda só 68 h de conversa, então `/tldr 7d` é cortado em 2 dias e 20 horas. Para
    resumir períodos maiores, configure estas chaves (veja os [settings](../settings.md)):

    ```text
    /set cache.messageRetentionHours 720        → o texto das mensagens por 30 dias (até 2160 h = 90 dias)
    /set cache.messageMediaRetentionHours 720   → as mídias por 30 dias (áudios entram no resumo, transcritos)
    /set tldr.maxMsgs 2000                      → até quantas mensagens um resumo lê (padrão 500)
    ```

    **Cuidado com o disco.** O texto pesa pouco, mas as mídias (fotos, vídeos, áudios, documentos) ficam em
    `cache/media` e, guardadas por semanas, podem fazer o `cache/` crescer **muito** (o tamanho depende do movimento dos seus
    chats, e grupos com muitas fotos e vídeos enchem o disco rápido). Antes de aumentar, confira o espaço livre e acompanhe o tamanho com o
    [`/cache`](cache.md); o `/cache -media` libera só as mídias, e o `/cache -clean` aplica a retenção na hora.
    Se o objetivo é só ler mais dias de texto, aumente apenas o `cache.messageRetentionHours` e deixe a mídia no
    padrão: o resumo perde só os áudios antigos que ainda não tinham sido transcritos.

    Um período maior também gasta mais créditos da OpenAI: cada resumo lê até 60 mil caracteres.

Detalhes:

- Precisa de pelo menos três mensagens elegíveis no período; sem elas, o bot avisa no chat.

- O resumo usa o texto já gravado no banco. As mensagens comuns ficam 68 h (a janela em que o
  WhatsApp deixa apagar), então períodos maiores são cortados e o bot avisa. Para alcançar mais dias,
  aumente o `cache.messageRetentionHours` (até 2160 h = 90 dias): `/set cache.messageRetentionHours 720` guarda
  30 dias de mensagens. As mídias têm o seu prazo, o `cache.messageMediaRetentionHours` (padrão 68 h): um áudio
  sem arquivo e sem transcrição deixa de entrar no resumo.
- Enquanto processa, o aviso diz o que está resumindo: `⏳ Processando o /tldr das 87 mensagens de Família do
  período de 2 horas, aguarde.` (ou `das últimas 100 mensagens de ...`, ou `... desde a mensagem respondida
  (há 3 horas)`).
- Ficam de fora os comandos, as mensagens apagadas e as mídias sem legenda. As suas mensagens
  aparecem com o nome do seu perfil; as respostas do bot (que saem pela sua conta) entram como suas.
- Cada mensagem vai até 500 caracteres, e o total até 60 mil: acima disso saem as mais antigas.
- É restrito ao dono e aos admins extras (`+a`): cada resumo gasta créditos da OpenAI, e o texto das
  conversas vai para a OpenAI.
