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
const SESSION_PATH = 'sessions'; // Carpeta de la sesión

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
const authenticateWithCode = async (sock) => {
    
    // 1. Pedir el número de teléfono
    const rl = readline.createInterface({ input, output });
    console.clear();
    console.log(chalk.yellow('>>> INICIO DE VINCULACIÓN: CÓDIGO SMS/WHATSAPP <<<'));
    
    const phoneNumber = await rl.question('1. Por favor, ingresa tu número de teléfono (con código de país, ej: 519XXXXXXXX): ');
    let cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanedNumber.startsWith('0')) cleanedNumber = cleanedNumber.substring(1);

    // 2. Solicitar el código al servidor (Meta envía el código de 6 dígitos)
    console.log(chalk.cyan(`\n2. Solicitando código para +${cleanedNumber}...`));
    
    // Aquí es donde el servidor de Meta te envía la notificación/SMS
    const codeRequest = await sock.requestRegistrationCode({
        method: 'sms', // Puedes usar 'sms' o 'voice'
        phoneNumber: cleanedNumber
    });
    
    if (codeRequest.success === false) {
        console.error(chalk.red('❌ ERROR: No se pudo solicitar el código. Verifica el número o espera.'));
        rl.close();
        exit(1);
    }

    // 3. Esperar el código de 6 dígitos que llega por SMS/WhatsApp
    console.log(chalk.yellow('\n>>> ¡IMPORTANTE! Revisa tu WhatsApp o SMS para el código de 6 dígitos. <<<'));
    
    const code = await rl.question('3. Ingresa el código de 6 dígitos que recibiste: ');
    
    // 4. Registrar la sesión con el código
    console.log(chalk.cyan('\n4. Verificando código y registrando sesión...'));
    const registration = await sock.register(code);

    if (registration.success) {
        console.log(chalk.green('\n✅ ¡Registro exitoso! Guardando credenciales...'));
    } else {
        console.error(chalk.red(`\n❌ ERROR DE REGISTRO. Código incorrecto o fallido: ${registration.reason}`));
        rl.close();
        exit(1);
    }
    rl.close();
    // El proceso continuará con la conexión normal
}

// ===================================================
// FUNCIÓN PRINCIPAL DE CONEXIÓN
// ===================================================
async function connectToWhatsApp() {
    // 1. Cargar estado de la sesión
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
    const { version } = await fetchLatestBaileysVersion();
    
    // 2. Configuración de la conexión
    const sock = makeWASocket({
        version,
        logger,
        // Eliminamos pairingCode: true para usar el método de código de 6 dígitos
        auth: state,
        browser: ['ISAA-NOVA', 'Safari', '1.0.0'],
        getMessage: async (key) => {}
    });

    // 3. === Lógica de Autenticación Clásica (Si no está registrado) ===
    if (!sock.authState.creds.registered) {
        await authenticateWithCode(sock);
        // Si el registro es exitoso, el flujo continúa y la conexión se abrirá.
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
            
            // Si la conexión se cierra y ya estamos registrados, intentamos reconectar
            if (sock.authState.creds.registered && [DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.restartRequired, 408, 428].includes(reason)) {
                console.log(`Conexión cerrada. Razón: ${reason}. Reconectando en 3 segundos...`);
                setTimeout(() => connectToWhatsApp(), 3000); 
            } else if (!sock.authState.creds.registered) {
                 // Si no está registrado, no reconectamos aquí; el flujo de authenticateWithCode lo maneja.
                 console.log(chalk.yellow('⚠️ Conexión terminada durante la autenticación. Vuelve a iniciar si no se completó.'));
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
        
        await handleMessage(sock, message, config);
    });

    // 7. Evento de Bienvenida (se mantiene)
    sock.ev.on('group-participants.update', async (data) => {
        // ... (Tu lógica de bienvenida se mantiene aquí)
    });
}

// INICIO DEL BOT
(async () => {
    // Si ya existe la carpeta de sesiones, saltamos el banner para evitar interrupciones en la reconexión.
    if (!fs.existsSync(SESSION_PATH)) {
        await startBanner(config.botName, config.ownerName); 
    }
    connectToWhatsApp();
})();
