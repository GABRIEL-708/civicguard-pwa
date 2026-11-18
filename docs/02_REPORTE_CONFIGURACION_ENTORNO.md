# Reporte Técnico de Configuración del Entorno de Desarrollo
## Proyecto Integrador 2: CivicGuard PWA
### Bitácora de Configuración Quirúrgica de Entorno Local Seguro, Red y Supresión de Caché

---

## 1. Identificación del Entorno y Ficha de Laboratorio

* **Proyecto**: CivicGuard PWA - Sistema de Gestión de Emergencias e Incidencias Urbanas
* **Institución**: Universidad Tecnológica Metropolitana (UTM)
* **Ingeniería**: Desarrollo y Gestión de Software
* **Fase**: Semana 1 - Configuración Quirúrgica de Entorno y Contexto Seguro
* **Sistema Operativo Base**: Microsoft Windows 11 Pro (x64)
* **Motor de Ejecución**: Node.js v24.14.0 / NPM v11.19.0
* **Control de Versiones**: Git v2.54.0

---

## 2. Herramientas de Desarrollo y Justificación Técnica

Para satisfacer los requerimientos de alta disponibilidad, desarrollo ágil y auditoría estricta de Service Workers, se establecieron las siguientes herramientas:

| Herramienta | Versión | Rol Arquitectónico | Justificación |
| :--- | :--- | :--- | :--- |
| **Node.js runtime** | 24.14.0 LTS | Servidor de desarrollo y orquestador | Provee un motor de alto rendimiento basado en V8 para servir assets estáticos y simular APIs backend. |
| **Servidor Web Local** | Vite Dev Server / Node Native HTTP | Servidor HTTP de alto rendimiento con HMR | Permite inyección instantánea de módulos (ES Modules), configuración precisa de cabeceras de respuesta y enlace en puertos controlados. |
| **ngrok Tunneling Proxy** | v3.x | Proxy inverso seguro para pruebas en hardware móvil | Genera un túnel seguro con certificado SSL/TLS válido (`https://*.ngrok-free.app`), indispensable para que navegadores móviles (Chrome en Android, Safari en iOS) reconozcan el origen como **Contexto Seguro** (`isSecureContext`). |
| **Google Chrome DevTools** | v130+ | Depuración y perfilado de Service Workers | Permite auditar el estado del ciclo de vida del SW (*Update on reload*, *Bypass for network*), simular desconexión total (*Offline checkbox*), red degradada (*Slow 3G*) y forzar eventos de *Push* y *Sync*. |
| **Lighthouse CLI / DevTools** | v12+ | Auditoría estandarizada industrial | Evalúa el cumplimiento del PWA checklist, métricas Web Vitals (FCP, LCP, CLS) y accesibilidad. |

---

## 3. Asignación de Puertos y Parámetros de Red

El entorno de desarrollo se configura para evitar colisiones de puertos y habilitar la resolución tanto en la máquina local (`loopback`) como en la red de área local (LAN) para pruebas cruzadas:

```
[ Dispositivo Móvil en Campo ]
             │ (4G/LTE o Wi-Fi)
             ▼
[ https://civicguard-pwa.ngrok-free.app ] ── (Túnel Seguro TLS 1.3)
             │
             ▼
[ Proxy ngrok Agent Local ]
             │ (Redirección HTTP local)
             ▼
[ Host Local: 127.0.0.1:5173 ] ── (Servidor Web de Alto Rendimiento)
             │
             ├── Archivos Estáticos / Application Shell
             ├── Service Worker (sw.js)
             └── manifest.json
```

### 3.1. Tabla de Parámetros de Puerto

| Parámetro | Valor de Configuración | Descripción |
| :--- | :--- | :--- |
| **Host IP de Enlace** | `0.0.0.0` / `localhost` | Escucha en todas las interfaces de red para permitir acceso vía LAN y túnel proxy. |
| **Puerto Primario Front-End** | `5173` | Puerto estándar de desarrollo de alta velocidad. |
| **Puerto Secundario Mock API** | `3001` (Opcional) | Endpoint para simulación de endpoints REST y suscripción Web Push. |
| **Protocolo Local** | HTTP (autorizado como contexto seguro bajo `localhost`) / HTTPS nativo. | El estándar W3C clasifica `http://localhost` y `http://127.0.0.1` como orígenes seguros por excepción de desarrollo. |
| **Protocolo Remoto (ngrok)** | HTTPS (TLS 1.3) | Certificado x509 con wildcard válido emitido por Let's Encrypt / DigiCert. |

---

## 4. Política de Supresión Quirúrgica de Cachés HTTP Clásicas

