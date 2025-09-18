



// Configuración de IndexedDB
const DB_NAME = 'RifasSucreDB';
const DB_VERSION = 6; // Incrementa cuando hagas cambios
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = (event) => {
            console.error('Error al abrir la base de datos:', event.target.error);
            reject('Error al abrir la base de datos');
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            
            // Verificar si todos los object stores existen
            const neededStores = ['rifas', 'clientes', 'clientesPermanentes', 'codigos', 'configuracion'];
            const missingStores = neededStores.filter(store => !db.objectStoreNames.contains(store));
            
            if (missingStores.length > 0) {
                // Si faltan stores, forzar una actualización
                db.close();
                const newVersion = DB_VERSION + 1;
                const newRequest = indexedDB.open(DB_NAME, newVersion);
                
                newRequest.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    neededStores.forEach(store => {
                        if (!db.objectStoreNames.contains(store)) {
                            if (store === 'codigos') {
                                const codigosStore = db.createObjectStore('codigos', { keyPath: 'codigo' });
                                codigosStore.createIndex('expiracion', 'expiracion', { unique: false });
                            } else if (store === 'clientes') {
                                const clientesStore = db.createObjectStore('clientes', { keyPath: 'id' });
                                clientesStore.createIndex('rifaId', 'rifaId', { unique: false });
                            } else if (store === 'clientesPermanentes') {
                                db.createObjectStore('clientesPermanentes', { keyPath: 'id' });
                            } else {
                                db.createObjectStore(store, { keyPath: store === 'configuracion' ? 'clave' : 'id' });
                            }
                        }
                    });
                };
                
                newRequest.onsuccess = (event) => {
                    db = event.target.result;
                    console.log('Base de datos actualizada correctamente');
                    resolve(db);
                };
                
                newRequest.onerror = (event) => {
                    console.error('Error al actualizar la base de datos:', event.target.error);
                    reject(event.target.error);
                };
            } else {
                console.log('Base de datos abierta correctamente');
                resolve(db);
            }
        };
        
        request.onupgradeneeded = (event) => {
    const db = event.target.result;
    const oldVersion = event.oldVersion;
    
    // Crear object stores si no existen
    if (!db.objectStoreNames.contains('rifas')) {
        db.createObjectStore('rifas', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('clientes')) {
        const clientesStore = db.createObjectStore('clientes', { keyPath: 'id' });
        clientesStore.createIndex('rifaId', 'rifaId', { unique: false });
    }
    if (!db.objectStoreNames.contains('clientesPermanentes')) {
        const clientesPermanentesStore = db.createObjectStore('clientesPermanentes', { keyPath: 'id' });
        clientesPermanentesStore.createIndex('numeroCliente', 'numeroCliente', { unique: true });
        clientesPermanentesStore.createIndex('telefono', 'telefono', { unique: false });
    }
    if (!db.objectStoreNames.contains('codigos')) {
        const codigosStore = db.createObjectStore('codigos', { keyPath: 'codigo' });
        codigosStore.createIndex('expiracion', 'expiracion', { unique: false });
    }
    if (!db.objectStoreNames.contains('configuracion')) {
        db.createObjectStore('configuracion', { keyPath: 'clave' });
    }
    
    console.log("Estructura de IndexedDB actualizada");
};
    });
}

// Funciones para Supabase
async function supabaseRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
            ...options,
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            throw new Error(`Error Supabase: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error en solicitud Supabase:', error);
        throw error;
    }
}

async function verificarCodigoEnDB(codigo) {
    try {
        // Obtener el ID del dispositivo actual
        const dispositivoId = obtenerIdDispositivo();
        
        // Verificar si el código existe y no está siendo usado por otro dispositivo
        const ahora = new Date().toISOString();
        const resultado = await supabaseRequest(`codigos_acceso?codigo=eq.${codigo}&select=*`);
        
        if (resultado.length === 0) {
            console.log('Código no encontrado en Supabase');
            return false;
        }
        
        const codigoObj = resultado[0];
        
        // Verificar expiración
        if (new Date() > new Date(codigoObj.expiracion)) {
            console.log('Código expirado');
            return false;
        }
        
        // Verificar si está siendo usado por otro dispositivo
        if (codigoObj.dispositivo_id && codigoObj.dispositivo_id !== dispositivoId) {
            console.log('Código en uso por otro dispositivo');
            return false;
        }
        
        // Si no está en uso, marcarlo como usado por este dispositivo
        await supabaseRequest(`codigos_acceso?codigo=eq.${codigo}`, {
            method: 'PATCH',
            body: JSON.stringify({
                dispositivo_id: dispositivoId,
                ultimo_uso: ahora
            })
        });
        
        console.log('Código válido y registrado para este dispositivo');
        return true;
        
    } catch (error) {
        console.error('Error al verificar código en Supabase:', error);
        return false;
    }
}

async function generarCodigoSupabase(duracionDias) {
    try {
        const codigo = Math.floor(10000000 + Math.random() * 90000000).toString();
        const expiracion = new Date();
        expiracion.setDate(expiracion.getDate() + duracionDias);
        
        const nuevoCodigo = {
            codigo: codigo,
            expiracion: expiracion.toISOString(),
            generado_por: "superusuario"
        };
        
        await supabaseRequest('codigos_acceso', {
            method: 'POST',
            body: JSON.stringify(nuevoCodigo)
        });
        
        return {
            codigo: codigo,
            expiracion: expiracion.toISOString(),
            duracion: duracionDias
        };
        
    } catch (error) {
        console.error('Error al generar código en Supabase:', error);
        throw error;
    }
}

async function obtenerCodigosActivos() {
    try {
        const ahora = new Date().toISOString();
        return await supabaseRequest(`codigos_acceso?expiracion=gt.${ahora}&select=*&order=creado_en.desc`);
    } catch (error) {
        console.error('Error al obtener códigos activos:', error);
        return [];
    }
}

async function liberarCodigo(codigo) {
    try {
        const dispositivoId = obtenerIdDispositivo();
        const resultado = await supabaseRequest(`codigos_acceso?codigo=eq.${codigo}&select=*`);
        
        if (resultado.length > 0 && resultado[0].dispositivo_id === dispositivoId) {
            await supabaseRequest(`codigos_acceso?codigo=eq.${codigo}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    dispositivo_id: null
                })
            });
            console.log('Código liberado:', codigo);
        }
    } catch (error) {
        console.error('Error al liberar código:', error);
    }
}

// Funciones genéricas para IndexedDB
async function guardarDatos(storeName, data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        const request = store.put(data);
        
        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error(`Error al guardar en ${storeName}:`, event.target.error);
            reject(event.target.error);
        };
    });
}

async function migrarDatosExistentes() {
    try {
        // Migrar clientes permanentes desde localStorage si existen
        if (localStorage.getItem('rifasSucre_clientesPermanentes')) {
            const clientesPermanentesLocal = JSON.parse(localStorage.getItem('rifasSucre_clientesPermanentes'));
            
            // Guardar en IndexedDB
            const tx = db.transaction(['clientesPermanentes'], 'readwrite');
            const store = tx.objectStore('clientesPermanentes');
            
            for (const cliente of clientesPermanentesLocal) {
                await store.put(cliente);
            }
            
            // Eliminar del localStorage
            localStorage.removeItem('rifasSucre_clientesPermanentes');
            console.log('Datos de clientes permanentes migrados desde localStorage');
        }
    } catch (error) {
        console.error('Error en migración de datos:', error);
    }
}

// Función mejorada para guardar rifas
async function guardarRifasEnDB() {
    try {
        const tx = db.transaction('rifas', 'readwrite');
        const store = tx.objectStore('rifas');
        
        // Limpiar store antes de guardar (evita duplicados)
        await store.clear();
        
        // Guardar todas las rifas
        await Promise.all(rifas.map(rifa => store.put(rifa)));
        
        console.log('Rifas guardadas en IndexedDB');
        return true;
    } catch (error) {
        console.error('Error guardando rifas:', error);
        // Fallback a localStorage
        localStorage.setItem('rifasSucre_rifas', JSON.stringify(rifas));
        return false;
    }
}

// Función mejorada para guardar clientes
async function guardarClientesEnDB() {
    try {
        const tx = db.transaction('clientes', 'readwrite');
        const store = tx.objectStore('clientes');
        
        await store.clear();
        await Promise.all(clientes.map(cliente => store.put(cliente)));
        
        console.log('Clientes guardados en IndexedDB');
        return true;
    } catch (error) {
        console.error('Error guardando clientes:', error);
        localStorage.setItem('rifasSucre_clientes', JSON.stringify(clientes));
        return false;
    }
}

// Función unificada para guardar todo
async function guardarTodo() {
    try {
        const rifasOk = await guardarRifasEnDB();
        const clientesOk = await guardarClientesEnDB();
        const clientesPermanentesOk = await guardarClientesPermanentesEnDB();
        const codigosOk = await guardarCodigosEnDB(); // Nueva línea

        if (rifaActiva) {
            await guardarConfiguracion('rifaActiva', rifaActiva);
            localStorage.setItem('rifasSucre_rifaActiva', rifaActiva);
        }
        
        return rifasOk && clientesOk && clientesPermanentesOk && codigosOk;
    } catch (error) {
        console.error('Error en guardarTodo:', error);
        return false;
    }
}

async function guardarClientesPermanentesEnDB() {
    try {
        // Verificar si el object store existe
        if (!db.objectStoreNames.contains('clientesPermanentes')) {
            console.warn('Object store clientesPermanentes no existe, usando localStorage');
            throw new Error('Object store no encontrado');
        }
        
        const tx = db.transaction(['clientesPermanentes'], 'readwrite');
        const store = tx.objectStore('clientesPermanentes');
        
        // Limpiar store antes de guardar
        await store.clear();
        
        // Guardar todos los clientes
        await Promise.all(clientesPermanentes.map(cliente => store.put(cliente)));
        
        console.log('Clientes permanentes guardados en IndexedDB');
        return true;
    } catch (error) {
        console.error('Error guardando clientes permanentes:', error);
        // Fallback a localStorage
        localStorage.setItem('rifasSucre_clientesPermanentes', JSON.stringify(clientesPermanentes));
        return false;
    }
}

async function guardarCodigosEnDB() {
    try {
        // Verificar si el object store existe
        if (!db.objectStoreNames.contains('codigos')) {
            console.warn('Object store codigos no existe, usando localStorage');
            throw new Error('Object store no encontrado');
        }
        
        const tx = db.transaction(['codigos'], 'readwrite');
        const store = tx.objectStore('codigos');
        
        // Limpiar store antes de guardar
        await store.clear();
        
        // Guardar todos los códigos
        await Promise.all(codigosValidos.map(codigo => store.put(codigo)));
        
        console.log('Códigos guardados en IndexedDB');
        return true;
    } catch (error) {
        console.error('Error guardando códigos:', error);
        // Fallback a localStorage
        localStorage.setItem('rifasSucre_codigos', JSON.stringify(codigosValidos));
        return false;
    }
}

function obtenerTodosDatos(storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            console.error(`Error al obtener datos de ${storeName}:`, event.target.error);
            reject(event.target.error);
        };
    });
}

function eliminarDatos(storeName, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error(`Error al eliminar de ${storeName}:`, event.target.error);
            reject(event.target.error);
        };
    });
}

function obtenerConfiguracion(clave) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['configuracion'], 'readonly');
        const store = transaction.objectStore('configuracion');
        const request = store.get(clave);
        
        request.onsuccess = () => resolve(request.result ? request.result.valor : null);
        request.onerror = (event) => {
            console.error('Error al obtener configuración:', event.target.error);
            reject(event.target.error);
        };
    });
}

function guardarConfiguracion(clave, valor) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['configuracion'], 'readwrite');
        const store = transaction.objectStore('configuracion');
        
        const request = store.put({ clave, valor });
        
        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Error al guardar configuración:', event.target.error);
            reject(event.target.error);
        };
    });
}

// Registrar Service Worker para PWA
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registrado:', reg.scope))
            .catch(err => console.log('SW no registrado (esto es normal en local):', err));
    });
} else {
    console.warn('Service Worker no soportado en este entorno');
}



// Variables globales
let rifas = [];
let clientes = [];
let abonos = [];
let rifaActiva = null;
const plantillaFacturaModal = document.getElementById('plantilla-factura-modal');
let superusuarioActivo = false;
let superusuarioTimeout = null;
let filtroClientes = 'todos';
let paginaActualClientes = 1;
const clientesPorPagina = 10;
let codigosValidos = [];
let codigosUsados = [];
let clientesPermanentes = [];
let paginaActualClientesPermanentes = 1;
const clientesPermanentesPorPagina = 20;

// Configuración de Supabase
const SUPABASE_URL = 'https://cnybagckrosizntlafip.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNueWJhZ2Nrcm9zaXpudGxhZmlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMTE0OTYsImV4cCI6MjA3Mzc4NzQ5Nn0.m5rsYhD66yyqOTf3N32qXUzaXTwTnPmNRM-Ie09T1Sc';


// Configurar el manual de usuario
const manualContent = `
<h3>1. Introducción</h3>
<p>Este sistema está diseñado para gestionar rifas, controlar la venta de números y mantener un registro organizado de clientes. Permite:</p>
<ul>
    <li>Registrar números vendidos, apartados o pagados.</li>
    <li>Generar tickets y comprobantes de venta (sin validez tributaria).</li>
    <li>Enviar mensajes automatizados a clientes vía WhatsApp.</li>
    <li>Exportar datos para respaldo y análisis.</li>
</ul>
<p><strong>Nota importante:</strong><br>
Los tickets, comprobantes o documentos generados por este sistema no son facturas legales y no tienen efectos tributarios. Son únicamente para control interno y registro de ventas.</p>

<h3>2. Acceso al Sistema</h3>
<p>Para ingresar, introduzca un código de acceso de 8 dígitos proporcionado por el administrador.</p>

<h3>3. Menú Principal</h3>
<p>El sistema cuenta con las siguientes secciones:</p>
<ul>
    <li><strong>Rifas:</strong> Gestión de todas las rifas activas.</li>
    <li><strong>Clientes:</strong> Registro de participantes y sus números comprados.</li>
    <li><strong>Respaldo:</strong> Opciones para guardar o recuperar datos.</li>
    <li><strong>Clientes Permanentes:</strong> Base de datos de clientes frecuentes.</li>
</ul>

<h3>4. Gestión de Rifas</h3>
<h4>Crear una nueva rifa</h4>
<ol>
    <li>Haga clic en "Nueva Rifa".</li>
    <li>Complete los datos:
        <ul>
            <li>Nombre de la rifa (ejemplo: "Rifa Navideña 2024").</li>
            <li>Total de números (ejemplo: 100).</li>
            <li>Columnas por grilla (organización visual).</li>
            <li>Números por grilla (ejemplo: 25 se dividirá en 4 ya que es de 100 el total en este caso).</li>
            <li>Precio por número (ejemplo: $10).</li>
        </ul>
    </li>
</ol>

<h4>Acciones disponibles por rifa</h4>
<ul>
    <li>✅ <strong>Activar/Desactivar:</strong> Seleccione qué rifa está actualmente en venta.</li>
    <li>🔢 <strong>Ver cuadrícula:</strong> Visualice todos los números (disponibles, apartados o pagados).</li>
    <li>✏️ <strong>Editar:</strong> Modifique los datos de la rifa.</li>
    <li>🗑️ <strong>Eliminar:</strong> Borre la rifa (se eliminarán también los clientes asociados).</li>
    <li>📊 <strong>Generar CSV:</strong> Exporte un listado de números con su estado (útil para Excel).</li>
</ul>

<h3>5. Gestión de Clientes</h3>
<h4>Agregar un nuevo cliente</h4>
<ol>
    <li>Seleccione una rifa activa.</li>
    <li>Haga clic en "Nuevo Cliente".</li>
    <li>Complete los datos:
        <ul>
            <li>Nombre.</li>
            <li>Teléfono (para contacto por WhatsApp).</li>
            <li>Números comprados (puede usar rangos como "001-005" o separar por comas: "001,005,010").</li>
            <li>Estado (Apartado o Pagado).</li>
        </ul>
    </li>
</ol>

<h4>Acciones por cliente</h4>
<ul>
    <li>📲 <strong>WhatsApp:</strong> Envíe un mensaje automático con sus números y estado.</li>
    <li>🎫 <strong>Ticket:</strong> Genere un comprobante para enviar al cliente (sin validez fiscal).</li>
    <li>✏️ <strong>Editar:</strong> Modifique datos del cliente (nombre, teléfono o números).</li>
    <li>🔄 <strong>Alternar estado:</strong> Cambie todos sus números a Pagado o Apartado en un solo paso.</li>
</ul>

<h4>Gestión de números individuales</h4>
<p>Haga clic en cualquier número para:</p>
<ul>
    <li>Cambiar su estado (de Apartado a Pagado o viceversa).</li>
    <li>Eliminarlo del cliente.</li>
</ul>

<h3>6. Clientes Permanentes</h3>
<p>Base de datos para guardar información de clientes frecuentes y reutilizarla en futuras rifas.</p>

<h4>Funciones disponibles</h4>
<ul>
    <li><strong>Agregar existentes:</strong> Al registrar un cliente nuevo, busque en la base para evitar duplicados.</li>
    <li><strong>Editar información:</strong> Actualice nombres o teléfonos.</li>
    <li><strong>Exportar/Importar:</strong> Guarde la lista en CSV o cargue datos desde un archivo.</li>
</ul>

<h3>7. Plantillas y Personalización</h3>
<h4>Mensajes para WhatsApp</h4>
<ul>
    <li><strong>Mensaje estándar:</strong> Texto que se envía al cliente al asignar números.</li>
    <li><strong>Recordatorio para rezagados:</strong> Mensaje para clientes con pagos pendientes.</li>
</ul>

<h4>Diseño de Tickets</h4>
<p>Personalice el formato de los tickets que se envían a los clientes (no es un documento fiscal).</p>

<h4>Configuración de impresión</h4>
<p>Ajuste el ancho (58mm o 80mm) y tamaño de fuente para comprobantes impresos.</p>

<h3>8. Respaldo de Datos</h3>
<ul>
    <li><strong>Crear respaldo:</strong> Guarde toda la información en un archivo seguro.</li>
    <li><strong>Restaurar:</strong> Recupere datos desde una copia anterior en caso de pérdida.</li>
</ul>

<h3>9. Consejos Rápidos</h3>
<ul>
    <li>✔ <strong>Use rangos para números:</strong> "001-010" equivale a 10 números seguidos.</li>
    <li>✔ <strong>Busque clientes antes de registrar:</strong> Evite duplicados en la base de datos.</li>
    <li>✔ <strong>Exporte respaldos regularmente:</strong> Prevenga pérdida de información.</li>
    <li>✔ <strong>Filtros útiles:</strong> Encuentre rápidamente números disponibles o clientes con pagos pendientes.</li>
</ul>

<h3>10. Soporte</h3>
<p>Para problemas técnicos, contacte al administrador del sistema.</p>

<p><strong>Nota final:</strong><br>
Este sistema es una herramienta de gestión interna. Los tickets generados no sustituyen facturas legales y no tienen validez fiscal.</p>
`;

