# Mapeo del Ciclo de Vida del Service Worker y Estrategias de Renderizado
## Proyecto Integrador 2: CivicGuard PWA
### Documento Técnico de Arquitectura del Hilo de Fondo (`sw.js`)

---

## 1. Introducción y Ámbito de Control (Scope)

Un Service Worker es un worker programable basado en eventos que se ejecuta en un hilo de fondo completamente independiente del hilo principal de renderizado (UI Thread) del navegador. No posee acceso directo al DOM, pero actúa como un **proxy de red programable** situado entre la aplicación web, el hardware del dispositivo y la red externa.

Para garantizar el control global de todas las rutas y solicitudes de la aplicación, el script del Service Worker se inyecta estrictamente en la raíz del proyecto (`/sw.js`). Esto le otorga un **Scope (ámbito)** de nivel raíz (`/`), permitiéndole interceptar cualquier petición generada por el Application Shell y sus submódulos.

```
Raíz del Servidor Web (/)
├── index.html                (Punto de entrada de la UI)
├── manifest.json             (Metadatos de la PWA)
├── sw.js                     (Scope: "/" - Control total de la red)
├── src/                      (Lógica del cliente y UI)
└── assets/                   (Imágenes, iconos, estilos)
```

---

## 2. Diagrama de Estados del Ciclo de Vida

El ciclo de vida de un Service Worker está diseñado para asegurar que una nueva versión de la aplicación no corrompa el estado ni las transacciones en curso de las instancias activas.

```
       +-----------------------+
       |   Navegador Web       |
       |  Registra: sw.js      |
       +-----------------------+
                   │
                   ▼
       +-----------------------+
       |       PARSING         |
       |  Descarga y análisis  |
       +-----------------------+
                   │
                   ▼
       +-----------------------+
       |      INSTALLING       |
       |  Evento: 'install'    | ──> Pre-caché del App Shell (Cache API)
       +-----------------------+
                   │
                   ├──> ¿Falló el caché? ──> [ ERROR / REDUNDANT ]
                   │
                   ▼
       +-----------------------+
       |       INSTALLED       |
       |     (Waiting)         | ──> self.skipWaiting() fuerza paso inmediato
       +-----------------------+
                   │
                   ▼
       +-----------------------+
       |      ACTIVATING       |
       |  Evento: 'activate'   | ──> Purga de cachés antiguas obsoletas
       +-----------------------+
                   │
                   ▼
       +-----------------------+
       |       ACTIVATED       |
       |  self.clients.claim() | ──> Toma control inmediato de clientes abiertos
       +-----------------------+
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
+───────────────+     +───────────────+
| Evento: FETCH |     | Evento: SYNC  |
| Intercepta    |     | Background    |
| tráfico web   |     | Sync offline  |
+───────────────+     +───────────────+
        │                     │
        └──────────┬──────────┘
                   ▼
       +-----------------------+
       |      REDUNDANT        |
       |  Sustituido por una   |
       |     nueva versión     |
       +-----------------------+
```

---

## 3. Escuchadores de Eventos Asíncronos Obligatorios

A continuación se detalla la implementación quirúrgica de los eventos fundamentales en `sw.js`:

### 3.1. Fase de Instalación (`install`) y Pre-cacheo Inmutable
El evento `install` se dispara únicamente cuando el navegador detecta una nueva versión byte a byte del archivo `sw.js`. Durante esta fase, el worker descarga y almacena en la **Cache API** los activos inmutables del cascarón (Application Shell).

```javascript
const CACHE_NAME = 'civicguard-shell-v1.0.0';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/styles/shell.css',
  '/src/app.js',
  '/src/db/indexed-store.js',
  '/src/hardware/camera.js',
  '/src/hardware/geolocation.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  console.log('[SW CivicGuard] Evento INSTALL detectado. Pre-cacheando App Shell...');
  
  // event.waitUntil asegura que el Service Worker no pase a 'installed' hasta que el caché esté listo
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW CivicGuard] Guardando assets inmutables en Cache API:', CACHE_NAME);
      return cache.addAll(SHELL_ASSETS);
    }).then(() => {
      // Control seguro del estado de espera: fuerza al nuevo SW a no esperar a que se cierren pestañas
      console.log('[SW CivicGuard] Forzando activación inmediata con self.skipWaiting()');
      return self.skipWaiting();
    })
  );
});
```

* **`event.waitUntil()`**: Extiende la vida del evento asíncrono hasta que la promesa retorne exitosa. Si algún archivo falla en descargarse, la instalación falla y la versión anterior continúa activa.
* **`self.skipWaiting()`**: Evita que el worker quede en estado `waiting` cuando existen pestañas viejas abiertas. Esto garantiza que las correcciones críticas en emergencias urbanas se apliquen de inmediato.

