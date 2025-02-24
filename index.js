const { useMultiFileAuthState, DisconnectReason, makeWASocket } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const P = require("pino");
const { conectarDB, buscarRespuesta, obtener_numero, obtenerGruposPorNombre } = require("./database");
const emojiRegex = require("emoji-regex");

dotenv.config();

const AUTH_FOLDER = "auth";

const readline = require('readline');

// Crear la interfaz de comandos
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function iniciarBot() {

    // Eliminar credenciales si no existen (para regenerar QR)
    if (!fs.existsSync(AUTH_FOLDER)) {
        fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Esto mostrará el QR automáticamente si es necesario
        logger: P({ level: "error" }) // Reduce los logs a solo errores
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.reason;

            console.log("🔴 Conexión cerrada. Razón:", reason);

            if (reason === DisconnectReason.loggedOut || reason === 401) {
                console.log("❌ Sesión cerrada. Eliminando datos de autenticación...");
                fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });

                console.log("🔄 Reiniciando para generar un nuevo código QR...");
                iniciarBot(); // Reinicia el bot para generar nuevo QR
            } else {
                console.log("🔄 Intentando reconectar...");
                iniciarBot();
            }
        } else if (connection === "open") {
            console.log("✅ Bot conectado a WhatsApp");
            await conectarDB();
        }
    });

    sock.ev.on("creds.update", saveCreds);

    // Función para retraso aleatorio entre respuestas
    function retrasoAleatorio(minSeg, maxSeg) {
        const tiempo = Math.floor(Math.random() * (maxSeg - minSeg + 1)) + minSeg;
        return new Promise(resolve => setTimeout(resolve, tiempo * 1000));
    }

    sock.ev.on("messages.upsert", async (msg) => {
        const mensaje = msg.messages[0];
        if (!mensaje.message || mensaje.key.fromMe) return;

        if (!mensaje.message || mensaje.key.fromMe) return; // Ignorar mensajes propios

        const chatId = mensaje.key.remoteJid;

        if (chatId.endsWith("@g.us")) {
            //console.log(`Mensaje de grupo ignorado: ${chatId}`);
            return;
        }
        // Filtrar para que solo guarde números personales (evitar grupos y difusiones)
        if (!chatId.endsWith("@s.whatsapp.net")) return;

        let texto = "";

        if (mensaje.message.conversation) {
            texto = mensaje.message.conversation;
        } else if (mensaje.message.extendedTextMessage?.text) {
            texto = mensaje.message.extendedTextMessage.text;
        } else if (mensaje.message.stickerMessage) {
            //console.log("Se recibió un sticker. No se responderá.");
            return;
        } else if (mensaje.message.reactionMessage) {
            //console.log("Se recibió una reacción. No se responderá.");
            return;
        } else if (mensaje.message.imageMessage) {
            //console.log("Se recibió una imagen. No se responderá automáticamente.");
            return;
        } else if (mensaje.message.videoMessage) {
            //console.log("Se recibió un video. No se responderá automáticamente.");
            return;
        } else if (mensaje.message.audioMessage || mensaje.message.voiceMessage) {
            //console.log("Se recibió una nota de voz. No se responderá.");
            return;
        }

        // Si no hay texto válido, salir
        if (!texto.trim()) {
            //console.log("Mensaje vacío o sin texto válido.");
            return;
        }

        // Detectar si el mensaje contiene solo emojis
        const regex = emojiRegex();
        const contieneSoloEmojis = texto.match(regex)?.join("").length === texto.length;

        if (contieneSoloEmojis) {
            //console.log("Se recibió solo un emoji. No se responderá.");
            return;
        }

        // const nombre = mensaje.pushName || "Desconocido"; // Nombre del usuario en WhatsApp

        // console.log(`Nuevo mensaje de (${chatId}): ${texto}`); // Notificación de mensajes


        // Registrar usuario si no existe
        //await registrarUsuario(chatId, nombre);

        // Guardar el mensaje en la base de datos
        // await guardarMensaje(chatId, texto);

        // Retraso aleatorio entre 30 y 90 segundos
        /*const tiempoDeEspera = Math.floor(Math.random() * (90 - 30 + 1)) + 30;
        await retrasoAleatorio(tiempoDeEspera, tiempoDeEspera);*/

        /*const respuestaData = await buscarRespuesta(texto);

        if (respuestaData) {
            if (respuestaData.tipo_respuesta === "texto") {
                await sock.sendMessage(chatId, { text: respuestaData.respuesta });
                await sock.readMessages([mensaje.key]);
            }
            else if (respuestaData.tipo_respuesta === "imagen") {
                // Suponiendo que `respuestaData.ruta_archivo` tiene las URLs separadas por comas
                const rutasImagenes = respuestaData.ruta_archivo.split(',');

                // Enviar las imágenes una por una
                for (const rutaImagen of rutasImagenes) {
                    const rutaCompleta = path.join(__dirname, rutaImagen.trim()); // Asegúrate de quitar posibles espacios extra
                    if (fs.existsSync(rutaCompleta)) {
                        await sock.sendMessage(chatId, {
                            image: { url: rutaCompleta },
                            caption: respuestaData.respuesta
                        });
                        await sock.readMessages([mensaje.key]);
                    } else {
                        await sock.sendMessage(chatId, { text: "Lo siento, el archivo solicitado no está disponible." });
                        await sock.readMessages([mensaje.key]);
                    }
                }
            }
            else if (respuestaData.tipo_respuesta === "pdf") {
                const rutaPDF = path.join(__dirname, respuestaData.ruta_archivo);
                if (fs.existsSync(rutaPDF)) {
                    await sock.sendMessage(chatId, {
                        document: { url: rutaPDF },
                        mimetype: "application/pdf",
                        fileName: "Archivo_PDF.pdf",  // Nombre con el que se mostrará en WhatsApp
                        caption: respuestaData.respuesta
                    });
                    await sock.readMessages([mensaje.key]);
                } else {
                    await sock.sendMessage(chatId, { text: "Lo siento, el archivo solicitado no está disponible." });
                    await sock.readMessages([mensaje.key]);
                }
            }
        } else {
            // await sock.sendMessage(chatId, { text: "No tengo información sobre esto, pero te pondré en contacto con soporte." });
            return;
        }*/
    });

    async function enviarRespuesta(destinatarios, texto) {
        try {
            const respuestaData = await buscarRespuesta(texto);
    
            if (!respuestaData) {
                console.log("No se encontró una respuesta para esta pregunta en la base de datos.");
                return;
            }
    
            // Si destinatarios es un solo ID, lo convierte en un array para que el bucle funcione igual
            const destinatariosArray = Array.isArray(destinatarios) ? destinatarios : [destinatarios];
    
            for (const destinatario of destinatariosArray) {
                if (respuestaData.tipo_respuesta === "texto") {
                    await sock.sendMessage(destinatario, { text: respuestaData.respuesta });
                    console.log(`Mensaje enviado a ${destinatario}.`);
                }
                else if (respuestaData.tipo_respuesta === "imagen") {
                    const rutasImagenes = respuestaData.ruta_archivo.split(',');
    
                    for (const rutaImagen of rutasImagenes) {
                        const rutaCompleta = path.join(__dirname, rutaImagen.trim());
                        if (fs.existsSync(rutaCompleta)) {
                            await sock.sendMessage(destinatario, {
                                image: { url: rutaCompleta },
                                caption: respuestaData.respuesta
                            });
                            console.log(`Imagen enviada a ${destinatario}`);
                        } else {
                            console.log(`Imagen no disponible para ${destinatario}`);
                        }
                    }
                }
                else if (respuestaData.tipo_respuesta === "pdf") {
                    const rutaPDF = path.join(__dirname, respuestaData.ruta_archivo);
                    if (fs.existsSync(rutaPDF)) {
                        await sock.sendMessage(destinatario, {
                            document: { url: rutaPDF },
                            mimetype: "application/pdf",
                            fileName: "Archivo_PDF.pdf",
                            caption: respuestaData.respuesta
                        });
                        console.log(`PDF enviado a ${destinatario}.`);
                    } else {
                        console.log(`PDF no disponible para ${destinatario}`);
                    }
                }
            }
        } catch (err) {
            console.error("Error al enviar mensaje:", err);
        }
    }
    
    // Función para enviar el mensaje personalizado (modificada)
    async function enviarMensajePersonalizado(destinatarios, texto) {
        try {
            // Si destinatarios es un solo ID, lo convierte en un array para que el bucle funcione igual
            const destinatariosArray = Array.isArray(destinatarios) ? destinatarios : [destinatarios];
    
            for (const destinatario of destinatariosArray) {
                await sock.sendMessage(destinatario, { text: texto });
                // console.log(`Mensaje personalizado enviado a ${destinatario}: ${texto}`);
                console.log(`Mensaje personalizado enviado a ${destinatario}.`)
            }
        } catch (err) {
            console.error("Error al enviar mensaje personalizado:", err);
        }
    }
    
    // Función para procesar el comando en la consola (modificada)
    async function procesarComando(comando) {
        const partes = comando.split(" ");
        const accion = partes[0];

        if (accion && (accion.toLowerCase() === "cls" || accion.toLowerCase() === "clear")) {
            console.clear(); // Limpia la consola
            console.log("Bot conectado a WhatsApp"); // Vuelve a imprimir el mensaje
        }
    
        else if (accion && accion.toLowerCase() === "env") {
            // (Código para el comando "env" - modificado)
            if (partes.length < 3) {
                console.log("Error: El comando 'env' requiere al menos un nombre de usuario y una pregunta (para buscar en la base de datos).");
                return;
            }
    
            const indiceUltimaPalabraNombre = partes.length - 2;
            const nombreUsuario = partes.slice(1, indiceUltimaPalabraNombre + 1).join(" ");
            const pregunta = partes[partes.length - 1]; // 'pregunta' es la clave para buscar en la base de datos
    
            if (!nombreUsuario) {
                console.log("Error: El nombre de usuario no puede estar vacío.");
                return;
            }
    
            if (!pregunta) {
                console.log("Error: La pregunta (clave de búsqueda) no puede estar vacía.");
                return;
            }
    
            let destinatarios;
            if (nombreUsuario === "SISTEMAS SUC") {
                destinatarios = await obtenerGruposPorNombre(nombreUsuario);
                if (!destinatarios) return; // Si no se encuentran los grupos, se detiene.
            } else {
                const whatsappId = await obtener_numero(nombreUsuario);
                if (!whatsappId) return; // Si no se encuentra el usuario, se detiene.
                destinatarios = whatsappId; // Si es un solo usuario, se asigna el ID
            }
    
            await enviarRespuesta(destinatarios, pregunta); // Llama a la función para buscar en la base de datos
        } else if (accion && accion.toLowerCase() === "env2") {
            // Lógica para enviar un mensaje personalizado (comando "env2" - modificado)
            if (partes.length < 3) {
                console.log("Error: El comando 'env2' requiere un nombre de usuario y un mensaje personalizado.");
                return;
            }
    
            const nombreUsuario = partes.slice(1, 3).join(" "); // Toma las dos siguientes palabras
            const mensajePersonalizado = partes.slice(3).join(" "); // El resto es el mensaje
    
            if (!nombreUsuario) {
                console.log("Error: El nombre de usuario no puede estar vacío.");
                return;
            }
    
            if (!mensajePersonalizado) {
                console.log("Error: El mensaje personalizado no puede estar vacío.");
                return;
            }
    
            let destinatarios;
            if (nombreUsuario === "SISTEMAS SUC") {
                destinatarios = await obtenerGruposPorNombre(nombreUsuario);
                if (!destinatarios) return; // Si no se encuentran los grupos, se detiene.
            } else {
                const whatsappId = await obtener_numero(nombreUsuario);
                if (!whatsappId) return; // Si no se encuentra el usuario, se detiene.
                destinatarios = whatsappId; // Si es un solo usuario, se asigna el ID
            }
    
            await enviarMensajePersonalizado(destinatarios, mensajePersonalizado); // Llama a la función para enviar un mensaje personalizado
        } else {
            console.log("El comando no se reconoce como interno o externo.");
        }
    }
    
    rl.on('line', (input) => {
        procesarComando(input);
    });

    sock.ev.on("creds.update", saveCreds);
}

iniciarBot();

