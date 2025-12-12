import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
    prefix: '.', // Prefijo de comandos
    ownerNumber: '51983569753@s.whatsapp.net', // Tu número
    botName: 'ISAA-NOVA',
    ownerName: 'Isaac Pérez',
    logoPath: join(__dirname, 'media', 'logo.jpg'),
    
    // Configuración adicional
    pairingCode: true, // Usar código de emparejamiento
    autoReadMessages: true,
    autoTyping: true,
    
    // URLs de APIs (si usas)
    apiKeys: {
        openWeather: 'TU_API_KEY',
        googleSearch: 'TU_API_KEY'
    }
};
