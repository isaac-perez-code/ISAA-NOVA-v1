// commands/info/menu.js
export default {
    name: 'menu',
    alias: ['help', 'start'],
    description: 'Muestra el menú de comandos disponibles.',
    category: 'info',
    execute: async (sock, message, args, config) => {
        const from = message.key.remoteJid;
        
        const menuText = `
*🌟 ISAA-NOVA - Menú de Comandos 🌟*

*Prefijo:* \`${config.prefix}\`
*Dueño:* ${config.ownerName}

*📁 Info*
- \`${config.prefix}menu\` | \`${config.prefix}help\`: Mostrar este menú.
- \`${config.prefix}info\`: Información del bot.
- \`${config.prefix}owner\`: Contacto del dueño.
- \`${config.prefix}ping\`: Latencia.
- \`${config.prefix}stats\`: Estadísticas de uso.

*📁 Games*
- \`${config.prefix}register\`: Registrar perfil.
- \`${config.prefix}profile\`: Ver perfil.
- \`${config.prefix}daily\`: Reclamo diario.
- \`${config.prefix}work\`: Trabajar.
- \`${config.prefix}rob\`: Robar a otro usuario.

*📁 Tools*
- \`${config.prefix}sticker\` | \`${config.prefix}s\`: Crea sticker (responde a imagen/video).
- \`${config.prefix}toimg\`: Convierte sticker a imagen.
- \`${config.prefix}translate [lang] [texto]\`: Traducir texto.
- \`${config.prefix}calc [operación]\`: Calculadora.

*📁 Group*
- \`${config.prefix}welcome [on/off]\`: Activar/desactivar bienvenida.
- \`${config.prefix}antilink [on/off]\`: Activar/desactivar antilink.
- \`${config.prefix}promote [@user]\`: Promover a admin.
- \`${config.prefix}demote [@user]\`: Degradarlo.

*📁 Downloads*
- \`${config.prefix}yt [url]\`: Descargar video de YouTube.
- \`${config.prefix}ytmp3 [url]\`: Descargar audio de YouTube.
- \`${config.prefix}ytmp4 [url]\`: Descargar video de YouTube.

*... y 30+ comandos más por implementar!*
`;

        await sock.sendMessage(from, { text: menuText }, { quoted: message });
    }
};
