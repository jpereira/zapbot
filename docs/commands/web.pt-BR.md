# `/web` · owner

Gerencia a interface web na sua conversa do WhatsApp com você mesmo. Sem opção,
o comando mostra se o serviço está rodando e o endereço de acesso.

| Opção | Valor | Descrição |
|---|---|---|
| `-list`, `-l` | | Lista as sessões ativas com IDs e vencimentos em UTC |
| `-destroy`, `-d` | `[id]` | Encerra uma sessão pelo ID ou todas sem ID |
| `-enable`, `-e` | | Ativa e inicia o serviço quando o login e a senha estão definidos |
| `-disable`, `-off` | | Para o serviço e encerra todas as sessões |
| `-pass`, `-p` | `<senha>` | Define a senha (mínimo de oito caracteres). Use aspas para senhas com espaços |
| `-login` | `<nome>` | Define o nome de login |
| `-2fa`, `-totp` | `<new\|qr\|código\|off>` | Cria um QR code, exibe de novo, confirma um código ou desativa o 2FA |

```text
/web -login jorge.admin
/web -p "troque isto pela sua senha"
/web -2fa new
/web -2fa 123456
/web -e
/web -l
/web -d
```

Escaneie o QR code com um app autenticador e substitua `123456` pelo código que ele mostra.
Alterações de login, senha ou 2FA encerram as sessões existentes. Os IDs listados pelo
comando são separados das credenciais do navegador.

Se o Docker define `ZAPBOT_WEB_ENABLED`, a variável decide se o serviço pode ser iniciado
ou parado. Veja [Interface web](../web.md) para configurar a rede e o acesso.
