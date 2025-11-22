const CACHE_NAME = 'asistenciaspro-cache-v3';
const CDN_CACHE_NAME = 'cdn-cache-v1';

const ASSETS_TO_PRECACHE = [
  './', 
  './index.html',
  './assets/js/app.js', 
  './manifest.json',
  './assets/icons/icon-192x192.png' 
];

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

// Evento de Fetch: Lógica CORREGIDA y más robusta
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Excluir la API de GitHub de la caché del Service Worker para no interferir con la sincronización
  if (url.origin.includes('github.com')) {
    // Si es la API de GitHub, simplemente la dejamos pasar a la red.
    return; 
  }

  // 1. Estrategia para CDNs (Cache First)
  if (url.origin === 'https://cdn.jsdelivr.net' || 
      url.origin === 'https://unpkg.com' ||
      url.origin === 'https://cdn.tailwindcss.com' ||
      url.origin.includes('gstatic.com')) { // Agregamos gstatic por si acaso
    
    e.respondWith(
      caches.open(CDN_CACHE_NAME).then((cache) => {
        return cache.match(e.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse; // Cache Hit: Devolver la versión cacheadada
          }

          // Cache Miss: Ir a la red
          return fetch(e.request).then((networkResponse) => {
            // CLONAMOS la respuesta original antes de que la usemos para cualquier cosa.
            const responseClone = networkResponse.clone(); 
            
            // 1. Guardar el CLON en la caché
            if (networkResponse.ok) { // networkResponse.ok es true para 200-299
              cache.put(e.request, responseClone);
            }
            // 2. Devolver la respuesta ORIGINAL al cliente
            return networkResponse; 
          }).catch((error) => {
            // Error en la red (o fallo de la respuesta original)
            console.error('[SW] Error en fetch de CDN:', error);
            return new Response('Error: CDN resource not found in cache and network failed.', {status: 503});
          });
        });
      })
    );
    return;
  }
  
  // 2. Estrategia para recursos locales (Network Falling Back to Cache)
  e.respondWith(
    fetch(e.request).then((networkResponse) => {
      // Si tiene éxito, CLONAMOS, actualizamos el caché y devolvemos la respuesta original.
      if (networkResponse.ok && e.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseClone);
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