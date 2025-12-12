import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar comandos dinámicamente
const loadCommands = () => {
    const commands = {};
    const commandDir = path.join(__dirname, 'commands');
    
    // Si no existe la carpeta de comandos, crear estructura básica
    if (!fs.existsSync(commandDir)) {
        console.error('❌ ERROR: No existe la carpeta commands/');
        console.log('📁 Creando estructura básica de comandos...');
        
        // Crear estructura básica
        const categories = ['info', 'tools', 'games', 'admin'];
        categories.forEach(cat => {
            const catPath = path.join(commandDir, cat);
            if (!fs.existsSync(catPath)) {
                fs.mkdirSync(catPath, { recursive: true });
                // Crear archivo de ejemplo
                const exampleCmd = path.join(catPath, 'example.js');
                if (!fs.existsSync(exampleCmd)) {
                    fs.writeFileSync(exampleCmd, 
`export default {
    name: 'example',
    alias: ['ex', 'ejemplo'],
    description: 'Comando de ejemplo',
    execute: async (sock, message, args, config) => {
        const from = message.key.remoteJid;
        await sock.sendMessage(from, 
            { text: '✅ Este es un comando de ejemplo de ISAA-NOVA' }, 
            { quoted: message }
        );
    }
};`);
                }
            }
        });
        
        console.log('✅ Estructura creada. Reinicia el bot.');
        return commands;
    }

    // Leer todas las categorías
    const categories = fs.readdirSync(commandDir)
        .filter(f => fs.statSync(path.join(commandDir, f)).isDirectory());

    for (const category of categories) {
        const categoryPath = path.join(commandDir, category);
        const commandFiles = fs.readdirSync(categoryPath)
            .filter(f => f.endsWith('.js'));

        for (const file of commandFiles) {
            try {
                const commandPath = `./commands/${category}/${file}`;
                const module = await import(commandPath);
                const command = module.default;
                
                if (command && command.name) {
                    commands[command.name] = command;
                    console.log(`✅ Comando cargado: ${command.name}`);
                    
                    // Registrar alias
                    if (command.alias && Array.isArray(command.alias)) {
                        command.alias.forEach(alias => {
                            commands[alias] = command;
                        });
                    }
                }
            } catch (error) {
                console.error(`❌ Error cargando ${file}:`, error.message);
            }
        }
    }
    
    console.log(`📊 Total comandos cargados: ${Object.keys(commands).length}`);
    return commands;
};

// Cargar comandos al inicio
const commands = await loadCommands();

// Manejar mensajes
export default async function handleMessage(sock, message, config) {
    try {
        const from = message.key.remoteJid;
        const text = message.message?.conversation || 
                     message.message?.extendedTextMessage?.text || 
                     message.message?.imageMessage?.caption || 
                     '';
        
        // Ignorar mensajes sin prefijo o del propio bot
        if (!text.startsWith(config.prefix) || message.key.fromMe) return;

        // Parsear comando
        const args = text.slice(config.prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        
        console.log(`📩 Comando recibido: ${commandName} de ${from}`);

        // Buscar comando
        const command = commands[commandName];
        
        if (!command) {
            await sock.sendMessage(from, 
                { text: `❌ Comando no encontrado. Usa ${config.prefix}menu para ver comandos disponibles.` }, 
                { quoted: message }
            );
            return;
        }

        // Ejecutar comando
        await command.execute(sock, message, args, config);
        
    } catch (error) {
        console.error('❌ Error en handleMessage:', error);
    }
}
