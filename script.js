



// Configuración de IndexedDB
const DB_NAME = 'RifasSucreDB';
const DB_VERSION = 4; // Incrementa cuando hagas cambios
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
            const neededStores = ['rifas', 'clientes', 'codigos', 'configuracion'];
            const missingStores = neededStores.filter(store => !db.objectStoreNames.contains(store));
            
            if (missingStores.length > 0) {
                // Si faltan stores, forzar una actualización
                db.close();
                const newRequest = indexedDB.open(DB_NAME, DB_VERSION + 1);
                
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
            
            if (!db.objectStoreNames.contains('rifas')) {
                db.createObjectStore('rifas', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('clientes')) {
                const clientesStore = db.createObjectStore('clientes', { keyPath: 'id' });
                clientesStore.createIndex('rifaId', 'rifaId', { unique: false });
            }
            if (!db.objectStoreNames.contains('codigos')) {
                const codigosStore = db.createObjectStore('codigos', { keyPath: 'codigo' });
                codigosStore.createIndex('expiracion', 'expiracion', { unique: false });
            }
            if (!db.objectStoreNames.contains('configuracion')) {
                db.createObjectStore('configuracion', { keyPath: 'clave' });
            }
        };
    });
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
        
        if (rifaActiva) {
            await guardarConfiguracion('rifaActiva', rifaActiva);
            localStorage.setItem('rifasSucre_rifaActiva', rifaActiva);
        }
        
        return rifasOk && clientesOk;
    } catch (error) {
        console.error('Error en guardarTodo:', error);
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
let rifaActiva = null;
let superusuarioActivo = false;
let superusuarioTimeout = null;
let filtroClientes = 'todos';
let paginaActualClientes = 1;
const clientesPorPagina = 10;let codigosValidos = JSON.parse(localStorage.getItem('codigosValidos') || "[]");
let codigosUsados = JSON.parse(localStorage.getItem('codigosUsados') || "[]");

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
        await cargarDatos();
        configurarEventos();
        
        // Verificar si ya tiene acceso
        const tieneAcceso = await verificarAccesoPersistente();
        if (tieneAcceso || superusuarioActivo) {
            accesoContainer.classList.add('hidden');
            mainContainer.classList.remove('hidden');
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
        const [rifasData, clientesData] = await Promise.all([
            obtenerTodosDatos('rifas'),
            obtenerTodosDatos('clientes')
        ]);
        
        rifas = rifasData || [];
        clientes = clientesData || [];
        
        // Si no hay datos, intentar con localStorage
        if (rifas.length === 0 && localStorage.getItem('rifasSucre_rifas')) {
            rifas = JSON.parse(localStorage.getItem('rifasSucre_rifas'));
            await guardarRifasEnDB(); // Migrar a IndexedDB
        }
        
        if (clientes.length === 0 && localStorage.getItem('rifasSucre_clientes')) {
            clientes = JSON.parse(localStorage.getItem('rifasSucre_clientes'));
            await guardarClientesEnDB(); // Migrar a IndexedDB
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
    
    if (rifasGuardadas) rifas = JSON.parse(rifasGuardadas);
    if (clientesGuardados) clientes = JSON.parse(clientesGuardados);
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

async function verificarCodigoEnDB(codigo) {
    return new Promise((resolve) => {
        const tx = db.transaction(['codigos'], 'readonly');
        const store = tx.objectStore('codigos');
        const request = store.get(codigo);

        request.onsuccess = () => {
            const codigoObj = request.result;
            if (!codigoObj) {
                console.log('Código no encontrado');
                resolve(false);
                return;
            }

            const ahora = new Date();
            const expiracion = new Date(codigoObj.expiracion);
            
            if (ahora > expiracion) {
                console.log('Código expirado');
                resolve(false);
                return;
            }

            console.log('Código válido');
            resolve(true);
        };

        request.onerror = () => {
            console.error('Error al verificar código');
            resolve(false);
        };
    });
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
    // btnPrueba.removeEventListener('click', activarPrueba); // Elimina esta línea si existe
    btnSuperusuario.addEventListener('click', mostrarModalSuperusuario);
    btnContacto.addEventListener('click', () => {
        window.open('https://wa.me/584245244171', '_blank');
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

    // Modales
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.add('hidden');
        });
    });
    
    // Superusuario
    document.getElementById('btn-superusuario-acceder').addEventListener('click', validarSuperusuario);
    
    // Eventos de teclado
    codigoAccesoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') validarAcceso();
    });
    
    document.getElementById('superusuario-clave').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') validarSuperusuario();
    });
}

