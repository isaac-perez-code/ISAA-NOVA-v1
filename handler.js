// handler.js
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para cargar dinámicamente todos los comandos
const loadCommands = (dir) => {
    const commands = {};
    // CORRECCIÓN CLAVE: Usamos __dirname y 'dir' (que es 'commands') para resolver la ruta absoluta
    const commandDir = path.resolve(__dirname, dir);
    
    // Leer todas las subcarpetas (info, games, tools, etc.)
    // Si la carpeta 'commands' no existe, fs.readdirSync lanzará el error ENOENT.
    // Asegúrate de que existe: ISAA-NOVA-v1/commands/
    try {
        const categories = fs.readdirSync(commandDir).filter(f => fs.statSync(path.join(commandDir, f)).isDirectory());

        for (const category of categories) {
            const categoryPath = path.join(commandDir, category);
            const commandFiles = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));

            for (const file of commandFiles) {
                const commandPath = path.join(categoryPath, file);
                // Importar dinámicamente el comando
                import(`file://${commandPath}`).then(module => {
                    const command = module.default;
                    if (command && command.name) {
                        // Mapear tanto por nombre como por alias (si existe)
                        commands[command.name] = command;
                        if (command.alias && Array.isArray(command.alias)) {
                            command.alias.forEach(alias => {
                                commands[alias] = command;
                            });
                        }
                    }
                }).catch(error => {
                    console.error(`Error al cargar el comando ${file}:`, error);
                });
            }
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`\n======================================================`);
            console.error(`❌ ERROR CRÍTICO: El directorio de comandos no existe.`);
            console.error(`Por favor, crea la carpeta: ${commandDir}`);
            console.error(`======================================================\n`);
        } else {
            console.error("Error desconocido al cargar comandos:", error);
        }
    }
    
    return commands;
};

// Cargar comandos una vez al inicio.
// 'commands' es la ruta relativa a la carpeta del bot.
const commands = loadCommands('commands');

export default async function handleMessage(sock, message, config) {
    const from = message.key.remoteJid;
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    
    // Ignorar mensajes sin prefijo o del propio bot
    if (!text.startsWith(config.prefix) || message.key.fromMe) return;

    // Parsear comando y argumentos
    const args = text.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    const command = commands[commandName];

    if (command) {
        try {
            console.log(`Ejecutando comando: ${commandName} en ${from}`);
            await command.execute(sock, message, args, config);
        } catch (error) {
            console.error(`Error al ejecutar el comando ${commandName}:`, error);
            await sock.sendMessage(from, { text: '❌ Ocurrió un error interno al ejecutar el comando.' }, { quoted: message });
        }
    }
}