// Configurar evento para mostrar el manual
document.getElementById('btn-manual').addEventListener('click', function() {
    document.getElementById('manual-content').innerHTML = manualContent;
    document.getElementById('manual-modal').classList.remove('hidden');
});

async function initPersistentStorage() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Crear todos los object stores necesarios si no existen
            if (!db.objectStoreNames.contains('config')) {
                db.createObjectStore('config', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('codigos')) {
                const codigosStore = db.createObjectStore('codigos', { keyPath: 'codigo' });
                codigosStore.createIndex('expiracion', 'expiracion', { unique: false });
            }
            if (!db.objectStoreNames.contains('rifas')) {
                db.createObjectStore('rifas', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('clientes')) {
                const clientesStore = db.createObjectStore('clientes', { keyPath: 'id' });
                clientesStore.createIndex('rifaId', 'rifaId', { unique: false });
                clientesStore.createIndex('nombre', 'nombre', { unique: false });
            }
            if (!db.objectStoreNames.contains('clientesPermanentes')) {
                const clientesPermanentesStore = db.createObjectStore('clientesPermanentes', { keyPath: 'id' });
                clientesPermanentesStore.createIndex('numeroCliente', 'numeroCliente', { unique: true });
                clientesPermanentesStore.createIndex('telefono', 'telefono', { unique: false });
            }
            if (!db.objectStoreNames.contains('configuracion')) {
                db.createObjectStore('configuracion', { keyPath: 'clave' });
            }
            
            console.log("Estructura de IndexedDB actualizada");
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log("IndexedDB iniciado correctamente");
            resolve(db);
        };
        
        request.onerror = (event) => {
            console.error("Error al abrir IndexedDB:", event.target.error);
            reject(event.target.error);
        };
    });
}

async function migrarDatosLocales() {
    // Migrar solo si existe data vieja
    if (localStorage.getItem('codigosValidos')) {
        const codigosLocal = JSON.parse(localStorage.getItem('codigosValidos') || "[]");
        const tx = db.transaction('codigos', 'readwrite');
        
        await Promise.all(
            codigosLocal.map(codigo => 
                tx.objectStore('codigos').put(codigo)
            )
        );
        
        localStorage.removeItem('codigosValidos');
    }
}

// Elementos del DOM
const accesoContainer = document.getElementById('acceso-container');
const mainContainer = document.getElementById('main-container');
const codigoAccesoInput = document.getElementById('codigo-acceso');
const btnAcceder = document.getElementById('btn-acceder');
const btnPrueba = document.getElementById('btn-prueba');
const btnSuperusuario = document.getElementById('btn-superusuario');
const btnContacto = document.getElementById('btn-contacto');
const btnRifas = document.getElementById('btn-rifas');
const btnClientes = document.getElementById('btn-clientes');
const btnRespaldo = document.getElementById('btn-respaldo');
const btnSeguridad = document.getElementById('btn-seguridad');
const btnSalir = document.getElementById('btn-salir');
const rifasSection = document.getElementById('rifas-section');
const clientesSection = document.getElementById('clientes-section');
const respaldoSection = document.getElementById('respaldo-section');
const seguridadSection = document.getElementById('seguridad-section');
const rifaActivaInfo = document.getElementById('rifa-activa-info');
const btnCambiarNombre = document.getElementById('btn-cambiar-nombre');
const nombreModal = document.getElementById('nombre-modal');
const appTitle = document.getElementById('app-title');
const plantillaTicketModal = document.getElementById('plantilla-ticket-modal');

// Modales
const superusuarioModal = document.getElementById('superusuario-modal');
const cuadriculaModal = document.getElementById('cuadricula-modal');
const clienteModal = document.getElementById('cliente-modal');
const plantillaModal = document.getElementById('plantilla-modal');
const rifaModal = document.getElementById('rifa-modal');
const seguridadModal = document.getElementById('seguridad-modal');
const confirmacionModal = document.getElementById('confirmacion-modal');

// Cargar datos al iniciar
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initPersistentStorage();
        await migrarDatosExistentes();
        await cargarDatos();
        await inicializarConfiguracionPorDefecto(); // Nueva línea
        configurarEventos();
        
        // Verificar si ya tiene acceso
        const tieneAcceso = await verificarAccesoPersistente();
        if (tieneAcceso || superusuarioActivo) {
            accesoContainer.classList.add('hidden');
            mainContainer.classList.remove('hidden');
            // Asegurar que los elementos existan antes de mostrarlos
            actualizarInfoRifaActiva();
            mostrarSeccion('rifas');
        }
    } catch (error) {
        console.error('Error en inicialización:', error);
        alert('Error al cargar la aplicación. Recarga la página.');
    }
});


async function cargarDatos() {
    try {
        // Primero intentar con IndexedDB
        const [rifasData, clientesData, nombreAppData, codigosData] = await Promise.all([
            obtenerTodosDatos('rifas'),
            obtenerTodosDatos('clientes'),
            obtenerConfiguracion('nombreApp'),
            obtenerTodosDatos('codigos') // Nueva línea
        ]);
        
        rifas = rifasData || [];
        clientes = clientesData || [];
        codigosValidos = codigosData || []; // Nueva línea
        
        // Intentar cargar clientes permanentes de IndexedDB
        try {
            clientesPermanentes = await obtenerTodosDatos('clientesPermanentes') || [];
        } catch (error) {
            console.warn('Error cargando clientes permanentes de IndexedDB:', error);
            // Fallback a localStorage
            const clientesPermanentesLocal = localStorage.getItem('rifasSucre_clientesPermanentes');
            clientesPermanentes = clientesPermanentesLocal ? JSON.parse(clientesPermanentesLocal) : [];
        }
        
        // Si no hay datos, intentar con localStorage
        if (rifas.length === 0 && localStorage.getItem('rifasSucre_rifas')) {
            rifas = JSON.parse(localStorage.getItem('rifasSucre_rifas'));
            await guardarRifasEnDB(); // Migrar a IndexedDB
        }
        
        if (clientes.length === 0 && localStorage.getItem('rifasSucre_clientes')) {
            clientes = JSON.parse(localStorage.getItem('rifasSucre_clientes'));
            await guardarClientesEnDB(); // Migrar a IndexedDB
        }
        
        if (codigosValidos.length === 0 && localStorage.getItem('rifasSucre_codigos')) {
            codigosValidos = JSON.parse(localStorage.getItem('rifasSucre_codigos'));
            await guardarCodigosEnDB(); // Nueva línea: Migrar a IndexedDB
        }
        
        // Cargar rifa activa
        const rifaActivaData = await obtenerConfiguracion('rifaActiva');
        rifaActiva = rifaActivaData || localStorage.getItem('rifasSucre_rifaActiva') || null;
        
        console.log('Datos cargados correctamente');
    } catch (error) {
        console.error('Error cargando datos:', error);
        cargarFallbackLocalStorage();
    }
}

async function inicializarConfiguracionPorDefecto() {
    try {
        // Configuración por defecto
        const configuracionesPorDefecto = [
            { clave: 'plantillaTicketTitulo', valor: 'TICKET DE RIFA' },
            { clave: 'plantillaTicketMensaje', valor: 'Cliente: {nombre}\nTeléfono: {telefono}\nNúmeros: {numeros}\nEstado: {estado}\nFecha: {fecha}' },
            { clave: 'mensajeWhatsAppTicket', valor: 'Link' },
            { clave: 'nombreApp', valor: 'Rifas Sucre' },
            { clave: 'plantillaFactura', valor: 'FACTURA\n\nCliente: {nombre}\nTeléfono: {telefono}\n\nNúmeros:\n{numeros}\n\nPrecio unitario: {precio}\nTotal: {total}\nDeuda: {deuda}\n\nFecha: {fecha}' },
            { clave: 'anchoFactura', valor: '58' },
            { clave: 'tamanoFuenteFactura', valor: '14' }
        ];
        
        // Verificar y guardar cada configuración si no existe
        for (const config of configuracionesPorDefecto) {
            const valorExistente = await obtenerConfiguracion(config.clave);
            if (valorExistente === null) {
                await guardarConfiguracion(config.clave, config.valor);
            }
        }
    } catch (error) {
        console.error('Error inicializando configuración por defecto:', error);
    }
}

// Funciones auxiliares para manejo seguro de IndexedDB
async function safeGetAll(storeName) {
    try {
        return await obtenerTodosDatos(storeName);
    } catch (error) {
        console.warn(`Error al obtener datos de ${storeName}:`, error);
        return [];
    }
}

async function safeGetConfig(clave) {
    try {
        const transaction = db.transaction(['configuracion'], 'readonly');
        const store = transaction.objectStore('configuracion');
        const request = store.get(clave);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result?.valor || null);
            request.onerror = () => resolve(null);
        });
    } catch (error) {
        console.warn(`Error al obtener configuración ${clave}:`, error);
        return null;
    }
}

function cargarFallbackLocalStorage() {
    console.warn("Usando fallback a localStorage");
    const rifasGuardadas = localStorage.getItem('rifasSucre_rifas');
    const clientesGuardados = localStorage.getItem('rifasSucre_clientes');
    const clientesPermanentesGuardados = localStorage.getItem('rifasSucre_clientesPermanentes'); // Nueva línea
    
    if (rifasGuardadas) rifas = JSON.parse(rifasGuardadas);
    if (clientesGuardados) clientes = JSON.parse(clientesGuardados);
    if (clientesPermanentesGuardados) clientesPermanentes = JSON.parse(clientesPermanentesGuardados); // Nueva línea
}

async function guardarAcceso(codigo) {
    try {
        // Guardar en IndexedDB para persistencia
        const tx = db.transaction(['configuracion'], 'readwrite');
        const store = tx.objectStore('configuracion');
        await store.put({ 
            clave: 'ultimo_acceso', 
            valor: codigo,
            timestamp: new Date().toISOString()
        });
        
        // Guardar también en sessionStorage para la sesión actual
        sessionStorage.setItem('codigo_acceso_actual', codigo);
    } catch (error) {
        console.error("Error guardando acceso:", error);
        // Fallback a localStorage
        localStorage.setItem('ultimo_acceso', codigo);
    }
}

async function verificarAccesoPersistente() {
    try {
        // 1. Intentar con IndexedDB primero
        const tx = db.transaction(['configuracion'], 'readonly');
        const store = tx.objectStore('configuracion');
        const request = store.get('ultimo_acceso');
        
        const acceso = await new Promise((resolve) => {
            request.onsuccess = () => resolve(request.result?.valor);
            request.onerror = () => resolve(null);
        });

        if (acceso && await verificarCodigoEnDB(acceso)) {
            return true;
        }
        
        // 2. Fallback a localStorage
        const codigoLocal = localStorage.getItem('ultimo_acceso');
        return codigoLocal && await verificarCodigoEnDB(codigoLocal);
    } catch (error) {
        console.error("Error verificando acceso:", error);
        return false;
    }
}



function mostrarModalClientesPermanentes() {
    const modal = document.getElementById('clientes-permanentes-modal');
    modal.classList.remove('hidden');
    paginaActualClientesPermanentes = 1; // Resetear a la primera página
    cargarClientesPermanentes();
    
    // Configurar buscador
    document.getElementById('buscar-cliente-permanente').addEventListener('input', (e) => {
        const termino = e.target.value.toLowerCase();
        const filas = document.querySelectorAll('#lista-clientes-permanentes tr');
        
        // Mostrar/ocultar filas según el término de búsqueda
        filas.forEach(fila => {
            const textoFila = fila.textContent.toLowerCase();
            fila.style.display = textoFila.includes(termino) ? '' : 'none';
        });
    });
    
    // Configurar botones de exportar/importar
    document.getElementById('btn-exportar-clientes').addEventListener('click', exportarClientesPermanentes);
    document.getElementById('btn-importar-clientes').addEventListener('click', importarClientesPermanentes);
}

async function cargarClientesPermanentes() {
    const tbody = document.getElementById('lista-clientes-permanentes');
    tbody.innerHTML = '';
    
    // Ordenar clientes por número
    const clientesOrdenados = [...clientesPermanentes].sort((a, b) => {
        const numA = parseInt(a.numeroCliente.replace('#', ''));
        const numB = parseInt(b.numeroCliente.replace('#', ''));
        return numA - numB;
    });
    
    // Calcular índices para la paginación
    const inicio = (paginaActualClientesPermanentes - 1) * clientesPermanentesPorPagina;
    const fin = inicio + clientesPermanentesPorPagina;
    const clientesPagina = clientesOrdenados.slice(inicio, fin);
    
    // Crear filas para los clientes de la página actual
    clientesPagina.forEach(cliente => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eee';
        
        tr.innerHTML = `
            <td style="padding: 10px;">${cliente.numeroCliente}</td>
            <td style="padding: 10px;">
                <input type="text" class="editar-nombre" value="${cliente.nombre}" style="width: 100%; border: 1px solid #ddd; padding: 5px;">
            </td>
            <td style="padding: 10px;">
                <input type="text" class="editar-telefono" value="${cliente.telefono}" style="width: 100%; border: 1px solid #ddd; padding: 5px;">
            </td>
            <td style="padding: 10px;">
                <button class="btn-guardar-cliente" data-id="${cliente.id}" style="padding: 5px 10px; background: #27ae60; color: white; border: none; border-radius: 3px;">
                    <i class="fas fa-save"></i>
                </button>
                <button class="btn-eliminar-cliente" data-id="${cliente.id}" style="padding: 5px 10px; background: #e74c3c; color: white; border: none; border-radius: 3px; margin-left: 5px;">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
        
        // Configurar eventos para los botones
        tr.querySelector('.btn-guardar-cliente').addEventListener('click', async (e) => {
            const id = e.target.closest('button').dataset.id;
            const nombre = tr.querySelector('.editar-nombre').value.trim();
            const telefono = tr.querySelector('.editar-telefono').value.trim();
            
            if (!nombre || !telefono) {
                alert('Nombre y teléfono son obligatorios');
                return;
            }
            
            await actualizarClientePermanente(id, nombre, telefono);
        });
        
        tr.querySelector('.btn-eliminar-cliente').addEventListener('click', async (e) => {
            const id = e.target.closest('button').dataset.id;
            await eliminarClientePermanente(id);
        });
    });
    
    // Actualizar controles de paginación
    actualizarControlesPaginacionClientesPermanentes();
}

function actualizarControlesPaginacionClientesPermanentes() {
    const totalClientes = clientesPermanentes.length;
    const totalPaginas = Math.ceil(totalClientes / clientesPermanentesPorPagina);
    
    // Crear o actualizar controles de paginación
    let paginacionContainer = document.querySelector('.paginacion-clientes-permanentes');
    
    if (!paginacionContainer) {
        paginacionContainer = document.createElement('div');
        paginacionContainer.className = 'paginacion-clientes-permanentes';
        paginacionContainer.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            margin-top: 20px;
        `;
        
        const modalContent = document.querySelector('#clientes-permanentes-modal .modal-content');
        modalContent.appendChild(paginacionContainer);
    } else {
        paginacionContainer.innerHTML = '';
    }
    
    // Botón Anterior
    const btnAnterior = document.createElement('button');
    btnAnterior.innerHTML = '<i class="fas fa-chevron-left"></i>';
    btnAnterior.disabled = paginaActualClientesPermanentes === 1;
    btnAnterior.addEventListener('click', () => {
        if (paginaActualClientesPermanentes > 1) {
            paginaActualClientesPermanentes--;
            cargarClientesPermanentes();
        }
    });
    
    // Información de página
    const paginaInfo = document.createElement('span');
    paginaInfo.className = 'pagina-info';
    paginaInfo.textContent = `Página ${paginaActualClientesPermanentes} de ${totalPaginas} - ${totalClientes} clientes`;
    
    // Botón Siguiente
    const btnSiguiente = document.createElement('button');
    btnSiguiente.innerHTML = '<i class="fas fa-chevron-right"></i>';
    btnSiguiente.disabled = paginaActualClientesPermanentes === totalPaginas || totalPaginas === 0;
    btnSiguiente.addEventListener('click', () => {
        if (paginaActualClientesPermanentes < totalPaginas) {
            paginaActualClientesPermanentes++;
            cargarClientesPermanentes();
        }
    });
    
    // Agregar controles al contenedor
    paginacionContainer.appendChild(btnAnterior);
    paginacionContainer.appendChild(paginaInfo);
    paginacionContainer.appendChild(btnSiguiente);
}

