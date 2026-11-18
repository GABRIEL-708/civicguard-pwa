# Documento de Definición de Proyecto y Justificación Arquitectónica
## Proyecto Integrador 2: CivicGuard PWA
### Sistema de Gestión de Emergencias e Incidencias en Infraestructura Urbana

---

## 1. Ficha Técnica del Proyecto

| Parámetro | Detalle |
| :--- | :--- |
| **Institución** | Universidad Tecnológica Metropolitana (UTM) |
| **Programa Académico** | Ingeniería en Desarrollo y Gestión de Software |
| **Asignatura** | Proyecto Integrador 2 (Cuatrimestre 10) |
| **Nombre del Sistema** | **CivicGuard PWA** |
| **Tipo de Sistema** | Progressive Web Application (PWA) de Nivel Empresarial Headless |
| **Entorno Operativo** | Dispositivos móviles y de escritorio en condiciones de red hostil o nula (Offline-First) |

---

## 2. Definición del Problema y Caso de Estudio

Las ciudades modernas se enfrentan cotidianamente a fallas críticas en su infraestructura urbana: fugas de agua potable o drenaje, baches de alta peligrosidad, colapso de luminarias públicas, caídas de árboles y postes, semáforos fuera de servicio o contingencias por desastres naturales. 

Los problemas habituales de los canales de reporte convencionales son:
1. **Pérdida de conectividad en campo**: Cuadrillas municipales y ciudadanos frecuentemente transitan por áreas con cobertura celular deficiente o intermitente. Los formularios web estándar fallan al perder la conexión, perdiendo los datos capturados y la evidencia fotográfica.
2. **Fricción de adopción en apps nativas**: Requerir que el ciudadano descargue una aplicación de 80-150 MB desde tiendas de aplicaciones (Google Play / App Store) antes de reportar un bache o un poste caído genera tasas de abandono superiores al 70%.
3. **Falta de metadatos precisos**: Los reportes por llamada o redes sociales carecen de geolocalización satelital exacta y fotografías verificadas en el momento del incidente.
4. **Alto consumo de recursos y lentitud**: Portales gubernamentales pesados, basados en arquitecturas monolíticas con renderizado dependiente del servidor, colapsan ante emergencias masivas.

**CivicGuard PWA** se concibe como una plataforma resiliente, accesible instantáneamente mediante un enlace web o código QR, capaz de instalarse en la pantalla de inicio del dispositivo sin pasar por tiendas de aplicaciones, y con la capacidad operativa de capturar incidencias, geolocalización satelital y evidencia fotográfica **aún en ausencia total de internet (Modo Avión estricto)**, sincronizando la información automáticamente en segundo plano cuando el dispositivo restablezca la conectividad.

---

## 3. Justificación de la Arquitectura Seleccionada

Para cumplir con las exigencias de disponibilidad, ligereza y acceso a hardware, se seleccionó una **Arquitectura Web Progresiva Desacoplada (Headless PWA)** con patrón **Application Shell (App Shell)**.

### 3.1. ¿Por qué PWA frente a otras alternativas?
* **Cero fricción de instalación**: Se distribuye vía web estándar bajo protocolo HTTPS seguro, compatible con Android, iOS, Windows y macOS.
* **Resiliencia Offline-First**: Mediante hilos de ejecución en segundo plano (**Service Workers**), la aplicación intercepted solicitudes de red y despacha recursos instantáneamente desde la **Cache API**, garantizando que la aplicación abra en menos de 1 segundo incluso en frío o sin conexión.
* **Persistencia local asíncrona avanzada**: A través de **IndexedDB**, los reportes, estados y fotografías (en formato binario Blob/Base64) se retienen transaccionalmente en el dispositivo sin bloquear el hilo principal de renderizado (UI thread). Se prohíbe el uso de `localStorage` para salvaguardar la fluidez a 60 fps.
* **Acceso a Hardware Nativo**: Uso directo de la **Geolocation API** (W3C) para fijar latitud, longitud y precisión métrica, y de la **MediaDevices API / HTML Media Capture** para accesar a la cámara del dispositivo móvil.
* **Sincronización en Segundo Plano**: Uso de la **Background Sync API** (`sync` event) para encolar operaciones mutables y ejecutarlas sin intervención del usuario en cuanto el navegador detecte restauración de red (`navigator.onLine`).

