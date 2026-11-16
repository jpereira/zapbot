# `/carbon`

Desenha código numa **imagem que parece uma janela de editor**, com cores para comentários, textos,
números e palavras-chave. É feita pelo próprio bot (SVG transformado em PNG pelo `sharp`): sem serviço
externo, e o código não sai da máquina.

```text
/carbon [-theme|-t <dark|light>] <código>
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `<código>` | O código. Pode ter várias linhas, e a cerca do Markdown (` ``` `) sai. Sem ele, usa o da mensagem respondida. Até 60 linhas de 120 colunas |
| `-theme`, `-t` | `<dark\|light>` | O tema de cores: `dark` (padrão) ou `light`. Só vale no começo do comando (o resto é código) |

```text
/carbon console.log(42)
/carbon -t light print(42)
/carbon                      → respondendo uma mensagem com código
```

- Tabs viram 4 espaços; as linhas além do limite são cortadas.
- O realce é simples (não conhece a linguagem): comentários `//` e `#`, textos, números e as
  palavras-chave mais comuns.
