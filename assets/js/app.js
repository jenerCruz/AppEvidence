/* =========================================
   IMPORTANTE: ESTE ARCHIVO NO DEBE LLEVAR ETIQUETAS <script>
   SOLO CÓDIGO JAVASCRIPT PURO
   ========================================= */

/* --- CONFIGURACIÓN Y VARIABLES GLOBALES --- */
const DB_NAME = 'GestionAsistenciasDB';
const STORES = { USERS: 'users', EVIDENCES: 'evidences', CONFIG: 'config' };
let db;
let currentUser = null;
let currentEvidences = { entrada: null, salida: null };
let userChartInstance = null;

/* --- INICIALIZACIÓN --- */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicializar Iconos (Lucide)
    if (window.lucide) window.lucide.createIcons();

    // 2. Configurar input de fecha
    const dateInput = document.getElementById('evidence-date');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
        dateInput.addEventListener('change', loadUserDailyEvidence);
    }

    // 3. Inicializar Base de Datos y Cargar Interfaz
    try {
        await initDB();
        await loadTeamGrid(); // Carga la cuadrícula inicial
        await loadGistConfig();
        console.log('Sistema iniciado correctamente');
    } catch (error) {
        console.error("Error crítico al iniciar:", error);
        if(window.showToast) window.showToast("Error al iniciar base de datos", "error");
    }

    // 4. Registrar Service Worker (PWA)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado:', reg.scope))
            .catch(err => console.warn('Error SW:', err));
    }
});

/* --- FUNCIONES GLOBALES (Disponibles para el HTML) --- */

window.showTab = function(tab) {
    // Ocultar todas las vistas
    ['team', 'individual', 'settings'].forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if(el) el.classList.add('hidden');
    });
    // Desactivar botones
    ['team', 'individual', 'settings'].forEach(n => {
        const btn = document.getElementById(`nav-${n}`);
        if(btn) btn.classList.remove('active', 'bg-blue-50', 'text-blue-600');
    });
    
    // Mostrar seleccionada
    const view = document.getElementById(`view-${tab}`);
    if(view) view.classList.remove('hidden');
    
    const navBtn = document.getElementById(`nav-${tab}`);
    if(navBtn) navBtn.classList.add('active', 'bg-blue-50', 'text-blue-600');

    // Lógica específica por pestaña
    if(tab === 'team') {
        const navInd = document.getElementById('nav-individual');
        if(navInd) navInd.classList.add('hidden');
        loadTeamGrid();
        currentUser = null;
    }
    if(tab === 'settings') loadGistConfig();
};

window.switchIndTab = function(subtab) {
    document.getElementById('ind-view-evidencia').classList.add('hidden');
    document.getElementById('ind-view-historial').classList.add('hidden');
    
    // Reset estilos botones
    document.getElementById('subtab-evidencia').className = "flex-1 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 border-b-2 border-transparent";
    document.getElementById('subtab-historial').className = "flex-1 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 border-b-2 border-transparent";

    // Activar actual
    document.getElementById(`ind-view-${subtab}`).classList.remove('hidden');
    document.getElementById(`subtab-${subtab}`).className = "flex-1 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 bg-blue-50";
    
    if(subtab === 'historial') renderUserChart();
};

window.showToast = function(msg, type='info') {
    const t = document.getElementById('toast');
    const msgEl = document.getElementById('toast-msg');
    if(!t || !msgEl) return;

    msgEl.innerText = msg;
    t.classList.remove('opacity-0', 'translate-y-10');
    
    if (type === 'error') t.classList.add('bg-red-600');
    else t.classList.remove('bg-red-600');

    setTimeout(() => {
        t.classList.add('opacity-0', 'translate-y-10');
    }, 3000);
};