### 3.2. Patrón Application Shell
La arquitectura separa estrictamente el cascarón visual (interfaz estática, navegación, hojas de estilo, iconos y lógica base) de los datos dinámicos (reportes, estadísticas, catálogos):
* **El Shell (Cascarón)**: Es inmutable y se almacena en la **Cache API** durante la fase de instalación del Service Worker.
* **Los Datos**: Se procesan dinámicamente mediante renderizado del lado del cliente (Client-Side Rendering) y se respaldan en **IndexedDB**.

```
+-------------------------------------------------------------+
|                     CivicGuard PWA UI                       |
|  +-------------------------------------------------------+  |
|  |           Application Shell (Header, Nav, FAB)        |  |
|  +-------------------------------------------------------+  |
|  |           Vistas Dinámicas (CSR / Placeholders)       |  |
|  +-------------------------------------------------------+  |
+-------------------------------------------------------------+
                              |
                     [ Service Worker ]
              (Intercepta todas las peticiones)
                 /                         \
                /                           \
       [ Cache API ]                   [ IndexedDB ]
  (Assets inmutables Shell:        (Reportes locales JSON,
   HTML, CSS, JS, Iconos)           Fotos Blob, Cola Sync)
                \                           /
                 \                         /
          +--------------------------------------+
          |   Network / API Externa (Headless)   |
          |       (Solo cuando hay red)          |
          +--------------------------------------+
```

---

## 4. Requerimientos de Alto Nivel del Sistema

### 4.1. Requerimientos Funcionales
1. **RF-01: Registro de Incidencias Urbanas**: Formulario para tipificar incidencias (Bacheo, Luminarias, Agua y Drenaje, Seguridad, Parques).
2. **RF-02: Geolocalización Automática**: Adquisición obligatoria de coordenadas GNSS (GPS) mediante la Geolocation API con retroalimentación visual al usuario.
3. **RF-03: Evidencia Fotográfica**: Captura de imagen desde la cámara o selector local, con previsualización y compresión ligera.
4. **RF-04: Operatividad Offline Estricta**: La app debe permitir navegar, crear reportes, tomar fotos y almacenar en IndexedDB con el dispositivo en Modo Avión.
5. **RF-05: Sincronización Automática**: Procesamiento de la cola de reportes pendientes al recuperar señal mediante Background Sync.
6. **RF-06: Notificaciones Push**: Recepción de alertas del sistema sobre cambios de estatus del reporte ("Recibido", "En Proceso", "Solucionado").
7. **RF-07: Instalabilidad**: Cumplimiento íntegro de directivas para `Add to Home Screen` (A2HS) con Web App Manifest y Maskable Icons.

### 4.2. Requerimientos No Funcionales
1. **RNF-01: No Bloqueo del Hilo Principal**: Cero llamadas síncronas bloqueantes (`localStorage` estrictamente vetado).
2. **RNF-02: Rendimiento Lighthouse**: Puntuación $\ge 90/100$ en la categoría PWA y Rendimiento bajo perfil de red degradada (Slow 3G).
3. **RNF-03: Seguridad (Contexto Seguro)**: Despliegue mandatorio bajo HTTPS con certificados TLS vigentes y soporte a políticas de origen seguro (`isSecureContext = true`).
4. **RNF-04: Diseño Adaptativo (Responsive)**: Interfaz diseñada bajo la filosofía *Mobile-First*, optimizada para pantallas táctiles y teclado accesible.