function mostrarModalCambiarNombre() {
    document.getElementById('nuevo-nombre').value = localStorage.getItem('nombreApp') || 'Rifas Sucre';
    nombreModal.classList.remove('hidden');
}

function guardarNuevoNombre() {
    const nuevoNombre = document.getElementById('nuevo-nombre').value.trim();
    if (!nuevoNombre) {
        alert('Por favor ingresa un nombre válido');
        return;
    }
    
    localStorage.setItem('nombreApp', nuevoNombre);
    appTitle.textContent = nuevoNombre;
    nombreModal.classList.add('hidden');
    document.querySelector('#acceso-container h1').textContent = nuevoNombre;
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
            alert('Código inválido, expirado o ya utilizado');
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

    // Información de rifa activa
    const infoRifa = document.createElement('div');
    infoRifa.className = 'rifa-activa';
    if (rifaActiva) {
        const rifa = rifas.find(r => r.id === rifaActiva);
        if (rifa) {
            infoRifa.textContent = `Rifa activa: ${rifa.nombre} (${rifa.totalNumeros} números)`;
        } else {
            infoRifa.textContent = 'Ninguna rifa seleccionada';
            rifaActiva = null;
        }
    } else {
        infoRifa.textContent = 'Ninguna rifa seleccionada';
    }
    rifasSection.appendChild(infoRifa);

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
        
        // Calcular números disponibles, apartados y pagados
        const clientesRifa = clientes.filter(c => c.rifaId === rifa.id);
        let apartados = 0;
        let pagados = 0;

        clientesRifa.forEach(cliente => {
            cliente.numeros.split(',').forEach(numCompleto => {
                const estado = numCompleto.includes(':') ? numCompleto.split(':')[1] : cliente.estado;
                
                if (estado === 'apartado') {
                    apartados++;
                } else if (estado === 'pagado') {
                    pagados++;
                }
            });
        });
        
        const disponibles = rifa.totalNumeros - apartados - pagados;
        
        rifaEstado.innerHTML = `
            <span>Disponibles: ${disponibles}</span>
            <span>Apartados: ${apartados}</span>
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
    const cliente = clientes.find(c => 
        c.rifaId === rifaId && 
        c.numeros.split(',').some(n => n.startsWith(numero))
    );
    
    if (!cliente) return { estado: 'disponible', cliente: null };
    
    const numData = cliente.numeros.split(',')
        .find(n => n.startsWith(numero));
    
    return {
        estado: numData.includes(':') ? numData.split(':')[1] : cliente.estado,
        cliente: cliente.nombre
    };
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
    
    document.getElementById('btn-guardar-cliente').onclick = guardarNuevoCliente;
    clienteModal.classList.remove('hidden');
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
    
    // Crear nuevo cliente
    const nuevoCliente = {
        id: Date.now().toString(),
        rifaId: rifaActiva,
        numeroCliente,
        nombre,
        telefono,
        numeros: numerosArray.map(n => parseInt(n).toString().padStart(3, '0')).join(','),
        estado,
        fechaRegistro: new Date().toISOString()
    };
    
    clientes.push(nuevoCliente);
    await guardarTodo();
    clienteModal.classList.add('hidden');
    actualizarListaClientes();
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
            return numFormateado;
        }
    });
    
    clientes[clienteIndex] = {
        ...clienteActual,
        nombre,
        telefono,
        numeros: numerosConEstado.join(','),
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
    const nuevosNumeros = cliente.numeros.split(',').map(num => {
        const numActual = num.includes(':') ? num.split(':')[0] : num;
        return numActual === numero ? `${numero}:${nuevoEstado}` : num;
    });

    cliente.numeros = nuevosNumeros.join(',');
    await guardarTodo(); // Ahora funciona correctamente
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
    
    let mensaje = plantilla
        .replace(/{nombre}/g, cliente.nombre)
        .replace(/{rifa}/g, rifa.nombre)
        .replace(/{numeros}/g, numerosLimpios)
        .replace(/{estado}/g, cliente.estado);
    
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

    const numerosHTML = cliente.numeros.split(',').map(numCompleto => {
        const [num, estadoIndividual] = numCompleto.includes(':') ? 
            numCompleto.split(':') : 
            [numCompleto, cliente.estado];
            
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
    let pagado = 0;
    let deuda = total;

    cliente.numeros.split(',').forEach(numCompleto => {
        const estado = numCompleto.includes(':') ? numCompleto.split(':')[1] : cliente.estado;
        if (estado === 'pagado') {
            pagado += (rifa?.precio || 0);
            deuda -= (rifa?.precio || 0);
        }
    });

    mensajeTicket = mensajeTicket
        .replace(/{nombre}/g, cliente.nombre)
        .replace(/{telefono}/g, cliente.telefono)
        .replace(/{rifa}/g, rifa.nombre)
        .replace(/{numeros}/g, numerosLimpios)
        .replace(/{estado}/g, cliente.estado)
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
    
    let mensaje = plantilla
        .replace(/{nombre}/g, cliente.nombre)
        .replace(/{rifa}/g, rifa.nombre)
        .replace(/{numeros}/g, numerosLimpios)
        .replace(/{estado}/g, cliente.estado);
    
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

function crearRespaldo() {
    const datos = {
        rifas,
        clientes,
        codigosUsados,
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
    
    alert('Respaldo creado correctamente');
}

function restaurarRespaldo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = event => {
            try {
                const datos = JSON.parse(event.target.result);
                
                mostrarConfirmacion(
                    'Restaurar Respaldo',
                    '¿Estás seguro de que deseas restaurar este respaldo? Todos los datos actuales serán reemplazados.',
                    () => {
                        rifas = datos.rifas || [];
                        clientes = datos.clientes || [];
                        codigosUsados = datos.codigosUsados || [];
                        rifaActiva = datos.rifaActiva || null;
                        
                        guardarDatos();
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

function mostrarSeguridad() {
    if (!superusuarioActivo) return;
    
    limpiarCodigosExpirados();
    
    seguridadSection.innerHTML = `
        <h2>🔑 Gestión de Accesos</h2>
        
        <div class="generar-codigo">
            <h3>Generar Nuevo Código</h3>
            <input type="number" id="codigo-duracion" placeholder="Días de validez (ej: 7)" min="1">
            <button onclick="generarCodigoAcceso()">Generar</button>
            
            <div id="codigo-generado-container" class="hidden">
                <div class="codigo-box" id="codigo-generado"></div>
                <p>Este código es de un solo uso</p>
            </div>
        </div>
        
        <div class="lista-codigos">
            <h3>Códigos Activos</h3>
            ${codigosValidos.map(c => `
                <div class="codigo-item ${codigosUsados.includes(c.codigo) ? 'usado' : ''}">
                    <strong>${c.codigo}</strong> - 
                    Válido hasta: ${new Date(c.expiracion).toLocaleDateString()}
                    ${codigosUsados.includes(c.codigo) ? ' (USADO)' : ''}
                </div>
            `).join('')}
        </div>
    `;
}

async function generarCodigoAcceso() {
    if (!superusuarioActivo) {
        alert('❌ Solo el superusuario puede generar códigos');
        return;
    }

    const duracion = parseInt(document.getElementById('codigo-duracion').value) || 7;
    const codigo = Math.floor(10000000 + Math.random() * 90000000).toString();
    const expiracion = new Date();
    expiracion.setDate(expiracion.getDate() + duracion);

    const nuevoCodigo = {
        codigo: codigo,
        expiracion: expiracion.toISOString(),
        generadoEl: new Date().toISOString(),
        generadoPor: "superusuario",
        usado: false
    };

    try {
        // Guardar en IndexedDB
        const tx = db.transaction(['codigos'], 'readwrite');
        const store = tx.objectStore('codigos');
        
        // Verificar si el código ya existe (muy improbable pero por seguridad)
        const existe = await new Promise(resolve => {
            const req = store.get(codigo);
            req.onsuccess = () => resolve(!!req.result);
            req.onerror = () => resolve(false);
        });

        if (existe) {
            alert('Error: Código ya existe. Intenta generar otro.');
            return;
        }

        // Guardar el nuevo código
        await store.put(nuevoCodigo);
        
        // Actualizar la lista local
        codigosValidos.push(nuevoCodigo);
        
        // Mostrar confirmación
        const codigoBox = document.getElementById('codigo-generado');
        codigoBox.innerHTML = `
            <strong>Código:</strong> ${codigo}<br>
            <strong>Válido hasta:</strong> ${expiracion.toLocaleDateString()}<br>
            <strong>Duración:</strong> ${duracion} días
        `;
        document.getElementById('codigo-generado-container').classList.remove('hidden');
        
        console.log('Código guardado en IndexedDB:', codigo);
        alert('✅ Código generado correctamente. Cópialo ahora: ' + codigo);
    } catch (error) {
        console.error('Error al guardar el código:', error);
        alert('❌ Error al guardar el código. Verifica la consola para más detalles.');
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
    if (rifaActiva) {
        const rifa = rifas.find(r => r.id === rifaActiva);
        rifaActivaInfo.textContent = `Rifa activa: ${rifa.nombre} (${rifa.totalNumeros} números)`;
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
    clienteHeader.innerHTML = `
        <span class="cliente-numero">${cliente.numeroCliente}</span>
        <span class="cliente-telefono">${cliente.telefono}</span>
    `;
    
    const clienteNombre = document.createElement('div');
    clienteNombre.className = 'cliente-nombre';
    clienteNombre.textContent = cliente.nombre;
    
    const clienteNumeros = document.createElement('div');
    clienteNumeros.className = 'cliente-numeros';

    // Ordenar los números numéricamente antes de mostrarlos
    cliente.numeros.split(',')
        .sort((a, b) => {
            const numA = parseInt(a.includes(':') ? a.split(':')[0] : a);
            const numB = parseInt(b.includes(':') ? b.split(':')[0] : b);
            return numA - numB;
        })
        .forEach(numCompleto => {
            const [num, estadoIndividual] = numCompleto.includes(':') ? 
                numCompleto.split(':') : 
                [numCompleto, cliente.estado];
            
            const numElement = document.createElement('div');
            numElement.className = `cliente-numero-rifa ${estadoIndividual}`;
            numElement.textContent = num;
            
            numElement.style.cssText = `
                cursor: pointer;
                display: inline-block;
                margin: 2px;
                padding: 2px 5px;
                border-radius: 3px;
                border: 1px solid #ddd;
            `;
            
            numElement.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                mostrarMenuNumeros(e, num, cliente);
            });
            
            clienteNumeros.appendChild(numElement);
        });
    
    const clienteAcciones = document.createElement('div');
clienteAcciones.className = 'cliente-acciones';

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
    // Procesar los números para asignarles el nuevo estado
    const nuevosNumeros = cliente.numeros.split(',').map(num => {
        const numBase = num.includes(':') ? num.split(':')[0] : num;
        return `${numBase}:${nuevoEstado}`;
    }).join(',');
    
    // Actualizar el cliente
    cliente.numeros = nuevosNumeros;
    cliente.estado = nuevoEstado;
    
    // Guardar cambios
    await guardarTodo();
    actualizarListaClientes();
}