# `/tldr` (`/resumo`) · admin

Resume a conversa de um chat pelo ChatGPT: assuntos principais, decisões,
combinados e pendências, em tópicos. Usa a mesma chave e o mesmo modelo do
[`/gpt`](gpt.md) (veja [Configurando a chave](gpt.md#configurando-a-chave)).

| Opção | Valor | Descrição |
|---|---|---|
| `[período]` | | `2h` ou `30m`: as mensagens desse tempo para cá; `300`: as últimas 300 (limite padrão 500, configurável até 2000 em `tldr.maxMsgs`). Padrão: as últimas 100. O `-` na frente é opcional (`-2h`) |
| `-chat`, `-c` | `<nome>` | Resume outro chat, buscado pelo nome: todas as palavras, em qualquer ordem, sem diferenciar acentos. Nome com espaço vai entre aspas: `-c "trabalho rio"` |
| `-pv` | | Envia no seu privado em vez de expor no chat atual |

```
/tldr                → as últimas 100 mensagens deste chat
/tldr 2h             → as das últimas 2 horas
/resumo 30m          → as dos últimos 30 minutos (pelo alias)
/tldr 300 -pv        → as últimas 300, no seu privado
/tldr -c família 3h -pv
```

```
📝 Resumo de Família
42 mensagens · 30/09, 18:02 a 30/09, 20:47

• Tia propôs o almoço de domingo na casa da Vó; todos confirmaram, menos o Primo.
• Tio fica com a churrasqueira; a Tia leva a sobremesa.
• Pendente: quem busca a Vó (o Tio responde até sábado).
```

Detalhes:

- O resumo usa o texto já gravado no banco. As mensagens comuns ficam 68 h
  (a janela em que o WhatsApp deixa apagar), então períodos maiores são
  cortados e o bot avisa.
- Ficam de fora os comandos, as mensagens apagadas e as mídias sem legenda. As
  suas mensagens aparecem com o nome do seu perfil; as respostas do bot (que
  saem pela sua conta) entram como suas.
- Cada mensagem vai até 500 caracteres, e o total até 60 mil: acima disso
  saem as mais antigas.
- É restrito ao dono e aos admins extras (`+o`): cada resumo gasta créditos da OpenAI, e o texto das
  conversas vai para a OpenAI.
