# `/web` · owner

Manage the web interface from your WhatsApp chat with yourself. Without an option,
the command shows whether the service is running and its URL.

| Option | Value | Description |
|---|---|---|
| `-list`, `-l` | | Lists active sessions numbered from 1 to N, with expiration times in UTC |
| `-destroy`, `-d` | `[number]` | Revokes a session by its number in the last list, or all without a number |
| `-enable`, `-e` | | Enables and starts the service once the login and password are set |
| `-disable`, `-off` | | Stops the service and revokes all sessions |
| `-pass`, `-p` | `<password>` | Sets the password (at least eight characters). Quote a password with spaces |
| `-login`, `-lg` | `<name>` | Sets the login name |
| `-timeout`, `-t` | `[minutes\|off]` | Shows or sets the idle timeout. The default is 30 minutes |
| `-2fa`, `-totp` | `<new\|qr\|code\|off>` | Creates a QR code, shows it again, confirms a code or disables 2FA |

```text
/web -login jorge.admin
/web -p "replace this with your password"
/web -2fa new
/web -2fa 123456
/web -e
/web -timeout 15
/web -l
/web -d 2
/web -d
```

Scan the QR code with an authenticator app and replace `123456` with the code it displays.
Changes to the login, password or 2FA revoke existing sessions. Use the number from the last list. If the session has expired, refresh with `/web -l`.

If Docker sets `ZAPBOT_WEB_ENABLED`, the environment decides whether the service can be started
or stopped. See [Web interface](../web.md) for configuration and network access.
