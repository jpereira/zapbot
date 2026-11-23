# `/web` · owner

Manage the web interface from your WhatsApp chat with yourself. Without an option,
the command shows whether the service is running and its URL.

| Option | Value | Description |
|---|---|---|
| `-list`, `-l` | | Lists active sessions with their IDs and expiration times in UTC |
| `-destroy`, `-d` | `[id]` | Revokes one session by ID, or all sessions with no ID |
| `-enable`, `-e` | | Enables and starts the service once the login and password are set |
| `-disable`, `-off` | | Stops the service and revokes all sessions |
| `-pass`, `-p` | `<password>` | Sets the password (at least eight characters). Quote a password with spaces |
| `-login` | `<name>` | Sets the login name |
| `-2fa`, `-totp` | `<new\|qr\|code\|off>` | Creates a QR code, shows it again, confirms a code or disables 2FA |

```text
/web -login jorge.admin
/web -p "replace this with your password"
/web -2fa new
/web -2fa 123456
/web -e
/web -l
/web -d
```

Scan the QR code with an authenticator app and replace `123456` with the code it displays.
Changes to the login, password or 2FA revoke existing sessions. Session IDs listed by the
command are separate from the browser credentials.

If Docker sets `ZAPBOT_WEB_ENABLED`, the environment decides whether the service can be started
or stopped. See [Web interface](../web.md) for configuration and network access.
