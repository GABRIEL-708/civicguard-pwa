# Especificación Técnica del Módulo Operativo Offline y Acceso a Hardware
## Proyecto Integrador 2: CivicGuard PWA
### Persistencia Asíncrona, Captura de Sensores Físicos y Protocolo de Background Sync

---

## 1. Introducción y Fundamentos del Entorno Hostil

En operaciones de emergencia urbana e inspección de infraestructura pública, la disponibilidad de red no puede asumirse como una constante. Por el contrario, la red debe considerarse un **recurso volátil y hostil**.

El objetivo de este módulo es dotar a **CivicGuard PWA** de autonomía operativa absoluta: la aplicación debe ser capaz de arrancar en frío, permitir el llenado completo de formularios, obtener las coordenadas de posicionamiento global satelital del operador, activar la cámara para capturar evidencia fotográfica, persistir las entidades en disco local y programar su despacho diferido, **todo ello con el dispositivo en Modo Avión estricto**.

---

## 2. Dualidad de Almacenamiento Local Asíncrono

Para cumplir con la prohibición explícita de APIs bloqueantes y optimizar la cuota de almacenamiento, se implementó una **estrategia de persistencia dual**:

```
                              +---------------------------------------+
                              |          CivicGuard Storage           |
                              +---------------------------------------+
                                           │              │
                   ┌───────────────────────┘              └──────────────────────┐
                   ▼                                                             ▼
     [ Cache API (Asíncrona) ]                                    [ IndexedDB (NoSQL Transaccional) ]
   • Objeto: Assets inmutables del Shell                         • Objeto: Estado mutable de negocio
   • Contenido:                                                  • Contenido:
     - index.html, CSS, JS bundles                                 - Store: `incidencias` (Reportes JSON)
     - Iconos vectoriales y SVG                                    - Store: `evidencias` (Fotos Blob/Base64)
     - Fuentes tipográficas y manifiesto                           - Store: `sync_queue` (Transacciones en espera)
   • Capacidad: Controlada por cuota de origen                   • Capacidad: Cientos de megabytes (>50% de disco libre)
```

### 2.1. ¿Por qué está estrictamente prohibido `localStorage`?
1. **Naturaleza Síncrona y Bloqueante**: `localStorage` se ejecuta directamente en el UI Thread (hilo principal). Al serializar o leer imágenes fotográficas en Base64 (típicamente de 1 a 4 MB), el hilo principal se congela por cientos de milisegundos, provocando caídas severas de cuadros (jank) y violando las métricas de *Interaction to Next Paint* (INP) de Google Lighthouse.
2. **Límite Ridículo de Capacidad**: Tiene un límite duro de 5 MB por origen, insuficiente para un sistema de reportes cívicos con evidencias visuales.
3. **Inaccesibilidad desde Workers**: `localStorage` no existe dentro del contexto de ejecución de un Service Worker (`sw.js`). Por tanto, una sincronización en segundo plano con Background Sync no podría leer datos desde `localStorage`.
4. **IndexedDB como Solución Óptima**: Es un motor NoSQL transaccional, indexado, completamente asíncrono y accesible de forma compartida tanto por la ventana de la aplicación como por el Service Worker.

---

## 3. Modelo de Datos y Esquema de IndexedDB

La base de datos se denomina `CivicGuardDB` (versión 1). Se definen los siguientes almacenes de objetos (*Object Stores*):

```javascript
/**
 * Inicialización de la Base de Datos Transaccional IndexedDB
 * Base: CivicGuardDB | Versión: 1
 */
function inicializarIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CivicGuardDB', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store para los reportes de emergencias
      if (!db.objectStoreNames.contains('reportes')) {
        const storeReportes = db.createObjectStore('reportes', { keyPath: 'id' });
        storeReportes.createIndex('categoria', 'categoria', { unique: false });
        storeReportes.createIndex('estatus', 'estatus', { unique: false });
        storeReportes.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Store para la cola de sincronización diferida
      if (!db.objectStoreNames.contains('cola_sincronizacion')) {
        const storeSync = db.createObjectStore('cola_sincronizacion', { keyPath: 'syncId', autoIncrement: true });
        storeSync.createIndex('intentos', 'intentos', { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}
```

### 3.1. Estructura de la Entidad Reporte (`ReporteIncidencia`)

```typescript
interface ReporteIncidencia {
  id: string;               // UUID v4 único generado en el cliente
  titulo: string;           // Breve descripción del incidente
  categoria: string;        // 'bacheo' | 'luminarias' | 'fuga_agua' | 'arbol_caido' | 'otro'
  descripcion: string;      // Detalle operativo capturado
  severidad: string;        // 'baja' | 'media' | 'alta' | 'critica'
  coordenadas: {
    latitud: number;        // Latitud decimal obtenida por GNSS
    longitud: number;       // Longitud decimal
    precision: number;      // Margen de error en metros
    altitud: number | null; // Altitud si está disponible
  };
  evidenciaFotografica: {
    dataUrl: string;        // Imagen comprimida en Base64 / WebP
    timestamp: number;      // Momento de captura
    tamanioBytes: number;   // Peso de la fotografía en disco
  };
  estatus: 'local_retenido' | 'sincronizando' | 'despachado' | 'resuelto';
  creadoEn: string;         // ISO 8601
  sincronizadoEn: string | null;
}
```

---

## 4. Acceso a Hardware Físico Móvil

