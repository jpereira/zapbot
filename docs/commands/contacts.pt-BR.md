# `/contacts` · owner

Exporta a sua agenda num **único arquivo vCard 3.0** (`.vcf`) com nome, número, empresa e recado
de cada contato (e as fotos de perfil com `-p`), pronto para importar no **Android** (Google Contatos) e no **iPhone**.
Só no **seu próprio privado**: a saída é a agenda inteira.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | Mostra esta ajuda |
| `-export`, `-e` | | Gera o `.vcf` com todos os contatos (ou só os do filtro) e envia aqui, só texto: nome, número, empresa e recado |
| `-photos`, `-p` | | Com `-e`: inclui as fotos de perfil (devagar: um download por contato, com pausa; cache em `cache/contacts`) |
| `-list`, `-l` | | Lista os contatos (nome e número); acima de 40 vai num arquivo `contacts-AAAAMMDD.txt` |
| `-nocache`, `-n` | | Com `-e -p`: baixa as fotos só para esta exportação, sem ler nem gravar `cache/contacts` |
| `-refresh`, `-r` | | Com `-e -p`: baixa as fotos de novo, ignorando o cache |
| `-clear`, `-c` | | Apaga as fotos salvas em `cache/contacts` |

| Argumento | Descrição |
|---|---|
| `[filtro...]` | Parte do nome ou do número, para restringir os contatos. Vários de uma vez com `/Nome/`: entra quem casar com qualquer um. Sem ele, todos |

```text
/contacts -e -p
⏳ Exportando 312 contatos, aguarde. As fotos são baixadas devagar, então pode demorar.
📇 312 contatos · 🖼️ 241 com foto (0 do cache) · 18.40 MB
```

```text
/contacts            → esta ajuda
/contacts -l Ana     → contatos com "Ana" no nome
/contacts -e         → todos, só texto, como contacts-AAAAMMDD.vcf (segundos)
/contacts -e -p      → com as fotos de perfil (minutos)
/contacts -e -p -r   → baixa todas as fotos de novo
/contacts -e -p -n                → exporta com fotos, sem mexer no cache de fotos
/contacts -clear                  → apaga as fotos salvas
```

- Cada cartão tem um `UID` fixo derivado do número (`zapbot-<número>`), então importar o arquivo de
  novo atualiza o contato em vez de duplicar, **quando o aparelho casa pelo UID**. Teste com um
  contato primeiro: o Android e o iPhone ainda podem perguntar o que fazer com duplicados.
- A foto do WhatsApp não é a da agenda do seu celular, e o bot não escreve no celular: você importa
  o arquivo lá.
- As fotos ficam em `cache/contacts` (também no [backup](backup.md)) e são reaproveitadas por
  `contacts.cacheDays` dias. Desligue com `contacts.cache` ou por exportação com `-n`.
- O download é lento de propósito (`contacts.delayMs` entre as fotos). Contatos com a foto escondida
  pela privacidade saem sem ela.