async function actualizarClientePermanente(id, nombre, telefono) {
    try {
        const index = clientesPermanentes.findIndex(c => c.id === id);
        if (index === -1) return;
        
        // Guardar el número de cliente antes de actualizar
        const numeroCliente = clientesPermanentes[index].numeroCliente;
        
        // Actualizar cliente permanente
        clientesPermanentes[index] = {
            ...clientesPermanentes[index],
            nombre,
            telefono
        };
        
        // Actualizar todos los clientes en rifas que tengan este número de cliente
        const nuevosClientes = clientes.map(cliente => {
            if (cliente.numeroCliente === numeroCliente) {
                return {
                    ...cliente,
                    nombre,
                    telefono
                };
            }
            return cliente;
        });
        
        // Guardar cambios en ambas bases de datos
        await guardarDatos('clientesPermanentes', clientesPermanentes);
        await guardarDatos('clientes', nuevosClientes);
        
        // Actualizar variables locales
        clientes = nuevosClientes;
        
        alert('Cliente actualizado en ambas bases de datos');
        cargarClientesPermanentes();
        actualizarListaClientes();
    } catch (error) {
        console.error('Error al actualizar cliente:', error);
        alert('Error al actualizar el cliente');
    }
}

async function eliminarClientePermanente(id) {
    if (!confirm('¿Está seguro de que desea eliminar este cliente permanente? Esta acción eliminará el cliente de la base permanente y todas sus participaciones en rifas. Esta acción no se puede deshacer.')) {
        return;
    }
    
    try {
        // Obtener el número de cliente antes de eliminarlo
        const clienteAEliminar = clientesPermanentes.find(c => c.id === id);
        if (!clienteAEliminar) return;
        
        const numeroCliente = clienteAEliminar.numeroCliente;
        
        // 1. Eliminar de clientes permanentes
        clientesPermanentes = clientesPermanentes.filter(c => c.id !== id);
        await guardarDatos('clientesPermanentes', clientesPermanentes);
        
        // 2. Eliminar todas las participaciones en rifas
        const nuevosClientes = clientes.filter(c => c.numeroCliente !== numeroCliente);
        await guardarDatos('clientes', nuevosClientes);
        clientes = nuevosClientes;
        
        alert('Cliente eliminado de ambas bases de datos');
        cargarClientesPermanentes();
        actualizarListaClientes();
    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        alert('Error al eliminar el cliente');
    }
}

async function exportarClientesPermanentes() {
    try {
        // Crear contenido CSV
        let csvContent = "N° Cliente,Nombre,Telefono,Fecha Registro\n";
        
        clientesPermanentes.forEach(cliente => {
            csvContent += `"${cliente.numeroCliente}","${cliente.nombre}","${cliente.telefono}","${cliente.fechaRegistro}"\n`;
        });
        
        // Crear blob y descargar
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Clientes_Permanentes_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert('Clientes exportados correctamente');
    } catch (error) {
        console.error('Error al exportar clientes:', error);
        alert('Error al exportar los clientes');
    }
}

async function importarClientesPermanentes() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async event => {
            try {
                const data = event.target.result;
                
                // Verificar formato del CSV
                if (!data.includes('N° Cliente') || !data.includes('Nombre') || !data.includes('Telefono')) {
                    alert('El archivo CSV no tiene el formato correcto');
                    return;
                }
                
                // Parsear CSV
                const lineas = data.split('\n');
                const encabezados = lineas[0].split(',');
                const nuevosClientes = [];
                
                for (let i = 1; i < lineas.length; i++) {
                    if (!lineas[i].trim()) continue;
                    
                    const valores = lineas[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
                    const cliente = {
                        id: Date.now() + i.toString(),
                        numeroCliente: valores[0].replace(/"/g, ''),
                        nombre: valores[1].replace(/"/g, ''),
                        telefono: valores[2].replace(/"/g, ''),
                        fechaRegistro: valores[3] ? valores[3].replace(/"/g, '') : new Date().toISOString()
                    };
                    
                    nuevosClientes.push(cliente);
                }
                
                if (!confirm(`Se importarán ${nuevosClientes.length} clientes. ¿Desea continuar?`)) {
                    return;
                }
                
                try {
                    // Combinar con clientes existentes (evitando duplicados por número de cliente)
                    const numerosExistentes = new Set(clientesPermanentes.map(c => c.numeroCliente));
                    const clientesParaAgregar = nuevosClientes.filter(c => !numerosExistentes.has(c.numeroCliente));
                    
                    clientesPermanentes = [...clientesPermanentes, ...clientesParaAgregar];
                    await guardarDatos('clientesPermanentes', clientesPermanentes);
                    
                    alert(`Se importaron ${clientesParaAgregar.length} clientes nuevos`);
                    cargarClientesPermanentes();
                } catch (error) {
                    console.error('Error al importar clientes:', error);
                    alert('Error al importar los clientes');
                }
            } catch (error) {
                console.error('Error al procesar archivo CSV:', error);
                alert('Error al procesar el archivo CSV');
            }
        };
        reader.readAsText(file);
    };
    
    input.click();
}

// Código de diagnóstico (puedes eliminarlo después)
async function verificarCodigoGuardado(codigo) {
    const tx = db.transaction(['codigos'], 'readonly');
    const store = tx.objectStore('codigos');
    const request = store.get(codigo);
    
    request.onsuccess = () => {
        console.log('Resultado de búsqueda:', request.result);
        if (!request.result) {
            console.error('El código no existe en la base de datos');
            console.log('Object stores disponibles:', db.objectStoreNames);
        }
    };
    
    request.onerror = (e) => {
        console.error('Error al verificar:', e.target.error);
    };
}

function configurarEventos() {
    // Acceso
    btnAcceder.addEventListener('click', validarAcceso);
    btnSuperusuario.addEventListener('click', mostrarModalSuperusuario);
    btnContacto.addEventListener('click', () => {
        window.open('https://wa.me/584245244171', '_blank');
    });
    
    // Manual de usuario
    document.getElementById('btn-manual').addEventListener('click', function() {
        document.getElementById('manual-content').innerHTML = manualContent;
        document.getElementById('manual-modal').classList.remove('hidden');
    });

    // Menú principal
    btnRifas.addEventListener('click', () => mostrarSeccion('rifas'));
    btnClientes.addEventListener('click', () => mostrarSeccion('clientes'));
    btnRespaldo.addEventListener('click', () => mostrarSeccion('respaldo'));
    btnSeguridad.addEventListener('click', () => mostrarSeccion('seguridad'));
    btnSalir.addEventListener('click', salir);
    btnCambiarNombre.addEventListener('click', mostrarModalCambiarNombre);
    document.getElementById('btn-guardar-nombre').addEventListener('click', guardarNuevoNombre);
    
    document.getElementById('btn-guardar-plantilla-ticket').addEventListener('click', guardarPlantillaTicket);
    document.getElementById('btn-plantilla-factura').addEventListener('click', mostrarModalPlantillaFactura);
    document.getElementById('btn-guardar-plantilla-factura').addEventListener('click', guardarPlantillaFactura);

    // Modales
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.add('hidden');
        });
    });
   
    document.getElementById('btn-clientes-permanentes').addEventListener('click', mostrarModalClientesPermanentes);

    // Superusuario
    document.getElementById('btn-superusuario-acceder').addEventListener('click', validarSuperusuario);
    
    // Eventos de teclado
    codigoAccesoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') validarAcceso();
    });
    
    document.getElementById('superusuario-clave').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') validarSuperusuario();
    });

    // Liberar código al cerrar la página
window.addEventListener('beforeunload', () => {
    const codigoAcceso = sessionStorage.getItem('codigo_acceso_actual');
    if (codigoAcceso) {
        // Usamos sendBeacon para asegurar que la solicitud se complete incluso al cerrar
        navigator.sendBeacon(`${SUPABASE_URL}/rest/v1/codigos_acceso?codigo=eq.${codigoAcceso}`, 
            JSON.stringify({dispositivo_id: null})
        );
    }
});

}

function mostrarModalCambiarNombre() {
    document.getElementById('nuevo-nombre').value = localStorage.getItem('nombreApp') || 'Rifas Sucre';
    nombreModal.classList.remove('hidden');
}

async function guardarNuevoNombre() {
    const nuevoNombre = document.getElementById('nuevo-nombre').value.trim();
    if (!nuevoNombre) {
        alert('Por favor ingresa un nombre válido');
        return;
    }
    
    try {
        // Guardar en localStorage (para compatibilidad)
        localStorage.setItem('nombreApp', nuevoNombre);
        
        // Guardar en IndexedDB para persistencia
        await guardarConfiguracion('nombreApp', nuevoNombre);
        
        // Actualizar la interfaz
        appTitle.textContent = nuevoNombre;
        document.querySelector('#acceso-container h1').textContent = nuevoNombre;
        
        nombreModal.classList.add('hidden');
    } catch (error) {
        console.error('Error al guardar el nombre:', error);
        alert('Error al guardar el nombre. Intenta nuevamente.');
    }
}

// ====== 5. VALIDACIÓN ACTUALIZADA ======
async function validarAcceso() {
    const codigo = codigoAccesoInput.value.trim();
    
    if (!codigo) {
        alert('Ingrese un código de acceso');
        return;
    }

    if (superusuarioActivo) {
        accesoContainer.classList.add('hidden');
        mainContainer.classList.remove('hidden');
        mostrarSeccion('rifas');
        return;
    }

    try {
        const esValido = await verificarCodigoEnDB(codigo);
        
        if (esValido) {
            // Guardar el acceso (sin marcar como usado)
            await guardarAcceso(codigo);
            
            // Iniciar sesión
            accesoContainer.classList.add('hidden');
            mainContainer.classList.remove('hidden');
            mostrarSeccion('rifas');
        } else {
            alert('Código inválido, expirado o en uso por otro dispositivo');
        }
    } catch (error) {
        console.error('Error en validación:', error);
        alert('Error al validar el código');
    }
}



function obtenerIdDispositivo() {
    let id = localStorage.getItem('deviceId');
    if (!id) {
        id = 'd-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('deviceId', id);
    }
    return id;
}


function mostrarModalSuperusuario() {
    superusuarioModal.classList.remove('hidden');
    document.getElementById('superusuario-clave').value = '';
    document.getElementById('superusuario-clave').focus();
}

async function validarSuperusuario() {
    const clave = document.getElementById('superusuario-clave').value.trim();
    const CLAVE_SUPERUSUARIO = "Mkgothicp.01"; // Cambia esto por tu clave real
    
    if (clave === CLAVE_SUPERUSUARIO) {
        superusuarioActivo = true;
        superusuarioModal.classList.add('hidden');
        
        // Configurar timeout de 1 hora
        if (superusuarioTimeout) clearTimeout(superusuarioTimeout);
        superusuarioTimeout = setTimeout(() => {
            superusuarioActivo = false;
            alert('Sesión de superusuario expirada');
        }, 3600000);
        
        // Redirigir
        accesoContainer.classList.add('hidden');
        mainContainer.classList.remove('hidden');
        mostrarSeccion('seguridad');
        
        console.log('Acceso como superusuario concedido');
    } else {
        alert('Clave de superusuario incorrecta');
        document.getElementById('superusuario-clave').value = '';
    }
}

function mostrarSeccion(seccion) {
    // Ocultar todas las secciones
    rifasSection.classList.add('hidden');
    clientesSection.classList.add('hidden');
    respaldoSection.classList.add('hidden');
    seguridadSection.classList.add('hidden');
    
    // Limpiar contenido previo
    rifasSection.innerHTML = '';
    clientesSection.innerHTML = '';
    respaldoSection.innerHTML = '';
    seguridadSection.innerHTML = '';
    
    // Mostrar sección seleccionada
    switch (seccion) {
        case 'rifas':
            mostrarRifas();
            rifasSection.classList.remove('hidden');
            break;
        case 'clientes':
            mostrarClientes();
            clientesSection.classList.remove('hidden');
            break;
        case 'respaldo':
            mostrarRespaldo();
            respaldoSection.classList.remove('hidden');
            break;
        case 'seguridad':
            if (superusuarioActivo || modoPrueba) {
                mostrarSeguridad();
                seguridadSection.classList.remove('hidden');
            } else {
                alert('Acceso denegado. Solo para superusuario.');
                mostrarSeccion('rifas');
            }
            break;
    }
}

function mostrarRifas() {
    rifasSection.innerHTML = '';

    // Botón para crear nueva rifa
    const btnNuevaRifa = document.createElement('button');
    btnNuevaRifa.innerHTML = '<i class="fas fa-plus"></i> Nueva Rifa';
    btnNuevaRifa.addEventListener('click', mostrarModalNuevaRifa);
    rifasSection.appendChild(btnNuevaRifa);

    // Información de rifa activa - crear elemento si no existe
    let infoRifa = document.getElementById('rifa-activa-info');
    if (!infoRifa) {
        infoRifa = document.createElement('div');
        infoRifa.id = 'rifa-activa-info';
        infoRifa.className = 'rifa-activa';
        rifasSection.appendChild(infoRifa);
    }
    
    // Actualizar la información
    actualizarInfoRifaActiva();

    // Lista de rifas
    if (rifas.length === 0) {
        const mensaje = document.createElement('p');
        mensaje.textContent = 'No hay rifas creadas. Crea tu primera rifa.';
        mensaje.style.marginTop = '20px';
        rifasSection.appendChild(mensaje);
        return;
    }

    const listaRifas = document.createElement('div');
    listaRifas.className = 'rifas-lista';
    
    rifas.forEach(rifa => {
        const rifaItem = document.createElement('div');
        rifaItem.className = `rifa-item ${rifaActiva === rifa.id ? 'activa' : ''}`;
        
        const rifaNombre = document.createElement('div');
        rifaNombre.className = 'rifa-nombre';
        rifaNombre.textContent = rifa.nombre;
        
        const rifaInfo = document.createElement('div');
        rifaInfo.className = 'rifa-info';
        rifaInfo.innerHTML = `
            <span>Números: ${rifa.totalNumeros}</span>
            <span>Columnas: ${rifa.columnas}</span>
            <span>Grillas: ${Math.ceil(rifa.totalNumeros / rifa.porGrilla)}</span>
        `;
        
        const rifaEstado = document.createElement('div');
        rifaEstado.className = 'rifa-info';
        
        // Calcular números disponibles, apartados, abonados y pagados
        const clientesRifa = clientes.filter(c => c.rifaId === rifa.id);
        const numerosUnicos = new Set();
        let apartados = 0;
        let abonados = 0;
        let pagados = 0;

        clientesRifa.forEach(cliente => {
            cliente.numeros.split(',').forEach(numCompleto => {
                const num = numCompleto.includes(':') ? numCompleto.split(':')[0] : numCompleto;
                numerosUnicos.add(num);
                
                const estado = numCompleto.includes(':') ? numCompleto.split(':')[1] : cliente.estado;
                const abono = numCompleto.split(':').length > 2 ? parseFloat(numCompleto.split(':')[2]) : 0;
                const precioNumero = rifa.precio || 0;
                
                if (estado === 'pagado' || abono >= precioNumero) {
                    pagados++;
                } else if (abono > 0) {
                    abonados++;
                } else if (estado === 'apartado') {
                    apartados++;
                }
            });
        });

        const disponibles = rifa.totalNumeros - apartados - abonados - pagados;
        
        rifaEstado.innerHTML = `
            <span>Disponibles: ${disponibles}</span>
            <span>Apartados: ${apartados}</span>
            <span>Abonados: ${abonados}</span>
            <span>Pagados: ${pagados}</span>
        `;
        
        const rifaAcciones = document.createElement('div');
        rifaAcciones.className = 'rifa-acciones';
        
        const btnActivar = document.createElement('button');
        btnActivar.textContent = rifaActiva === rifa.id ? 'Activa' : 'Activar';
        btnActivar.addEventListener('click', () => {
            rifaActiva = rifa.id;
            localStorage.setItem('rifasSucre_rifaActiva', rifaActiva);
            mostrarRifas();
            mostrarClientes();
            actualizarInfoRifaActiva();
        });
        
        const btnCuadricula = document.createElement('button');
        btnCuadricula.textContent = 'Ver Cuadrícula';
        btnCuadricula.addEventListener('click', (e) => {
            e.stopPropagation();
            mostrarCuadriculaCompleta(rifa);
        });
        
        const btnEditar = document.createElement('button');
        btnEditar.textContent = 'Editar';
        btnEditar.addEventListener('click', () => mostrarModalEditarRifa(rifa));
        
        const btnEliminar = document.createElement('button');
        btnEliminar.textContent = 'Eliminar';
        btnEliminar.style.backgroundColor = '#e74c3c';
        btnEliminar.addEventListener('click', (e) => {
            e.stopPropagation();
            mostrarConfirmacion(
                'Eliminar Rifa',
                `¿Estás seguro de que deseas eliminar la rifa "${rifa.nombre}"? Todos los clientes asociados también serán eliminados.`,
                () => eliminarRifa(rifa.id)
            );
        });
        
        rifaAcciones.appendChild(btnActivar);
        rifaAcciones.appendChild(btnCuadricula);
        rifaAcciones.appendChild(btnEditar);
        rifaAcciones.appendChild(btnEliminar);
        
        rifaItem.appendChild(rifaNombre);
        rifaItem.appendChild(rifaInfo);
        rifaItem.appendChild(rifaEstado);
        rifaItem.appendChild(rifaAcciones);
        
        listaRifas.appendChild(rifaItem);
    });
    
    rifasSection.appendChild(listaRifas);
}

