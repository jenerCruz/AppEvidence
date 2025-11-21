const CACHE_NAME = 'gestion-asistencias-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  // Librerías externas (CDN) para funcionamiento offline
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/lucide@latest'
];

// 1. Instalación: Guardamos los recursos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      // Usamos addAll con manejo de errores para evitar que falle todo si un CDN falla
      return Promise.all(
        ASSETS_TO_CACHE.map(url => {
            return cache.add(url).catch(err => console.warn('[SW] Falló carga de:', url, err));
        })
      );
    })
  );
  self.skipWaiting();
});

// 2. Activación: Limpieza de cachés viejas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Borrando cache antigua:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. Fetch: Estrategia "Cache First, falling back to Network"
// Intentamos servir desde caché, si no está, vamos a internet.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Si está en caché, lo devolvemos
      if (response) {
        return response;
      }
      // Si no, hacemos la petición a red
      return fetch(event.request).then((networkResponse) => {
        // Opcional: Podríamos cachear dinámicamente aquí nuevas peticiones
        return networkResponse;
      });
    })
  );
});