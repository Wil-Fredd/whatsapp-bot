require("dotenv").config();
const sql = require("mssql");


// Configuración de la base de datos usando variables de entorno
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: parseInt(process.env.DB_PORT, 10),
    options: {
        encrypt: process.env.DB_ENCRYPT === "true",
        trustServerCertificate: process.env.DB_TRUST_CERTIFICATE === "true",
    }
};

// Función para conectar a la base de datos
async function conectarDB() {
    try {
        await sql.connect(config);
        // console.log("✅ Conectado a SQL Server");
    } catch (err) {
        console.error("❌ Error en la conexión:", err);
    }
}

async function obtener_numero(nombreUsuario) {
    try {
        if (!nombreUsuario || typeof nombreUsuario !== 'string') {
            console.error("❌ El nombre del usuario es inválido");
            return null;
        }

        const pool = await sql.connect(config);

        // Buscar nombres que *comiencen* con el nombre de usuario proporcionado
        const resultado = await pool.request()
            .input("nombre", sql.NVarChar, nombreUsuario + "%") // Búsqueda LIKE
            .query("SELECT whatsapp_id FROM users WHERE nombre LIKE @nombre");

        if (resultado.recordset.length === 0) {
            console.log("⚠️ No se encontró ningún usuario que comience con ese nombre.");
            return null;
        } else if (resultado.recordset.length === 1) {
            return resultado.recordset[0].whatsapp_id; // Devolvemos el número si hay una sola coincidencia
        } else {
            // Hay múltiples coincidencias, así que necesitamos refinar la búsqueda
            console.log("⚠️ Múltiples usuarios encontrados genera coincidencias.");
            console.log("Por favor, especifique un nombre más completo.");
            return null;
        }

    } catch (err) {
        console.error("❌ Error al obtener el número de teléfono:", err);
        return null;
    }
}

async function obtenerGruposPorNombre(nombreUsuario) {
    try {
        const pool = await sql.connect(config);

        const resultado = await pool.request()
            .input("nombre", sql.NVarChar, nombreUsuario)
            .query("SELECT whatsapp_id FROM users WHERE nombre = @nombre");

        if (resultado.recordset.length > 0) {
            // Asumimos que whatsapp_id contiene una lista de IDs separados por comas
            return resultado.recordset[0].whatsapp_id.split(',').map(id => id.trim());
        } else {
            console.log("⚠️ No se encontró ningún usuario con ese nombre.");
            return null;
        }
    } catch (err) {
        console.error("❌ Error al obtener los IDs de los grupos:", err);
        return null;
    }
}

// Función para buscar respuesta en la base de datos
async function buscarRespuesta(mensaje) {
    try {
        const pool = await sql.connect(config);
        const result = await pool
            .request()
            .input("mensaje", sql.NVarChar, `%${mensaje}%`)
            .query("SELECT TOP 1 respuesta, tipo_respuesta, ruta_archivo FROM faq WHERE pregunta LIKE @mensaje");

        if (result.recordset.length > 0) {
            return {
                respuesta: result.recordset[0].respuesta,
                tipo_respuesta: result.recordset[0].tipo_respuesta,
                ruta_archivo: result.recordset[0].ruta_archivo
            };
        }
        return null;
    } catch (error) {
        console.error("Error al buscar respuesta:", error);
        return null;
    }
}

module.exports = { conectarDB, buscarRespuesta, obtener_numero, obtenerGruposPorNombre };