function mostrarModalNuevaRifa() {
    document.getElementById('rifa-modal-title').textContent = 'Nueva Rifa';
    document.getElementById('rifa-nombre').value = '';
    document.getElementById('rifa-total').value = '';
    document.getElementById('rifa-columnas').value = '';
    document.getElementById('rifa-por-grilla').value = '';
    
    document.getElementById('btn-guardar-rifa').onclick = guardarNuevaRifa;
    rifaModal.classList.remove('hidden');
}

function mostrarModalEditarRifa(rifa) {
    document.getElementById('rifa-modal-title').textContent = 'Editar Rifa';
    document.getElementById('rifa-nombre').value = rifa.nombre;
    document.getElementById('rifa-total').value = rifa.totalNumeros;
    document.getElementById('rifa-columnas').value = rifa.columnas;
    document.getElementById('rifa-por-grilla').value = rifa.porGrilla;
    document.getElementById('rifa-precio').value = rifa.precio || ''; // Nueva línea
    
    document.getElementById('btn-guardar-rifa').onclick = () => guardarRifaEditada(rifa.id);
    rifaModal.classList.remove('hidden');
}

async function guardarNuevaRifa() {
    const nombre = document.getElementById('rifa-nombre').value.trim();
const total = parseInt(document.getElementById('rifa-total').value);
const columnas = parseInt(document.getElementById('rifa-columnas').value);
const porGrilla = parseInt(document.getElementById('rifa-por-grilla').value);
const precio = parseFloat(document.getElementById('rifa-precio').value) || 0;
    
    if (!nombre || isNaN(total) || isNaN(columnas) || isNaN(porGrilla)) {
        alert('Por favor completa todos los campos correctamente');
        return;
    }
    
    if (total <= 0 || columnas <= 0 || porGrilla <= 0) {
        alert('Los valores deben ser mayores a cero');
        return;
    }
    
    const nuevaRifa = {
    id: Date.now().toString(),
    nombre,
    totalNumeros: total,
    columnas,
    porGrilla,
    precio, // Nueva propiedad
    fechaCreacion: new Date().toISOString()
};
    
    try {
        await guardarDatos('rifas', nuevaRifa);
        rifas.push(nuevaRifa);
        await guardarTodo(); // <-- AÑADIR ESTA LÍNEA
        rifaModal.classList.add('hidden');
        mostrarRifas();
    } catch (error) {
        alert('Error al guardar la rifa. Intenta nuevamente.');
    }
}

async function guardarRifaEditada(id) {
    const nombre = document.getElementById('rifa-nombre').value.trim();
    const total = parseInt(document.getElementById('rifa-total').value);
    const columnas = parseInt(document.getElementById('rifa-columnas').value);
    const porGrilla = parseInt(document.getElementById('rifa-por-grilla').value);
    const precio = parseFloat(document.getElementById('rifa-precio').value) || 0;
    
    if (!nombre || isNaN(total) || isNaN(columnas) || isNaN(porGrilla) || isNaN(precio)) {
        alert('Por favor completa todos los campos correctamente');
        return;
    }
    
    if (total <= 0 || columnas <= 0 || porGrilla <= 0 || precio < 0) {
        alert('Los valores deben ser mayores a cero (el precio puede ser cero)');
        return;
    }
    if (total <= 0 || columnas <= 0 || porGrilla <= 0) {
        alert('Los valores deben ser mayores a cero');
        return;
    }
    
    const rifaIndex = rifas.findIndex(r => r.id === id);
    if (rifaIndex === -1) {
        alert('No se encontró la rifa a editar');
        return;
    }
    
    const rifaActualizada = {
        ...rifas[rifaIndex],
        nombre,
        totalNumeros: total,
        columnas,
        porGrilla,
        precio // Agregar esta línea
    };
    
    try {
        await guardarDatos('rifas', rifaActualizada);
        rifas[rifaIndex] = rifaActualizada;
        await guardarTodo(); // <-- AÑADIR ESTA LÍNEA
        rifaModal.classList.add('hidden');
        mostrarRifas();
    } catch (error) {
        alert('Error al actualizar la rifa. Intenta nuevamente.');
    }
}

async function eliminarRifa(id) {
    try {
        // Eliminar clientes asociados primero
        const clientesAsociados = clientes.filter(c => c.rifaId === id);
        for (const cliente of clientesAsociados) {
            await eliminarDatos('clientes', cliente.id);
        }
        
        // Eliminar la rifa
        await eliminarDatos('rifas', id);
        
        // Actualizar las listas locales
        rifas = rifas.filter(r => r.id !== id);
        clientes = clientes.filter(c => c.rifaId !== id);
        
        // Si la rifa eliminada era la activa, limpiar rifaActiva
        if (rifaActiva === id) {
            rifaActiva = null;
            localStorage.removeItem('rifasSucre_rifaActiva');
        }
        
        // Guardar cambios
        await guardarTodo();
        
        // Actualizar la interfaz
        mostrarRifas();
        mostrarClientes();
        actualizarInfoRifaActiva();
    } catch (error) {
        console.error('Error al eliminar la rifa:', error);
        alert('Error al eliminar la rifa. Intenta nuevamente.');
    }
}

function mostrarCuadriculaCompleta(rifa) {
    if (!rifa) {
        console.error("Error: No se proporcionó la rifa.");
        return;
    }

    cuadriculaModal.classList.remove('hidden');
    document.getElementById('modal-rifa-title').textContent = rifa.nombre;

    const cuadriculaContainer = document.getElementById('cuadricula-completa');
    cuadriculaContainer.innerHTML = '';

    const numerosPorGrilla = rifa.porGrilla;
    const totalGrillas = Math.ceil(rifa.totalNumeros / numerosPorGrilla);

    const grillasContainer = document.createElement('div');
    grillasContainer.className = 'grillas-container';
    cuadriculaContainer.appendChild(grillasContainer);

    for (let g = 0; g < totalGrillas; g++) {
        const inicio = g * numerosPorGrilla;
        const fin = Math.min(inicio + numerosPorGrilla, rifa.totalNumeros);

        const grilla = document.createElement('div');
        grilla.className = 'grilla';
        grilla.id = `grilla-${g}`;

        const contenedorBotones = document.createElement('div');
        contenedorBotones.className = 'grilla-botones';

        const btnDescargarGrilla = document.createElement('button');
        btnDescargarGrilla.className = 'btn-descargar-grilla';
        btnDescargarGrilla.innerHTML = '<i class="fas fa-download"></i> Descargar esta grilla';
        btnDescargarGrilla.addEventListener('click', (e) => {
            e.stopPropagation();
            descargarGrillaIndividual(grilla, rifa.nombre, g + 1);
        });
        contenedorBotones.appendChild(btnDescargarGrilla);
        grilla.appendChild(contenedorBotones);

        const tituloGrilla = document.createElement('h3');
        tituloGrilla.textContent = `Grilla ${g + 1}: Números ${inicio.toString().padStart(3, '0')}-${(fin - 1).toString().padStart(3, '0')}`;
        grilla.appendChild(tituloGrilla);

        const numerosContainer = document.createElement('div');
        numerosContainer.className = 'numeros-container';
        numerosContainer.style.gridTemplateColumns = `repeat(${rifa.columnas}, 1fr)`;
        grilla.appendChild(numerosContainer);

        for (let i = inicio; i < fin; i++) {
            const num = i.toString().padStart(3, '0');
            const numeroElement = document.createElement('div');
            numeroElement.className = 'numero-rifa';
            numeroElement.textContent = num;

            const estadoNumero = obtenerEstadoNumero(rifa.id, num);
            if (estadoNumero.cliente) {
                numeroElement.classList.add(estadoNumero.estado);
                numeroElement.title = `${estadoNumero.cliente} - ${estadoNumero.estado}`;
            } else {
                numeroElement.classList.add('disponible');
                numeroElement.title = 'Disponible';
            }

            numerosContainer.appendChild(numeroElement);
        }

        grillasContainer.appendChild(grilla);
    }

    document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        const filtro = this.dataset.filtro;
        const numeros = cuadriculaContainer.querySelectorAll('.numero-rifa');
        
        numeros.forEach(num => {
            num.style.display = 'flex';
            
            if (filtro === 'disponibles' && !num.classList.contains('disponible')) {
                num.style.display = 'none';
            } else if (filtro === 'apartados' && !num.classList.contains('apartado')) {
                num.style.display = 'none';
            } else if (filtro === 'abonados' && !num.classList.contains('abonado')) {
                num.style.display = 'none';
            } else if (filtro === 'pagados' && !num.classList.contains('pagado')) {
                num.style.display = 'none';
            }
        });
    });
});

    document.getElementById('descargar-cuadricula').onclick = () => descargarCuadricula(rifa);
    
    // Configurar control de tamaño de cuadros
    const tamanioCuadros = document.getElementById('tamanio-cuadros');
    const tamanioValor = document.getElementById('tamanio-valor');
    
    tamanioCuadros.addEventListener('input', function() {
        const valor = this.value;
        tamanioValor.textContent = `${valor}px`;
        
        const numeros = document.querySelectorAll('.numero-rifa');
        numeros.forEach(num => {
            num.style.width = `${valor}px`;
            num.style.height = `${valor}px`;
            num.style.fontSize = `${Math.max(10, valor / 2)}px`;
        });
    });
}

function descargarGrillaIndividual(grillaElement, nombreRifa, numeroGrilla) {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading-descarga';
    loadingDiv.innerHTML = `
        <div style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            color: white;
        ">
            <div style="font-size: 20px; margin-bottom: 20px;">
                <i class="fas fa-spinner fa-spin"></i> Generando imagen...
            </div>
            <div style="font-size: 14px;">Por favor espere, esto puede tomar unos segundos</div>
        </div>
    `;
    document.body.appendChild(loadingDiv);

    const elementoOriginal = grillaElement;
    const clone = elementoOriginal.cloneNode(true);
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.background = 'white';
    clone.style.padding = '20px';
    clone.style.borderRadius = '5px';
    
    const botones = clone.querySelector('.grilla-botones');
    if (botones) botones.style.display = 'none';

    document.body.appendChild(clone);

    const opciones = {
        scale: 1,
        logging: true,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: clone.scrollWidth,
        windowHeight: clone.scrollHeight
    };

    setTimeout(() => {
        html2canvas(clone, opciones).then(canvas => {
            const link = document.createElement('a');
            link.download = `Rifa_${nombreRifa}_Grilla_${numeroGrilla}.png`;
            link.href = canvas.toDataURL('image/png', 1.0);
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            
            document.body.removeChild(link);
            document.body.removeChild(clone);
            document.body.removeChild(loadingDiv);
        }).catch(err => {
            console.error('Error al generar imagen:', err);
            alert('Error al generar la imagen. Por favor intente nuevamente.');
            document.body.removeChild(clone);
            document.body.removeChild(loadingDiv);
        });
    }, 500);
}

function obtenerEstadoNumero(rifaId, numero) {
    const clientesConNumero = clientes.filter(c => 
        c.rifaId === rifaId && 
        c.numeros.split(',').some(n => {
            const numPart = n.includes(':') ? n.split(':')[0] : n;
            return numPart === numero;
        })
    ).sort((a, b) => new Date(b.fechaRegistro) - new Date(a.fechaRegistro));
    
    if (clientesConNumero.length === 0) {
        return { estado: 'disponible', cliente: null, abonado: 0 };
    }
    
    const cliente = clientesConNumero[0];
    const numData = cliente.numeros.split(',')
        .find(n => {
            const nPart = n.includes(':') ? n.split(':')[0] : n;
            return nPart === numero;
        });
    
    if (numData && numData.includes(':')) {
        try {
            const partes = numData.split(':');
            const estado = partes.length > 1 ? partes[1] : cliente.estado;
            const abono = partes.length > 2 ? parseFloat(partes[2]) : 0;
            const rifa = rifas.find(r => r.id === rifaId);
            const precioNumero = rifa.precio || 0;
            
            // CORRECCIÓN: Si el estado es "pagado" pero el abono es menor al precio,
            // o si el abono es igual o mayor al precio, forzar estado "pagado"
            let estadoFinal = estado;
            if (estado === 'pagado' || abono >= precioNumero) {
                estadoFinal = 'pagado';
            } else if (abono > 0 && abono < precioNumero) {
                estadoFinal = 'abonado';
            }
            
            // CORRECCIÓN: Si el estado es pagado, el abono debe ser igual al precio
            const abonoFinal = estadoFinal === 'pagado' ? precioNumero : abono;
            
            return {
                estado: estadoFinal,
                cliente: cliente.nombre,
                abonado: abonoFinal
            };
        } catch (error) {
            console.error('Error al procesar número:', numData, error);
            return {
                estado: cliente.estado,
                cliente: cliente.nombre,
                abonado: 0
            };
        }
    } else {
        return {
            estado: cliente.estado,
            cliente: cliente.nombre,
            abonado: 0
        };
    }
}

// Agregar esta función para mostrar el modal de abono
function mostrarModalAbono(numero, cliente) {
    const rifa = rifas.find(r => r.id === cliente.rifaId);
    if (!rifa) return;

    // Buscar información actual del número
    const numInfo = cliente.numeros.split(',').find(n => {
        const [num] = n.split(':');
        return num === numero;
    });

    const [_, estadoActual, abonoActual] = numInfo ? numInfo.split(':') : [numero, 'disponible', '0'];
    const precioNumero = rifa.precio || 0;
    const saldoPendiente = precioNumero - parseFloat(abonoActual || 0);

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <span class="close-modal">&times;</span>
            <h2>Registrar Abono</h2>
            <div class="form-group">
                <label>Cliente: ${cliente.nombre}</label>
            </div>
            <div class="form-group">
                <label>Número: ${numero}</label>
            </div>
            <div class="form-group">
                <label>Precio total: $${precioNumero.toFixed(2)}</label>
            </div>
            <div class="form-group">
                <label>Abonado: $${parseFloat(abonoActual || 0).toFixed(2)}</label>
            </div>
            <div class="form-group">
                <label>Saldo pendiente: $${saldoPendiente.toFixed(2)}</label>
            </div>
            <div class="form-group">
                <label for="monto-abono">Monto del abono:</label>
                <input type="number" id="monto-abono" min="0.01" step="0.01" max="${saldoPendiente}" value="${saldoPendiente}">
            </div>
            <button id="btn-registrar-abono">Registrar Abono</button>
        </div>
    `;

    document.body.appendChild(modal);
    modal.classList.remove('hidden');

    // Configurar eventos
    modal.querySelector('.close-modal').addEventListener('click', () => {
        modal.remove();
    });

    modal.querySelector('#btn-registrar-abono').addEventListener('click', async () => {
        const monto = parseFloat(modal.querySelector('#monto-abono').value);
        
        if (isNaN(monto) || monto <= 0) {
            alert('Ingrese un monto válido');
            return;
        }

        if (monto > saldoPendiente) {
            alert(`El monto no puede exceder el saldo pendiente ($${saldoPendiente.toFixed(2)})`);
            return;
        }

        const success = await registrarAbono(cliente, numero, monto);
        if (success) {
            modal.remove();
            actualizarListaClientes();
            alert(`Abono de $${monto.toFixed(2)} registrado correctamente para el número ${numero}`);
        }
    });
}

// Agregar esta función para registrar abonos
async function registrarAbono(cliente, numero, monto) {
    try {
        // Buscar el número en los números del cliente
        const nuevosNumeros = cliente.numeros.split(',').map(numCompleto => {
            const [num, estado, abonoActual] = numCompleto.split(':');
            if (num === numero) {
                const nuevoAbono = parseFloat(abonoActual || 0) + parseFloat(monto);
                const rifa = rifas.find(r => r.id === cliente.rifaId);
                const precioNumero = rifa.precio || 0;
                
                // Determinar nuevo estado
                let nuevoEstado = estado;
                if (nuevoAbono >= precioNumero) {
                    nuevoEstado = 'pagado';
                } else if (nuevoAbono > 0) {
                    nuevoEstado = 'abonado';
                }
                
                return `${num}:${nuevoEstado}:${nuevoAbono}`;
            }
            return numCompleto;
        });

        // Actualizar cliente
        const clienteActualizado = {
            ...cliente,
            numeros: nuevosNumeros.join(',')
        };

        // Registrar abono en el historial
        const nuevoAbono = {
            id: Date.now().toString(),
            rifaId: cliente.rifaId,
            clienteId: cliente.id,
            numeroCliente: cliente.numeroCliente,
            numero: numero,
            monto: parseFloat(monto),
            fecha: new Date().toISOString()
        };

        // Guardar cambios
        const nuevosClientes = clientes.map(c => c.id === cliente.id ? clienteActualizado : c);
        await guardarTodo();
        clientes = nuevosClientes;

        abonos.push(nuevoAbono);
        // Nota: Necesitarías implementar guardarAbonos() si quieres persistencia

        return true;
    } catch (error) {
        console.error('Error al registrar abono:', error);
        alert('Error al registrar el abono. Intente nuevamente.');
        return false;
    }
}

function descargarCuadricula(rifa) {
    const loadingMessage = document.createElement('div');
    loadingMessage.textContent = 'Generando imagen, por favor espere...';
    loadingMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 5px;
        z-index: 9999;
    `;
    document.body.appendChild(loadingMessage);

    const elemento = document.getElementById('cuadricula-completa');
    
    const opciones = {
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        scrollX: 0,
        scrollY: -window.scrollY
    };

    html2canvas(elemento, opciones).then(canvas => {
        const enlace = document.createElement('a');
        enlace.download = `Rifa_${rifa.nombre}_${new Date().toISOString().slice(0,10)}.png`;
        enlace.href = canvas.toDataURL('image/png');
        
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
        
        document.body.removeChild(loadingMessage);
    }).catch(error => {
        console.error('Error al generar la imagen:', error);
        alert('Ocurrió un error al generar la imagen');
        document.body.removeChild(loadingMessage);
    });
}

