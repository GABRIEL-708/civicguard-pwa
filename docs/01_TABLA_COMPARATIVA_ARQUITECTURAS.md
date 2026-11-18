# Matriz Comparativa Oficial de Arquitecturas de Software
## Proyecto Integrador 2: CivicGuard PWA
### Evaluación Multicriterio Aplicada a Sistemas de Emergencias e Incidencias Urbanas

---

## 1. Introducción y Propósito

El presente documento constituye la **Tabla Comparativa Oficial** requerida para la Semana 1 del Proyecto Integrador. Evalúa con rigor técnico cinco paradigmas arquitectónicos en el desarrollo de software moderno:
1. **Arquitectura Web Tradicional (Monolítica / MPA - Multi-Page Application)**
2. **Arquitectura Orientada a Servicios (SOA / Microservicios + SPA clásica)**
3. **Arquitectura Móvil Nativa (Android Kotlin / iOS Swift)**
4. **Arquitectura Multiplataforma Híbrida / Compilada (Flutter, React Native)**
5. **Arquitectura Web Progresiva (PWA - Progressive Web App Headless)**

La evaluación se contextualiza en las necesidades críticas del sistema **CivicGuard PWA**: operatividad en entornos hostiles o sin conectividad, captura de hardware (GPS/Cámara), cero fricción de instalación por parte del ciudadano y rendimiento predecible sin degradación del dispositivo.

---

## 2. Matriz Comparativa Exhaustiva

| Criterio Técnico | 1. Web Tradicional (MPA / Monolito) | 2. Orientada a Servicios (SOA / API + SPA) | 3. Móvil Nativa (Kotlin / Swift) | 4. Multiplataforma (Flutter / React Native) | 5. Web Progresiva (PWA Headless) [Seleccionada] |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Pila Tecnológica Típica** | PHP/Laravel, Django, ASP.NET MVC, JSP con renderizado HTML en servidor. | Backend REST/gRPC (Node, Spring, Go) + Frontend React/Angular/Vue. | Kotlin / Java (Android SDK), Swift / Objective-C (iOS Cocoa Touch). | Dart (Flutter Engine) o JavaScript/TypeScript sobre React Native Bridge / Fabric. | HTML5 semántico, CSS3 moderno, ES Modules, Service Workers, Cache API, IndexedDB. |
| **Modelo de Distribución** | Navegador Web clásico vía URL. Sin instalación. | Navegador Web clásico vía URL o empaquetado WebView. | Tiendas oficiales (Google Play Store, Apple App Store). Proceso de revisión de 24h a 7 días. | Tiendas oficiales (Play Store / App Store) con binarios compilados por plataforma. | Directa desde la web mediante manifest.json y estándar W3C Add to Home Screen (A2HS). Sin tiendas. |
| **Capacidad Offline y Resiliencia** | **Nula (0/10)**. Cada interacción exige viaje redondo al servidor (Round Trip). La pérdida de red produce el dinosaurio de error de red. | **Muy Pobre (2/10)**. Requiere conexión constante para invocar los endpoints de la API. Sin Service Worker no hay retención. | **Sobresaliente (10/10)**. Base de datos embebida (SQLite/Room/CoreData) y manejo autónomo de estado local en el sistema operativo. | **Alta (9/10)**. Soporte de persistencia local (SQLite, Hive, Realm) y sincronización nativa en background. | **Excelente (9.5/10)**. Soporte nativo de **Cache API** (App Shell inmutable) e **IndexedDB** (transaccional). Operatividad total en Modo Avión. |
| **Acceso a Hardware (Cámara y GPS)** | Limitado a etiquetas `<input type="file">`. GPS básico dependiente de red activa. | Similar a Web Tradicional; acceso mediante Web APIs estándar solo si hay contexto seguro y conexión. | **Acceso Total y Directo (10/10)**. CameraX, NDK, GPS asistido a bajo nivel con máxima precisión. | **Acceso Alto (9/10)** mediante plugins/canales nativos (MethodChannels / JNI). | **Acceso Avanzado (9/10)** mediante APIs W3C modernas (`Geolocation API`, `MediaDevices`, `Web Notification API`). |
| **Fricción de Adopción por el Usuario** | Baja (solo abrir navegador), pero inutilizable sin datos. | Baja al abrir, pero pesada en la carga inicial de bundles JS (Chunk sizes elevados). | **Extrema (Muy Alta)**. El usuario debe buscar en la tienda, contar con 100+ MB libres, descargar y conceder permisos previos. | **Alta**. Requiere descarga e instalación desde tienda de aplicaciones (paquetes de 40-90 MB). | **Mínima (Óptima)**. Carga instantánea vía enlace o QR (< 2 MB total), instalación instantánea en 1 clic. |
| **Peso Inicial de Descarga** | ~1 a 3 MB por página. | ~5 a 15 MB de bundles JS minificados. | 50 MB a 150 MB (incluye runtime y assets nativos). | 30 MB a 90 MB (incluye engine de Flutter o JSC/Hermes). | **< 1.5 MB** para el Application Shell completo y assets esenciales. |
| **Persistencia Local** | Cookies HTTP y sesiones de servidor. No hay persistencia offline del lado del cliente. | Usualmente abusa de `localStorage` (síncrono y bloqueante) o estados volátiles en memoria (Redux). | SQLite, Room, Datastore, CoreData. Asíncrono en hilos dedicados (Coroutines/Dispatchers). | SQLite, Realm, WatermelonDB, AsyncStorage. | **IndexedDB** (motor transaccional asíncrono NoSQL) y **Cache API**. Cero impacto en el UI thread. |
| **Ciclo de Actualizaciones** | Instantáneo en servidor. | Instantáneo en servidor y CDN. | Lento y fragmentado. Depende de aprobación de tiendas y de que el usuario descargue el update. | Lento en tiendas (salvo CodePush parcial para JS, restringido para cambios binarios). | **Instantáneo e Ininterrumpido**. El Service Worker detecta cambios en el hash de versión y actualiza silenciosamente. |
| **Costo y Complejidad de Desarrollo** | Medio. Fácil de iniciar, pero escalar e implementar offline es prácticamente inviable. | Alto. Doble base de código (backend desacoplado + SPA compleja con enrutamiento cliente). | **Muy Alto**. Requiere dos equipos especializados independientes (Android y iOS), duplicando costos. | Medio-Alto. Un solo código base pero requiere mantenimiento constante de dependencias nativas y builds pesados. | **Eficiente y Escalable**. Base de código web única, universalmente compatible y testeable en navegadores estándar. |
| **Notificaciones Push** | Incompatibles sin navegador abierto. | Incompatibles de forma nativa sin Service Worker. | Integración nativa con Firebase Cloud Messaging (FCM) y Apple Push Notification service (APNs). | Integración nativa mediante librerías multiplataforma sobre FCM / APNs. | **Web Push API** con protocolo estándar VAPID. Funcionamiento en background incluso con la app cerrada. |