---

### 3.2. Fase de Activación (`activate`) y Purga de Cachés Obsoletas
El evento `activate` se produce una vez que el worker anterior fue dado de baja o desplazado por `skipWaiting()`. Este momento es idóneo para depurar cachés antiguas y migrar esquemas de almacenamiento para no saturar la cuota de disco del usuario.

```javascript
self.addEventListener('activate', (event) => {
  console.log('[SW CivicGuard] Evento ACTIVATE detectado. Purgando versiones antiguas...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((existingCache) => {
          // Si el nombre de la caché no coincide con la versión activa, se destruye
          if (existingCache !== CACHE_NAME) {
            console.log('[SW CivicGuard] Purgando caché obsoleta:', existingCache);
            return caches.delete(existingCache);
          }
        })
      );
    }).then(() => {
      // self.clients.claim() hace que el SW tome control inmediato de todas las páginas abiertas
      console.log('[SW CivicGuard] Reclamando clientes activos con self.clients.claim()');
      return self.clients.claim();
    })
  );
});
```

* **`caches.delete()`**: Elimina físicamente los almacenes de caché viejos, liberando almacenamiento en dispositivos de recursos limitados.
* **`self.clients.claim()`**: Asume el control de todas las pestañas abiertas bajo el scope sin obligar a que el usuario refresque manualmente.

---

### 3.3. Intercepción y Resiliencia de Red (`fetch`)
El evento `fetch` intercepta todas las peticiones salientes (imágenes, CSS, scripts, datos de red). Se implementa una **estrategia de red resiliente dual**:

1. **Cache-First (Cascarón inmutable)**: Para los archivos del Application Shell. Si está en caché, se entrega en <10 ms; de lo contrario, se busca en red y se almacena.
2. **Network-First con Fallback Local (Datos y Reportes)**: Para peticiones dinámicas de API. Se intenta la red primero; si no hay conectividad (Modo Avión), se devuelve una respuesta de contingencia o se recuperan datos de IndexedDB.

```javascript
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Si es un recurso estático del shell (mismo origen)
  if (SHELL_ASSETS.includes(requestUrl.pathname) || event.request.destination === 'style' || event.request.destination === 'script') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse; // Cache-First
        }
        return fetch(event.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Estrategia Network-First con fallback para endpoints de datos
  event.respondWith(
    fetch(event.request).catch(() => {
      console.warn('[SW CivicGuard] Fallo de red detectado (Modo Offline activo) para:', event.request.url);
      return caches.match(event.request).then((fallback) => {
        if (fallback) return fallback;
        return new Response(JSON.stringify({
          offline: true,
          message: 'Sistema operando en contingencia offline. Los datos residen en IndexedDB.'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        });
      });
    })
  );
});
```

---

## 4. Estrategia de Renderizado Mixto (Hybrid Rendering)

Para cumplir con el estándar empresarial de alto rendimiento y accesibilidad:
* **Placeholders Estructurales Inyectados (Inyección Estática del Shell)**: El archivo `index.html` contiene el esqueleto inmutable (Cabecera cívica con indicador de red, barra de navegación inferior fija, contenedor de vistas con tarjetas *skeleton* o marcadores de posición en CSS puro). Esto permite que el usuario perciba que la aplicación cargó instantáneamente ($FCP < 0.6s$).
* **Client-Side Rendering (CSR) Reactivo**: Al arrancar los módulos JavaScript, se leen los reportes desde **IndexedDB**, se sustituyen los esqueletos por los datos reales y se activan los controladores de eventos (cámara, geolocalización, sincronización).

```
[ Carga Instantánea del Shell ] ──> Placeholders CSS (Skeletons) visibles en 300 ms
              │
              ▼
[ Lectura Asíncrona de IndexedDB ] ──> Hilo de datos no bloqueante
              │
              ▼
[ Hidratación Client-Side ] ──> Sustitución por reportes reales, interactividad y mapa
```

---

## 5. Visuales Adaptativos: Maskable Icons y Pantallas de Inicio

El manifiesto web (`manifest.json`) se configura con soporte para iconos adaptativos (`maskable`), asegurando que en cualquier dispositivo móvil (pantallas circulares de Samsung OneUI, cuadradas con esquinas redondeadas de Pixel UI, etc.) el icono se renderice sin bordes blancos indeseados ni recortes de marca:

```json
{
  "src": "/assets/icons/maskable-512.png",
  "sizes": "512x512",
  "type": "image/png",
  "purpose": "maskable"
}
```

La combinación del color de tema (`theme_color`), el color de fondo (`background_color`) y los iconos genera de forma automática la **Splash Screen** nativa del sistema operativo al abrirse desde la pantalla de inicio, eliminando la sensación de estar en un navegador web convencional.