function mostrarClientes() {
    if (!rifaActiva) {
        clientesSection.innerHTML = `
            <div class="alert">
                <p>No hay ninguna rifa seleccionada. Por favor, selecciona una rifa primero.</p>
                <button id="btn-seleccionar-rifa">Seleccionar Rifa</button>
            </div>
        `;
        
        document.getElementById('btn-seleccionar-rifa').addEventListener('click', () => {
            mostrarSeccion('rifas');
        });
        
        return;
    }
    
    const rifa = rifas.find(r => r.id === rifaActiva);
    
    const header = document.createElement('div');
    header.innerHTML = `
        <h2>Clientes - ${rifa.nombre}</h2>
        <div class="button-group">
            <button id="btn-nuevo-cliente"><i class="fas fa-plus"></i> Nuevo Cliente</button>
            <button id="btn-plantilla-mensaje"><i class="fas fa-envelope"></i> Mensaje Plantilla</button>
            <button id="btn-plantilla-ticket"><i class="fas fa-ticket-alt"></i> Plantilla Ticket</button>
        </div>
    `;
    clientesSection.appendChild(header);
    
    // Filtros para clientes
    const filtrosContainer = document.createElement('div');
    filtrosContainer.className = 'filtros-clientes';
    filtrosContainer.innerHTML = `
        <button class="filtro-cliente-btn ${filtroClientes === 'todos' ? 'active' : ''}" data-filtro="todos">
            <i class="fas fa-users"></i> Todos los clientes
        </button>
        <button class="filtro-cliente-btn ${filtroClientes === 'con-apartados' ? 'active' : ''}" data-filtro="con-apartados">
            <i class="fas fa-hourglass-half"></i> Con números apartados
        </button>
        <button class="filtro-cliente-btn ${filtroClientes === 'con-pagados' ? 'active' : ''}" data-filtro="con-pagados">
            <i class="fas fa-check-circle"></i> Con números pagados
        </button>
    `;
    clientesSection.appendChild(filtrosContainer);
    
    // Configurar eventos de los filtros
    document.querySelectorAll('.filtro-cliente-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            paginaActualClientes = 1; // Resetear a primera página al cambiar filtro
            filtroClientes = this.dataset.filtro;
            document.querySelectorAll('.filtro-cliente-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            actualizarListaClientes();
        });
    });
    
    const buscador = document.createElement('div');
    buscador.className = 'buscador';
    buscador.innerHTML = `
        <input type="text" id="buscador-clientes" placeholder="Buscar por nombre, teléfono o números...">
    `;
    clientesSection.appendChild(buscador);
    
    const listaClientes = document.createElement('div');
    listaClientes.className = 'clientes-lista';
    clientesSection.appendChild(listaClientes);
    
    // Controles de paginación
    const paginacionContainer = document.createElement('div');
    paginacionContainer.className = 'paginacion';
    clientesSection.appendChild(paginacionContainer);
    
    document.getElementById('btn-nuevo-cliente').addEventListener('click', mostrarModalNuevoCliente);
    document.getElementById('btn-plantilla-mensaje').addEventListener('click', mostrarModalPlantilla);
    document.getElementById('btn-plantilla-ticket').addEventListener('click', mostrarModalPlantillaTicket);
    document.getElementById('buscador-clientes').addEventListener('input', filtrarClientes);
    
    actualizarListaClientes();
}

function actualizarListaClientes() {
    if (!rifaActiva) return;
    
    const listaClientes = document.querySelector('.clientes-lista');
    const paginacionContainer = document.querySelector('.paginacion');
    listaClientes.innerHTML = '';
    paginacionContainer.innerHTML = '';
    
    let clientesRifa = clientes
        .filter(c => c.rifaId === rifaActiva)
        .sort((a, b) => parseInt(a.numeroCliente.slice(1)) - parseInt(b.numeroCliente.slice(1)));
    
    // Aplicar filtro según selección
    if (filtroClientes !== 'todos') {
        clientesRifa = clientesRifa.filter(cliente => {
            const numeros = cliente.numeros.split(',');
            
            if (filtroClientes === 'con-apartados') {
                return numeros.some(num => {
                    const estado = num.includes(':') ? num.split(':')[1] : cliente.estado;
                    return estado === 'apartado';
                });
            } else if (filtroClientes === 'con-pagados') {
                return numeros.some(num => {
                    const estado = num.includes(':') ? num.split(':')[1] : cliente.estado;
                    return estado === 'pagado';
                });
            }
            return true;
        });
    }
    
    // Calcular paginación
    const totalClientes = clientesRifa.length;
    const totalPaginas = Math.ceil(totalClientes / clientesPorPagina);
    const inicio = (paginaActualClientes - 1) * clientesPorPagina;
    const fin = inicio + clientesPorPagina;
    const clientesPagina = clientesRifa.slice(inicio, fin);
    
    if (clientesPagina.length === 0) {
        listaClientes.innerHTML = '<p>No hay clientes registrados para esta rifa.</p>';
    } else {
        clientesPagina.forEach(cliente => {
            const clienteItem = crearElementoCliente(cliente);
            listaClientes.appendChild(clienteItem);
        });
    }
    
    // Mostrar controles de paginación si hay más de una página
    if (totalPaginas > 1) {
        const btnAnterior = document.createElement('button');
        btnAnterior.innerHTML = '<i class="fas fa-chevron-left"></i>';
        btnAnterior.disabled = paginaActualClientes === 1;
        btnAnterior.addEventListener('click', () => {
            if (paginaActualClientes > 1) {
                paginaActualClientes--;
                actualizarListaClientes();
            }
        });
        
        const paginaInfo = document.createElement('span');
        paginaInfo.textContent = `Página ${paginaActualClientes} de ${totalPaginas}`;
        
        const btnSiguiente = document.createElement('button');
        btnSiguiente.innerHTML = '<i class="fas fa-chevron-right"></i>';
        btnSiguiente.disabled = paginaActualClientes === totalPaginas;
        btnSiguiente.addEventListener('click', () => {
            if (paginaActualClientes < totalPaginas) {
                paginaActualClientes++;
                actualizarListaClientes();
            }
        });
        
        paginacionContainer.appendChild(btnAnterior);
        paginacionContainer.appendChild(paginaInfo);
        paginacionContainer.appendChild(btnSiguiente);
    }
}


