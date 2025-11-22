/* ============================================================
   GLOBAL CONFIGURACION IDB
   ============================================================ */
let db;
const DB_NAME = 'AsistenciasDB';
const DB_VERSION = 1;

// Nombres de las Object Stores (Tablas)
const STORES = {
    USERS: 'users',
    EVIDENCES: 'evidences',
    CONFIG: 'config' // Gist ID, Token
};

/* ============================================================
   FUNCIONES DE OCR Y VALIDACIÓN
   ============================================================ */

/**
 * Convierte una fecha de formato DD/MM/YY (OCR) a YYYY-MM-DD para comparación.
 * @param {string} ocrDateString - La fecha extraída por el OCR (ej: '21/11/25').
 * @returns {string|null} - La fecha en formato estándar YYYY-MM-DD.
 */
function parseOCRDate(ocrDateString) {
    const parts = ocrDateString.split('/'); 
    if (parts.length !== 3) return null;

    // Convertimos año de 2 dígitos (YY) a 4 dígitos (YYYY). Asumimos 20XX.
    const year = parseInt(parts[2], 10);
    // Asume 20xx si el año de 2 dígitos no es "demasiado" grande (e.g., más de 10 años en el futuro)
    const currentYearShort = new Date().getFullYear() - 2000;
    const fullYear = (year > currentYearShort + 10) ? 1900 + year : 2000 + year;

    const month = parts[1].padStart(2, '0');
    const day = parts[0].padStart(2, '0');
    
    return `${fullYear}-${month}-${day}`;
}

/**
 * Realiza todas las validaciones (patrones y reglas de negocio) sobre el texto.
 * @param {string} text - El texto completo extraído por el OCR.
 * @param {string} userSelectedDate - La fecha seleccionada por el usuario (YYYY-MM-DD).
 * @returns {object} - Resultado estructurado con mensaje y datos.
 */
function validateCheckOutData(text, userSelectedDate) {
    // Regex Maestra: Captura Fecha, Hora, Región, Cód. Numérico (5 dígitos), Cód. Alfanumérico.
    const regex = /(\d{1,2}\/\d{1,2}\/\d{2}).*?(\d{1,2}:\d{2}\s*[ap]\.?\s*m\.?).*?(Región\s?\d+).*?(\d{5}).*?(\w+)/is;
    const match = text.match(regex);
    
    const failedResult = { isValid: false, message: 'Fallo: No se encontraron todos los patrones requeridos.', code: null };
    
    if (!match) {
        return failedResult;
    }

    const ocrDateStr = match[1];
    const ocrAlphaCode = match[5];
    
    // VALIDACIÓN 1: FECHA
    const ocrStandardDate = parseOCRDate(ocrDateStr);
    
    if (ocrStandardDate !== userSelectedDate) {
        failedResult.message = `❌ La fecha de la imagen (${ocrDateStr}) no coincide con la fecha seleccionada (${userSelectedDate}).`;
        return failedResult;
    }

    // VALIDACIÓN 2: CÓDIGO ALFANUMÉRICO NO DEBE CONTENER 'PMC'
    if (ocrAlphaCode.toUpperCase().includes('PMC')) {
        failedResult.message = `❌ El código final (${ocrAlphaCode}) contiene la secuencia prohibida 'PMC'.`;
        return failedResult;
    }

    // ÉXITO
    return {
        isValid: true,
        message: '✅ Validación exitosa.',
        date: ocrDateStr,
        time: match[2],
        region: match[3],
        numericCode: match[4],
        alphaCode: ocrAlphaCode,
        code: `${match[4]}-${ocrAlphaCode}` 
    };
}


/**
 * Ejecuta el proceso de OCR usando Tesseract.js. Usa Web Workers.
 * @param {File} imageFile - El archivo de imagen.
 * @returns {Promise<string|null>} - El texto extraído o null si hay error.
 */
