// commands/tools/sticker.js
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs-extra';
import { tmpdir } from 'os';
import path from 'path';

export default {
    name: 'sticker',
    alias: ['s'],
    description: 'Convierte una imagen o video a sticker.',
    category: 'tools',
    execute: async (sock, message, args, config) => {
        const from = message.key.remoteJid;
        const msg = message.message;
        
        const type = Object.keys(msg || {})[0];
        let media;
        let isVideo = false;
        
        // 1. Verificar si hay un mensaje citado (quoted)
        if (msg.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quoted = msg.extendedTextMessage.contextInfo.quotedMessage;
            if (quoted.imageMessage) {
                media = quoted.imageMessage;
            } else if (quoted.videoMessage) {
                media = quoted.videoMessage;
                isVideo = true;
            }
        // 2. Verificar si es un mensaje directo (image/videoMessage)
        } else if (type === 'imageMessage') {
            media = msg.imageMessage;
        } else if (type === 'videoMessage') {
            media = msg.videoMessage;
            isVideo = true;
        }

        if (!media) {
            return sock.sendMessage(from, { text: `Responde a una *imagen* o *video* con el comando *${config.prefix}sticker*` }, { quoted: message });
        }
        
        try {
            const buffer = await downloadMediaMessage(
                { message: media, key: message.key, },
                'buffer',
                {},
                { logger: config.logger }
            );

            // Preparar para enviar como sticker
            const stickerOptions = {
                sticker: buffer,
                // Puedes añadir metadatos del sticker aquí (opcional)
                // packname: 'ISAA-NOVA',
                // author: config.ownerName
            };

            await sock.sendMessage(from, stickerOptions, { quoted: message });

        } catch (error) {
            console.error('Error al crear sticker:', error);
            await sock.sendMessage(from, { text: '❌ Error al procesar la multimedia. Asegúrate de que el video no sea muy largo (máx. 10 segundos).' }, { quoted: message });
        }
    }
};