function filtrarClientes() {
    const busqueda = document.getElementById('buscador-clientes').value.toLowerCase();
    const clientesItems = document.querySelectorAll('.cliente-item');
    
    if (!busqueda) {
        clientesItems.forEach(item => item.style.display = 'block');
        return;
    }
    
    clientesItems.forEach(item => {
        const nombre = item.querySelector('.cliente-nombre').textContent.toLowerCase();
        const telefono = item.querySelector('.cliente-telefono').textContent.toLowerCase();
        const numeros = item.querySelector('.cliente-numeros').textContent.toLowerCase();
        
        if (nombre.includes(busqueda) || telefono.includes(busqueda) || numeros.includes(busqueda)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

function mostrarModalNuevoCliente() {
    document.getElementById('cliente-modal-title').textContent = 'Nuevo Cliente';
    document.getElementById('cliente-nombre').value = '';
    document.getElementById('cliente-telefono').value = '';
    document.getElementById('cliente-numeros').value = '';
    document.getElementById('cliente-estado').value = 'apartado';
    
    // Eliminar cualquier botón de búsqueda previo para evitar duplicados
    const existingBtn = document.getElementById('btn-buscar-cliente-container');
    if (existingBtn) existingBtn.remove();
    
    // Crear contenedor para el botón de búsqueda (solo si no existe)
    const btnContainer = document.createElement('div');
    btnContainer.id = 'btn-buscar-cliente-container';
    btnContainer.className = 'form-group';
    btnContainer.innerHTML = `
        <button id="btn-buscar-cliente" style="margin-bottom: 10px;">
            <i class="fas fa-search"></i> Buscar Cliente Existente
        </button>
        <div id="resultados-busqueda" class="hidden"></div>
    `;
    
    // Insertar después del título
    const modalContent = document.querySelector('#cliente-modal .modal-content');
    modalContent.insertBefore(btnContainer, document.getElementById('cliente-nombre').parentElement);
    
    document.getElementById('btn-buscar-cliente').addEventListener('click', buscarClienteExistente);
    document.getElementById('btn-guardar-cliente').onclick = guardarNuevoCliente;
    clienteModal.classList.remove('hidden');
}

async function buscarClienteExistente() {
    const modalBusqueda = document.createElement('div');
    modalBusqueda.className = 'modal';
    modalBusqueda.id = 'busqueda-modal';
    modalBusqueda.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <span class="close-modal">&times;</span>
            <h2>Buscar Cliente Existente</h2>
            <div class="form-group">
                <input type="text" id="busqueda-cliente" placeholder="Buscar por nombre, teléfono o número de cliente" style="width: 100%;">
            </div>
            <div id="lista-clientes-existente" style="max-height: 300px; overflow-y: auto;"></div>
        </div>
    `;
    
    document.body.appendChild(modalBusqueda);
    modalBusqueda.classList.remove('hidden');
    
    // Configurar eventos
    modalBusqueda.querySelector('.close-modal').addEventListener('click', () => {
        modalBusqueda.remove();
    });
    
    const inputBusqueda = modalBusqueda.querySelector('#busqueda-cliente');
    inputBusqueda.addEventListener('input', () => {
        const termino = inputBusqueda.value.toLowerCase();
        const resultados = clientesPermanentes.filter(c => 
            c.nombre.toLowerCase().includes(termino) || 
            c.telefono.toLowerCase().includes(termino) ||
            c.numeroCliente.toLowerCase().includes(termino))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        const lista = modalBusqueda.querySelector('#lista-clientes-existente');
        lista.innerHTML = '';
        
        if (resultados.length === 0) {
            lista.innerHTML = '<p>No se encontraron clientes</p>';
            return;
        }
        
        resultados.forEach(cliente => {
            const item = document.createElement('div');
            item.className = 'cliente-item';
            item.style.cursor = 'pointer';
            item.style.padding = '10px';
            item.style.borderBottom = '1px solid #eee';
            item.innerHTML = `
                <strong>${cliente.numeroCliente}</strong> - ${cliente.nombre}
                <div>${cliente.telefono}</div>
            `;
            
            item.addEventListener('click', () => {
                // Llenar el formulario con los datos del cliente
                document.getElementById('cliente-nombre').value = cliente.nombre;
                document.getElementById('cliente-telefono').value = cliente.telefono;
                modalBusqueda.remove();
            });
            
            lista.appendChild(item);
        });
    });
    
    inputBusqueda.focus();
}

function mostrarModalEditarCliente(cliente) {
    document.getElementById('cliente-modal-title').textContent = 'Editar Cliente';
    document.getElementById('cliente-nombre').value = cliente.nombre;
    document.getElementById('cliente-telefono').value = cliente.telefono;
    document.getElementById('cliente-numeros').value = cliente.numeros;
    document.getElementById('cliente-estado').value = cliente.estado;
    
    document.getElementById('btn-guardar-cliente').onclick = () => guardarClienteEditado(cliente.id);
    clienteModal.classList.remove('hidden');
}

async function guardarNuevoCliente() {
    if (!rifaActiva) {
        alert('No hay rifa seleccionada');
        return;
    }
    
    const nombre = document.getElementById('cliente-nombre').value.trim();
    const telefono = document.getElementById('cliente-telefono').value.trim();
    const numerosInput = document.getElementById('cliente-numeros').value.trim();
    const estado = document.getElementById('cliente-estado').value;
    
    if (!nombre || !telefono || !numerosInput) {
        alert('Por favor completa todos los campos');
        return;
    }
    
    // Obtener referencia segura a appTitle
    const appTitleElement = document.getElementById('app-title');
    const appName = appTitleElement && appTitleElement.textContent 
        ? appTitleElement.textContent 
        : localStorage.getItem('nombreApp') || 'Rifas Sucre';
    
    // Normalizar el número de teléfono
    const telefonoNormalizado = normalizarTelefono(telefono);
    
    // **CAMBIO IMPORTANTE: Verificar si ya existe un cliente con este número en la MISMA RIFA**
const clienteExistenteMismaRifa = clientes.find(c => 
    normalizarTelefono(c.telefono) === telefonoNormalizado && 
    c.rifaId === rifaActiva
);

if (clienteExistenteMismaRifa) {
    alert(`Ya existe un cliente registrado con este número de teléfono EN ESTA RIFA:\n\n` +
          `Nombre: ${clienteExistenteMismaRifa.nombre}\n` +
          `Teléfono: ${clienteExistenteMismaRifa.telefono}`);
    return;
}
    
    // Procesar números con diferentes separadores y rangos
    const numerosProcesados = [];
    
    // Separar por comas, puntos o espacios
    const partes = numerosInput.split(/[,.\s]+/);
    
    for (const parte of partes) {
        if (!parte) continue;
        
        // Procesar rangos (ejemplo: 010-050)
        if (parte.includes('-')) {
            const [inicioStr, finStr] = parte.split('-');
            const inicio = parseInt(inicioStr);
            const fin = parseInt(finStr);
            
            if (isNaN(inicio) || isNaN(fin)) {
                alert(`El rango "${parte}" no es válido`);
                return;
            }
            
            if (inicio > fin) {
                alert(`El rango "${parte}" está invertido (el primer número debe ser menor)`);
                return;
            }
            
            for (let i = inicio; i <= fin; i++) {
                numerosProcesados.push(i.toString());
            }
        } else {
            numerosProcesados.push(parte);
        }
    }
    
    // Eliminar duplicados
    const numerosArray = [...new Set(numerosProcesados)];
    
    if (numerosArray.length === 0) {
        alert('No se han ingresado números válidos');
        return;
    }
    
    const rifa = rifas.find(r => r.id === rifaActiva);
    
    // Validar formato y rango de números
    for (const num of numerosArray) {
        if (isNaN(num) || num === '') {
            alert(`El número "${num}" no es válido`);
            return;
        }
        
        const numFormateado = parseInt(num).toString().padStart(3, '0');
        if (parseInt(numFormateado) >= rifa.totalNumeros) {
            alert(`El número ${numFormateado} excede el total de números de la rifa (${rifa.totalNumeros})`);
            return;
        }
    }
    
    // Verificar disponibilidad de números
    const numerosOcupados = {};
    const clientesRifa = clientes.filter(c => c.rifaId === rifaActiva);
    
    clientesRifa.forEach(cliente => {
        cliente.numeros.split(',').forEach(num => {
            const numFormateado = parseInt(num.includes(':') ? num.split(':')[0] : num).toString().padStart(3, '0');
            numerosOcupados[numFormateado] = true;
        });
    });
    
    const numerosNoDisponibles = numerosArray.filter(num => {
        const numFormateado = parseInt(num).toString().padStart(3, '0');
        return numerosOcupados[numFormateado];
    });
    
    if (numerosNoDisponibles.length > 0) {
        alert(`Los siguientes números ya están ocupados: ${numerosNoDisponibles.join(', ')}`);
        return;
    }
    
    // Procesar números con el formato solicitado
    const nuevosNumeros = numerosArray.map(n => {
    const num = parseInt(n).toString().padStart(3, '0');
    // Si el estado es "pagado", establecer el abono igual al precio
    const precioNumero = rifa.precio || 0;
    const abonoInicial = (estado === 'pagado') ? precioNumero : 0;
    return `${num}:${estado}:${abonoInicial}`;
}).sort((a, b) => parseInt(a.split(':')[0]) - parseInt(b.split(':')[0])).join(',');

    
    // Generar número de cliente único
    let numeroCliente = '';
    const numerosClientes = clientes.map(c => parseInt(c.numeroCliente.slice(1)));
    const maxNumero = numerosClientes.length > 0 ? Math.max(...numerosClientes) : 0;
    
    let huecoEncontrado = false;
    for (let i = 1; i <= maxNumero; i++) {
        if (!numerosClientes.includes(i)) {
            numeroCliente = `#${i.toString().padStart(3, '0')}`;
            huecoEncontrado = true;
            break;
        }
    }
    
    if (!huecoEncontrado) {
        numeroCliente = `#${(maxNumero + 1).toString().padStart(3, '0')}`;
    }
    
    // Crear nuevo cliente para la rifa
    const nuevoClienteRifa = {
        id: Date.now().toString(),
        rifaId: rifaActiva,
        numeroCliente,
        nombre,
        telefono,
        numeros: nuevosNumeros,
        estado,
        fechaRegistro: new Date().toISOString()
    };
    
    // **NUEVO: Crear/actualizar cliente permanente**
    const clientePermanenteExistente = clientesPermanentes.find(c => 
        normalizarTelefono(c.telefono) === telefonoNormalizado
    );
    
    if (clientePermanenteExistente) {
        // Actualizar cliente permanente existente
        clientePermanenteExistente.nombre = nombre;
        clientePermanenteExistente.telefono = telefono;
        clientePermanenteExistente.ultimaActualizacion = new Date().toISOString();
    } else {
        // Crear nuevo cliente permanente
        const nuevoClientePermanente = {
            id: Date.now().toString() + '-perm', // ID diferente
            numeroCliente: numeroCliente,
            nombre: nombre,
            telefono: telefono,
            fechaRegistro: new Date().toISOString(),
            ultimaActualizacion: new Date().toISOString()
        };
        clientesPermanentes.push(nuevoClientePermanente);
    }
    
    // Guardar ambos clientes
    clientes.push(nuevoClienteRifa);
    await guardarTodo();
    await guardarClientesPermanentesEnDB(); // **NUEVO: Guardar clientes permanentes**
    
    clienteModal.classList.add('hidden');
    actualizarListaClientes();
    
    alert('Cliente guardado en rifa y base de datos permanente');
}

// Función para normalizar números de teléfono
function normalizarTelefono(telefono) {
    if (!telefono) return '';
    
    // Eliminar todo excepto números
    return telefono.replace(/[^\d]/g, '');
}

async function guardarClienteEditado(id) {
    const nombre = document.getElementById('cliente-nombre').value.trim();
    const telefono = document.getElementById('cliente-telefono').value.trim();
    const numerosInput = document.getElementById('cliente-numeros').value.trim();
    const estado = document.getElementById('cliente-estado').value;
    
    if (!nombre || !telefono || !numerosInput) {
        alert('Por favor completa todos los campos');
        return;
    }
    
    const clienteIndex = clientes.findIndex(c => c.id === id);
    if (clienteIndex === -1) return;
    
    // Normalizar el número de teléfono
    const telefonoNormalizado = normalizarTelefono(telefono);
    const telefonoActualNormalizado = normalizarTelefono(clientes[clienteIndex].telefono);
    
    // Verificar si el nuevo número ya existe en OTRO cliente (no en el actual)
    if (telefonoNormalizado !== telefonoActualNormalizado) {
        const clienteExistente = clientes.find(c => 
            c.id !== id && normalizarTelefono(c.telefono) === telefonoNormalizado
        );
        
        if (clienteExistente) {
            alert(`Ya existe otro cliente con este número de teléfono:\n\n` +
                  `Nombre: ${clienteExistente.nombre}\n` +
                  `Teléfono: ${clienteExistente.telefono}\n` +
                  `Rifa: ${rifas.find(r => r.id === clienteExistente.rifaId)?.nombre || 'Desconocida'}`);
            return;
        }
    }
    
    // Procesar números con diferentes separadores y rangos
    const numerosProcesados = [];
    
    // Separar por comas, puntos o espacios
    const partes = numerosInput.split(/[,.\s]+/);
    
    for (const parte of partes) {
        if (!parte) continue;
        
        // Procesar rangos (ejemplo: 010-050)
        if (parte.includes('-')) {
            const [inicioStr, finStr] = parte.split('-');
            const inicio = parseInt(inicioStr);
            const fin = parseInt(finStr);
            
            if (isNaN(inicio) || isNaN(fin)) {
                alert(`El rango "${parte}" no es válido`);
                return;
            }
            
            if (inicio > fin) {
                alert(`El rango "${parte}" está invertido (el primer número debe ser menor)`);
                return;
            }
            
            for (let i = inicio; i <= fin; i++) {
                numerosProcesados.push(i.toString());
            }
        } else {
            numerosProcesados.push(parte);
        }
    }
    
    // Eliminar duplicados y limpiar estados existentes
    const numerosArray = [...new Set(numerosProcesados.map(n => {
        const num = n.trim();
        return num.includes(':') ? num.split(':')[0] : num;
    }))];
    
    if (numerosArray.length !== numerosInput.split(',').length) {
        alert('Has ingresado números duplicados. Se han eliminado los repetidos.');
    }
    
    const rifa = rifas.find(r => r.id === clientes[clienteIndex].rifaId);
const precioNumero = rifa ? (rifa.precio || 0) : 0;
    
    for (const num of numerosArray) {
        if (isNaN(num) || num === '') {
            alert(`El número "${num}" no es válido`);
            return;
        }
        
        const numFormateado = parseInt(num).toString().padStart(3, '0');
        if (parseInt(numFormateado) >= rifa.totalNumeros) {
            alert(`El número ${numFormateado} excede el total de números de la rifa (${rifa.totalNumeros})`);
            return;
        }
    }
    
    const numerosOcupados = {};
    const clientesRifa = clientes.filter(c => c.rifaId === clientes[clienteIndex].rifaId && c.id !== id);
    
    clientesRifa.forEach(cliente => {
        cliente.numeros.split(',').forEach(num => {
            const numFormateado = parseInt(num.includes(':') ? num.split(':')[0] : num).toString().padStart(3, '0');
            numerosOcupados[numFormateado] = true;
        });
    });
    
    const numerosNoDisponibles = numerosArray.filter(num => {
        const numFormateado = parseInt(num).toString().padStart(3, '0');
        return numerosOcupados[numFormateado];
    });
    
    if (numerosNoDisponibles.length > 0) {
        alert(`Los siguientes números ya están ocupados: ${numerosNoDisponibles.join(', ')}`);
        return;
    }
    
    // Mantener los estados individuales de los números que ya los tenían
    const clienteActual = clientes[clienteIndex];
    const numerosConEstado = numerosArray.map(num => {
        const numFormateado = parseInt(num).toString().padStart(3, '0');
        // Buscar si el número ya tenía un estado definido
        const numExistente = clienteActual.numeros.split(',').find(n => {
            const numPart = n.includes(':') ? n.split(':')[0] : n;
            return numPart === numFormateado;
        });
        
        // Si existía y tenía estado, mantenerlo, de lo contrario usar el estado general
        if (numExistente && numExistente.includes(':')) {
            return numExistente;
        } else {
            // Si el estado es "pagado", establecer el abono igual al precio
            const abonoInicial = (estado === 'pagado') ? precioNumero : 0;
            return `${numFormateado}:${estado}:${abonoInicial}`;
        }
    });
    
    clientes[clienteIndex] = {
        ...clienteActual,
        nombre,
        telefono,
        numeros: numerosConEstado.sort((a, b) => parseInt(a.split(':')[0]) - parseInt(b.split(':')[0])).join(','),
        estado
    };
    
    await guardarTodo();
    clienteModal.classList.add('hidden');
    actualizarListaClientes();
}

function mostrarMenuNumeros(event, numero, cliente) {
    const menusPrevios = document.querySelectorAll('.menu-numero');
    menusPrevios.forEach(menu => menu.remove());
    
    const menu = document.createElement('div');
    menu.className = 'menu-numero';
    
    const clickX = event.clientX;
    const clickY = event.clientY;
    
    menu.style.cssText = `
        position: fixed;
        left: ${clickX}px;
        top: ${clickY}px;
        z-index: 1000;
        background: white;
        border: 1px solid #ddd;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        min-width: 180px;
    `;
    
    const estadoActual = obtenerEstadoNumero(cliente.rifaId, numero).estado;

    // Opción para registrar abono (si no está pagado completamente)
    if (estadoActual !== 'pagado') {
        const opAbonar = document.createElement('div');
        opAbonar.textContent = 'Registrar Abono';
        opAbonar.style.cssText = `
            padding: 8px 15px;
            cursor: pointer;
            transition: background-color 0.2s;
        `;
        opAbonar.onmouseenter = () => opAbonar.style.backgroundColor = '#f0f0f0';
        opAbonar.onmouseleave = () => opAbonar.style.backgroundColor = '';
        opAbonar.onclick = () => {
            menu.remove();
            mostrarModalAbono(numero, cliente);
        };
        menu.appendChild(opAbonar);
    }

    if (estadoActual !== 'pagado') {
        const opPagado = document.createElement('div');
        opPagado.textContent = 'Marcar como Pagado';
        opPagado.style.padding = '8px 15px';
        opPagado.style.cursor = 'pointer';
        opPagado.onclick = () => {
            cambiarEstadoNumero(numero, cliente, 'pagado');
            menu.remove();
        };
        menu.appendChild(opPagado);
    }

    if (estadoActual !== 'apartado') {
        const opApartado = document.createElement('div');
        opApartado.textContent = 'Marcar como Apartado';
        opApartado.style.padding = '8px 15px';
        opApartado.style.cursor = 'pointer';
        opApartado.onclick = () => {
            cambiarEstadoNumero(numero, cliente, 'apartado');
            menu.remove();
        };
        menu.appendChild(opApartado);
    }

    const opEliminar = document.createElement('div');
    opEliminar.textContent = 'Eliminar número';
    opEliminar.style.cssText = `
        padding: 8px 15px;
        cursor: pointer;
        color: #e74c3c;
    `;
    opEliminar.onclick = () => {
        eliminarNumero(numero, cliente);
        menu.remove();
    };
    menu.appendChild(opEliminar);

    document.body.appendChild(menu);

    setTimeout(() => {
        const clickHandler = (e) => {
            if (!menu.contains(e.target) && !e.target.classList.contains('cliente-numero-rifa')) {
                menu.remove();
                document.removeEventListener('click', clickHandler);
            }
        };
        document.addEventListener('click', clickHandler);
    }, 10);
}

async function cambiarEstadoNumero(numero, cliente, nuevoEstado) {
    const rifa = rifas.find(r => r.id === cliente.rifaId);
const precioNumero = rifa ? (rifa.precio || 0) : 0;
    
    const nuevosNumeros = cliente.numeros.split(',').map(numCompleto => {
        const [numActual, estadoActual, abonoActual] = numCompleto.includes(':') ? 
            numCompleto.split(':') : 
            [numCompleto, cliente.estado, '0'];
            
        if (numActual === numero) {
            // Si cambia a pagado, establecer abono igual al precio
            const nuevoAbono = (nuevoEstado === 'pagado') ? precioNumero : 
                              (nuevoEstado === 'apartado') ? 0 : parseFloat(abonoActual || 0);
            return `${numero}:${nuevoEstado}:${nuevoAbono}`;
        }
        return numCompleto;
    });

    cliente.numeros = nuevosNumeros.join(',');
    await guardarTodo();
    actualizarListaClientes();
}

async function eliminarNumero(numero, cliente) {
    mostrarConfirmacion(
        'Eliminar número',
        `¿Eliminar el número ${numero} de ${cliente.nombre}?`,
        async () => {  // <-- Añadir async aquí
            const nuevosNumeros = cliente.numeros.split(',')
                .filter(num => !num.startsWith(numero));
            
            if (nuevosNumeros.length === 0) {
                clientes = clientes.filter(c => c.id !== cliente.id);
            } else {
                cliente.numeros = nuevosNumeros.join(',');
            }
            
            await guardarTodo();  // 
            actualizarListaClientes();
        }
    );
}

function confirmarEliminarCliente(id) {
    mostrarConfirmacion(
        'Eliminar Cliente',
        '¿Estás seguro de que deseas eliminar este cliente?',
        () => eliminarCliente(id)
    );
}

async function eliminarCliente(id) {  // <-- Añade 'async' aquí
    clientes = clientes.filter(c => c.id !== id);
    await guardarTodo();  // Ahora el await funciona correctamente
    actualizarListaClientes();
    mostrarRifas();
}

function enviarWhatsApp(cliente) {
    const rifa = rifas.find(r => r.id === cliente.rifaId);
    const plantilla = localStorage.getItem('rifasSucre_plantilla') || '';
    
    // Limpiar los números para mostrar (quitar los estados)
    const numerosLimpios = cliente.numeros.split(',').map(num => {
        return num.includes(':') ? num.split(':')[0] : num;
    }).join(', ');
    
    // CALCULAR ESTADO GENERAL CORRECTO
    let numerosPagados = 0;
    let numerosApartados = 0;
    const totalNumeros = cliente.numeros.split(',').length;
    
    cliente.numeros.split(',').forEach(numCompleto => {
        const estado = numCompleto.includes(':') ? numCompleto.split(':')[1] : cliente.estado;
        if (estado === 'pagado') numerosPagados++;
        if (estado === 'apartado') numerosApartados++;
    });
    
    let estadoGeneral = 'mixto';
    if (numerosPagados === totalNumeros) estadoGeneral = 'pagado';
    if (numerosApartados === totalNumeros) estadoGeneral = 'apartado';
    
    let mensaje = plantilla
        .replace(/{nombre}/g, cliente.nombre)
        .replace(/{rifa}/g, rifa.nombre)
        .replace(/{numeros}/g, numerosLimpios)
        .replace(/{estado}/g, estadoGeneral);  // ← ESTADO CORREGIDO
    
    const url = `https://wa.me/${cliente.telefono}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
}

function generarTicket(cliente) {
    const rifa = rifas.find(r => r.id === cliente.rifaId);
    if (!rifa) {
        alert('No se encontró la rifa asociada al cliente');
        return;
    }

    const ticketElement = document.createElement('div');
    ticketElement.style.cssText = `
        width: 300px;
        padding: 20px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        font-family: Arial, sans-serif;
        color: #333;
    `;

    // CALCULAR ESTADOS INDIVIDUALES DE LOS NÚMEROS
    let numerosPagados = 0;
    let numerosApartados = 0;
    
    const numerosHTML = cliente.numeros.split(',').map(numCompleto => {
        const [num, estadoIndividual] = numCompleto.includes(':') ? 
            numCompleto.split(':') : 
            [numCompleto, cliente.estado];
            
        // Contar números por estado
        if (estadoIndividual === 'pagado') numerosPagados++;
        if (estadoIndividual === 'apartado') numerosApartados++;
            
        return `<span style="display: inline-block; margin: 2px; padding: 2px 5px; 
                border-radius: 3px; border: 1px solid #ddd; 
                background: ${estadoIndividual === 'pagado' ? '#2ecc71' : '#f1c40f'}; 
                color: ${estadoIndividual === 'pagado' ? 'white' : '#333'}">
                ${num}
                </span>`;
    }).join('');

    const tituloTicket = localStorage.getItem('plantillaTicketTitulo') || 'TICKET DE RIFA';
    let mensajeTicket = localStorage.getItem('plantillaTicketMensaje') || 
        'Cliente: {nombre}\nTeléfono: {telefono}\nNúmeros: {numeros}\nEstado: {estado}\nFecha: {fecha}\nTotal: {total}\nPagado: {pagado}\nDeuda: {deuda}\nHora: {hora}';

    // Limpiar los números para mostrar en el mensaje (quitar los estados)
    const numerosLimpios = cliente.numeros.split(',').map(num => {
        return num.includes(':') ? num.split(':')[0] : num;
    }).join(', ');

    // Calcular montos
    const totalNumeros = cliente.numeros.split(',').length;
    const total = totalNumeros * (rifa?.precio || 0);

    // Calcular pagado y deuda
    let pagado = numerosPagados * (rifa?.precio || 0);
    let deuda = total - pagado;

    // DETERMINAR ESTADO GENERAL (si todos son pagados = "pagado", si todos apartados = "apartado", si mezclados = "mixto")
    let estadoGeneral = 'mixto';
    if (numerosPagados === totalNumeros) estadoGeneral = 'pagado';
    if (numerosApartados === totalNumeros) estadoGeneral = 'apartado';

    mensajeTicket = mensajeTicket
        .replace(/{nombre}/g, cliente.nombre)
        .replace(/{telefono}/g, cliente.telefono)
        .replace(/{rifa}/g, rifa.nombre)
        .replace(/{numeros}/g, numerosLimpios)
        .replace(/{estado}/g, estadoGeneral)  // ← ESTADO CORREGIDO
        .replace(/{fecha}/g, new Date().toLocaleDateString())
        .replace(/{total}/g, total.toFixed(2))
        .replace(/{pagado}/g, pagado.toFixed(2))
        .replace(/{deuda}/g, deuda.toFixed(2))
        .replace(/{hora}/g, new Date().toLocaleTimeString());

    const mensajeHTML = mensajeTicket.split('\n').map(line => 
        `<div style="margin-bottom: 8px;">${line}</div>`
    ).join('');

    ticketElement.innerHTML = `
        <h2 style="text-align: center; margin-bottom: 15px; color: #2c3e50;">${tituloTicket}</h2>
        ${mensajeHTML}
        <div style="margin-bottom: 15px;"><strong>Números:</strong><br>${numerosHTML}</div>
        <div style="text-align: center; font-size: 12px; color: #7f8c8d;">
            ${new Date().toLocaleDateString()} - ${appTitle.textContent}
        </div>
    `;

    document.body.appendChild(ticketElement);

    const loadingMessage = document.createElement('div');
    loadingMessage.textContent = 'Generando ticket...';
    loadingMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 5px;
        z-index: 9999;
    `;
    document.body.appendChild(loadingMessage);

    html2canvas(ticketElement).then(canvas => {
        // Crear un elemento de imagen para mostrar el ticket
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        img.style.maxWidth = '100%';
        
        // Limpiar y mostrar el ticket en pantalla
        document.body.removeChild(ticketElement);
        document.body.removeChild(loadingMessage);
        
        // Crear contenedor principal
        const ticketContainer = document.createElement('div');
        ticketContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            display: flex;
            flex-direction: column;
            z-index: 9999;
            padding: 20px;
            overflow-y: auto; /* Permite hacer scroll si el contenido es muy largo */
        `;
        
        // Contenedor para los botones (fijo en la parte inferior)
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            position: sticky;
            bottom: 0;
            background: rgba(0,0,0,0.9);
            padding: 15px 0;
            display: flex;
            justify-content: center;
            gap: 20px;
            width: 100%;
            z-index: 10000;
        `;
        
        // Contenedor para la imagen del ticket (con scroll)
        const imageContainer = document.createElement('div');
        imageContainer.style.cssText = `
            flex-grow: 1;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding: 20px;
            overflow-y: auto;
        `;
        
        imageContainer.appendChild(img);
        
        // Botón para copiar al portapapeles
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copiar al Portapapeles';
        copyButton.style.cssText = `
            padding: 10px 20px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
        `;
        
        copyButton.onclick = () => {
            canvas.toBlob(blob => {
                navigator.clipboard.write([
                    new ClipboardItem({
                        'image/png': blob
                    })
                ]).then(() => {
                    alert('Ticket copiado al portapapeles');
                    document.body.removeChild(ticketContainer);
                }).catch(err => {
                    console.error('Error al copiar:', err);
                    alert('No se pudo copiar al portapapeles. Puedes hacer una captura manual.');
                });
            });
        };
        
        // Botón para cerrar
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Cerrar';
        closeButton.style.cssText = `
            padding: 10px 20px;
            background: #e74c3c;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
        `;
        
        closeButton.onclick = () => {
            document.body.removeChild(ticketContainer);
        };
        
        // Agregar elementos al contenedor de botones
        buttonContainer.appendChild(copyButton);
        buttonContainer.appendChild(closeButton);
        
        // Agregar elementos al contenedor principal
        ticketContainer.appendChild(imageContainer);
        ticketContainer.appendChild(buttonContainer);
        
        document.body.appendChild(ticketContainer);
        
    }).catch(err => {
        console.error('Error al generar ticket:', err);
        alert('Error al generar el ticket');
        document.body.removeChild(ticketElement);
        document.body.removeChild(loadingMessage);
    });
}

function enviarRezagados(cliente) {
    const rifa = rifas.find(r => r.id === cliente.rifaId);
    const plantilla = localStorage.getItem('rifasSucre_plantilla_rezagados') || 
                     localStorage.getItem('rifasSucre_plantilla') || 
                     '¡Hola {nombre}! Recordatorio: Tus números {numeros} en la rifa "{rifa}" están como {estado}. Por favor completa tu pago. ¡Gracias!';
    
    // Limpiar los números para mostrar (quitar los estados)
    const numerosLimpios = cliente.numeros.split(',').map(num => {
        return num.includes(':') ? num.split(':')[0] : num;
    }).join(', ');
    
    // CALCULAR ESTADO GENERAL CORRECTO
    let numerosPagados = 0;
    let numerosApartados = 0;
    const totalNumeros = cliente.numeros.split(',').length;
    
    cliente.numeros.split(',').forEach(numCompleto => {
        const estado = numCompleto.includes(':') ? numCompleto.split(':')[1] : cliente.estado;
        if (estado === 'pagado') numerosPagados++;
        if (estado === 'apartado') numerosApartados++;
    });
    
    let estadoGeneral = 'mixto';
    if (numerosPagados === totalNumeros) estadoGeneral = 'pagado';
    if (numerosApartados === totalNumeros) estadoGeneral = 'apartado';
    
    let mensaje = plantilla
        .replace(/{nombre}/g, cliente.nombre)
        .replace(/{rifa}/g, rifa.nombre)
        .replace(/{numeros}/g, numerosLimpios)
        .replace(/{estado}/g, estadoGeneral);  // ← ESTADO CORREGIDO
    
    const url = `https://wa.me/${cliente.telefono}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
}

function mostrarModalPlantilla() {
    // Cargar plantillas con variables por defecto si no existen
    const plantillaWhatsApp = localStorage.getItem('rifasSucre_plantilla') || 
        '¡Hola {nombre}!\n\n' +
        'Gracias por participar en la rifa "{rifa}".\n' +
        'Tus números son: {numeros}\n' +
        'Estado: {estado}\n\n' +
        '¡Mucha suerte!';
    
    const plantillaRezagados = localStorage.getItem('rifasSucre_plantilla_rezagados') || 
        '¡Hola {nombre}!\n\n' +
        'Recordatorio: Tus números {numeros} en la rifa "{rifa}" están como {estado}.\n' +
        'Por favor completa tu pago lo antes posible.\n\n' +
        '¡Gracias por tu apoyo!';
    
    document.getElementById('plantilla-mensaje').value = plantillaWhatsApp;
    document.getElementById('plantilla-rezagados').value = plantillaRezagados;
    
    // Configurar eventos de pestañas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(`${this.dataset.tab}-tab`).classList.add('active');
        });
    });
    
    document.getElementById('btn-guardar-plantilla').onclick = guardarPlantillas;
    plantillaModal.classList.remove('hidden');
}

function guardarPlantillas() {
    const plantillaWhatsApp = document.getElementById('plantilla-mensaje').value;
    const plantillaRezagados = document.getElementById('plantilla-rezagados').value;
    
    localStorage.setItem('rifasSucre_plantilla', plantillaWhatsApp);
    localStorage.setItem('rifasSucre_plantilla_rezagados', plantillaRezagados);
    plantillaModal.classList.add('hidden');
    alert('Plantillas guardadas correctamente');
}

function mostrarModalPlantillaTicket() {
    document.getElementById('plantilla-ticket-titulo').value = 
        localStorage.getItem('plantillaTicketTitulo') || 'TICKET DE RIFA';
    document.getElementById('plantilla-ticket-mensaje').value = 
        localStorage.getItem('plantillaTicketMensaje') || 'Cliente: {nombre}\nTeléfono: {telefono}\nNúmeros: {numeros}\nEstado: {estado}\nFecha: {fecha}';
    
    plantillaTicketModal.classList.remove('hidden');
}

function guardarPlantillaTicket() {
    const titulo = document.getElementById('plantilla-ticket-titulo').value.trim();
    const mensaje = document.getElementById('plantilla-ticket-mensaje').value.trim();
    
    if (!titulo || !mensaje) {
        alert('Por favor completa todos los campos');
        return;
    }
    
    localStorage.setItem('plantillaTicketTitulo', titulo);
    localStorage.setItem('plantillaTicketMensaje', mensaje);
    plantillaTicketModal.classList.add('hidden');
    alert('Plantilla de ticket guardada correctamente');
}

function mostrarRespaldo() {
    respaldoSection.innerHTML = `
        <h2>Respaldo de Datos</h2>
        <p>Aquí puedes crear una copia de seguridad de todos tus datos o restaurar desde una copia previa.</p>
        
        <div class="respaldo-acciones">
            <button id="btn-crear-respaldo"><i class="fas fa-save"></i> Crear Respaldo</button>
            <button id="btn-restaurar-respaldo"><i class="fas fa-upload"></i> Restaurar Respaldo</button>
        </div>
    `;
    
    document.getElementById('btn-crear-respaldo').addEventListener('click', crearRespaldo);
    document.getElementById('btn-restaurar-respaldo').addEventListener('click', restaurarRespaldo);
}

async function crearRespaldo() {
    try {
        // Obtener todos los datos de configuración de IndexedDB
        const configuracion = await obtenerTodosDatos('configuracion');
        const codigos = await obtenerTodosDatos('codigos'); // Nueva línea
        
        const datos = {
            rifas,
            clientes,
            clientesPermanentes, 
            codigos, // Cambiado de codigosUsados a codigos
            codigosUsados, // Mantener por compatibilidad
            configuracion,
            rifaActiva,
            fechaRespaldo: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `respaldo_rifas_sucre_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        alert('Respaldo creado correctamente con toda la configuración');
    } catch (error) {
        console.error('Error al crear respaldo:', error);
        alert('Error al crear el respaldo. Intenta nuevamente.');
    }
}

function restaurarRespaldo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async event => {
    try {
        const datos = JSON.parse(event.target.result);
        
        mostrarConfirmacion(
            'Restaurar Respaldo',
            '¿Estás seguro de que deseas restaurar este respaldo? Todos los datos actuales serán reemplazados.',
            async () => {
                rifas = datos.rifas || [];
                clientes = datos.clientes || [];
                clientesPermanentes = datos.clientesPermanentes || [];
                // Nueva línea: cargar códigos (usar datos.codigos si existe, si no datos.codigosUsados)
                codigosValidos = datos.codigos || datos.codigosUsados || [];
                codigosUsados = datos.codigosUsados || [];
                rifaActiva = datos.rifaActiva || null;
                
                // Restaurar configuración si existe en el respaldo
                if (datos.configuracion) {
                    try {
                        const tx = db.transaction(['configuracion'], 'readwrite');
                        const store = tx.objectStore('configuracion');
                        await store.clear(); // Limpiar configuración existente
                        
                        // Guardar cada item de configuración
                        for (const configItem of datos.configuracion) {
                            await store.put(configItem);
                        }
                    } catch (error) {
                        console.error('Error al restaurar configuración:', error);
                    }
                }
                
                await guardarTodo();
                alert('Respaldo restaurado correctamente');
                mostrarSeccion('rifas');
            }
        );
    } catch (error) {
        alert('Error al leer el archivo de respaldo. Asegúrate de que es un archivo válido.');
    }
};
        reader.readAsText(file);
    };
    
    input.click();
}