async function processImageForOCR(imageFile) {
    showToast('Iniciando OCR... proceso local y asíncrono.');
    
    // Asume que Tesseract está disponible globalmente
    const worker = await Tesseract.createWorker({
        logger: m => {
             // Opcional: mostrar progreso detallado
        }
    });

    try {
        await worker.loadLanguage('spa');
        await worker.initialize('spa');
        
        const { data: { text } } = await worker.recognize(imageFile);
        
        return text.trim();

    } catch (error) {
        console.error('Error durante el OCR:', error);
        showToast('Error crítico en el OCR. Intente con una imagen más clara.', true);
        return null; 
    } finally {
        await worker.terminate();
    }
}


/* ============================================================
   UTILIDADES
   ============================================================ */
function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');

    if (!toast || !toastMsg) return console.warn('Toast elements not found.'); // Manejo básico si no existe el DOM

    toastMsg.textContent = msg;
    toast.className = 'fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl opacity-0 transition-all duration-300 pointer-events-none z-[70] text-sm font-medium translate-y-10';

    if (isError) {
        toast.classList.add('bg-red-700', 'text-white');
    } else {
        toast.classList.add('bg-slate-900', 'text-white');
    }

    // Mostrar
    setTimeout(() => {
        toast.classList.remove('opacity-0', 'translate-y-10');
        toast.classList.add('opacity-100', 'translate-y-0');
    }, 50);

    // Ocultar
    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-10');
    }, 4000);
}

function getInitials(name) {
    if (!name) return 'UN';
    const parts = name.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (name[0] + name[1]).toUpperCase();
}

let activeUserId = null;

/* ============================================================
   NAVEGACION Y VISTAS
   ============================================================ */
function showTab(tabName) {
    // 1. Ocultar todas las vistas y desmarcar todos los botones
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active', 'bg-slate-50'));

    // 2. Mostrar la vista y marcar el botón activo
    document.getElementById(`view-${tabName}`).classList.remove('hidden');
    document.getElementById(`nav-${tabName}`).classList.add('active', 'bg-slate-50');

    // 3. Si volvemos a equipo, limpiar el estado individual
    if (tabName === 'team') {
        document.getElementById('nav-individual').classList.add('hidden');
        activeUserId = null;
    }
    
    // 4. Asegurarse de que los iconos se rendericen después de cambiar de vista
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function openUserPanel(userId, userName, userBranch) {
    activeUserId = userId;
    
    // Actualizar nav individual
    document.getElementById('nav-individual').classList.remove('hidden');
    
    // Actualizar vista individual
    document.getElementById('ind-name').textContent = userName;
    document.getElementById('ind-initials').textContent = getInitials(userName);
    document.getElementById('ind-branch').textContent = userBranch;

    // Calcular estadísticas al abrir
    calculateUserStats(userId);
    
    // Mostrar la vista y cambiar a la sub-pestaña por defecto
    showTab('individual');
    switchIndTab('evidencia'); 

    // Poner la fecha de hoy por defecto en el selector
    document.getElementById('evidence-date').value = new Date().toISOString().split('T')[0];

    // Cargar evidencia si existe para hoy
    loadCurrentEvidence(userId, document.getElementById('evidence-date').value);
}

function switchIndTab(subTabName) {
    // Resetear las vistas y los estilos de las sub-pestañas
    document.getElementById('ind-view-evidencia').classList.add('hidden');
    document.getElementById('ind-view-historial').classList.add('hidden');
    document.getElementById('subtab-evidencia').classList.remove('text-blue-600', 'border-b-2', 'border-blue-600', 'bg-blue-50', 'text-slate-500', 'hover:text-slate-700');
    document.getElementById('subtab-historial').classList.remove('text-blue-600', 'border-b-2', 'border-blue-600', 'bg-blue-50', 'text-slate-500', 'hover:text-slate-700');

    // Activar la sub-pestaña seleccionada
    document.getElementById(`ind-view-${subTabName}`).classList.remove('hidden');
    document.getElementById(`subtab-${subTabName}`).classList.add('text-blue-600', 'border-b-2', 'border-blue-600', 'bg-blue-50');
    
    // Asegurar que la otra sub-pestaña tiene el estilo inactivo
    const otherSubTabName = subTabName === 'evidencia' ? 'historial' : 'evidencia';
    document.getElementById(`subtab-${otherSubTabName}`).classList.add('text-slate-500', 'hover:text-slate-700');

    if (subTabName === 'historial') {
        renderUserChart(activeUserId);
        renderUserHistory(activeUserId);
    }
}

/* ============================================================
   INDEXEDDB CORE FUNCTIONS
   ============================================================ */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            db = e.target.result;
            // Si la tabla no existe, la crea
            if (!db.objectStoreNames.contains(STORES.USERS)) {
                db.createObjectStore(STORES.USERS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.EVIDENCES)) {
                // Se agregó keyPath, pero la búsqueda por evidencia debería ser por ID compuesto
                db.createObjectStore(STORES.EVIDENCES, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.CONFIG)) {
                db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            document.getElementById('db-status').innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Listo';
            resolve(db);
        };

        request.onerror = (e) => {
            console.error("Error al abrir la base de datos:", e.target.error);
            document.getElementById('db-status').innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span> Error IDB';
            reject(e.target.error);
        };
    });
}