window.openUserModal = function(userId = null) {
    const modal = document.getElementById('user-modal');
    const content = document.getElementById('user-modal-content');
    const title = document.getElementById('modal-title');
    const btnDel = document.getElementById('btn-delete-user');
    
    // Resetear formulario
    document.getElementById('input-name').value = '';
    document.getElementById('input-branch').value = '';
    document.getElementById('input-active').checked = true;
    document.getElementById('edit-user-id').value = '';

    if (userId) {
        title.innerText = "Editar Promotor";
        btnDel.classList.remove('hidden');
        dbGet(STORES.USERS, userId).then(u => {
            if(u) {
                document.getElementById('input-name').value = u.name;
                document.getElementById('input-branch').value = u.branch;
                document.getElementById('input-active').checked = u.active;
                document.getElementById('edit-user-id').value = u.id;
            }
        });
    } else {
        title.innerText = "Nuevo Promotor";
        btnDel.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
};

window.closeUserModal = function() {
    const modal = document.getElementById('user-modal');
    const content = document.getElementById('user-modal-content');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
};

/* --- BASE DE DATOS (IndexedDB) --- */
function initDB() {
    return new Promise((resolve, reject) => {
        // Abrimos versión 2 para asegurar que las tiendas existan
        const req = indexedDB.open(DB_NAME, 2);
        
        req.onupgradeneeded = e => {
            db = e.target.result;
            if (!db.objectStoreNames.contains(STORES.USERS)) {
                db.createObjectStore(STORES.USERS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.EVIDENCES)) {
                const es = db.createObjectStore(STORES.EVIDENCES, { keyPath: 'id' });
                es.createIndex('userId', 'userId', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORES.CONFIG)) {
                db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
            }
        };
        
        req.onsuccess = e => {
            db = e.target.result;
            const status = document.getElementById('db-status');
            if(status) {
                status.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-400"></span> Conectado';
                status.classList.replace('text-yellow-300', 'text-green-300');
            }
            resolve(db);
        };
        
        req.onerror = e => reject(e);
    });
}

function dbPut(store, data) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(data).onsuccess = () => resolve();
        tx.onerror = e => reject(e);
    });
}

function dbGet(store, key) {
    return new Promise(resolve => {
        const tx = db.transaction(store, 'readonly');
        tx.objectStore(store).get(key).onsuccess = e => resolve(e.target.result);
        tx.onerror = () => resolve(null);
    });
}

function dbGetAll(store) {
    return new Promise(resolve => {
        const tx = db.transaction(store, 'readonly');
        tx.objectStore(store).getAll().onsuccess = e => resolve(e.target.result || []);
        tx.onerror = () => resolve([]);
    });
}

function dbDelete(store, key) {
    return new Promise((resolve) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key).onsuccess = () => resolve();
    });
}

/* --- LÓGICA DE EQUIPO --- */
window.saveUser = async function() {
    const id = document.getElementById('edit-user-id').value || crypto.randomUUID();
    const name = document.getElementById('input-name').value.trim();
    const branch = document.getElementById('input-branch').value.trim();
    const active = document.getElementById('input-active').checked;

    if(!name) return window.showToast('Nombre es requerido', 'error');

    const user = { id, name, branch, active, updated: Date.now() };
    await dbPut(STORES.USERS, user);
    closeUserModal();
    window.showToast('Promotor guardado');
    loadTeamGrid();
};

window.deleteUser = async function() {
    const id = document.getElementById('edit-user-id').value;
    if(!id) return;
    if(confirm('¿Eliminar este usuario y todo su historial?')) {
        await dbDelete(STORES.USERS, id);
        closeUserModal();
        window.showToast('Promotor eliminado');
        loadTeamGrid();
    }
};