async function mostrarSeguridad() {
    if (!superusuarioActivo) return;
    
    seguridadSection.innerHTML = `
        <h2>🔑 Gestión de Accesos</h2>
        
        <div class="generar-codigo">
            <h3>Generar Nuevo Código</h3>
            <input type="number" id="codigo-duracion" placeholder="Días de validez (ej: 7)" min="1">
            <button onclick="generarCodigoAcceso()">Generar</button>
            
            <div id="codigo-generado-container" class="hidden">
                <div class="codigo-box" id="codigo-generado"></div>
                <p>Este código es de un solo uso por dispositivo</p>
            </div>
        </div>
        
        <div class="lista-codigos">
            <h3>Códigos Activos</h3>
            <div id="lista-codigos-activos"></div>
        </div>
    `;
    
    // Cargar códigos activos
    await actualizarListaCodigosActivos();
}

async function actualizarListaCodigosActivos() {
    try {
        const codigos = await obtenerCodigosActivos();
        const lista = document.getElementById('lista-codigos-activos');
        
        if (codigos.length === 0) {
            lista.innerHTML = '<p>No hay códigos activos</p>';
            return;
        }
        
        lista.innerHTML = codigos.map(codigo => `
            <div class="codigo-item ${codigo.dispositivo_id ? 'usado' : ''}">
                <strong>${codigo.codigo}</strong> - 
                Válido hasta: ${new Date(codigo.expiracion).toLocaleDateString()}
                ${codigo.dispositivo_id ? ` (En uso)` : ' (Disponible)'}
                <br>
                <small>Generado: ${new Date(codigo.creado_en).toLocaleDateString()}</small>
                ${codigo.ultimo_uso ? `<br><small>Último uso: ${new Date(codigo.ultimo_uso).toLocaleDateString()}</small>` : ''}
            </div>
        `).join('');
    } catch (error) {
        console.error('Error al cargar códigos activos:', error);
    }
}

async function generarCodigoAcceso() {
    if (!superusuarioActivo) {
        alert('❌ Solo el superusuario puede generar códigos');
        return;
    }

    const duracion = parseInt(document.getElementById('codigo-duracion').value) || 7;
    
    try {
        const nuevoCodigo = await generarCodigoSupabase(duracion);
        
        // Mostrar confirmación
        const codigoBox = document.getElementById('codigo-generado');
        codigoBox.innerHTML = `
            <strong>Código:</strong> ${nuevoCodigo.codigo}<br>
            <strong>Válido hasta:</strong> ${new Date(nuevoCodigo.expiracion).toLocaleDateString()}<br>
            <strong>Duración:</strong> ${nuevoCodigo.duracion} días
        `;
        document.getElementById('codigo-generado-container').classList.remove('hidden');
        
        console.log('Código generado en Supabase:', nuevoCodigo.codigo);
        alert('✅ Código generado correctamente. Cópialo ahora: ' + nuevoCodigo.codigo);
        
        // Actualizar la lista de códigos activos
        mostrarSeguridad();
    } catch (error) {
        console.error('Error al generar el código:', error);
        alert('❌ Error al generar el código. Verifica la consola para más detalles.');
    }
}

function limpiarCodigosExpirados() {
    const ahora = new Date();
    codigosValidos = codigosValidos.filter(c => new Date(c.expiracion) > ahora);
    localStorage.setItem('codigosValidos', JSON.stringify(codigosValidos));
}

function cerrarSesionSuperusuario() {
    superusuarioActivo = false;
    if (superusuarioTimeout) clearTimeout(superusuarioTimeout);
    document.getElementById('btn-seguridad').classList.add('hidden');
    alert('Sesión de superusuario cerrada');
    mostrarSeccion('rifas');
}

function mostrarConfirmacion(titulo, mensaje, callback) {
    document.getElementById('confirmacion-titulo').textContent = titulo;
    document.getElementById('confirmacion-mensaje').textContent = mensaje;
    
    const btnSi = document.getElementById('confirmacion-si');
    const btnNo = document.getElementById('confirmacion-no');
    
    btnSi.onclick = null;
    btnNo.onclick = null;
    
    btnSi.onclick = () => {
        confirmacionModal.classList.add('hidden');
        if (callback) callback();
    };
    
    btnNo.onclick = () => {
        confirmacionModal.classList.add('hidden');
    };
    
    confirmacionModal.classList.remove('hidden');
}

function actualizarInfoRifaActiva() {
    const rifaActivaInfo = document.getElementById('rifa-activa-info');
    if (!rifaActivaInfo) {
        console.warn('Elemento rifa-activa-info no encontrado en el DOM');
        return;
    }
    
    if (rifaActiva) {
        const rifa = rifas.find(r => r.id === rifaActiva);
        if (rifa) {
            rifaActivaInfo.textContent = `Rifa activa: ${rifa.nombre} (${rifa.totalNumeros} números)`;
        } else {
            rifaActivaInfo.textContent = 'Ninguna rifa seleccionada';
            rifaActiva = null;
        }
    } else {
        rifaActivaInfo.textContent = 'Ninguna rifa seleccionada';
    }
}

function guardarDatos() {
    localStorage.setItem('rifasSucre_rifas', JSON.stringify(rifas));
    localStorage.setItem('rifasSucre_clientes', JSON.stringify(clientes));
    localStorage.setItem('rifasSucre_codigos', JSON.stringify(codigosUsados));
    
    if (rifaActiva) {
        localStorage.setItem('rifasSucre_rifaActiva', rifaActiva);
    }
}