function getStore(storeName, mode = 'readonly') {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
}

function getByID(storeName, id) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = e => reject(e.target.error);
    });
}

function getAll(storeName) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = e => reject(e.target.error);
    });
}

function save(storeName, data) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.put(data); // put sirve para INSERT o UPDATE
        request.onsuccess = () => resolve(data);
        request.onerror = e => reject(e.target.error);
    });
}

function remove(storeName, id) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = e => reject(e.target.error);
    });
}

/* ============================================================
   MODAL DE USUARIO (CRUD)
   ============================================================ */
function openUserModal(user = null) {
    const modal = document.getElementById('user-modal');
    const content = document.getElementById('user-modal-content');
    const btnDelete = document.getElementById('btn-delete-user');
    
    document.getElementById('edit-user-id').value = user ? user.id : 'new';
    document.getElementById('input-name').value = user ? user.name : '';
    document.getElementById('input-branch').value = user ? user.branch : '';
    document.getElementById('input-active').checked = user ? user.active : true;

    document.getElementById('modal-title').textContent = user ? `Editar a ${user.name}` : 'Añadir Nuevo Promotor';
    btnDelete.classList.toggle('hidden', !user);

    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 50);
}

function closeUserModal() {
    const modal = document.getElementById('user-modal');
    const content = document.getElementById('user-modal-content');
    
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

async function saveUser() {
    const userId = document.getElementById('edit-user-id').value;
    const name = document.getElementById('input-name').value.trim();
    const branch = document.getElementById('input-branch').value.trim();
    const active = document.getElementById('input-active').checked;

    if (!name || !branch) {
        return showToast('El nombre y la sucursal son obligatorios.', true);
    }

    const user = {
        id: userId === 'new' ? `user_${Date.now()}` : userId,
        name: name,
        branch: branch,
        active: active,
        updated: Date.now()
    };

    try {
        await save(STORES.USERS, user);
        showToast(`Promotor "${name}" guardado.`);
        closeUserModal();
        renderTeamGrid(await getAll(STORES.USERS));
    } catch (e) {
        showToast('Error al guardar el promotor.', true);
        console.error(e);
    }
}

async function deleteUser() {
    const userId = document.getElementById('edit-user-id').value;
    if (confirm("¿Estás seguro de que quieres eliminar este promotor y todas sus asistencias?")) {
        try {
            await remove(STORES.USERS, userId);
            // Opcional: limpiar también sus evidencias
            const allEvidences = await getAll(STORES.EVIDENCES);
            const userEvidences = allEvidences.filter(e => e.userId === userId);
            for (const evidence of userEvidences) {
                await remove(STORES.EVIDENCES, evidence.id);
            }
            showToast('Promotor eliminado.');
            closeUserModal();
            renderTeamGrid(await getAll(STORES.USERS));
        } catch (e) {
            showToast('Error al eliminar el promotor.', true);
            console.error(e);
        }
    }
}

/* ============================================================
   RENDERIZADO DE VISTAS
   ============================================================ */
function renderUserCard(user) {
    const activeClass = user.active ? 'bg-white border-slate-200' : 'bg-slate-100 border-slate-300 opacity-60';
    const activeText = user.active ? 'Activo' : 'Inactivo';

    // Usamos JSON.stringify y replace para escapar el objeto JSON correctamente
    const userJsonString = JSON.stringify(user).replace(/"/g, '&quot;');

    return `
        <div class="user-card ${activeClass} rounded-xl shadow-md p-4 flex items-center gap-4 cursor-pointer hover:shadow-lg transition duration-200" 
             onclick="openUserPanel('${user.id}', '${user.name.replace(/'/g, "\\'")}', '${user.branch.replace(/'/g, "\\'")}')">
            <div class="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 uppercase">${getInitials(user.name)}</div>
            <div class="flex-grow">
                <p class="font-bold text-sm text-slate-800 truncate">${user.name}</p>
                <p class="text-xs text-slate-500 flex items-center gap-1">
                    <i data-lucide="store" class="w-3 h-3"></i> ${user.branch}
                </p>
            </div>
            <div class="text-right flex-shrink-0">
                <span class="text-[10px] font-bold ${user.active ? 'text-green-600' : 'text-red-500'}">${activeText}</span>
                <button onclick="event.stopPropagation(); openUserModal(${userJsonString})" class="text-slate-400 hover:text-slate-600 p-1 block mt-0.5" aria-label="Editar usuario">
                    <i data-lucide="pencil" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
    `;
}

async function renderTeamGrid(users) {
    const grid = document.getElementById('team-grid');
    if (!users || users.length === 0) {
        grid.innerHTML = `<div class="p-8 text-center text-slate-400 col-span-full bg-white rounded-xl border border-dashed border-slate-300">No hay promotores registrados.</div>`;
        return;
    }
    
    // Separar activos de inactivos
    const activeUsers = users.filter(u => u.active).sort((a, b) => a.name.localeCompare(b.name));
    const inactiveUsers = users.filter(u => !u.active).sort((a, b) => a.name.localeCompare(b.name));

    const html = [...activeUsers, ...inactiveUsers].map(user => renderUserCard(user)).join('');
    grid.innerHTML = html;
    
    // Asegurarse de que los iconos de Lucide se rendericen
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/* ============================================================
   GESTION DE EVIDENCIAS (IMAGENES)
   ============================================================ */

/**
 * Convierte el archivo de imagen a una cadena Base64 optimizada.
 * @param {File} file - El archivo de imagen.
 * @returns {Promise<string>} La cadena Base64 optimizada.
 */
function fileToBase64(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400; // Reducimos el tamaño para ahorrar espacio
                const QUALITY = 0.5; // Reducimos la calidad JPEG

                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = height * (MAX_WIDTH / width);
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convertir a JPEG con baja calidad para reducir el tamaño del archivo
                const dataUrl = canvas.toDataURL('image/jpeg', QUALITY); 
                resolve(dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}


let currentEvidence = {
    entrada: null,
    salida: null,
    // NUEVOS CAMPOS: Almacenan los datos validados del OCR
    validatedCheckIn: null,
    validatedCheckOut: null
};

async function handleFileSelect(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 🔑 Obtener la fecha seleccionada por el usuario (debe estar en YYYY-MM-DD)
    const selectedDate = document.getElementById('evidence-date').value; 
    if (!selectedDate) {
        return showToast('Error: Primero selecciona una fecha de evidencia.', true);
    }

    try {
        // --- PASO 1: Ejecutar OCR y obtener el texto bruto ---
        const rawText = await processImageForOCR(file);
        
        if (!rawText) {
             return; // El error ya fue notificado
        }

        // --- PASO 2: Validar el texto con la fecha seleccionada ---
        // Nota: Se usa validateCheckOutData, asumiendo que la lógica es la misma para entrada y salida.
        const validationResult = validateCheckOutData(rawText, selectedDate);

        if (!validationResult.isValid) {
            // ❌ Detener aquí si la validación falla
            // También mostramos el mensaje de error específico
            return showToast(validationResult.message, true); 
        }
        
        // --- PASO 3: Si la validación es exitosa, guardar datos y base64 ---
        
        // 3a. Guardar la imagen comprimida
        const base64Data = await fileToBase64(file);
        currentEvidence[type] = base64Data;

        // 3b. Guardar los datos validados en el slot correspondiente
        if (type === 'entrada') {
            currentEvidence.validatedCheckIn = validationResult;
        } else if (type === 'salida') {
            currentEvidence.validatedCheckOut = validationResult;
        }

        // Mostrar vista previa y éxito
        const previewEl = document.getElementById(`preview-${type}`);
        previewEl.innerHTML = `<img src="${base64Data}" class="w-full h-full object-cover">`;

        showToast(`${validationResult.message} Imagen de ${type} cargada.`);

    } catch (e) {
        showToast('Error procesando la imagen.', true);
        console.error(e);
    }
}


async function loadCurrentEvidence(userId, date) {
    const evidenceId = `${userId}_${date}`;
    const evidence = await getByID(STORES.EVIDENCES, evidenceId);

    // Reiniciar el estado
    currentEvidence = { 
        entrada: null, 
        salida: null,
        validatedCheckIn: null, // Asegurar que estos también se reinicien
        validatedCheckOut: null
    };
    document.getElementById('preview-entrada').innerHTML = '<span class="text-slate-400 text-[10px]">Vacío</span>';
    document.getElementById('preview-salida').innerHTML = '<span class="text-slate-400 text-[10px]">Vacío</span>';

    if (evidence) {
        // Cargar Base64
        currentEvidence.entrada = evidence.entrada;
        currentEvidence.salida = evidence.salida;
        
        // Cargar datos validados si existen (para reintentar guardar si es necesario)
        currentEvidence.validatedCheckIn = evidence.validatedEntry || null;
        currentEvidence.validatedCheckOut = evidence.validatedExit || null;

        if (evidence.entrada) {
            document.getElementById('preview-entrada').innerHTML = `<img src="${evidence.entrada}" class="w-full h-full object-cover">`;
        }
        if (evidence.salida) {
            document.getElementById('preview-salida').innerHTML = `<img src="${evidence.salida}" class="w-full h-full object-cover">`;
        }
    }
}

async function saveEvidence() {
    const date = document.getElementById('evidence-date').value;
    
    if (!activeUserId) {
        return showToast('Error: No hay un usuario activo seleccionado.', true);
    }
    if (!date) {
        return showToast('Error: Debes seleccionar una fecha.', true);
    }
    if (!currentEvidence.entrada && !currentEvidence.salida) {
        return showToast('Debes subir al menos una foto (entrada o salida).', true);
    }
    
    // 🚨 Nueva Validación: Asegurar que si hay foto, haya datos validados
    if ((currentEvidence.entrada && !currentEvidence.validatedCheckIn) || 
        (currentEvidence.salida && !currentEvidence.validatedCheckOut)) {
        return showToast('Error: Falta información validada para una o ambas fotos. Vuelve a cargar la imagen.', true);
    }
    
    const evidenceId = `${activeUserId}_${date}`;
    
    const evidence = {
        id: evidenceId,
        userId: activeUserId,
        fecha: date,
        entrada: currentEvidence.entrada,
        salida: currentEvidence.salida,
        // -----------------------------------------------------------------
        // CAMPOS CLAVE: Guardamos el resultado del OCR y la validación
        validatedEntry: currentEvidence.validatedCheckIn, // Corregido: Usar validatedCheckIn
        validatedExit: currentEvidence.validatedCheckOut, // Corregido: Usar validatedCheckOut
        // -----------------------------------------------------------------
        timestamp: Date.now()
    };

    try {
        await save(STORES.EVIDENCES, evidence);
        showToast('Asistencia guardada correctamente.');
        // Recalcular stats y actualizar el historial
        calculateUserStats(activeUserId);
        if (!document.getElementById('ind-view-historial').classList.contains('hidden')) {
             renderUserChart(activeUserId);
             renderUserHistory(activeUserId);
        }
    } catch (e) {
        showToast('Error al guardar la evidencia.', true);
        console.error(e);
    }
} // <--- Eliminada la repetición de la función saveEvidence() que estaba aquí.

document.getElementById('evidence-date').addEventListener('change', (e) => {
    if (activeUserId) {
        loadCurrentEvidence(activeUserId, e.target.value);
    }
});


/* ============================================================
   ESTADISTICAS Y GRAFICOS
   ============================================================ */
let userChartInstance = null;

async function calculateUserStats(userId) {
    const allEvidences = await getAll(STORES.EVIDENCES);
    const userEvidences = allEvidences.filter(e => e.userId === userId);
    
    const now = new Date();
    // Obtener la fecha de inicio de semana (lunes)
    const dayOfWeek = (now.getDay() + 6) % 7; // Lunes = 0, Domingo = 6
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    let weekCount = 0;
    const requiredDays = 6; // Lunes a Sábado

    userEvidences.forEach(e => {
        const evidenceDate = new Date(e.fecha);
        // Verificar si la evidencia cae dentro de esta semana
        if (evidenceDate >= startOfWeek && evidenceDate.getTime() <= now.getTime()) {
            // Verificar si tiene entrada Y salida
            if (e.entrada && e.salida) {
                // Solo contar los días de Lunes (1) a Sábado (6)
                if (evidenceDate.getDay() >= 1 && evidenceDate.getDay() <= 6) {
                    weekCount++;
                }
            }
        }
    });

    const percent = Math.round((weekCount / requiredDays) * 100);
    
    document.getElementById('ind-weekly-count').textContent = weekCount;
    document.getElementById('ind-weekly-percent').textContent = `${percent > 100 ? 100 : percent}%`;
}

async function renderUserChart(userId) {
    const allEvidences = await getAll(STORES.EVIDENCES);
    const userEvidences = allEvidences.filter(e => e.userId === userId);
    
    const now = new Date();
    // Obtener la fecha de inicio de semana (Lunes)
    const dayOfWeek = (now.getDay() + 6) % 7; 
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);

    const labels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const data = [0, 0, 0, 0, 0, 0, 0];
    
    // Mapear evidencias de la semana
    userEvidences.forEach(e => {
        const evidenceDate = new Date(e.fecha);
        const day = (evidenceDate.getDay() + 6) % 7; // 0=L, 1=M, ... 6=D
        
        if (evidenceDate >= startOfWeek) {
            if (e.entrada && e.salida) {
                data[day] = 1; // Cumplido
            } else if(e.entrada || e.salida) {
                data[day] = 0.5; // Parcial
            }
        }
    });

    const ctx = document.getElementById('userChart').getContext('2d');
    
    // Asume que Chart.js está disponible globalmente
    if (userChartInstance) {
        userChartInstance.destroy();
    }

    userChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Asistencia Completa',
                data: data,
                backgroundColor: data.map(val => val === 1 ? 'rgba(59, 130, 246, 0.8)' : val === 0.5 ? 'rgba(251, 191, 36, 0.8)' : 'rgba(203, 213, 225, 0.8)'),
                borderColor: data.map(val => val === 1 ? 'rgba(59, 130, 246, 1)' : val === 0.5 ? 'rgba(251, 191, 36, 1)' : 'rgba(148, 163, 184, 1)'),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 1.1,
                    ticks: {
                        callback: (value) => value === 1 ? 'Completo' : value === 0.5 ? 'Parcial' : ''
                    }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderUserHistory(userId) {
    getAll(STORES.EVIDENCES)
        .then(allEvidences => {
            const userEvidences = allEvidences
                .filter(e => e.userId === userId)
                .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); // Orden descendente

            const list = document.getElementById('user-history-list');
            
            if (userEvidences.length === 0) {
                 list.innerHTML = `<p class="p-4 text-center text-slate-400 text-sm">No hay registros de asistencia para este usuario.</p>`;
                 return;
            }
            
            list.innerHTML = userEvidences.map(e => {
                const isComplete = e.entrada && e.salida;
                const statusIcon = isComplete 
                    ? '<i data-lucide="check-circle" class="w-4 h-4 text-green-500"></i>' 
                    : '<i data-lucide="minus-circle" class="w-4 h-4 text-red-500"></i>';
                const statusText = isComplete ? 'Completa' : 'Incompleta';
                
                return `
                    <div class="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div class="flex items-center gap-3">
                            ${statusIcon}
                            <div>
                                <p class="text-sm font-medium text-slate-800">${e.fecha}</p>
                                <p class="text-xs text-slate-500">${statusText}</p>
                            </div>
                        </div>
                        <div class="text-xs text-slate-400">
                             ${e.entrada ? '<i data-lucide="image" class="w-4 h-4 inline mr-1"></i>E' : ''} 
                             ${e.salida ? '<i data-lucide="image" class="w-4 h-4 inline mr-1"></i>S' : ''}
                        </div>
                    </div>
                `;
            }).join('');
            
            // Asegurarse de que los iconos de Lucide se rendericen
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

        })
        .catch(e => {
            console.error("Error al renderizar el historial:", e);
            showToast('Error cargando historial.', true);
        });
}


/* ============================================================
   SINCRONIZACION GIST
   ============================================================ */

const GIST_FILE_NAME = 'gestion_asistencias_full.json';

async function getGistConfig() {
    const gistIdObj = await getByID(STORES.CONFIG, 'gistId');
    const gistTokenObj = await getByID(STORES.CONFIG, 'gistToken');
    
    const gistId = gistIdObj ? gistIdObj.value : '';
    const gistToken = gistTokenObj ? gistTokenObj.value : '';

    // Asegurarse de que los elementos existen antes de asignar
    const idEl = document.getElementById('gist-id');
    const tokenEl = document.getElementById('gist-token');

    if (idEl) idEl.value = gistId;
    if (tokenEl) tokenEl.value = gistToken;

    return { id: gistId, token: gistToken };
}

async function saveGistConfig() {
    const id = document.getElementById('gist-id').value.trim();
    const token = document.getElementById('gist-token').value.trim();

    if (!id || !token) {
        return showToast('ID y Token de Gist son obligatorios.', true);
    }

    try {
        await save(STORES.CONFIG, { key: 'gistId', value: id });
        await save(STORES.CONFIG, { key: 'gistToken', value: token });
        showToast('Configuración de Gist guardada.');
    } catch (e) {
        showToast('Error al guardar la configuración.', true);
    }
}

/**
 * Sincroniza (Descarga) los datos desde el Gist remoto.
 */
async function syncFromGist() {
    const config = await getGistConfig();
    if (!config.id || !config.token) { // Ambas son necesarias para la auth
        return showToast('Configuración de Gist incompleta (Token y ID).', true);
    }

    showToast('Descargando datos desde Gist...');
    
    try {
        // La URL de un Gist es: https://api.github.com/gists/ID_DEL_GIST
        const response = await fetch(`https://api.github.com/gists/${config.id}`, {
            headers: {
                // Se requiere token para acceder a Gists privados o por seguridad
                'Authorization': `token ${config.token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.files[GIST_FILE_NAME]?.content;

        if (!content) {
             showToast(`El Gist existe, pero no se encontró el archivo ${GIST_FILE_NAME}. Crea el archivo con contenido {}.`, true);
             return;
        }

        const remoteData = JSON.parse(content);
        
        // Sobreescribir las bases de datos locales con los datos remotos
        await replaceAll(STORES.USERS, remoteData.users || []);
        await replaceAll(STORES.EVIDENCES, remoteData.evidences || []);
        
        // Recargar la UI
        renderTeamGrid(await getAll(STORES.USERS));
        
        showToast("Datos descargados y sincronizados correctamente.");

    } catch (e) {
        console.error(e);
        showToast("Error descargando de Gist: " + (e.message || e), true);
    }
}

/**
 * Sincroniza (Subida) los datos locales al Gist remoto.
 */
async function syncToGist() {
    const config = await getGistConfig();
    if (!config.id || !config.token) {
        return showToast('Configuración de Gist incompleta (Token y ID).', true);
    }
    
    showToast('Subiendo datos a Gist...');

    try {
        // 1. Obtener todos los datos locales
        const users = await getAll(STORES.USERS);
        const evidences = await getAll(STORES.EVIDENCES);
        
        const localData = {
            users: users,
            evidences: evidences,
            timestamp: Date.now()
        };

        const jsonContent = JSON.stringify(localData, null, 2);

        // 2. Preparar el payload de la API de GitHub
        const payload = {
            description: `Backup de Asistencias - ${new Date().toLocaleString()}`,
            files: {
                [GIST_FILE_NAME]: {
                    content: jsonContent
                }
            }
        };

        // 3. Realizar la solicitud PATCH (actualizar)
        const upload = await fetch(`https://api.github.com/gists/${config.id}`, {
            method: 'PATCH', // Usamos PATCH para actualizar el Gist existente
            headers: {
                'Authorization': `token ${config.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!upload.ok) throw new Error(`HTTP ${upload.status}`);

        showToast("Sincronización completada y subida correctamente.");

    } catch (e) {
        console.error(e);
        showToast("Error subiendo a Gist: " + (e.message || e), true);
    }
}

/* ============================================================
   NUEVA FUNCION: LIMPIEZA DE EVIDENCIAS ANTIGUAS
   ============================================================ */

/**
 * Borra todas las evidencias de asistencia con más de 30 días de antigüedad
 * de la IndexedDB local y luego sube la versión limpia a Gist.
 */
async function cleanOldEvidence() {
    if (!confirm("ADVERTENCIA: ¿Estás seguro de que quieres borrar PERMANENTEMENTE todas las asistencias con más de 30 días de antigüedad? Esta acción se sincronizará con Gist.")) {
        return;
    }

    showToast('Iniciando limpieza de historial...');

    try {
        const allEvidences = await getAll(STORES.EVIDENCES);
        const now = Date.now();
        // 30 días en milisegundos
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000; 
        const cutoffTime = now - THIRTY_DAYS_MS;
        
        let deletedCount = 0;
        
        for (const evidence of allEvidences) {
            // Se usa la fecha de la evidencia (e.fecha), que está en YYYY-MM-DD
            const evidenceDate = new Date(evidence.fecha).getTime();

            if (evidenceDate < cutoffTime) {
                await remove(STORES.EVIDENCES, evidence.id);
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            showToast(`${deletedCount} registros antiguos borrados localmente.`);
            // Sincronizar la versión limpia con Gist inmediatamente
            await syncToGist();
            // Recargar la vista si el usuario activo está en historial
            if (activeUserId && !document.getElementById('ind-view-historial').classList.contains('hidden')) {
                renderUserHistory(activeUserId);
            }
            showToast(`Limpieza completada y sincronizada con Gist. Archivos borrados: ${deletedCount}.`);
        } else {
            showToast('No se encontraron registros de más de 30 días para borrar.');
        }


    } catch (e) {
        console.error("Error durante la limpieza del historial:", e);
        showToast('Error crítico al intentar limpiar el historial.', true);
    }
}

/* ============================================================
   REPLACE ALL – necesario para syncFromGist
   ============================================================ */
/**
 * Borra todos los datos de un Object Store y añade un nuevo conjunto de datos.
 * @param {string} storeName - Nombre del Object Store.
 * @param {Array<Object>} dataArray - Array de objetos a insertar.
 * @returns {Promise<void>}
 */
function replaceAll(storeName, dataArray) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);

        const clearReq = store.clear();
        clearReq.onsuccess = () => {
            let i = 0;
            // Función auto-invocada para añadir elementos uno por uno
            (function addNext() {
                if (i >= dataArray.length) { 
                    resolve(); 
                    return; 
                }
                const item = dataArray[i++];
                const addReq = store.add(item);
                addReq.onsuccess = addNext;
                addReq.onerror = e => reject(e.target.error);
            })();
        };
        clearReq.onerror = e => reject(e.target.error);
    });
}

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await openDB();
        
        // Cargar y renderizar todo
        renderTeamGrid(await getAll(STORES.USERS));
        await getGistConfig(); // Cargar la configuración de Gist

        // Asegurarse de que los iconos iniciales se muestren
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

    } catch (e) {
        console.error("Error al inicializar la aplicación:", e);
    }
});

/* ===========================
   SERVICE WORKER registro
   =========================== */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(()=> console.log('SW registrado')).catch(e => console.warn('SW error', e));
}
