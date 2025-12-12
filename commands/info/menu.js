// commands/info/menu.js
export default {
    name: 'menu',
    description: 'Muestra el menú de comandos disponibles.',
    category: 'info',
    execute: async (sock, message, args, config) => {
        const from = message.key.remoteJid;
        
        const menuText = `
*🌟 ISAA-NOVA - Menú de Comandos 🌟*

*Prefijo:* \`${config.prefix}\`

*📁 Info*
- \`${config.prefix}menu\`: Mostrar este menú.
- \`${config.prefix}info\`: Información del bot.
- \`${config.prefix}owner\`: Contacto del dueño.
- \`${config.prefix}ping\`: Latencia del bot.
- \`${config.prefix}stats\`: Estadísticas de uso.

*📁 Games*
- \`${config.prefix}register\`: Registrar tu perfil de juego.
- \`${config.prefix}profile\`: Ver tu perfil.
- \`${config.prefix}daily\`: Reclamo diario.
- \`${config.prefix}work\`: Trabajar y ganar dinero.

*📁 Tools*
- \`${config.prefix}sticker\`: Crear sticker (responde a una imagen/video).
- \`${config.prefix}toimg\`: Convertir sticker a imagen (responde a un sticker).
- \`${config.prefix}translate [lang] [texto]\`: Traducir texto.

*📁 Downloads*
- \`${config.prefix}yt [url]\`: Descargar video de YouTube.
- \`${config.prefix}ytmp3 [url]\`: Descargar audio de YouTube.

*... y muchos más! (30+ comandos)*
`;

        await sock.sendMessage(from, { text: menuText }, { quoted: message });
    }
};
