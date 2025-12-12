// index.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import config from './config.js';
import handleMessage from './handler.js';

// Logger
const logger = pino({ level: 'silent' });

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('sessions');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: state,
        browser: ['ISAA-NOVA', 'Safari', '1.0.0'],
        getMessage: async (key) => {
            // Lógica para obtener mensajes (opcional)
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log('Dispositivo desconectado. Por favor, elimina la carpeta sessions y escanea de nuevo.');
            } else if (reason === DisconnectReason.connectionClosed || reason === DisconnectReason.connectionLost || reason === DisconnectReason.restartRequired) {
                console.log(`Conexión cerrada. Razón: ${reason}. Reconectando...`);
                connectToWhatsApp();
            } else {
                console.log(`Conexión cerrada. Error: ${reason}.`);
            }
        } else if (connection === 'open') {
            console.log('Conexión exitosa. Bot listo.');
        }
    });

    // Guardar credenciales
    sock.ev.on('creds.update', saveCreds);

    // Manejar mensajes
    sock.ev.on('messages.upsert', async (m) => {
        if (!m.messages || m.messages.length === 0) return;
        const message = m.messages[0];
        
        // Llama al manejador de comandos
        await handleMessage(sock, message, config);
    });

    // Evento de Bienvenida
    sock.ev.on('group-participants.update', async (data) => {
        const { id, participants, action } = data;
        
        if (action === 'add' && participants.length > 0) {
            try {
                const metadata = await sock.groupMetadata(id);
                const memberJid = participants[0];
                const memberName = memberJid.split('@')[0];
                
                const welcomeText = `👋 ¡Hola @${memberName}! Bienvenido/a al grupo **${metadata.subject}**.\n\nSoy **${config.botName}**.\n\nEscribe **${config.prefix}menu** para ver mis comandos.\n\n🧑‍💻 Mi dueño es: ${config.ownerName}`;
    
                const messageOptions = {
                    caption: welcomeText,
                    mentions: [memberJid]
                };
    
                // Adjuntar la imagen si existe
                if (fs.existsSync(config.logoPath)) {
                    messageOptions.image = fs.readFileSync(config.logoPath);
                } else {
                    messageOptions.text = welcomeText;
                    delete messageOptions.caption;
                    delete messageOptions.image;
                }
    
                await sock.sendMessage(id, messageOptions);

            } catch (error) {
                console.error("Error al enviar bienvenida:", error);
            }
        }
    });
}

connectToWhatsApp();
