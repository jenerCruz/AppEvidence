const CACHE_NAME = 'asistencias-v2';

// Solo incluimos archivos locales en la lista de precaché (addAll).
// Los CDNs se manejarán por la estrategia de caché en el evento 'fetch'.
const ASSETS_TO_PRECACHE = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

// Evento de Instalación: Pre-cache de archivos locales
self.addEventListener('install', (e) => {
  console.log('[SW] Instalando y precacheando recursos locales...');
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Ejecutamos addAll SOLO con los archivos locales, 
        // ya que los CDNs pueden ser inestables para este proceso.
        return cache.addAll(ASSETS_TO_PRECACHE);
      })
      .catch((error) => {
        // En caso de error, lo reportamos, pero el Service Worker intentará activarse.
        console.error('[SW] Error al cachear ASSETS locales:', error);
      })
  );
});

// Evento de Activación: Limpia cachés antiguas
self.addEventListener('activate', (event) => {
  console.log('[SW] Activado. Limpiando cachés antiguas...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[SW] Eliminando caché antigua:', key);
          return caches.delete(key);
        }
      }));
    })
  );
});

// Evento de Fetch: Estrategia Cache-First (para locales) o Network-First (para CDNs)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request)
      .then((response) => {
        // 1. Si está en caché (incluidos los recursos locales y algunos CDNs guardados previamente), lo devolvemos
        if (response) {
          return response;
        }

        // 2. Si no está en caché, vamos a la red
        return fetch(e.request).then((networkResponse) => {
          // Si es una petición a un recurso de CDN (que no precacheamos), podemos guardarlo para futuras peticiones.
          const isExternalCDN = e.request.url.startsWith('https://cdn.') || e.request.url.startsWith('https://unpkg.com');

          // Si el recurso es externo y la respuesta es válida (status 200)
          if (isExternalCDN && networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseToCache);
            });
          }

          // Devolvemos la respuesta de la red
          return networkResponse;
        });
      })
      .catch(() => {
        // En caso de fallo de red, podemos devolver una página offline si existiera.
        // Aquí no devolveremos nada especial, solo reportamos el error.
        console.warn('[SW] Fallo de red para:', e.request.url);
      })
  );
});