# `/web` · owner

Gerencia a interface web na sua conversa do WhatsApp com você mesmo. Sem opção,
o comando mostra se o serviço está rodando e o endereço de acesso.

| Opção | Valor | Descrição |
|---|---|---|
| `-list`, `-l` | | Lista as sessões ativas numeradas de 1 a N, com vencimentos em UTC |
| `-destroy`, `-d` | `[número]` | Encerra uma sessão pelo número na última lista ou todas sem número |
| `-enable`, `-e` | | Ativa e inicia o serviço quando o login e a senha estão definidos |
| `-disable`, `-off` | | Para o serviço e encerra todas as sessões |
| `-pass`, `-p` | `<senha>` | Define a senha (mínimo de oito caracteres). Use aspas para senhas com espaços |
| `-login` | `<nome>` | Define o nome de login |
| `-timeout`, `-t` | `[minutos\|off]` | Consulta ou define o limite de inatividade. O padrão é 30 minutos |
| `-2fa`, `-totp` | `<new\|qr\|código\|off>` | Cria um QR code, exibe de novo, confirma um código ou desativa o 2FA |

```text
/web -login jorge.admin
/web -p "troque isto pela sua senha"
/web -2fa new
/web -2fa 123456
/web -e
/web -timeout 15
/web -l
/web -d 2
/web -d
```

Escaneie o QR code com um app autenticador e substitua `123456` pelo código que ele mostra.
Alterações de login, senha ou 2FA encerram as sessões existentes. Use o número da última lista. Se a sessão já tiver expirado, atualize com `/web -l`.

Se o Docker define `ZAPBOT_WEB_ENABLED`, a variável decide se o serviço pode ser iniciado
ou parado. Veja [Interface web](../web.md) para configurar a rede e o acesso.
