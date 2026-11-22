/*
 * The levels, of people and commands: owner > admin > user.
 *
 * Who types (the level, computed on every message):
 * owner  the owner: the account paired with the bot (msg.fromMe);
 * admin  the bot.admins people (/bot +a);
 * user   the people and groups in bot.users (/bot +u).
 *
 * A command's (and an option's) "role" is the minimum level of whoever can use it. A command
 * `role: ADMIN` with `isDelegable: true` the owner can still allow a user with /bot +cmd.
 */

const ROLES = Object.freeze({ USER: 'user', ADMIN: 'admin', OWNER: 'owner' });

// From lowest to highest
const ORDER = [ROLES.USER, ROLES.ADMIN, ROLES.OWNER];

const roleValid = (role) => ORDER.includes(role);

// Does whoever has this level (null: nobody) reach a command or an option of this role?
const answer = (level, role) => ORDER.indexOf(level) >= 0 && ORDER.indexOf(level) >= ORDER.indexOf(role);

// A shortcut or a /me with several {/command}s gets the highest (most restricted) role of the targets
const roleMoreRestricted = (roles) =>
    roles.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), ROLES.USER);

module.exports = {
    ORDER,
    ROLES,
    answer,
    roleMoreRestricted,
    roleValid
};
