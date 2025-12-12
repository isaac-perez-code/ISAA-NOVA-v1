// config.js

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
    prefix: '.',             // Prefijo para los comandos (ej: .menu)
    botName: 'ISAA-NOVA',    // Nombre del bot
    ownerName: 'Isaac Pérez', // Nombre del dueño (para mensajes y banner)
    ownerNumber: '51983569753', // Tu número de teléfono con código de país, sin '+' ni guiones.
    pairingCode: true,       // Usar código de emparejamiento en lugar de QR
    logoPath: path.join(__dirname, 'media', 'media/logo.jpg'), // Ruta a tu logo para mensajes de bienvenida
};

export default config;
