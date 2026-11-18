/**
 * Service Worker Principal - CivicGuard PWA (Robusto y Tolerante a Fallos)
 * Scope: "/" | UTM Proyecto Integrador 2
 */

const CACHE_VERSION = 'civicguard-shell-v1.0.5';

const ASSETS_APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/maskable-512.png'
];

// 1. INSTALL con cacheo resiliente (Promise.allSettled)
self.addEventListener('install', (event) => {
  console.log('[SW CivicGuard] ⚙️ Evento INSTALL iniciado.');

  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      // Usamos Promise.allSettled para que si un asset falla, el Service Worker igual se instale con éxito
      await Promise.allSettled(
        ASSETS_APP_SHELL.map((asset) =>
          fetch(asset)
            .then((res) => {
              if (res.ok) return cache.put(asset, res);
            })
            .catch((err) => console.warn('[SW Cache] Omitido:', asset))
        )
      );
    }).then(() => {
      console.log('[SW CivicGuard] ⚡ Activando inmediatamente con skipWaiting()');
      return self.skipWaiting();
    })
  );
});

// 2. ACTIVATE con toma de control inmediata
self.addEventListener('activate', (event) => {
  console.log('[SW CivicGuard] 🚀 Evento ACTIVATE iniciado.');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_VERSION) {
            console.log('[SW CivicGuard] Purgando caché obsoleta:', k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 3. FETCH
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Si es API externa o de Supabase -> Network First
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request).then((res) => {
          if (res) return res;
          return new Response(JSON.stringify({ offline: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // Si es activo estático -> Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((networkRes) => {
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const clone = networkRes.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, clone));
        }
        return networkRes;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html') || caches.match('/');
        }
      });
    })
  );
});

// 4. NOTIFICACIONES PUSH
self.addEventListener('push', (event) => {
  let data = {
    titulo: 'Alerta Cívica Municipal',
    mensaje: 'Se ha registrado una actualización en el estado de una incidencia.'
  };

  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch (e) {
      data.mensaje = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.titulo, {
      body: data.mensaje,
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/badge-72.png',
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cl) => {
      if (cl.length > 0) {
        cl[0].focus();
      } else {
        clients.openWindow('/');
      }
    })
  );
});