### 4.1. El Problema de la Doble Caché
Un error habitual en el desarrollo de PWAs es permitir que la caché HTTP del navegador (Caché clásica del servidor web basada en `ETag` o `Last-Modified`) retenga los archivos `index.html` o `sw.js`. Si esto ocurre:
1. El navegador no se entera de que existe una nueva versión del Service Worker.
2. Se generan desfases entre el código cliente y el worker de fondo.
3. Se produce corrupción en la recuperación de recursos offline.

### 4.2. Cabeceras HTTP de Control Implementadas
Se configuró el servidor local para inyectar cabeceras estrictas de no-almacenamiento en recursos dinámicos y en el script del Service Worker:

```http
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
Pragma: no-cache
Expires: 0
Surrogate-Control: no-store
```

* **`no-store`**: Prohíbe terminantemente al navegador y a proxies intermedios almacenar cualquier copia del archivo en disco o memoria.
* **`must-revalidate`**: Obliga a verificar con el origen cualquier petición subsecuente.
* **`max-age=0`**: Invalida la frescura del recurso de manera inmediata.

De este modo, se garantiza que **el único mecanismo responsable de la persistencia de assets sea la Cache API administrada programáticamente por `sw.js`**, eliminando cualquier interferencia de la caché HTTP del navegador.

---

## 5. Validación del Contexto Seguro (Secure Context)

Las especificaciones de la W3C y el consorcio WHATWG prohíben estrictamente la ejecución de Service Workers, el acceso a la cámara mediante `navigator.mediaDevices` y la geolocalización satelital precisa en contextos no seguros (HTTP plano remoto).

### 5.1. Prueba de Validación en Código
Se diseñó la siguiente rutina de comprobación que el Application Shell ejecuta al inicializar:

```javascript
/**
 * Verificación de Integridad de Contexto Seguro
 * CivicGuard PWA - UTM
 */
function validarContextoSeguro() {
  const esContextoSeguro = window.isSecureContext;
  const soporteSW = 'serviceWorker' in navigator;
  const soporteCrypto = !!(window.crypto && window.crypto.subtle);
  const soporteGeo = 'geolocation' in navigator;
  const soporteMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  console.group('🛡️ Auditoría de Contexto Seguro - CivicGuard');
  console.log(`• Origen actual: ${window.location.origin}`);
  console.log(`• isSecureContext: ${esContextoSeguro ? '✅ SEGURO' : '❌ INSEGURO'}`);
  console.log(`• Service Worker API: ${soporteSW ? '✅ DISPONIBLE' : '❌ NO DISPONIBLE'}`);
  console.log(`• Web Cryptography API: ${soporteCrypto ? '✅ ACTIVO' : '❌ INACTIVO'}`);
  console.log(`• Geolocation API: ${soporteGeo ? '✅ DISPONIBLE' : '❌ INACCESIBLE'}`);
  console.log(`• MediaDevices (Cámara): ${soporteMedia ? '✅ DISPONIBLE' : '❌ INACCESIBLE'}`);
  console.groupEnd();

  if (!esContextoSeguro) {
    throw new Error('CivicGuard requiere un origen seguro (HTTPS o localhost) para operar.');
  }
}
```

### 5.2. Procedimiento Operativo con ngrok para Pruebas en Hardware Real

Para validar el sistema en teléfonos inteligentes reales de los miembros del equipo:
1. Se inicia el servidor de desarrollo en la máquina local:
   ```powershell
   npm run dev -- --host 0.0.0.0 --port 5173
   ```
2. En una terminal paralela, se expone el puerto mediante el proxy seguro:
   ```powershell
   ngrok http 5173
   ```
3. ngrok genera una URL segura con TLS público:
   `https://a1b2-c3d4.ngrok-free.app` -> `http://localhost:5173`
4. El operador abre dicha URL en Chrome Mobile en un teléfono Android o Safari en iOS:
   - Se valida `window.isSecureContext === true`.
   - El navegador permite la instalación como Web App nativa.
   - Se habilitan los permisos biométricos y de sensores (GPS de alta precisión y hardware de cámara).

---

## 6. Conclusiones de la Configuración de Entorno

El entorno establecido proporciona:
1. **Aislamiento absoluto**: Eliminación de problemas de caché fantasma mediante cabeceras `no-store`.
2. **Cumplimiento estricto de seguridad**: Respeto al modelo W3C de orígenes seguros.
3. **Capacidad de auditoría multi-dispositivo**: Evaluación inmediata en condiciones de hardware móvil real mediante túneles seguros con ngrok.
