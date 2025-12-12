// index.js (Versión Estabilizada)
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, requestRegistrationCode, register, jidNormalizedUser } from '@whiskeysockets/baileys';
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
import { spawn } from 'child_process'; // Añadido para la limpieza de tmp (como Ellen-Joe)
import os from 'os'; // Añadido para el directorio temporal

// --- Variables Globales y Configuración (Basado en el estilo Ellen-Joe) ---
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'; // Estabilidad TLS
const logger = pino({ level: 'silent' });
const SESSION_PATH = 'sessions';
const rl = readline.createInterface({ input, output });

// --- Mapeo de reintentos (Crucial para estabilidad de Baileys) ---
const msgRetryCounterMap = {}; 
// --- Módulo de almacenamiento local (Si usas 'store' en makeWASocket) ---
const store = { loadMessage: async (jid, id) => { /* Aquí iría tu lógica de almacenamiento si la tuvieras */ return null; } };

// ===================================================
// FUNCIÓN PARA EL BANNER ASCII ART
// ===================================================
// (Se mantiene igual)
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
// NUEVA FUNCIÓN: Flujo de Vinculación con Menú
// ===================================================
async function handlePairingFlow(sock, state) { // Eliminamos saveCreds de aquí, se guarda en el listener de ev
    
    // Usamos rl interno para esta función para simplificar
    const rl = readline.createInterface({ input, output });
    console.clear();
    await startBanner(config.botName, config.ownerName); 

    console.log(chalk.bold.yellow('>>> INICIO DE VINCULACIÓN: SELECCIONA MÉTODO <<<'));
    console.log('--------------------------------------------------');
    console.log(chalk.cyan('1. Vincular a través de QR'));
    console.log(chalk.cyan('2. Vincular a través de número (CÓDIGO DE 6 DÍGITOS SMS/WhatsApp)'));
    console.log('--------------------------------------------------');
    
    const option = await rl.question('Envie con cuál opción desea vincular (1 o 2): ');
    rl.close();

    if (option === '1') {
        // Opción 1: Código QR 
        console.log(chalk.green('\n✅ Opción seleccionada: Vincular a través de QR.'));
        console.log(chalk.yellow('Esperando datos de conexión... Escanea el código QR que aparecerá.'));
        // La generación del QR ocurrirá en connection.update

    } else if (option === '2') {
        // Opción 2: CÓDIGO CLÁSICO SMS/WhatsApp 
        
        const rl2 = readline.createInterface({ input, output });
        const phoneNumber = await rl2.question('1. Por favor, ingresa tu número de teléfono (con código de país, ej: 519XXXXXXXX): ');
        
        let cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (cleanedNumber.startsWith('0')) cleanedNumber = cleanedNumber.substring(1);

        try {
            console.log(chalk.cyan(`\n2. Solicitando código para +${cleanedNumber}...`));
            
            // Usamos requestRegistrationCode (método SMS/Voice)
            const codeRequest = await sock.requestRegistrationCode({
                method: 'sms', 
                phoneNumber: cleanedNumber,
                state: state
            });

            if (codeRequest.reason === 'too_recent') {
                console.error(chalk.red(`❌ ERROR: Has solicitado un código muy recientemente. Inténtalo de nuevo en unos minutos.`));
                exit(1);
            }
            
            const code = await rl2.question(chalk.yellow('\n3. Ingresa el código de 6 dígitos que recibiste por SMS o WhatsApp: '));
            rl2.close();
            
            console.log(chalk.cyan('\n4. Verificando código y registrando sesión...'));
            
            // Usamos la función register
            const registration = await sock.register(code, codeRequest.registrationCode, cleanedNumber);

            if (registration.status === 'ok') {
                console.log(chalk.green('\n✅ ¡Registro exitoso! Reiniciando la conexión...'));
            } else {
                console.error(chalk.red(`\n❌ ERROR DE REGISTRO. Código incorrecto o fallido: ${registration.reason}`));
                exit(1);
            }

        } catch (error) {
            // Este catch es vital para atrapar errores de red o del servidor de WhatsApp.
            console.error(chalk.red("❌ Error al solicitar/registrar el código. Intenta con la opción QR."), error.message);
            exit(1); 
        }

    } else {
        console.error(chalk.red('❌ Opción no válida. Reinicia el bot e intenta de nuevo.'));
        exit(1);
    }
}


