// handler.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Objeto para almacenar comandos cargados
const commands = {};

// Función para cargar comandos dinámicamente y de forma síncrona
const loadCommands = (commandDir) => {
    
    // Si no existe la carpeta de comandos, crear estructura básica
    if (!fs.existsSync(commandDir)) {
        console.error('❌ ERROR: No existe la carpeta commands/');
        console.log('📁 Creando estructura básica de comandos...');
        
        try {
            const categories = ['info', 'tools', 'games', 'admin'];
            categories.forEach(cat => {
                const catPath = path.join(commandDir, cat);
                fs.mkdirSync(catPath, { recursive: true });
                
                // Crear archivo de ejemplo (síncrono)
                const exampleCmd = path.join(catPath, 'example.js');
                fs.writeFileSync(exampleCmd, 
`export default {
    name: 'example',
    alias: ['ex', 'ejemplo'],
    description: 'Comando de ejemplo',
    category: '${cat}',
    execute: async (sock, message, args, config) => {
        const from = message.key.remoteJid;
        await sock.sendMessage(from, 
            { text: '✅ Este es un comando de ejemplo de ISAA-NOVA' }, 
            { quoted: message }
        );
    }
};`);
            });
            
            console.log('✅ Estructura creada. ¡Reinicia el bot para cargar comandos!');
            return; // Detener la carga aquí, se debe reiniciar.
        } catch (e) {
            console.error('❌ Error al crear estructura:', e.message);
            return;
        }
    }

    // Leer todas las categorías
    const categories = fs.readdirSync(commandDir)
        .filter(f => fs.statSync(path.join(commandDir, f)).isDirectory());

    const commandPromises = [];

    for (const category of categories) {
        const categoryPath = path.join(commandDir, category);
        const commandFiles = fs.readdirSync(categoryPath)
            .filter(f => f.endsWith('.js'));

        for (const file of commandFiles) {
            const commandPath = path.join(categoryPath, file);
            
            const importPromise = import(`file://${commandPath}`)
                .then(module => {
                    const command = module.default;
                    
                    if (command && command.name) {
                        commands[command.name] = command;
                        console.log(`✅ Comando cargado: ${command.name} (${category})`);
                        
                        // Registrar alias
                        if (command.alias && Array.isArray(command.alias)) {
                            command.alias.forEach(alias => {
                                commands[alias] = command;
                            });
                        }
                    }
                })
                .catch(error => {
                    console.error(`❌ Error cargando ${file}:`, error.message);
                });
            
            commandPromises.push(importPromise);
        }
    }

    // Esperar a que todos los comandos se carguen de forma asíncrona
    Promise.all(commandPromises)
        .then(() => {
            console.log(`\n📊 Total comandos cargados: ${Object.keys(commands).length}`);
        })
        .catch(err => {
            console.error('❌ Error general al esperar comandos:', err);
        });
};

// Ejecutar la carga de comandos al inicio
loadCommands(path.join(__dirname, 'commands'));


// Manejar mensajes (Exportado como función asíncrona)
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
        const from = message.key.remoteJid;
         await sock.sendMessage(from, 
            { text: '⚠️ Ocurrió un error inesperado al procesar el mensaje.' }, 
            { quoted: message }
        );
    }
    }
