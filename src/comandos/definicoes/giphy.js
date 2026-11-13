/*
 * /giphy: Envia um GIF do GIPHY
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/giphy',
    usage: '/giphy [tag|URL|ID]',
    aliases: [],
    summary: 'Sends a GIF from GIPHY',
    help: 'Sends a GIF from GIPHY as a looping video: random by tag (default: gif.tag), or the GIF chosen by URL or ID. Needs GIPHY_API_KEY in config/.env or the giphy.api.key setting.',
    ex: ['/giphy cats', '/giphy https://giphy.com/gifs/h5WUvmDSB0njFcFeCE'],
    role: USER,
    cron: true
};
