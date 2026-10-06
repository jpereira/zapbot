/*
 * Máscara só na apresentação: destinatários e dados salvos continuam íntegros.
 */
function mascararTelefones(texto) {
    return String(texto).replace(
        /(^|[^\w])(\+?\d{10,15})(?!\d|@(?!c\.us\b))/g,
        (_, antes, fone) => {
            const numero = fone.replace(/^\+/, '');
            return antes + (fone.startsWith('+') ? '+' : '') +
                numero.slice(0, 5) + '****' + numero.slice(-2);
        }
    );
}

function tirarOpcaoMascara(args) {
    return args.replace(/"[^"]*"|'[^']*'|\/(?:\\.|[^/])*\/|(^|\s)-(?:mask|m)(?=\s|$)/g,
        (trecho, separador) => separador === undefined ? trecho : separador).trim();
}

module.exports = { mascararTelefones, tirarOpcaoMascara };