### 4.1. Módulo de Geolocalización Satelital (W3C Geolocation API)
El personal de campo necesita georreferenciar la incidencia con exactitud métrica. Se configura el sensor con `enableHighAccuracy: true` para activar el módem GPS del teléfono en vez de depender de la triangulación IP:

```javascript
/**
 * Captura de Coordenadas Satelitales de Alta Precisión
 */
export function capturarUbicacionOperador() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      return reject(new Error('La API de Geolocalización no está soportada en este dispositivo.'));
    }

    const opciones = {
      enableHighAccuracy: true, // Fuerza el uso del chip GPS físico
      timeout: 15000,          // Tiempo máximo de espera: 15 segundos
      maximumAge: 0            // No aceptar lecturas obsoletas en caché del sensor
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
          precision: pos.coords.accuracy, // en metros
          timestamp: pos.timestamp
        });
      },
      (error) => {
        let mensaje = 'Error al obtener geolocalización: ';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            mensaje += 'El operador denegó el permiso de ubicación.';
            break;
          case error.POSITION_UNAVAILABLE:
            mensaje += 'Señal satelital no disponible (sin visión de cielo abierto).';
            break;
          case error.TIMEOUT:
            mensaje += 'Tiempo de espera agotado al consultar el sensor GNSS.';
            break;
        }
        reject(new Error(mensaje));
      },
      opciones
    );
  });
}
```

### 4.2. Módulo de Captura Fotográfica y Compresión (MediaDevices & Canvas API)
Para capturar la evidencia visual sin agotar el espacio en IndexedDB, el sistema accede a la cámara del dispositivo y comprime la toma a un lienzo `HTMLCanvasElement` antes de la persistencia:

```javascript
/**
 * Compresión de imagen a formato ligero WebP/JPEG
 */
export async function procesarEvidenciaFotografica(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_WIDTH = 1280;
        const scaleSize = MAX_WIDTH / img.width;
        const canvas = document.createElement('canvas');
        canvas.width = (img.width > MAX_WIDTH) ? MAX_WIDTH : img.width;
        canvas.height = (img.width > MAX_WIDTH) ? (img.height * scaleSize) : img.height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Exporta en WebP al 80% de calidad para optimización de almacenamiento
        const dataUrl = canvas.toDataURL('image/webp', 0.8);
        resolve({
          dataUrl,
          tamanioBytes: Math.round((dataUrl.length * 3) / 4)
        });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

---

## 5. Algoritmo de Sincronización en Segundo Plano (Background Sync API)

Cuando el operador presiona "Guardar Reporte" en Modo Avión:
1. El registro se almacena en la tabla `reportes` de **IndexedDB** con estatus `local_retenido`.
2. Se inserta un apunte en `cola_sincronizacion`.
3. Se solicita un registro de sincronización al Service Worker mediante `SyncManager`:
   ```javascript
   if ('serviceWorker' in navigator && 'SyncManager' in window) {
     const registration = await navigator.serviceWorker.ready;
     await registration.sync.register('sync-civic-reports');
     console.log('[CivicGuard] Evento de Background Sync programado exitosamente.');
   }
   ```
4. En cuanto el sistema operativo detecta que el dispositivo salió de Modo Avión y tiene acceso a internet, el navegador emite el evento `sync` dentro de `sw.js`:
   ```javascript
   self.addEventListener('sync', (event) => {
     if (event.tag === 'sync-civic-reports') {
       console.log('[SW CivicGuard] Red restablecida: ejecutando Background Sync...');
       event.waitUntil(despacharReportesEncolados());
     }
   });
   ```
5. Si el servidor responde exitosamente (HTTP 200/201), el estatus del reporte cambia a `despachado` y se emite una notificación local de confirmación.

---

## 6. Protocolo de Demostración y Validación en Modo Avión

Para cumplir con el entregable técnico de la Semana 3, se ejecutará el siguiente estudio de caso:

| Paso | Acción Operativa | Resultado Esperado | Validación |
| :---: | :--- | :--- | :--- |
| **1** | Activar **Modo Avión** en el teléfono móvil o marcar **Offline** en DevTools. | Conectividad celular y Wi-Fi deshabilitadas al 100%. | El banner de estado de red del Application Shell cambia a rojo: `📡 Modo Desconectado (Offline)`. |
| **2** | Abrir la aplicación CivicGuard desde el icono en la pantalla de inicio. | El Application Shell carga en menos de 500 ms desde Cache API. | Pantalla de inicio visible sin dinosaurio de error. |
| **3** | Diligenciar formulario de reporte (Bache crítico en Av. Tecnológico). | El usuario ingresa texto sin latencia. | UI fluida sin bloqueos. |
| **4** | Presionar "Obtener Ubicación Actual". | El sensor GPS entrega latitud y longitud. | Coordenadas impresas en pantalla con precisión métrica. |
| **5** | Tomar fotografía de la incidencia con la cámara. | La cámara se activa, captura y comprime a WebP. | Fotografía visible en miniatura. |
| **6** | Presionar "Registrar Reporte". | La transacción asíncrona se confirma en IndexedDB. | Reporte aparece en la lista local con insignia `Pendiente de Sincronización`. |
| **7** | Desactivar el Modo Avión (Restaurar Wi-Fi/4G). | El evento `sync` se dispara automáticamente en el Service Worker. | Los reportes pendientes se sincronizan en silencio y pasan a estatus `Sincronizado`. |
