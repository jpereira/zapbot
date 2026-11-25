# `/tldr` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /tldr` ([Delegando](index.md#delegando-um-comando-admin)).
Quem recebe resume só o chat atual, aqui mesmo: `-chat` e `-private` são do dono e dos admins extras.

Resume a conversa de um chat pelo ChatGPT: assuntos principais, decisões, combinados e pendências,
em tópicos. Usa a mesma chave e o mesmo modelo do [`/gpt`](gpt.md) (veja
[Configurando a chave](gpt.md#configurando-a-chave)). O texto do ChatGPT passa pela mesma conversão do
Markdown para a formatação do WhatsApp do `/gpt` (veja [Formatação no WhatsApp](gpt.md#formatação-no-whatsapp)).

| Opção | Valor | Descrição |
|---|---|---|
| `-quiet`, `-q` | | Não mostra a dica do motor ("💡 ... por ChatGPT, Tesseract, Piper...") no fim da resposta. Para esconder sempre: o setting `tldr.footer` em `off` |
| `[período]` | | Um tempo, como no [`/cron`](cron.md) (`30m`, `2h`, `1d`, `1h30m`, `2d4h`): as mensagens desse tempo para cá; um número (`300`): as últimas 300 (limite padrão 500, configurável de 10 a 2000 em `tldr.maxMsgs`). Padrão: as últimas 100. O `-` na frente é opcional (`-2h`) |
| *(respondendo)* | | Resume da mensagem respondida até agora; o período digitado ou o `-chat` ganham |
| `-chat`, `-c` | `<chat>` | Resume outro chat, nome do grupo ou do contato (todas as palavras, em qualquer ordem, sem diferenciar acentos), `/regex/` ou `@contato`. Nome com espaço vai entre aspas: `-c "trabalho rio"`. Se vários chats casarem, lista e espera o nº |
| `-status`, `-s` | | Acrescenta no rodapé o consumo da chamada: bytes TX/RX, tokens, custo e saldo (veja [Status](gpt.md#status--status)) |
| `-private` | | Envia no seu privado em vez de expor no chat atual |

```text
/tldr                → as últimas 100 mensagens deste chat
/tldr 2h             → as das últimas 2 horas
/tldr 1d             → as do último dia (1h30m, 2d4h... valem; o banco guarda 3 dias, ou o `cache.messageRetentionDays`)
/tldr 30             → as últimas 30 mensagens (sem a letra, é quantidade)
/tldr 300 -private        → as últimas 300, no seu privado
/tldr -c família 3h -private
(respondendo uma mensagem)  /tldr  → dela até agora
/tldr -s 2h                  → o resumo mais o consumo no rodapé
```

Respondendo uma mensagem, o `/tldr` resume a conversa **a partir dela** (inclusive) até agora, como um
"onde parei de ler". Se você digitar um período (`2h`, `300`) ou usar o `-chat`, o respondido é
ignorado. As mensagens ainda são as do banco (3 dias, ou o `cache.messageRetentionDays`) e vale o limite `tldr.maxMsgs`: acima dele, o
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
    Por padrão o banco guarda só 3 dias de conversa, então `/tldr 7d` é cortado em 3 dias. Para
    resumir períodos maiores, configure estas chaves (veja os [settings](../settings.md)):

    ```text
    /set cache.messageRetentionDays 30          → o texto das mensagens por 30 dias (até 90)
    /set cache.messageMediaRetentionDays 30     → as mídias por 30 dias (áudios entram no resumo, transcritos)
    /set tldr.maxMsgs 2000                      → até quantas mensagens um resumo lê (padrão 500)
    ```

    **Cuidado com o disco.** O texto pesa pouco, mas as mídias (fotos, vídeos, áudios, documentos) ficam em
    `cache/media` e, guardadas por semanas, podem fazer o `cache/` crescer **muito** (o tamanho depende do movimento dos seus
    chats, e grupos com muitas fotos e vídeos enchem o disco rápido). Antes de aumentar, confira o espaço livre e acompanhe o tamanho com o
    [`/cache`](cache.md); o `/cache -media` libera só as mídias, e o `/cache -clean` aplica a retenção na hora.
    Se o objetivo é só ler mais dias de texto, aumente apenas o `cache.messageRetentionDays` e deixe a mídia no
    padrão: o resumo perde só os áudios antigos que ainda não tinham sido transcritos.

    Um período maior também gasta mais créditos da OpenAI: cada resumo lê até 60 mil caracteres.

Detalhes:

- Precisa de pelo menos três mensagens elegíveis no período; sem elas, o bot avisa no chat.

- O resumo usa o texto já gravado no banco. As mensagens comuns ficam 3 dias (cobre a janela em que o
  WhatsApp deixa apagar), então períodos maiores são cortados e o bot avisa. Para alcançar mais dias,
  aumente o `cache.messageRetentionDays` (até 90): `/set cache.messageRetentionDays 30` guarda
  30 dias de mensagens. As mídias têm o seu prazo, o `cache.messageMediaRetentionDays` (padrão 3 dias): um áudio
  sem arquivo e sem transcrição deixa de entrar no resumo.
- Enquanto processa, o aviso diz o que está resumindo: `⏳ Processando o /tldr das 87 mensagens de Família do
  período de 2 horas, aguarde.` (ou `das últimas 100 mensagens de ...`, ou `... desde a mensagem respondida
  (há 3 horas)`).
- Uma primeira palavra desconhecida que parece uma opção (`/tldr -price`) é recusada com a dica de
  usar `-h`, em vez de ser lida como período.
- Ficam de fora os comandos, as mensagens apagadas e as mídias sem legenda. As suas mensagens
  aparecem com o nome do seu perfil; as respostas do bot (que saem pela sua conta) entram como suas.
- Os áudios (os 10 mais recentes do período) são transcritos, até 25 MB cada, e entram no resumo com
  quem enviou e quando. A transcrição fica gravada, então não é paga duas vezes. O áudio que não dá
  para transcrever (sem arquivo, grande demais, outro formato) fica de fora.
- Cada mensagem vai até 500 caracteres, e o total até 60 mil: acima disso saem as mais antigas.
- É restrito ao dono e aos admins extras (`+a`): cada resumo gasta créditos da OpenAI, e o texto das
  conversas vai para a OpenAI.