// ===================================================
// FUNCIÓN DE LIMPIEZA DE ARCHIVOS TEMPORALES (Estabilidad)
// ===================================================
function clearTmp() {
    const tmpDir = os.tmpdir()
    // Comando find para eliminar archivos viejos (estilo Ellen-Joe)
    spawn('find', [tmpDir, '-amin', '3', '-type', 'f', '-delete']);
}


// ===================================================
// FUNCIÓN PRINCIPAL DE CONEXIÓN
// ===================================================
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
    const { version } = await fetchLatestBaileysVersion();
    
    // CORRECCIÓN: Siempre pasamos el objeto 'state'
    const auth = state; 

    // 2. Configuración de la conexión
    const sock = makeWASocket({
        version,
        logger,
        auth: auth, 
        browser: ['ISAA-NOVA', 'Safari', '1.0.0'], // Usar Safari en vez de Chrome puede ayudar a la autenticación
        msgRetryCounterMap, // Añadido para estabilidad de mensajes (como Ellen-Joe)
        generateHighQualityLinkPreview: true, // Estabilidad en vistas previas
        getMessage: async (clave) => {
            let jid = jidNormalizedUser(clave.remoteJid)
            // Lógica de carga de mensajes para reintentos (simulando Ellen-Joe)
            let msg = await store.loadMessage(jid, clave.id) 
            return msg?.message || ""
        },
    });

    // === Lógica de Vinculación si no está registrado ===
    if (!state.creds.registered) {
        // Pasamos sock y state para el flujo de registro
        await handlePairingFlow(sock, state); 
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
                console.log(chalk.red('⚠️ SIN CONEXIÓN, BORRE LA CARPETA sessions Y REINICIE.'));
                exit(0); 
            } 
            
            // Si la conexión se cierra Y NO ESTAMOS REGISTRADOS, no reconectamos.
            if (!sock.authState.creds.registered) {
                console.log(chalk.yellow(`\n⚠️ Esperando vinculación. Si el QR/código falló, reinicia el bot.`));
                return;
            }
            
            // Si ya está registrado, reconectamos (Mejor manejo de errores de conexión)
            if ([DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.restartRequired, 408, 428].includes(reason)) {
                console.log(`Conexión cerrada. Razón: ${reason}. Reconectando en 3 segundos...`);
                setTimeout(() => connectToWhatsApp(), 3000); 
            } else {
                 console.log(chalk.red(`\n⚠️！ RAZÓN DE DESCONEXIÓN DESCONOCIDA: ${reason || 'No Encontrado'} >> ${connection || 'No Encontrado'}`));
                 // Aquí puedes decidir si llamas a connectToWhatsApp() o si simplemente sales (exit(1))
                 // Por ahora, salimos para evitar bucles infinitos en errores graves
                 // exit(1);
            }
            
        } else if (connection === 'open') {
            console.log(chalk.bold.green('\n❀ ISAA-NOVA Conectado Exitosamente ❀'));
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

    // 7. Evento de Bienvenida (se mantiene)
    sock.ev.on('group-participants.update', async (data) => {
        // Lógica de bienvenida...
    });
}

// ===================================================
// INICIO DEL BOT Y TAREA DE LIMPIEZA
// ===================================================
(async () => {
    if (!fs.existsSync(SESSION_PATH)) {
        await startBanner(config.botName, config.ownerName); 
    }
    connectToWhatsApp();
    
    // Tarea de limpieza (cada 4 minutos, como Ellen-Joe)
    setInterval(async () => {
        clearTmp();
        console.log(chalk.bold.cyanBright(`\n╭» ❍ MULTIMEDIA ❍\n│→ ARCHIVOS DE LA CARPETA TMP ELIMINADOS\n╰― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ⌫ ♻`));
    }, 1000 * 60 * 4); // 4 minutos
})();
