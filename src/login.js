/*
 * /bot -login <senha>: quem é de fora vira admin (bot.admins) com a senha do dono.
 * A senha nunca fica em claro: o setting 'bot.login' guarda "scrypt$sal$hash" (scrypt com sal
 * aleatório). O dono define com /bot -passwd <senha> (ou off) e é avisado de cada acesso
 * (WhatsApp e e-mail). Errou demais, o número fica bloqueado por um tempo.
 */

const crypto = require('crypto');
const { messageToSelf } = require('./cliente');
const { dbRun } = require('./db');
const { alertarPorEmail } = require('./email');
const { printInfo } = require('./log');
const { getSetting, setSetting } = require('./settings');

const MAX_ERROS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;
const SENHA_MIN = 8;

// numero → { erros, ate }
const tentativas = new Map();

const hash = (senha, sal) => crypto.scryptSync(senha, sal, 32);

function criarHash(senha) {
    const sal = crypto.randomBytes(8);
    return `scrypt$${sal.toString('hex')}$${hash(senha, sal).toString('hex')}`;
}

function conferirSenha(senha, guardado) {
    const [alg, sal, esperado] = String(guardado ?? '').split('$');
    if (alg !== 'scrypt' || !sal || !esperado) return false;
    const a = hash(senha, Buffer.from(sal, 'hex'));
    const b = Buffer.from(esperado, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// O que vem depois do "-login": a senha (o resto da linha, pode ter espaço)
function senhaDoLogin(args) {
    const m = /^\s*-login(?:\s+([\s\S]*?))?\s*$/i.exec(String(args ?? ''));
    return m ? (m[1] ?? '') : null;
}

// O dono define (ou, com "off", apaga) a senha
async function definirSenha(senha) {
    if (/^off$/i.test(senha)) {
        await setSetting('bot.login', '');
        return '🔓 *Login desligado:* ninguém de fora vira admin pela senha.';
    }
    if (senha.length < SENHA_MIN) return `❌ A senha precisa de pelo menos ${SENHA_MIN} caracteres.`;
    await setSetting('bot.login', criarHash(senha));
    return '🔐 *Senha gravada* (só o hash fica no banco). Quem mandar `/bot -login <senha>` no ' +
        'privado vira admin e você é avisado.\n💡 _Apague a sua mensagem com a senha._';
}

// Apaga a senha do banco de mensagens (o bot grava todo corpo antes de tratar o comando)
const esconderNoBanco = (id) =>
    dbRun("UPDATE messages SET body = '/bot -login ***' WHERE id = ?", [id]).catch(() => {});

/**
 * Tenta o login de quem é de fora. Devolve o texto da resposta.
 * @param {{ numero: string, nome: string, senha: string, isGroup: boolean }} o
 */
async function tentarLogin({ numero, nome, senha, isGroup }) {
    if (isGroup) return '🚫 Use o login só no privado.';
    const guardado = getSetting('bot.login');
    if (!guardado) return '🚫 Login desativado.';
    if (!numero) return '🚫 Não consegui identificar o seu número.';
    if (!senha) return '❌ Uso: /bot -login <senha>';

    const t = tentativas.get(numero) ?? { erros: 0, ate: 0 };
    if (t.ate > Date.now()) return `⛔ Muitas tentativas. Aguarde ${Math.ceil((t.ate - Date.now()) / 60000)} min.`;

    if (!conferirSenha(senha, guardado)) {
        t.erros += 1;
        if (t.erros >= MAX_ERROS) {
            t.erros = 0;
            t.ate = Date.now() + BLOQUEIO_MS;
            await avisarDono('🚨 Login bloqueado', `${nome} (+${numero}) errou a senha do /bot -login ` +
                `${MAX_ERROS} vezes. Bloqueado por ${BLOQUEIO_MS / 60000} min.`);
        }
        tentativas.set(numero, t);
        printInfo(`/bot -login: senha errada de ${nome} (+${numero})`);
        return '❌ Senha incorreta.';
    }

    tentativas.delete(numero);
    const admins = getSetting('bot.admins');
    if (admins.includes(numero)) return '👑 Você já é admin.';
    await setSetting('bot.admins', [...admins, numero]);
    await avisarDono('🔑 Novo admin por senha', `${nome} (+${numero}) virou admin com o /bot -login.\n` +
        `Para revogar: /bot -o +${numero}`);
    return '👑 *Pronto:* você agora é admin do bot.';
}

async function avisarDono(titulo, detalhes) {
    printInfo(`${titulo}: ${detalhes.split('\n')[0]}`);
    await messageToSelf(`${titulo}\n${detalhes}`);
    await alertarPorEmail(titulo, detalhes, { forcar: true });
}

module.exports = { conferirSenha, criarHash, definirSenha, esconderNoBanco, senhaDoLogin, tentarLogin };
