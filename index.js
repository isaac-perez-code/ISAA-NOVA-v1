// index.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import config from './config.js';
import handleMessage from './handler.js';
import readline from 'readline/promises'; 
import { stdin as input, stdout as output, exit } from 'process';
import chalk from 'chalk'; 

// Logger
const logger = pino({ level: 'silent' });
const SESSION_PATH = 'sessions';

// ===================================================
// FUNCIÓN PARA EL BANNER ASCII ART
// ===================================================
const startBanner = async (botName, ownerName) => {
    const primaryColor = chalk.hex('#1E90FF');
    const secondaryColor = chalk.hex('#87CEEB');

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
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
    const { version } = await fetchLatestBaileysVersion();
    
    // 2. Configuración de la conexión (Activamos pairingCode)
    const sock = makeWASocket({
        version,
        logger,
        pairingCode: true, // CLAVE: Usamos el método de 8 dígitos
        auth: state,
        browser: ['ISAA-NOVA', 'Safari', '1.0.0'],
        getMessage: async (key) => {}
    });

    // 3. === Lógica para el código de emparejamiento (8 dígitos) ===
    if (!sock.authState.creds.registered) {
        
        const rl = readline.createInterface({ input, output });
        console.clear();
        
        const phoneNumber = await rl.question('Por favor, ingresa tu número de teléfono (con código de país, ej: 519XXXXXXXX): ');
        rl.close();

        let cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (cleanedNumber.startsWith('0')) cleanedNumber = cleanedNumber.substring(1);

        try {
            // Utilizamos requestPairingCode que sí está disponible
            const code = await sock.requestPairingCode(cleanedNumber);
            
            console.log(`\n======================================================`);
            console.log(chalk.green(`✅ CÓDIGO DE EMPAREJAMIENTO GENERADO: ${code}`));
            console.log(`======================================================`);
            console.log(chalk.yellow(`\nInstrucciones en WhatsApp:`));
            console.log(`1. Abrir WhatsApp, ir a Ajustes > Dispositivos vinculados.`);
            console.log(`2. Tocar "Vincular un dispositivo" y luego "Vincular con el número de teléfono".`);
            console.log(`3. Ingresar el código de 8 dígitos mostrado arriba: ${code}\n`);
            
        } catch (error) {
            console.error(chalk.red("Error al generar el código de emparejamiento. Revisa el formato del número."), error);
            exit(1); 
        }
    }
    // ===================================================

    // 4. Manejar actualización de conexión
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red('Dispositivo desconectado. Elimina la carpeta sessions y reinicia.'));
                exit(0); 
            } 
            
            // PREVENCIÓN DE BUCLE 408: Si no está registrado, no reconectar mientras se espera el código
            if (!sock.authState.creds.registered) {
                console.log(chalk.yellow(`\n⚠️ Esperando vinculación en WhatsApp. El bot no intentará reconectar.`));
                return; 
            }
            
            // Si ya está registrado, sí reconectamos
            if ([DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.restartRequired, 408, 428].includes(reason)) {
                console.log(`Conexión cerrada. Razón: ${reason}. Reconectando en 3 segundos...`);
                setTimeout(() => connectToWhatsApp(), 3000); 
            } else {
                 console.log(`Conexión cerrada debido a: ${reason}. ${lastDisconnect?.error}`);
            }
            
        } else if (connection === 'open') {
            console.log(chalk.green('Conexión exitosa. Bot listo.'));
        }
    });

    // 5. Guardar credenciales
    sock.ev.on('creds.update', saveCreds);

    // 6. Manejar mensajes (resto de la lógica es la misma)
    sock.ev.on('messages.upsert', async (m) => {
        if (!m.messages || m.messages.length === 0) return;
        const message = m.messages[0];
        if (message.key.remoteJid === 'status@broadcast') return;
        
        try {
            await handleMessage(sock, message, config);
        } catch (error) {
            logger.error('Error al manejar mensaje:', error);
        }
    });

    // 7. Evento de Bienvenida (se mantiene)
    sock.ev.on('group-participants.update', async (data) => {
        const { id, participants, action } = data;
        
        if (action === 'add' && participants.length > 0) {
            try {
                const metadata = await sock.groupMetadata(id);
                const memberJid = participants[0];
                
                const welcomeText = `👋 ¡Hola @${memberJid.split('@')[0]}! Bienvenido/a al grupo **${metadata.subject}**.\n\nSoy **${config.botName}**.\n\nEscribe **${config.prefix}menu** para ver mis comandos.\n\n🧑‍💻 Mi dueño es: ${config.ownerName}`;
    
                const messageOptions = {
                    caption: welcomeText,
                    mentions: [memberJid]
                };
    
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

// INICIO DEL BOT
(async () => {
    // Si ya existe la sesión, simplemente conecta. Si no, pide el número.
    if (fs.existsSync(SESSION_PATH)) {
        await startBanner(config.botName, config.ownerName); 
    }
    connectToWhatsApp();
})();
