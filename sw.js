/**
 * Service Worker Principal - CivicGuard PWA
 * Ubicación: Raíz (Scope: "/")
 * Universidad Tecnológica Metropolitana (UTM) - Proyecto Integrador 2
 * 
 * Cumplimiento Técnico:
 * - Ciclo de vida: install, activate, self.skipWaiting(), clients.claim()
 * - Persistencia del cascarón: Cache API (inmutable)
 * - Resiliencia de red: Cache-First para Shell y Network-First para API
 * - Hilos de fondo: Background Sync ('sync-civic-reports') y Web Push ('push')
 */

const CACHE_VERSION = 'civicguard-shell-v1.0.0';

// Activos inmutables del Application Shell a pre-cachear durante 'install'
const ASSETS_APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/styles/shell.css',
  '/src/app.js',
  '/src/db/indexed-store.js',
  '/src/hardware/geolocation.js',
  '/src/hardware/camera.js',
  '/src/sync/background-sync.js',
  '/src/notifications/push-service.js',
  '/assets/icons/icon-72.png',
  '/assets/icons/icon-96.png',
  '/assets/icons/icon-128.png',
  '/assets/icons/icon-144.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/maskable-512.png',
  '/assets/icons/badge-72.png'
];

/**
 * 1. EVENTO INSTALL
 * Descarga y almacena en Cache API los activos inmutables del cascarón
 */
self.addEventListener('install', (event) => {
  console.log('[SW CivicGuard] ⚙️ Evento INSTALL iniciado. Cacheando Application Shell...');

  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => {
        console.log('[SW CivicGuard] 📦 Almacenando assets inmutables en:', CACHE_VERSION);
        return cache.addAll(ASSETS_APP_SHELL);
      })
      .then(() => {
        // Control seguro del estado de espera (Semana 2)
        console.log('[SW CivicGuard] ⚡ self.skipWaiting() activado: omitiendo estado de espera.');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW CivicGuard] ❌ Error en pre-cacheo durante install:', err);
      })
  );
});

/**
 * 2. EVENTO ACTIVATE
 * Purga cachés antiguas obsoletas y toma control inmediato de las páginas abiertas
 */
self.addEventListener('activate', (event) => {
  console.log('[SW CivicGuard] 🚀 Evento ACTIVATE iniciado.');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((nombre) => {
            if (nombre !== CACHE_VERSION) {
              console.log('[SW CivicGuard] 🗑️ Purgando versión obsoleta de caché:', nombre);
              return caches.delete(nombre);
            }
          })
        );
      })
      .then(() => {
        // Toma de control inmediata de clientes activos (Semana 2)
        console.log('[SW CivicGuard] 📢 self.clients.claim() reclamando todos los clientes abiertos.');
        return self.clients.claim();
      })
  );
});

/**
 * 3. EVENTO FETCH
 * Intercepción de peticiones de red y estrategia de entrega resiliente
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Peticiones de API dinámica -> Estrategia Network-First con fallback JSON
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          console.log('[SW CivicGuard] 📡 Fallo de red en API. Retornando fallback de contingencia offline.');
          return new Response(JSON.stringify({
            offline: true,
            mensaje: 'Sistema operando en contingencia offline. Los datos se encuentran retenidos en IndexedDB local.'
          }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
          });
        })
    );
    return;
  }

  // Activos estáticos del Application Shell -> Estrategia Cache-First con actualización de fondo
  event.respondWith(
    caches.match(event.request)
      .then((respuestaCache) => {
        if (respuestaCache) {
          // Devuelve de inmediato el activo del cascarón desde la Cache API (latencia < 15ms)
          return respuestaCache;
        }

        // Si no está en caché, solicita a red y guarda en caché
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
            // Fallback para navegación de páginas en modo offline
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

/**
 * 4. EVENTO BACKGROUND SYNC
 * Se ejecuta automáticamente cuando el dispositivo recupera conexión a internet
 */
self.addEventListener('sync', (event) => {
  console.log('[SW CivicGuard] 🔄 Evento SYNC interceptado con etiqueta:', event.tag);

  if (event.tag === 'sync-civic-reports') {
    event.waitUntil(
      despacharColaBackgroundSync()
    );
  }
});

/**
 * Procesa la cola de IndexedDB dentro del worker
 */
async function despacharColaBackgroundSync() {
  console.log('[SW Background Sync] 🌐 Verificando reportes retenidos para despacho...');
  try {
    // Abrir conexión directa a IndexedDB desde el worker
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

    if (items.length === 0) {
      console.log('[SW Background Sync] ✨ No hay reportes pendientes.');
      return;
    }

    console.log(`[SW Background Sync] 🚀 Despachando ${items.length} reporte(s) retenidos...`);

    for (const item of items) {
      try {
        const res = await fetch('/api/reportes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        });

        if (res.ok) {
          // Actualizar en IndexedDB
          const updateTx = db.transaction(['reportes', 'cola_sincronizacion'], 'readwrite');
          const rStore = updateTx.objectStore('reportes');
          const sStore = updateTx.objectStore('cola_sincronizacion');

          const rReq = rStore.get(item.idReporte);
          rReq.onsuccess = () => {
            const rep = rReq.result;
            if (rep) {
              rep.estatus = 'despachado';
              rep.sincronizadoEn = new Date().toISOString();
              rStore.put(rep);
            }
          };
          sStore.delete(item.idReporte);
        }
      } catch (e) {
        console.warn('[SW Background Sync] Falló envío diferido de:', item.idReporte);
      }
    }

    // Notificar al usuario mediante alerta nativa del sistema
    self.registration.showNotification('CivicGuard: Sincronización Completada', {
      body: `Se han despachado exitosamente ${items.length} reporte(s) capturados en modo offline.`,
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/badge-72.png',
      tag: 'sync-completado'
    });

  } catch (err) {
    console.error('[SW Background Sync] Error al procesar cola:', err);
  }
}

/**
 * 5. EVENTO PUSH
 * Recepción de notificaciones nativas enviadas por el centro de mando
 */
self.addEventListener('push', (event) => {
  console.log('[SW CivicGuard] 📲 Notificación Push recibida.');

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
    data: { url: datos.url },
    actions: [
      { action: 'abrir', title: 'Ver Incidencia' },
      { action: 'cerrar', title: 'Cerrar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(datos.titulo, opciones)
  );
});

/**
 * 6. EVENTO NOTIFICATION CLICK
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'cerrar') return;

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
