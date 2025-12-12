// index.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import config from './config.js';
import handleMessage from './handler.js';
import readline from 'readline/promises'; 
import { stdin as input, stdout as output, exit } from 'process'; // Importamos 'exit'
import chalk from 'chalk'; // Para colores en el banner

// Logger
const logger = pino({ level: 'silent' });

// ===================================================
// FUNCIÓN PARA EL BANNER ASCII ART PERSONALIZADO
// ===================================================
const startBanner = async (botName, ownerName) => {
    // Definimos los colores
    const primaryColor = chalk.hex('#1E90FF'); // Azul neón
    const secondaryColor = chalk.hex('#87CEEB'); // Azul claro

    // Arte ASCII (Ajustado para terminal)
    const asciiArt = `
${secondaryColor(`             .                                    .`)}
${secondaryColor(`            /|\\                                  /|\\`)}
${secondaryColor(`           / | \\        ${primaryColor('ISAA-NOVA')}         / | \\`)}
${secondaryColor(`          /  |  \\     ${primaryColor('BOT PROFESSIONAL')}    /  |  \\`)}
${secondaryColor(`         /___|___\\                               /___|___\\`)}
${primaryColor(`       /=================================================\\`)}
${primaryColor(`      / ${chalk.yellow('I')}  ${chalk.white('N')}  ${chalk.cyan('F')}  ${chalk.magenta('O')}   ${chalk.green('S')}  ${chalk.red('Y')}  ${chalk.yellow('S')} T E M  ${chalk.white('N')} E T W O R K ${chalk.cyan('X')}/\\`)}
${primaryColor(`     /===================================================\\`)}
`;

    console.log(asciiArt);

    // Mensajes de bienvenida y sistema
    console.log(chalk.bold.hex('#FFD700')(`⭐  NÚCLEO ISAA-NOVA: Online`));
    console.log(chalk.bold.hex('#FFA07A')(`⚙️  Iniciando sistemas... ${botName} está listo para sus comandos.`));
    console.log(chalk.bold.white(`👤  Dueño: ${ownerName}`));
    console.log(chalk.bold.white(`==================================================\n`));
};


// ===================================================
// FUNCIÓN PRINCIPAL DE CONEXIÓN
// ===================================================
async function connectToWhatsApp() {
    // 1. Cargar estado de la sesión
    const { state, saveCreds } = await useMultiFileAuthState('sessions');
    const { version } = await fetchLatestBaileysVersion();
    
    // 2. Configuración de la conexión
    const sock = makeWASocket({
        version,
        logger,
        pairingCode: true, // <-- Activamos el código de emparejamiento
        auth: state,
        browser: ['ISAA-NOVA', 'Safari', '1.0.0'],
        getMessage: async (key) => {
            // Lógica para obtener mensajes si es necesario
        }
    });

    // 3. === Lógica para el código de emparejamiento (solo si no hay sesión registrada) ===
    if (!sock.authState.creds.registered && config.pairingCode) {
        
        const rl = readline.createInterface({ input, output });

        const phoneNumber = await rl.question('Por favor, ingresa tu número de teléfono (con código de país, ej: 519XXXXXXXX): ');
        rl.close();

        // Limpiar el número y vincularlo
        let cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (cleanedNumber.startsWith('0')) cleanedNumber = cleanedNumber.substring(1);

        try {
            const code = await sock.requestPairingCode(cleanedNumber);
            
            console.log(`\n======================================================`);
            console.log(`✅ CÓDIGO DE EMPAREJAMIENTO GENERADO: ${code}`);
            console.log(`======================================================`);
            console.log(`\nInstrucciones en WhatsApp:`);
            console.log(`1. Abrir WhatsApp, ir a Ajustes > Dispositivos vinculados.`);
            console.log(`2. Tocar "Vincular un dispositivo" y luego "Vincular con el número de teléfono".`);
            console.log(`3. Ingresar el código de 8 dígitos mostrado arriba: ${code}\n`);
            
        } catch (error) {
            console.error("Error al generar el código de emparejamiento. Revisa el formato del número:", error);
            exit(1); // Sale del programa si falla la generación
        }
    }
    // ===================================================

    // 4. Manejar actualización de conexión
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

            if (reason === DisconnectReason.loggedOut) {
                console.log('Dispositivo desconectado. Por favor, elimina la carpeta sessions y vincula de nuevo.');
                exit(0); 
            } else if ([DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.restartRequired, 408, 428].includes(reason)) {
                console.log(`Conexión cerrada. Razón: ${reason}. Reconectando en 3 segundos...`);
                setTimeout(() => connectToWhatsApp(), 3000); 
            } else {
                console.log(`Conexión cerrada debido a: ${reason}. ${lastDisconnect?.error}`);
            }
        } else if (connection === 'open') {
            console.log('Conexión exitosa. Bot listo.');
        }
    });

    // 5. Guardar credenciales
    sock.ev.on('creds.update', saveCreds);

    // 6. Manejar mensajes
    sock.ev.on('messages.upsert', async (m) => {
        if (!m.messages || m.messages.length === 0) return;
        const message = m.messages[0];
        if (message.key.remoteJid === 'status@broadcast') return;
        
        await handleMessage(sock, message, config);
    });

    // 7. Evento de Bienvenida
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
    
                // Adjuntar la imagen si existe (media/logo.jpg)
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

// ===================================================
// INICIO DEL BOT (Muestra banner y luego conecta)
// ===================================================
(async () => {
    await startBanner(config.botName, config.ownerName); 
    connectToWhatsApp();
})();
