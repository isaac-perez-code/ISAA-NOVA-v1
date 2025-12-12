// handler.js
import fs from 'fs-extra';
import path from 'path';

// Función para cargar dinámicamente todos los comandos
const loadCommands = (dir) => {
    const commands = {};
    const commandDir = path.resolve(process.cwd(), dir);
    
    // Leer todas las subcarpetas (info, games, tools, etc.)
    const categories = fs.readdirSync(commandDir).filter(f => fs.statSync(path.join(commandDir, f)).isDirectory());

    for (const category of categories) {
        const categoryPath = path.join(commandDir, category);
        // Leer todos los archivos .js dentro de la subcarpeta
        const commandFiles = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));

        for (const file of commandFiles) {
            const commandPath = path.join(categoryPath, file);
            // Importar dinámicamente el comando
            import(`file://${commandPath}`).then(module => {
                const command = module.default;
                if (command.name) {
                    commands[command.name] = command;
                }
            }).catch(error => {
                console.error(`Error al cargar el comando ${file}:`, error);
            });
        }
    }
    return commands;
};

// Cargar comandos una vez al inicio
const commands = loadCommands('commands');

export default async function handleMessage(sock, message, config) {
    const from = message.key.remoteJid;
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    
    // Ignorar mensajes sin prefijo
    if (!text.startsWith(config.prefix)) return;

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
            await sock.sendMessage(from, { text: '❌ Ocurrió un error al ejecutar el comando.' }, { quoted: message });
        }
    }
}
