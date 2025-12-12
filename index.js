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
import qrcode from 'qrcode-terminal'; 

// Logger y configuración
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
// FUNCIÓN: Flujo de Vinculación con Menú
// ===================================================
async function handlePairingFlow(sock) {
    
    const rl = readline.createInterface({ input, output });
    console.clear();
    await startBanner(config.botName, config.ownerName); 

    console.log(chalk.bold.yellow('>>> INICIO DE VINCULACIÓN: SELECCIONA MÉTODO <<<'));
    console.log('--------------------------------------------------');
    console.log(chalk.cyan('1. Vincular a través de QR'));
    console.log(chalk.cyan('2. Vincular a través de número'));
    console.log('--------------------------------------------------');
    
    const option = await rl.question('Envie con cuál opción desea vincular (1 o 2): ');
    rl.close();

    if (option === '1') {
        console.log(chalk.green('\n✅ Opción seleccionada: Vincular a través de QR.'));
        console.log(chalk.yellow('Esperando datos de conexión... Escanea el código QR que aparecerá.'));
        // El bot ahora esperará el evento 'qr' en connection.update.

    } else if (option === '2') {
        
        const rl2 = readline.createInterface({ input, output });
        const phoneNumber = await rl2.question('Por favor, ingresa tu número de teléfono (con código de país, ej: 519XXXXXXXX): ');
        rl2.close();

        let cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (cleanedNumber.startsWith('0')) cleanedNumber = cleanedNumber.substring(1);

        try {
            console.log(chalk.yellow(`\nSolicitando código de emparejamiento para +${cleanedNumber}...`));
            const code = await sock.requestPairingCode(cleanedNumber);
            
            console.log(`\n======================================================`);
            console.log(chalk.green(`✅ CÓDIGO DE EMPAREJAMIENTO GENERADO: ${code}`));
            console.log(`======================================================`);
            console.log(chalk.yellow(`\nInstrucciones en WhatsApp:`));
            console.log(`1. Abrir WhatsApp, ir a Ajustes > Dispositivos vinculados.`);
            console.log(`2. Tocar "Vincular un dispositivo" y luego "Vincular con el número de teléfono".`);
            console.log(`3. Ingresar el código de 8 dígitos mostrado arriba: ${code}\n`);
            
        } catch (error) {
            console.error(chalk.red("❌ Error al generar el código de emparejamiento. Intenta con la opción QR."), error);
            exit(1); 
        }

    } else {
        console.error(chalk.red('❌ Opción no válida. Reinicia el bot e intenta de nuevo.'));
        exit(1);
    }
}


// ===================================================
// FUNCIÓN PRINCIPAL DE CONEXIÓN
// ===================================================
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
    const { version } = await fetchLatestBaileysVersion();
    
    // CORRECCIÓN CLAVE: Siempre pasamos el objeto 'state' a makeWASocket
    const auth = state; 

    // 2. Configuración de la conexión
    const sock = makeWASocket({
        version,
        logger,
        auth: auth, 
        browser: ['ISAA-NOVA', 'Safari', '1.0.0'],
        getMessage: async (key) => {}
    });

    // === Lógica de Vinculación si no está registrado ===
    if (!state.creds.registered) {
        await handlePairingFlow(sock); 
    }
    // ===================================================
    
    // 4. Manejar actualización de conexión
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Manejar QR Code 
        if (qr && !state.creds.registered) {
            console.log(chalk.yellow('\nEscanea el siguiente Código QR:'));
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red('Dispositivo desconectado. Elimina la carpeta sessions y reinicia.'));
                exit(0); 
            } 
            
            // Si la conexión se cierra Y NO ESTAMOS REGISTRADOS, no reconectamos.
            if (!sock.authState.creds.registered) {
                console.log(chalk.yellow(`\n⚠️ Esperando vinculación. Si el QR/código falló, reinicia el bot.`));
                return;
            }
            
            // Si ya está registrado, reconectamos
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

    // 6. Manejar mensajes
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

    // 7. Evento de Bienvenida
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
    if (!fs.existsSync(SESSION_PATH)) {
        await startBanner(config.botName, config.ownerName); 
    }
    connectToWhatsApp();
})();
