/**
 * Service Worker Principal - CivicGuard PWA
 * Ubicación: Raíz (Scope: "/")
 * Universidad Tecnológica Metropolitana (UTM) - Proyecto Integrador 2
 */

const CACHE_VERSION = 'civicguard-shell-v1.0.2';

const ASSETS_APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/shell.css',
  '/js/app.js',
  '/js/db/indexed-store.js',
  '/js/db/supabase-client.js',
  '/js/hardware/geolocation.js',
  '/js/hardware/camera.js',
  '/js/sync/background-sync.js',
  '/js/notifications/push-service.js',
  '/assets/icons/icon-72.png',
  '/assets/icons/icon-96.png',
  '/assets/icons/icon-128.png',
  '/assets/icons/icon-144.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/maskable-512.png',
  '/assets/icons/badge-72.png'
];

self.addEventListener('install', (event) => {
  console.log('[SW CivicGuard] ⚙️ Evento INSTALL iniciado. Cacheando Application Shell...');

  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => {
        return cache.addAll(ASSETS_APP_SHELL);
      })
      .then(() => {
        return self.skipWaiting();
      })
      .catch((err) => {
        console.warn('[SW CivicGuard] Cache partial warning:', err);
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW CivicGuard] 🚀 Evento ACTIVATE iniciado.');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((nombre) => {
            if (nombre !== CACHE_VERSION) {
              return caches.delete(nombre);
            }
          })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // APIs externas de Supabase o mock local -> Network-First
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request).then((fallback) => {
          if (fallback) return fallback;
          return new Response(JSON.stringify({
            offline: true,
            mensaje: 'Sistema operando en contingencia offline. Datos retenidos en IndexedDB.'
          }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
          });
        });
      })
    );
    return;
  }

  // Activos estáticos del Application Shell -> Cache-First
  event.respondWith(
    caches.match(event.request)
      .then((respuestaCache) => {
        if (respuestaCache) {
          return respuestaCache;
        }

        return fetch(event.request)
          .then((respuestaRed) => {
            if (!respuestaRed || respuestaRed.status !== 200 || respuestaRed.type !== 'basic') {
              return respuestaRed;
            }

            const respuestaParaCache = respuestaRed.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(event.request, respuestaParaCache);
            });

            return respuestaRed;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-civic-reports') {
    event.waitUntil(
      despacharColaBackgroundSync()
    );
  }
});

async function despacharColaBackgroundSync() {
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('CivicGuardDB', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const tx = db.transaction('cola_sincronizacion', 'readonly');
    const store = tx.objectStore('cola_sincronizacion');
    const items = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (items.length === 0) return;

    for (const item of items) {
      try {
        const res = await fetch('https://wjfbcmkgomxoqjtkeaoe.supabase.co/rest/v1/reportes', {
          method: 'POST',
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZmJjbWtnb214b3FqdGtlYW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMTk1OTIsImV4cCI6MjExMDU5NTU5Mn0.LgehF5fvMGQFly0DbKGezDnCI4gZYmod0iiOHRYcTGs',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZmJjbWtnb214b3FqdGtlYW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMTk1OTIsImV4cCI6MjExMDU5NTU5Mn0.LgehF5fvMGQFly0DbKGezDnCI4gZYmod0iiOHRYcTGs',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(item.payload)
        });

        if (res.ok) {
          const updateTx = db.transaction(['reportes', 'cola_sincronizacion'], 'readwrite');
          updateTx.objectStore('cola_sincronizacion').delete(item.idReporte);
        }
      } catch (e) {
        console.warn('[SW Background Sync] Error en reintento diferido:', e);
      }
    }
  } catch (err) {
    console.error('[SW Background Sync] Error:', err);
  }
}

self.addEventListener('push', (event) => {
  let datos = {
    titulo: 'Alerta Cívica Municipal',
    mensaje: 'Se ha registrado una actualización en el estado de una incidencia.',
    url: '/'
  };

  if (event.data) {
    try {
      datos = Object.assign(datos, event.data.json());
    } catch (e) {
      datos.mensaje = event.data.text();
    }
  }

  const opciones = {
    body: datos.mensaje,
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/badge-72.png',
    vibrate: [200, 100, 200],
    data: { url: datos.url }
  };

  event.waitUntil(
    self.registration.showNotification(datos.titulo, opciones)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlDestino = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientes) => {
        for (const cliente of clientes) {
          if (cliente.url.includes(self.location.origin) && 'focus' in cliente) {
            cliente.focus();
            cliente.navigate(urlDestino);
            return;
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlDestino);
        }
      })
  );
});
