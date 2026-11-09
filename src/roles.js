/*
 * Os níveis, das pessoas e dos comandos: owner > admin > user.
 *
 * Quem digita (o nivel, calculado a cada mensagem):
 *   owner  o dono: a conta pareada ao bot (msg.fromMe);
 *   admin  as pessoas do bot.admins (/bot +a);
 *   user   as pessoas e os grupos do bot.users (/bot +u).
 *
 * O "role" de um comando (e de uma opção) é o nível mínimo de quem pode usá-lo. Um comando
 * `role: ADMIN` com `delegavel: true` o dono ainda pode liberar a um usuário com o /bot +cmd.
 */

const ROLES = Object.freeze({ USER: 'user', ADMIN: 'admin', OWNER: 'owner' });

// Do menos para o mais alto
const ORDEM = [ROLES.USER, ROLES.ADMIN, ROLES.OWNER];

const roleValido = (role) => ORDEM.includes(role);

// Quem tem este nível (null: ninguém) alcança um comando ou uma opção deste role?
const atende = (nivel, role) => ORDEM.indexOf(nivel) >= 0 && ORDEM.indexOf(nivel) >= ORDEM.indexOf(role);

// Um atalho ou um /me com vários {/comando} fica com o role mais alto (o mais restrito) dos alvos
const roleMaisRestrito = (roles) =>
    roles.reduce((a, b) => (ORDEM.indexOf(b) > ORDEM.indexOf(a) ? b : a), ROLES.USER);

module.exports = {
    ORDEM,
    ROLES,
    atende,
    roleMaisRestrito,
    roleValido
};
