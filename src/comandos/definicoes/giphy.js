/*
 * /giphy: Envia um GIF do GIPHY
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/giphy',
    usage: '/giphy [tag|URL|ID]',
    aliases: ['/gif'],
    summary: 'Envia um GIF do GIPHY',
    help: 'Envia um GIF do GIPHY como vídeo em loop: aleatório pela tag (padrão: gif.tag), ou o GIF escolhido por URL ou ID. Precisa de GIPHY_API_KEY no config/.env ou do setting giphy.api.key.',
    ex: ['/giphy gatos', '/giphy https://giphy.com/gifs/h5WUvmDSB0njFcFeCE'],
    role: USER,
    cron: true
};