---

## 3. Análisis Crítico Aplicado al Caso de Estudio: CivicGuard

El sistema **CivicGuard** fue concebido para operar en situaciones de contingencia y fallas urbanas en las calles de la ciudad. A continuación se analiza la viabilidad de cada arquitectura para este objetivo específico:

### 3.1. Arquitectura Web Tradicional (Monolítica)
* **Veredicto**: **INVIABLE**.
* **Motivo**: Al depender del renderizado en servidor (SSR puro sin clientes inteligentes), cualquier caída en la señal celular 3G/4G/5G en el lugar del bache o fuga provoca un fallo fatal de navegación (*ERR_INTERNET_DISCONNECTED*). El ciudadano o técnico municipal pierde los datos redactados y la evidencia fotográfica capturada.

### 3.2. Arquitectura Orientada a Servicios (SOA + SPA Clásica)
* **Veredicto**: **INSUFICIENTE**.
* **Motivo**: Si bien separa la capa visual de la lógica de negocio, una SPA convencional que no implementa un Service Worker no cuenta con un proxy programable en el cliente. Si la API no responde, la aplicación muestra loaders perpetuos o errores de red no controlados. Además, comúnmente recurre a `localStorage`, lo que viola la especificación del proyecto al bloquear el hilo principal durante la serialización de imágenes.

### 3.3. Arquitectura Móvil Nativa
* **Veredicto**: **TÉCNICAMENTE CAPAZ, PERO OPERATIVAMENTE INEFICIENTE**.
* **Motivo**: Ofrece el máximo rendimiento de hardware y persistencia (Room / SQLite), pero sufre de una **fricción de adopción crítica**: un ciudadano que transita por una avenida y encuentra una rejilla abierta no esperará a descargar 120 MB desde Google Play para emitir un reporte. Para cuadrillas municipales, obliga a mantener dos ecosistemas de desarrollo paralelos (iOS y Android), elevando sustancialmente los costos presupuestales.

### 3.4. Arquitectura Multiplataforma (Flutter / React Native)
* **Veredicto**: **DESPROPORCIONADA Y DE ALTO MANTENIMIENTO**.
* **Motivo**: Reduce el costo a un solo repositorio, pero continúa anclada a los ecosistemas de tiendas de aplicaciones y empaquetados pesados. La compilación de binarios y la gestión de dependencias de puente (*bridges*) agrega complejidad técnica innecesaria cuando las capacidades nativas requeridas (cámara y geolocalización) ya están estandarizadas en la web moderna.

### 3.5. Arquitectura Web Progresiva (PWA Headless)
* **Veredicto**: **ARQUITECTURA ÓPTIMA SELECCIONADA**.
* **Justificación Integral**:
  1. **Disponibilidad Inmediata**: Cualquier persona puede acceder a `https://civicguard.app` mediante un enlace o QR en el mobiliario urbano, instalando la app de inmediato en su pantalla de inicio en menos de 3 segundos.
  2. **Independencia Total de Red**: El patrón **Application Shell** garantiza que la estructura del sistema se recupere en milisegundos desde la **Cache API**.
  3. **Persistencia No Bloqueante**: La integración con **IndexedDB** permite guardar reportes JSON con geocoordenadas satelitales y fotografías codificadas de manera asíncrona, sin congelar la interfaz ni violar el requerimiento de hilos de fondo.
  4. **Sincronización Transparente**: La API de **Background Sync** permite al personal de campo registrar 10 incidencias en una zona rural o sótano sin cobertura; al regresar a una zona con señal, el Service Worker despierta y despacha los datos al servidor sin intervención del operario.

---

## 4. Conclusión Técnica del Dictamen

La arquitectura **Web Progresiva (PWA)** es la única opción que reconcilia las bondades del alcance universal y bajo peso del ecosistema Web con las capacidades de persistencia, hardware y operación offline del software nativo, cumpliendo estrictamente con el dictamen de ingeniería del Proyecto Integrador 2 de la UTM.
