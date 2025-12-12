// commands/tools/sticker.js
import { downloadMediaMessage } from '@adiwajshing/baileys';
import fs from 'fs-extra';

export default {
    name: 'sticker',
    alias: ['s'],
    description: 'Convierte una imagen o video a sticker.',
    category: 'tools',
    execute: async (sock, message, args, config) => {
        const from = message.key.remoteJid;
        const msg = message.message;
        const type = Object.keys(msg || {})[0];
        
        // Verificar si se está respondiendo a una imagen o video
        const isMedia = (type === 'imageMessage' || type === 'videoMessage' || type === 'extendedTextMessage' && msg.extendedTextMessage?.contextInfo?.quotedMessage);

        if (!isMedia) {
            return sock.sendMessage(from, { text: `Responde a una imagen o video con el comando *${config.prefix}sticker*` }, { quoted: message });
        }
        
        const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage;
        const mime = (quoted?.imageMessage || quoted?.videoMessage)?.mimetype || type;
        
        try {
            const stream = await downloadMediaMessage(
                quoted || message,
                'buffer',
                {},
                { logger: config.logger } // Pasar el logger si está disponible
            );
            
            // Envía el sticker. Baileys maneja la conversión a WebP (sticker) automáticamente.
            await sock.sendMessage(from, { sticker: stream }, { quoted: message });

        } catch (error) {
            console.error('Error al crear sticker:', error);
            await sock.sendMessage(from, { text: '❌ Error al procesar la multimedia para crear el sticker.' }, { quoted: message });
        }
    }
};