function salir() {
    // Liberar el código de acceso si existe
    const codigoAcceso = sessionStorage.getItem('codigo_acceso_actual');
    if (codigoAcceso) {
        liberarCodigo(codigoAcceso);
    }
    
    // Limpiar solo la sesión actual
    sessionStorage.removeItem('codigo_acceso_actual');
    
    // No limpiar el código de acceso persistente
    mainContainer.classList.add('hidden');
    accesoContainer.classList.remove('hidden');
    codigoAccesoInput.value = '';
    codigoAccesoInput.focus();
    
    if (superusuarioActivo) {
        superusuarioActivo = false;
        if (superusuarioTimeout) clearTimeout(superusuarioTimeout);
    }
}
function crearElementoCliente(cliente) {
    const clienteItem = document.createElement('div');
    clienteItem.className = 'cliente-item';
    
    const clienteHeader = document.createElement('div');
    clienteHeader.className = 'cliente-header';
    
    // Calcular total de números y deuda
    const numerosArray = cliente.numeros.split(',');
    const totalNumeros = numerosArray.length;

    // Calcular deuda total
    let deudaTotal = 0;
    const rifa = rifas.find(r => r.id === cliente.rifaId);
    const precioNumero = rifa ? (rifa.precio || 0) : 0;

    numerosArray.forEach(numCompleto => {
        const [num, estado, abono] = numCompleto.includes(':') ? 
            numCompleto.split(':') : 
            [numCompleto, cliente.estado, '0'];
        
        const abonoActual = parseFloat(abono || 0);
        
        if (estado === 'apartado') {
            deudaTotal += precioNumero;
        } else if (estado === 'abonado') {
            deudaTotal += (precioNumero - abonoActual);
        }
        // Los números pagados no generan deuda
    });

    clienteHeader.innerHTML = `
        <span class="cliente-numero">${cliente.numeroCliente}</span>
        <span class="cliente-telefono">${cliente.telefono}</span>
        <div class="cliente-info-adicional">
            <small>Total de nros: ${totalNumeros}</small>
            <small>Deuda total: $${deudaTotal.toFixed(2)}</small>
        </div>
    `;
    
    const clienteNombre = document.createElement('div');
    clienteNombre.className = 'cliente-nombre';
    clienteNombre.textContent = cliente.nombre;
    
    const clienteNumeros = document.createElement('div');
    clienteNumeros.className = 'cliente-numeros';

    cliente.numeros.split(',')
        .map(numCompleto => {
            const [num, estadoIndividual, abono] = numCompleto.includes(':') ? 
                numCompleto.split(':') : 
                [numCompleto, cliente.estado, '0'];
            return { num: parseInt(num), estado: estadoIndividual, abono: parseFloat(abono), original: numCompleto };
        })
        .sort((a, b) => a.num - b.num)
        .forEach(item => {
            const numElement = document.createElement('div');
            
            // Determinar clase CSS según estado y abono
            let claseEstado = item.estado;
            if (item.abono > 0 && item.estado !== 'pagado') {
                claseEstado = 'abonado';
            }
            
            numElement.className = `cliente-numero-rifa ${claseEstado}`;
            numElement.textContent = item.num.toString().padStart(3, '0');
            
            // Tooltip con información de abonos
            const rifa = rifas.find(r => r.id === cliente.rifaId);
            const precioNumero = rifa.precio || 0;
            const pendiente = precioNumero - item.abono;
            
            // CORRECCIÓN: Mostrar información correcta según el estado
if (item.estado === 'pagado') {
    numElement.title = `Estado: ${item.estado}\nPagado: $${precioNumero.toFixed(2)}`;
} else if (item.estado === 'abonado') {
    numElement.title = `Estado: ${item.estado}\nAbonado: $${item.abono.toFixed(2)}\nPendiente: $${pendiente.toFixed(2)}`;
} else {
    numElement.title = `Estado: ${item.estado}`;
}
            
            numElement.style.cssText = `
                cursor: pointer;
                display: inline-block;
                margin: 2px;
                padding: 3px 8px;
                border-radius: 3px;
                font-size: 14px;
                position: relative;
            `;
            
            // Barra de progreso visual para abonos
            if (item.abono > 0 && item.estado !== 'pagado') {
                const porcentaje = Math.min(100, (item.abono / precioNumero) * 100);
                numElement.innerHTML = `
                    ${item.num.toString().padStart(3, '0')}
                    <div style="
                        position: absolute;
                        bottom: 0;
                        left: 0;
                        width: ${porcentaje}%;
                        height: 2px;
                        background-color: #27ae60;
                    "></div>
                `;
            }
            
            numElement.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                mostrarMenuNumeros(e, item.num.toString().padStart(3, '0'), cliente);
            });
            
            clienteNumeros.appendChild(numElement);
        });
    
    const clienteAcciones = document.createElement('div');
clienteAcciones.className = 'cliente-acciones';

// Agrega el botón de imprimir factura
const btnImprimirFactura = document.createElement('button');
btnImprimirFactura.innerHTML = '<i class="fas fa-print"></i> Factura';
btnImprimirFactura.style.backgroundColor = '#16a085';
btnImprimirFactura.addEventListener('click', (e) => {
    e.stopPropagation();
    imprimirFactura(cliente);
});
clienteAcciones.appendChild(btnImprimirFactura);

// Nuevo botón Alternar
const btnAlternar = document.createElement('button');
btnAlternar.innerHTML = '<i class="fas fa-sync-alt"></i> Alternar';
btnAlternar.style.backgroundColor = '#9b59b6';
btnAlternar.addEventListener('click', (e) => {
    e.stopPropagation();
    mostrarModalAlternarEstado(cliente);
});
clienteAcciones.appendChild(btnAlternar);

const btnWhatsApp = document.createElement('button');
btnWhatsApp.innerHTML = '<i class="fab fa-whatsapp"></i> WhatsApp';
    btnWhatsApp.addEventListener('click', (e) => {
        e.stopPropagation();
        enviarWhatsApp(cliente);
    });

    const tieneApartados = cliente.numeros.split(',').some(num => {
        const estado = num.includes(':') ? num.split(':')[1] : cliente.estado;
        return estado === 'apartado';
    });

    if (tieneApartados) {
        const btnRezagados = document.createElement('button');
        btnRezagados.innerHTML = '<i class="fas fa-exclamation-circle"></i> Rezagados';
        btnRezagados.style.backgroundColor = '#e67e22';
        btnRezagados.addEventListener('click', (e) => {
            e.stopPropagation();
            enviarRezagados(cliente);
        });
        clienteAcciones.appendChild(btnRezagados);
    }
    
    const btnTicket = document.createElement('button');
    btnTicket.innerHTML = '<i class="fas fa-ticket-alt"></i> Ticket';
    btnTicket.addEventListener('click', (e) => {
        e.stopPropagation();
        generarTicket(cliente);
    });
    
    const btnEditar = document.createElement('button');
    btnEditar.innerHTML = '<i class="fas fa-edit"></i> Editar';
    btnEditar.addEventListener('click', (e) => {
        e.stopPropagation();
        mostrarModalEditarCliente(cliente);
    });
    
    const btnEliminar = document.createElement('button');
btnEliminar.textContent = 'Eliminar';
btnEliminar.style.backgroundColor = '#e74c3c';
btnEliminar.style.color = 'white';
btnEliminar.addEventListener('click', (e) => {
    e.stopPropagation();
    mostrarConfirmacion(
        'Eliminar Cliente',
        `¿Estás seguro de que deseas eliminar al cliente "${cliente.nombre}"?`,
        () => eliminarCliente(cliente.id)
    );
});
    
    clienteAcciones.appendChild(btnWhatsApp);
    clienteAcciones.appendChild(btnTicket);
    clienteAcciones.appendChild(btnEditar);
    clienteAcciones.appendChild(btnEliminar);
    
    clienteItem.appendChild(clienteHeader);
    clienteItem.appendChild(clienteNombre);
    clienteItem.appendChild(clienteNumeros);
    clienteItem.appendChild(clienteAcciones);
    
    return clienteItem;
}

function mostrarModalAlternarEstado(cliente) {
    mostrarConfirmacion(
        'Alternar Estado',
        `¿Cambiar estado de TODOS los números de ${cliente.nombre}?`,
        () => {
            // Crear un mini modal de selección
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 20px;
                border-radius: 5px;
                box-shadow: 0 0 20px rgba(0,0,0,0.2);
                z-index: 1001;
                text-align: center;
            `;
            
            modal.innerHTML = `
                <h3>Seleccionar Estado</h3>
                <div style="display: flex; gap: 10px; margin: 20px 0; justify-content: center;">
                    <button id="btn-cambiar-apartado" style="background: #f1c40f; padding: 10px 15px;">Apartado</button>
                    <button id="btn-cambiar-pagado" style="background: #2ecc71; padding: 10px 15px;">Pagado</button>
                </div>
                <button id="btn-cancelar-cambio" style="background: #e74c3c; padding: 8px 15px;">Cancelar</button>
            `;
            
            document.body.appendChild(modal);
            
            // Configurar eventos
            document.getElementById('btn-cambiar-apartado').addEventListener('click', () => {
                alternarTodosNumeros(cliente, 'apartado');
                modal.remove();
            });
            
            document.getElementById('btn-cambiar-pagado').addEventListener('click', () => {
                alternarTodosNumeros(cliente, 'pagado');
                modal.remove();
            });
            
            document.getElementById('btn-cancelar-cambio').addEventListener('click', () => {
                modal.remove();
            });
        }
    );
}

async function alternarTodosNumeros(cliente, nuevoEstado) {
    const rifa = rifas.find(r => r.id === cliente.rifaId);
const precioNumero = rifa ? (rifa.precio || 0) : 0;
    
    // Procesar los números para asignarles el nuevo estado con abonos correctos
    const nuevosNumeros = cliente.numeros.split(',').map(numCompleto => {
        const [numBase, estadoActual, abonoActual] = numCompleto.includes(':') ? 
            numCompleto.split(':') : 
            [numCompleto, cliente.estado, '0'];
            
        // Si cambia a pagado, establecer abono igual al precio
        const nuevoAbono = (nuevoEstado === 'pagado') ? precioNumero : 
                          (nuevoEstado === 'apartado') ? 0 : parseFloat(abonoActual || 0);
        return `${numBase}:${nuevoEstado}:${nuevoAbono}`;
    }).join(',');
    
    // Actualizar el cliente
    cliente.numeros = nuevosNumeros;
    cliente.estado = nuevoEstado;
    
    // Guardar cambios
    await guardarTodo();
    actualizarListaClientes();
}

// Función para mostrar la plantilla de factura
function mostrarModalPlantillaFactura() {
    document.getElementById('factura-titulo').value = 
        localStorage.getItem('facturaTitulo') || 'FACTURA DE VENTA';
    document.getElementById('factura-encabezado').value = 
        localStorage.getItem('facturaEncabezado') || `${localStorage.getItem('nombreApp') || 'Rifas Sucre'}\nTeléfono: \nDirección: `;
    document.getElementById('factura-cuerpo').value = 
        localStorage.getItem('facturaCuerpo') || 'Cliente: {nombre}\nRifa: {rifa}\nNúmeros: {numeros}\nCantidad: {cantidad}\nPrecio unitario: {precio}\nTotal: {total}';
    document.getElementById('factura-pie').value = 
        localStorage.getItem('facturaPie') || '¡Gracias por su compra!\nVálido como factura';
    
    plantillaFacturaModal.classList.remove('hidden');
}

// Función para guardar la plantilla de factura
function guardarPlantillaFactura() {
    const titulo = document.getElementById('factura-titulo').value.trim();
    const encabezado = document.getElementById('factura-encabezado').value.trim();
    const cuerpo = document.getElementById('factura-cuerpo').value.trim();
    const pie = document.getElementById('factura-pie').value.trim();
    
    if (!titulo || !encabezado || !cuerpo || !pie) {
        alert('Por favor completa todos los campos');
        return;
    }
    
    localStorage.setItem('facturaTitulo', titulo);
    localStorage.setItem('facturaEncabezado', encabezado);
    localStorage.setItem('facturaCuerpo', cuerpo);
    localStorage.setItem('facturaPie', pie);
    
    plantillaFacturaModal.classList.add('hidden');
    alert('Plantilla de factura guardada correctamente');
}

// Función para imprimir factura
function imprimirFactura(cliente) {
    const rifa = rifas.find(r => r.id === cliente.rifaId);
    if (!rifa) {
        alert('No se encontró la rifa asociada al cliente');
        return;
    }

    // Mostrar modal de confirmación de impresión
    document.getElementById('imprimir-factura-modal').classList.remove('hidden');
    
    // Configurar eventos de los botones
    document.getElementById('btn-imprimir-factura').onclick = () => {
        generarFactura(cliente, parseInt(document.getElementById('tamano-impresion').value));
        document.getElementById('imprimir-factura-modal').classList.add('hidden');
    };
    
    document.getElementById('btn-cancelar-impresion').onclick = () => {
        document.getElementById('imprimir-factura-modal').classList.add('hidden');
    };
}

// Función para generar la factura
function generarFactura(cliente, ancho) {
    const rifa = rifas.find(r => r.id === cliente.rifaId);
    const cantidadNumeros = cliente.numeros.split(',').length;
    const precioUnitario = rifa.precio || 0;
    const total = cantidadNumeros * precioUnitario;
    
    // Calcular pagado y deuda
    let pagado = 0;
    
    // CALCULAR ESTADO GENERAL CORRECTO
    let numerosPagados = 0;
    let numerosApartados = 0;
    const totalNumeros = cliente.numeros.split(',').length;

    cliente.numeros.split(',').forEach(numCompleto => {
        const estado = numCompleto.includes(':') ? numCompleto.split(':')[1] : cliente.estado;
        if (estado === 'pagado') {
            pagado += precioUnitario;
            numerosPagados++;
        }
        if (estado === 'apartado') numerosApartados++;
    });
    
    let estadoGeneral = 'mixto';
    if (numerosPagados === totalNumeros) estadoGeneral = 'pagado';
    if (numerosApartados === totalNumeros) estadoGeneral = 'apartado';
    
    const deuda = total - pagado;
    
    // Limpiar números para mostrar
    const numerosLimpios = cliente.numeros.split(',').map(num => {
        return num.includes(':') ? num.split(':')[0] : num;
    }).join(', ');
    
    // Obtener plantilla de factura
    const titulo = localStorage.getItem('facturaTitulo') || 'FACTURA DE VENTA';
    const encabezado = localStorage.getItem('facturaEncabezado') || `${localStorage.getItem('nombreApp') || 'Rifas Sucre'}\nTeléfono: \nDirección: `;
    let cuerpo = localStorage.getItem('facturaCuerpo') || 'Cliente: {nombre}\nRifa: {rifa}\nNúmeros: {numeros}\nCantidad: {cantidad}\nPrecio unitario: {precio}\nTotal: {total}\nPagado: {pagado}\nDeuda: {deuda}';
    const pie = localStorage.getItem('facturaPie') || '¡Gracias por su compra!\nDocumento sin validez fiscal';
    
    // Reemplazar variables (incluyendo las nuevas)
    cuerpo = cuerpo
        .replace(/{nombre}/g, cliente.nombre)
        .replace(/{rifa}/g, rifa.nombre)
        .replace(/{numeros}/g, numerosLimpios)
        .replace(/{cantidad}/g, cantidadNumeros)
        .replace(/{precio}/g, precioUnitario.toFixed(2))
        .replace(/{total}/g, total.toFixed(2))
        .replace(/{pagado}/g, pagado.toFixed(2))
        .replace(/{deuda}/g, deuda.toFixed(2))
        .replace(/{fecha}/g, new Date().toLocaleDateString())
        .replace(/{hora}/g, new Date().toLocaleTimeString())
        .replace(/{estado}/g, estadoGeneral); // ← AQUÍ ESTÁ EL CAMBIO PRINCIPAL
    
    // Crear contenido de la factura con ajustes específicos de tamaño
    const facturaContent = `
    <div id="factura-impresion" style="width: ${ancho}mm; padding: 3mm; font-family: 'Courier New', monospace; font-size: ${ancho === 58 ? '14px' : '14px'}; line-height: 1.2; font-weight: normal;">
        <h2 style="margin: 3px 0; font-size: ${ancho === 58 ? '16px' : '16px'}; font-weight: bold; text-align: left;">${titulo}</h2>
        <div style="margin: 3px 0; font-size: ${ancho === 58 ? '13px' : '13px'}; white-space: pre-line; text-align: left;">${encabezado}</div>
        <hr style="border-top: 1px dashed #000; margin: 4px 0;">
        <div style="margin: 4px 0; white-space: pre-line;">${cuerpo}</div>
        <hr style="border-top: 1px dashed #000; margin: 4px 0;">
        <div style="font-size: ${ancho === 58 ? '13px' : '13px'}; margin: 4px 0; white-space: pre-line; text-align: left;">${pie}</div>
        <div style="margin-top: 6px; font-size: ${ancho === 58 ? '12px' : '12px'}; text-align: left;">${new Date().toLocaleString()}</div>
    </div>
`;
    
    // Crear ventana de impresión
    const ventanaImpresion = window.open('', '_blank', 'width=600,height=600');
    ventanaImpresion.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Factura ${cliente.nombre}</title>
            <style>
                @media print {
                    body { 
                        margin: 0 !important; 
                        padding: 0 !important;
                        width: ${ancho}mm;
                    }
                    #factura-impresion {
                        width: ${ancho}mm !important;
                        padding: 2mm 3mm !important;
                        margin: 0 !important;
                    }
                    button { display: none !important; }
                    hr { border-top: 1px solid #000 !important; }
                }
                @page {
                    size: ${ancho}mm auto;
                    margin: 2mm;
                }
            </style>
        </head>
        <body style="margin: 0; padding: 0;">
            ${facturaContent}
            <div style="text-align: center; margin-top: 10px;">
                <button onclick="window.print()" style="padding: 8px 15px; background: #3498db; color: white; border: none; border-radius: 3px; cursor: pointer; margin-right: 10px;">Imprimir</button>
                <button onclick="window.close()" style="padding: 8px 15px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer;">Cancelar</button>
            </div>
            <script>
                // Auto-enfocar el botón de imprimir
                window.onload = function() {
                    document.querySelector('button').focus();
                };
            </script>
        </body>
        </html>
    `);
    ventanaImpresion.document.close();

}

