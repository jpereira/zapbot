/*
 * util/attempts.js: login attempt tracking (/bot -login, the web login, the TOTP and the protected tags).
 */
const bot = require('./helpers/bot');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { attemptFor } = bot.src('util/attempts');

describe('attemptFor', () => {
    test('o contador de erros não reseta só porque o atacante espaçou as tentativas (a brecha que permitia força bruta lenta e silenciosa)', () => {
        const entries = new Map();
        const WINDOW = 15 * 60 * 1000;
        let now = 0;

        // 1º ciclo: 4 erros, sempre abaixo do limite de 5 — ainda não bloqueia
        for (let i = 0; i < 4; i++) {
            const entry = attemptFor(entries, 'atacante', WINDOW, now);
            entry.errors += 1;
        }
        assert.equal(entries.get('atacante').until, 0, 'com só 4 erros, ainda não bloqueou');

        // espera mais que a janela (o que antes resetava o contador para 0) e tenta de novo
        now += WINDOW + 1000;
        const entry = attemptFor(entries, 'atacante', WINDOW, now);
        assert.equal(entry.errors, 4, 'o contador continua de onde parou: a espera não zera os erros');
        entry.errors += 1;
        assert.equal(entry.errors, 5, 'o 5º erro, mesmo espaçado, soma com os anteriores');
    });

    test('ainda bloqueia normalmente quando os erros se acumulam dentro da janela', () => {
        const entries = new Map();
        const WINDOW = 15 * 60 * 1000;
        const now = 0;
        let blockedAt = null;

        for (let i = 1; i <= 5; i++) {
            const entry = attemptFor(entries, 'atacante-rapido', WINDOW, now);
            entry.errors += 1;
            if (entry.errors >= 5) { entry.until = now + WINDOW; blockedAt = i; }
        }

        assert.equal(blockedAt, 5, 'o quinto erro seguido bloqueia');
        assert.ok(entries.get('atacante-rapido').until > now);
    });

    test('uma entrada bloqueada continua bloqueada enquanto o bloqueio não vence, mesmo que o "window" seja curto', () => {
        const entries = new Map();
        const now = 0;
        const entry = attemptFor(entries, 'x', 1000, now);
        entry.until = now + 60_000;
        const later = attemptFor(entries, 'x', 1000, now + 2000);
        assert.equal(later.until, now + 60_000, 'o bloqueio não some só porque o "window" é menor que o tempo passado');
    });

    test('limite de memória: sob pressão, só libera espaço para entradas realmente ociosas (não as recentes)', () => {
        const entries = new Map();
        const now = 1_000_000;
        for (let i = 0; i < 4096; i++) {
            entries.set(`id${i}`, { errors: 1, until: 0, active: false, last: now });
        }
        // todas recentes: nenhuma é removida, e uma nova entrada é recusada (null) em vez de estourar a memória
        assert.equal(attemptFor(entries, 'novo', 60_000, now), null);
        assert.equal(entries.size, 4096);

        // uma entrada bem antiga (mais de 24h ociosa) libera espaço
        entries.get('id0').last = now - 25 * 60 * 60 * 1000;
        const created = attemptFor(entries, 'novo', 60_000, now);
        assert.ok(created, 'agora cabe, porque uma entrada ociosa há mais de 24h foi liberada');
        assert.equal(entries.has('id0'), false);
    });

    test('sem entrada prévia, começa zerada e sem bloqueio', () => {
        const entries = new Map();
        const entry = attemptFor(entries, 'novo', 60_000, 0);
        assert.deepEqual([entry.errors, entry.until, entry.active], [0, 0, false]);
    });
});
