// config.js
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
    prefix: '.', // El prefijo para los comandos
    ownerNumber: '51983569753@s.whatsapp.net', // **TU NÚMERO** (Reemplazar con tu código de país y número)
    botName: 'ISAA-NOVA',
    ownerName: 'Isaac Pérez',
    logoPath: `${__dirname}/media/logo.jpg`, // Asegúrate de guardar el logo en media/logo.jpg
};
