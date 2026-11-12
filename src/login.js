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
const { t } = require('./i18n');

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
        return t('login.desligado');
    }
    if (senha.length < SENHA_MIN) return t('login.senhaCurta', { min: SENHA_MIN });
    await setSetting('bot.login', criarHash(senha));
    return t('login.senhaGravada');
}

// Apaga a senha do banco de mensagens (o bot grava todo corpo antes de tratar o comando)
const esconderNoBanco = (id) =>
    dbRun("UPDATE messages SET body = '/bot -login ***' WHERE id = ?", [id]).catch(() => {});

/**
 * Tenta o login de quem é de fora. Devolve o texto da resposta.
 * @param {{ numero: string, nome: string, senha: string, isGroup: boolean }} o
 */
async function tentarLogin({ numero, nome, senha, isGroup }) {
    if (isGroup) return t('login.soPrivado');
    const guardado = getSetting('bot.login');
    if (!guardado) return t('login.desativado');
    if (!numero) return t('login.semNumero');
    if (!senha) return t('login.uso');

    const tent = tentativas.get(numero) ?? { erros: 0, ate: 0 };
    if (tent.ate > Date.now()) return t('login.muitasTentativas', { min: Math.ceil((tent.ate - Date.now()) / 60000) });

    if (!conferirSenha(senha, guardado)) {
        tent.erros += 1;
        if (tent.erros >= MAX_ERROS) {
            tent.erros = 0;
            tent.ate = Date.now() + BLOQUEIO_MS;
            await avisarDono(t('login.bloqueadoTitulo'),
                t('login.bloqueadoCorpo', { nome, numero, erros: MAX_ERROS, min: BLOQUEIO_MS / 60000 }));
        }
        tentativas.set(numero, tent);
        printInfo(`/bot -login: senha errada de ${nome} (+${numero})`);
        return t('login.senhaIncorreta');
    }

    tentativas.delete(numero);
    const admins = getSetting('bot.admins');
    if (admins.includes(numero)) return t('login.jaAdmin');
    await setSetting('bot.admins', [...admins, numero]);
    await avisarDono(t('login.novoAdminTitulo'), t('login.novoAdminCorpo', { nome, numero }));
    return t('login.pronto');
}

async function avisarDono(titulo, detalhes) {
    printInfo(`${titulo}: ${detalhes.split('\n')[0]}`);
    await messageToSelf(`${titulo}\n${detalhes}`);
    await alertarPorEmail(titulo, detalhes, { forcar: true });
}

module.exports = { conferirSenha, criarHash, definirSenha, esconderNoBanco, senhaDoLogin, tentarLogin };
