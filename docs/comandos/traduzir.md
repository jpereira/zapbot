# `/traduzir` (`/tr`, `/translate`)

Traduz um texto pelo [Google Cloud Translation](https://cloud.google.com/translate). Respondendo
(reply) uma mensagem, traduz o texto dela. O idioma de origem é detectado sozinho; o de destino é o
português, ou o do `-para`.

| Opção | Valor | Descrição |
|---|---|---|
| `[texto]` | | O texto (até 5000 caracteres, com quebras de linha). Sem ele, a mensagem respondida |
| `-para`, `-p` | `<idioma>` | Idioma de destino, pelo código: `en`, `es`, `fr`, `it`, `de`, `ja`, `zh-CN`... Padrão: setting `traduzir.lang` (`pt`) |
| `-list`, `-l` | | Lista os idiomas aceitos, com o código |

```text
/traduzir Where is the nearest pharmacy?
/tr -para en Onde fica a farmácia mais próxima?
/translate -p es               (respondendo uma mensagem)
/traduzir -l                   → os idiomas e os códigos
/set traduzir.lang en          → muda o idioma padrão
```

```text
/traduzir Where is the nearest pharmacy?
🌐 Tradução (en → pt)

Onde fica a farmácia mais próxima?
```

Não é admin: quem estiver no `bot.users` usa (com ele em `true`, qualquer pessoa; e cada tradução
conta na cota da sua chave).

## Configurando a chave do Google

O `/traduzir` usa a Cloud Translation API (versão "Basic", v2) com uma chave de API. O Google cobra
por caractere de entrada, incluindo espaços. A franquia mensal para tradução NMT cobre 500 mil
caracteres, compartilhados entre Basic e Advanced; consulte os
[preços do Google](https://cloud.google.com/products/translate/pricing). O faturamento precisa estar
ativo mesmo para usar só a cota grátis.

1. Entre em [console.cloud.google.com](https://console.cloud.google.com/) com a sua conta Google.
2. **Crie um projeto**: no seletor de projetos (no topo), **Novo projeto**, dê um nome (ex.:
   `zapbot`) e clique em **Criar**. Confira que ele ficou selecionado.
3. **Ative o faturamento**: menu **☰ › Faturamento** e vincule uma conta de faturamento (cartão) ao
   projeto.
4. **Ative a API**: menu **☰ › APIs e serviços › Biblioteca**, busque **Cloud Translation API** e
   clique em **Ativar**.
5. **Crie a chave**: **APIs e serviços › Credenciais › + Criar credenciais › Chave de API**. Copie a
   chave (começa com `AIza`).
6. **Restrinja a chave** (recomendado): abra a chave criada, em **Restrições de API** escolha
   **Restringir chave**, marque só **Cloud Translation API** e salve. Se o servidor tiver IP fixo,
   dá para limitar também por endereço IP em **Restrições de aplicativos**.
7. **Limite o gasto** (recomendado): em **Faturamento › Orçamentos e alertas**, crie um orçamento
   com alerta por e-mail; em **APIs e serviços › Cloud Translation API › Cotas**, dá para baixar o
   limite de caracteres por dia.
8. **Configure no bot**, de um dos jeitos:
    - no `config/.env`: `GOOGLE_TRANSLATE_API_KEY=AIza...` (vale no próximo start), ou
    - pelo WhatsApp, sem reiniciar: `/set traduzir.api.key AIza...` (exibida mascarada; o
      `GOOGLE_TRANSLATE_API_KEY` do `.env`, se existir, tem prioridade).
9. Teste com `/traduzir hello`.

Se algo estiver faltando, o bot diz o quê:

| Resposta | Causa |
|---|---|
| `⚠️ Chave do Google Translate não encontrada` | Sem `GOOGLE_TRANSLATE_API_KEY` e sem o setting `traduzir.api.key` |
| `🔑 Chave do Google Translate inválida` | A chave está errada (ou foi apagada no console) |
| `⚠️ A Cloud Translation API não está ativada` | Falta o passo 4, no mesmo projeto da chave |
| `💳 O projeto da chave está sem faturamento` | Falta o passo 3 |
| `⛔ O Google recusou a chave` | A chave tem restrições que não incluem a Cloud Translation API (passo 6) ou o IP do servidor |
| `💸 Cota do Google Translate esgotada` | Passou da cota diária ou do limite de requisições/caracteres por minuto |

A chave vai no cabeçalho da requisição (`X-Goog-Api-Key`), nunca na URL, e não aparece no chat nem
nos logs.

As [cotas do Google](https://docs.cloud.google.com/translate/quotas) são independentes da franquia
gratuita: configure limites de uso no projeto para controlar o consumo. Um
[orçamento somente de alertas](https://docs.cloud.google.com/billing/docs/how-to/budgets) avisa
sobre gastos; ele não interrompe as traduções.