window.loadTeamGrid = async function() {
    const grid = document.getElementById('team-grid');
    if(!grid) return;
    
    grid.innerHTML = '';
    const users = await dbGetAll(STORES.USERS);
    
    if(users.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center p-10 bg-white rounded-xl border border-dashed border-slate-300 text-slate-500">
            <p>No hay promotores.</p>
            <p class="text-sm">Haz clic en "Añadir" para comenzar.</p>
        </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const allEvidences = await dbGetAll(STORES.EVIDENCES);

    users.forEach(u => {
        // Calcular estado del día
        const todayRec = allEvidences.find(e => e.userId === u.id && e.fecha === todayStr);
        let statusBadge = '<span class="bg-slate-100 text-slate-500 text-[10px] px-2 py-1 rounded-full">Sin registro</span>';
        
        if (todayRec) {
            if(todayRec.entrada && todayRec.salida) statusBadge = '<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-full font-bold">Completado</span>';
            else if (todayRec.entrada) statusBadge = '<span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded-full font-bold">Entrada OK</span>';
        }

        const initials = u.name ? u.name.substring(0,2).toUpperCase() : 'UN';
        
        const card = document.createElement('div');
        card.className = "bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-md transition relative group";
        card.innerHTML = `
            <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition z-10">
                <button onclick="event.stopPropagation(); openUserModal('${u.id}')" class="text-slate-400 hover:text-blue-600 p-1 bg-slate-50 rounded shadow-sm border border-slate-200"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
            </div>
            <div class="flex items-center gap-3 cursor-pointer" onclick="selectUser('${u.id}')">
                <div class="w-12 h-12 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 font-bold text-sm border-2 border-white shadow-sm">
                    ${initials}
                </div>
                <div>
                    <h3 class="font-bold text-slate-800 leading-tight">${u.name}</h3>
                    <p class="text-xs text-slate-500 flex items-center gap-1 mb-1">
                        <i data-lucide="map-pin" class="w-3 h-3"></i> ${u.branch}
                    </p>
                    ${u.active ? statusBadge : '<span class="bg-red-100 text-red-600 text-[10px] px-2 py-1 rounded-full">Inactivo</span>'}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
    if (window.lucide) window.lucide.createIcons();
};

window.selectUser = async function(id) {
    const user = await dbGet(STORES.USERS, id);
    if(!user) return;
    
    currentUser = user;
    
    // Rellenar cabecera individual
    const nameEl = document.getElementById('ind-name');
    const branchEl = document.getElementById('ind-branch');
    const initialsEl = document.getElementById('ind-initials');

    if(nameEl) nameEl.innerText = user.name;
    if(branchEl) branchEl.innerText = user.branch;
    if(initialsEl) initialsEl.innerText = user.name.substring(0,2).toUpperCase();
    
    // Mostrar pestaña
    const navInd = document.getElementById('nav-individual');
    if(navInd) navInd.classList.remove('hidden');
    
    window.showTab('individual');
    loadUserStats();
    loadUserDailyEvidence();
};

/* --- EVIDENCIAS --- */
window.loadUserDailyEvidence = async function() {
    if(!currentUser) return;
    const dateStr = document.getElementById('evidence-date').value;
    const key = `${currentUser.id}_${dateStr}`;
    
    const record = await dbGet(STORES.EVIDENCES, key);
    currentEvidences = { entrada: null, salida: null };
    
    if(record) {
        currentEvidences.entrada = record.entrada;
        currentEvidences.salida = record.salida;
    }
    updatePreviews();
};

window.handleFileSelect = function(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Redimensionar para ahorrar espacio
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxDim = 600; // Calidad decente
            let w = img.width, h = img.height;
            if (w > h) { if (w > maxDim) { h *= maxDim/w; w = maxDim; } }
            else { if (h > maxDim) { w *= maxDim/h; h = maxDim; } }
            
            canvas.width = w; canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            
            currentEvidences[type] = canvas.toDataURL('image/jpeg', 0.7);
            updatePreviews();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

function updatePreviews() {
    ['entrada', 'salida'].forEach(type => {
        const div = document.getElementById(`preview-${type}`);
        const src = currentEvidences[type];
        if(!div) return;
        if(src) div.innerHTML = `<img src="${src}" class="w-full h-full object-cover">`;
        else div.innerHTML = `<span class="text-slate-400 text-[10px]">Toca para subir</span>`;
    });
}

window.saveEvidence = async function() {
    if(!currentUser) return;
    const dateStr = document.getElementById('evidence-date').value;
    
    if(!currentEvidences.entrada && !currentEvidences.salida) return window.showToast('Sube al menos una foto', 'error');

    const record = {
        id: `${currentUser.id}_${dateStr}`,
        userId: currentUser.id,
        fecha: dateStr,
        entrada: currentEvidences.entrada,
        salida: currentEvidences.salida,
        timestamp: Date.now()
    };

    await dbPut(STORES.EVIDENCES, record);
    window.showToast('Evidencia Guardada');
    loadUserStats();
};

/* --- ESTADÍSTICAS --- */
window.loadUserStats = async function() {
    if(!currentUser) return;
    
    const all = await dbGetAll(STORES.EVIDENCES);
    const userEvs = all.filter(e => e.userId === currentUser.id);
    
    // Calcular semana actual
    const today = new Date();
    const dayOfWeek = today.getDay() || 7; 
    const monday = new Date(today);
    monday.setHours(0,0,0,0);
    monday.setDate(today.getDate() - dayOfWeek + 1);

    let weeklyCount = 0;
    userEvs.forEach(e => {
        const dObj = new Date(e.fecha + 'T12:00:00');
        if (dObj >= monday && e.entrada && e.salida) weeklyCount++;
    });

    const percent = Math.min(100, Math.round((weeklyCount / 6) * 100));
    const countEl = document.getElementById('ind-weekly-count');
    const perEl = document.getElementById('ind-weekly-percent');
    
    if(countEl) countEl.innerText = weeklyCount;
    if(perEl) perEl.innerText = percent + '%';

    // Historial lista
    const list = document.getElementById('user-history-list');
    if(list) {
        list.innerHTML = '';
        userEvs.sort((a,b) => b.fecha.localeCompare(a.fecha));
        
        if(userEvs.length === 0) list.innerHTML = '<div class="p-4 text-center text-slate-400 text-xs">Sin registros</div>';

        userEvs.slice(0, 10).forEach(ev => {
            const isFull = ev.entrada && ev.salida;
            const div = document.createElement('div');
            div.className = "p-3 flex justify-between items-center text-sm";
            div.innerHTML = `
                <div class="flex gap-3 items-center">
                    <span class="font-mono text-xs text-slate-500">${ev.fecha}</span>
                    <div class="flex gap-1">
                         ${ev.entrada ? '<div class="w-2 h-2 rounded-full bg-blue-500" title="Entrada"></div>' : ''}
                         ${ev.salida ? '<div class="w-2 h-2 rounded-full bg-indigo-500" title="Salida"></div>' : ''}
                    </div>
                </div>
                <span class="${isFull ? 'text-green-600 font-bold' : 'text-orange-500'} text-xs">
                    ${isFull ? 'Completo' : 'Parcial'}
                </span>
            `;
            list.appendChild(div);
        });
    }

    const histTab = document.getElementById('ind-view-historial');
    if(histTab && !histTab.classList.contains('hidden')) {
        renderUserChart();
    }
};

window.renderUserChart = function() {
    const canvas = document.getElementById('userChart');
    if(!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if(userChartInstance) userChartInstance.destroy();
    
    const currentVal = parseInt(document.getElementById('ind-weekly-count').innerText) || 0;
    
    userChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Objetivo', 'Actual'],
            datasets: [{
                label: 'Días',
                data: [6, currentVal],
                backgroundColor: ['#e2e8f0', '#4f46e5'],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, max: 7 } },
            plugins: { legend: { display: false } }
        }
    });
};

/* --- GIST SYNC --- */
window.loadGistConfig = async function() {
    const cfg = await dbGet(STORES.CONFIG, 'gist_credentials');
    if(cfg) {
        const idEl = document.getElementById('gist-id');
        const tokEl = document.getElementById('gist-token');
        if(idEl) idEl.value = cfg.id || '';
        if(tokEl) tokEl.value = cfg.token || '';
    }
};

window.saveGistConfig = async function() {
    const id = document.getElementById('gist-id').value.trim();
    const token = document.getElementById('gist-token').value.trim();
    await dbPut(STORES.CONFIG, { key: 'gist_credentials', id, token });
    window.showToast('Credenciales Gist guardadas');
};

window.syncToGist = async function() {
    const cfg = await dbGet(STORES.CONFIG, 'gist_credentials');
    if(!cfg || !cfg.id || !cfg.token) return window.showToast('Configura Gist primero', 'error');

    window.showToast('Preparando datos...');
    const users = await dbGetAll(STORES.USERS);
    const evidences = await dbGetAll(STORES.EVIDENCES);

    const payload = {
        description: "Backup Asistencias - Gestion Promotores",
        files: {
            "gestion_asistencias_full.json": {
                content: JSON.stringify({ users, evidences, timestamp: Date.now() })
            }
        }
    };

    try {
        const res = await fetch(`https://api.github.com/gists/${cfg.id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${cfg.token}`,
                'Content-Type': 'application/json'
            },
       
