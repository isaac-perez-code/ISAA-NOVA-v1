// index.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@adiwajshing/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
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
            // Lógica para obtener mensajes si es necesario
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log('Dispositivo desconectado. Por favor, elimina la carpeta sessions y escanea de nuevo.');
            } else if (reason === DisconnectReason.badSession) {
                console.log('Sesión mala. Por favor, elimina la carpeta sessions y escanea de nuevo.');
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log('Conexión cerrada. Reconectando...');
                connectToWhatsApp();
            } else if (reason === DisconnectReason.connectionLost) {
                console.log('Conexión perdida. Reconectando...');
                connectToWhatsApp();
            } else if (reason === DisconnectReason.restartRequired) {
                console.log('Reinicio requerido. Reiniciando...');
                connectToWhatsApp();
            } else {
                console.log(`Conexión cerrada debido a: ${reason}. ${lastDisconnect?.error}`);
            }
        } else if (connection === 'open') {
            console.log('Conexión exitosa. Bot listo.');
        }
    });

    // Guardar credenciales
    sock.ev.on('creds.update', saveCreds);

    // Manejar mensajes
    sock.ev.on('messages.upsert', async (m) => {
        if (!m.messages) return;
        const message = m.messages[0];
        if (message.key.remoteJid === 'status@broadcast') return;
        
        // Llama al manejador de comandos
        await handleMessage(sock, message, config);
    });

    // Evento de adición/salida de grupo (Bienvenida)
    sock.ev.on('group-participants.update', async (data) => {
        const { id, participants, action } = data;
        const metadata = await sock.groupMetadata(id);
        
        if (action === 'add' && participants.length > 0) {
            const memberJid = participants[0];
            const welcomeText = `👋 ¡Hola @${memberJid.split('@')[0]}! Bienvenido/a al grupo **${metadata.subject}**.\n\nSoy **${config.botName}**.\n\nEscribe **${config.prefix}menu** para ver mis comandos.\n\n🧑‍💻 Mi dueño es: ${config.ownerName}`;

            // Envía la imagen y el texto de bienvenida
            if (fs.existsSync(config.logoPath)) {
                await sock.sendMessage(id, { 
                    image: fs.readFileSync(config.logoPath),
                    caption: welcomeText,
                    mentions: [memberJid]
                });
            } else {
                await sock.sendMessage(id, { text: welcomeText, mentions: [memberJid] });
            }
        }
    });
}

connectToWhatsApp();
