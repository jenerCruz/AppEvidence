const CACHE_NAME = 'asistenciaspro-cache-v3'; // Versión 3 (mantener)
const CDN_CACHE_NAME = 'cdn-cache-v1';

// Recursos locales a precachear (mantenemos la lista)
const ASSETS_TO_PRECACHE = [
  './', 
  './index.html',
  './assets/js/app.js', 
  './manifest.json',
  './assets/icons/icon-192x192.png' 
];

// Evento de Instalación: Pre-cache de archivos locales (sin cambios)
self.addEventListener('install', (e) => {
  console.log('[SW] Instalando y precacheando recursos locales...');
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_PRECACHE);
      })
      .catch((error) => {
        console.error('[SW] Error al cachear ASSETS locales:', error);
      })
  );
});

// Evento de Activación: Limpia cachés antiguas (sin cambios)
self.addEventListener('activate', (e) => {
  console.log('[SW] Activado. Limpiando cachés antiguas...');
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME && key !== CDN_CACHE_NAME) {
          console.log('[SW] Eliminando caché antigua:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// Evento de Fetch: Lógica corregida para evitar el error 'Response body is already used'
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // 1. Estrategia para CDNs (Cache First)
  if (url.origin === 'https://cdn.jsdelivr.net' || 
      url.origin === 'https://unpkg.com' ||
      url.origin === 'https://cdn.tailwindcss.com') {
    
    // Excluimos la API de GitHub de la caché del Service Worker para no interferir con la sincronización
    if (url.origin.includes('github.com')) {
        return; 
    }

    e.respondWith(
      caches.open(CDN_CACHE_NAME).then((cache) => {
        return cache.match(e.request).then((response) => {
          if (response) {
            return response; // Usar caché si está disponible
          }

          // Si no está, ir a la red
          return fetch(e.request).then((networkResponse) => {
            // CLONAMOS la respuesta antes de guardarla para poder devolver la original.
            const responseToCache = networkResponse.clone(); 
            
            if (networkResponse.status === 200) {
              cache.put(e.request, responseToCache);
            }
            return networkResponse; // Devolvemos la respuesta original al cliente
          }).catch(() => {
            return new Response('Error: CDN resource not found in cache and network failed.', {status: 503});
          });
        });
      })
    );
    return;
  }
  
  // 2. Estrategia para recursos locales (Network Falling Back to Cache)
  e.respondWith(
    // Primero, vamos a la red
    fetch(e.request).then((networkResponse) => {
      // Si tiene éxito, CLONAMOS, actualizamos el caché, y devolvemos la original.
      const responseToCache = networkResponse.clone(); 
      
      if (networkResponse.ok) { // Usamos .ok para 200-299
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        }).catch(e => console.error("[SW] Error al guardar en caché local:", e));
      }
      return networkResponse; // Devolvemos la respuesta original de la red

    }).catch(async () => {
      // Si la red falla, buscamos en el caché.
      const cachedResponse = await caches.match(e.request);
      if (cachedResponse) {
          return cachedResponse;
      }
      // Si no hay caché ni red, devuelve un error 
      return new Response('Error: Recurso no encontrado en caché ni en red.', {status: 404});
    })
  );
});