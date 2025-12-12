// index.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, startRegistration, register } from '@whiskeysockets/baileys';
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
// FUNCIÓN DE AUTENTICACIÓN CLÁSICA (SMS/WhatsApp)
// ===================================================
const authenticateWithCode = async (sock, state, saveCreds) => {
    
    // 1. Pedir el número de teléfono
    const rl = readline.createInterface({ input, output });
    console.clear();
    console.log(chalk.yellow('>>> INICIO DE VINCULACIÓN: CÓDIGO SMS/WHATSAPP <<<'));
    
    const phoneNumber = await rl.question('1. Por favor, ingresa tu número de teléfono (con código de país, ej: 519XXXXXXXX): ');
    rl.close();
    
    let cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanedNumber.startsWith('0')) cleanedNumber = cleanedNumber.substring(1);

    // 2. Iniciar el registro y solicitar el código (Meta envía la notificación)
    console.log(chalk.cyan(`\n2. Solicitando código para +${cleanedNumber} a través de SMS/WhatsApp...`));
    
    // Utilizamos startRegistration, que es la función correcta para iniciar el proceso
    const registrationResult = await startRegistration({
        method: 'sms', // Método de entrega preferido (sms o voice)
        phoneNumber: cleanedNumber,
        state: state,
        saveCreds: saveCreds
    });
    
    if (registrationResult.reason === 'too_recent') {
        console.log(chalk.red(`❌ ERROR: Has solicitado un código muy recientemente. Inténtalo de nuevo en unos minutos.`));
        exit(1);
    }
    
    // 3. Esperar el código de 6 dígitos que llega por SMS/WhatsApp
    console.log(chalk.yellow('\n>>> ¡IMPORTANTE! Revisa tu WhatsApp o SMS para el código de 6 dígitos. <<<'));
    
    const rl2 = readline.createInterface({ input, output });
    const code = await rl2.question('3. Ingresa el código de 6 dígitos que recibiste: ');
    rl2.close();
    
    // 4. Registrar la sesión con el código
    console.log(chalk.cyan('\n4. Verificando código y registrando sesión...'));
    
    // Utilizamos la función 'register' para completar el proceso
    const registration = await register(code, registrationResult.registrationId, cleanedNumber);

    if (registration.status === 'ok') {
        console.log(chalk.green('\n✅ ¡Registro exitoso! Guardando credenciales...'));
    } else {
        console.error(chalk.red(`\n❌ ERROR DE REGISTRO. Código incorrecto o fallido: ${registration.reason}`));
        exit(1);
    }
    
    // Ahora que tenemos las credenciales, re-iniciamos la conexión
    connectToWhatsApp();
}

// ===================================================
// FUNCIÓN PRINCIPAL DE CONEXIÓN
// ===================================================
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
    const { version } = await fetchLatestBaileysVersion();
    
    // Si no está registrado, iniciamos la autenticación por código SMS
    if (!state.creds.registered) {
        // Ejecutamos la función de autenticación y salimos de esta instancia de connectToWhatsApp
        // La propia función authenticateWithCode llamará a connectToWhatsApp() de nuevo si tiene éxito
        if (!fs.existsSync(SESSION_PATH)) {
            await startBanner(config.botName, config.ownerName); 
        }
        await authenticateWithCode(null, state, saveCreds);
        return; 
    }
    
    // 2. Configuración de la conexión (Solo si ya está registrado)
    const sock = makeWASocket({
        version,
        logger,
        auth: state,
        browser: ['ISAA-NOVA', 'Safari', '1.0.0'],
        getMessage: async (key) => {}
    });

    // 4. Manejar actualización de conexión
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red('Dispositivo desconectado. Elimina la carpeta sessions y reinicia.'));
                exit(0); 
            } 
            
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
        
        // Usamos try-catch para proteger el bot si el handler falla
        try {
            await handleMessage(sock, message, config);
        } catch (error) {
            logger.error('Error al manejar mensaje:', error);
        }
    });

    // 7. Evento de Bienvenida (se mantiene)
    sock.ev.on('group-participants.update', async (data) => {
        // ... (Tu lógica de bienvenida se mantiene aquí)
    });
}

// INICIO DEL BOT
(async () => {
    // Si ya existe la sesión, simplemente conecta. Si no, authenticateWithCode lo manejará.
    if (fs.existsSync(SESSION_PATH)) {
        await startBanner(config.botName, config.ownerName); 
    }
    connectToWhatsApp();
})();
