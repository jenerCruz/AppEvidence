const CACHE_NAME = 'asistencias-v2';

// Solo incluimos archivos locales en la lista de precaché (addAll).
// Los CDNs se manejarán por la estrategia de caché en el evento 'fetch'.
const ASSETS_TO_PRECACHE = [
  './',
  './index.html',
  './assets/js/app.js', // ⬅️ ¡RUTA CORREGIDA!
  './manifest.json'
];

// Evento de Instalación: Pre-cache de archivos locales
self.addEventListener('install', (e) => {
  console.log('[SW] Instalando y precacheando recursos locales...');
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Ejecutamos addAll SOLO con los archivos locales.
        return cache.addAll(ASSETS_TO_PRECACHE);
      })
      .catch((error) => {
        // En caso de error, lo reportamos, pero el Service Worker intentará activarse.
        console.error('[SW] Error al cachear ASSETS locales:', error);
      })
  );
});

// ... (Resto del código del Service Worker: activate y fetch)
