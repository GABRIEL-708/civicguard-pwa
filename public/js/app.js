/**
 * Orquestador Principal del Application Shell (Client-Side)
 * CivicGuard PWA - UTM Proyecto Integrador 2
 */

import { dbStore } from './db/indexed-store.js';
import { SupabaseClient } from './db/supabase-client.js';
import { GeolocationHardware } from './hardware/geolocation.js';
import { CameraHardware } from './hardware/camera.js';
import { BackgroundSyncManager } from './sync/background-sync.js';
import { PushNotificationService } from './notifications/push-service.js';

// Instancias de hardware
const camera = new CameraHardware();

// Estado en memoria de la UI
const estadoUI = {
  filtroActual: 'todos',
  coordenadasCapturadas: null,
  evidenciaFotografica: null,
  modoAvionSimulado: false
};

// --- INICIALIZACIÓN AL CARGAR EL DOCUMENTO ---
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🛡️ Inicializando CivicGuard PWA Application Shell...');
  
  // 1. Registro del Service Worker en la raíz
  await registrarServiceWorker();

  // 2. Monitoreo de Conectividad (Online / Offline)
  inicializarMonitoreoRed();

  // 3. Inicializar IndexedDB y cargar datos
  await dbStore.init();
  await actualizarMetricasUI();
  await cargarReportesEnUI();

  // 4. Configurar eventos de navegación y formularios
  configurarNavegacion();
  configurarFormularioReporte();
  configurarSensoresHardware();
  configurarCentroControlSync();
});

/**
 * 1. REGISTRO DEL SERVICE WORKER (Semana 2)
 */
async function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[App Shell] ✅ Service Worker registrado en scope:', reg.scope);

      // Detección de nueva versión
      reg.addEventListener('updatefound', () => {
        const nuevoWorker = reg.installing;
        nuevoWorker.addEventListener('statechange', () => {
          if (nuevoWorker.state === 'installed' && navigator.serviceWorker.controller) {
            mostrarToast('🔄 Nueva versión disponible de CivicGuard instalada.', 'info');
          }
        });
      });

    } catch (err) {
      console.error('[App Shell] ❌ Falló registro de Service Worker:', err);
    }
  } else {
    console.warn('[App Shell] ⚠️ Service Worker no soportado en este navegador.');
  }
}

/**
 * 2. MONITOREO DE CONECTIVIDAD DE RED (Semana 3)
 */
function inicializarMonitoreoRed() {
  const banner = document.getElementById('network-banner');
  const bannerText = document.getElementById('network-status-text');

  function actualizarEstado() {
    const estaEnLinea = navigator.onLine && !estadoUI.modoAvionSimulado;

    if (estaEnLinea) {
      banner.className = 'online';
      bannerText.innerHTML = '🟢 Conectado a Red Municipal (En Línea)';
      // Disparar sincronización diferida al restablecer conexión
      BackgroundSyncManager.procesarColaDirecta((cant) => {
        mostrarToast(`🚀 ${cant} reporte(s) encolados se sincronizaron con éxito.`, 'success');
        actualizarMetricasUI();
        cargarReportesEnUI();
      });
    } else {
      banner.className = 'offline';
      bannerText.innerHTML = '📡 Modo Desconectado (Offline / Modo Avión) - Operatividad 100% activa';
      mostrarToast('Modo Offline: Los reportes se retendrán en IndexedDB.', 'warning');
    }
  }

  window.addEventListener('online', actualizarEstado);
  window.addEventListener('offline', actualizarEstado);
  actualizarEstado();
}

/**
 * 3. NAVEGACIÓN Y CAMBIO DE VISTAS (App Shell)
 */
function configurarNavegacion() {
  const navButtons = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.view-section');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-target');
      
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      sections.forEach(sec => {
        if (sec.id === targetView) {
          sec.classList.add('active');
        } else {
          sec.classList.remove('active');
        }
      });

      // Si sale del formulario, apagar la cámara si estaba encendida
      if (targetView !== 'vista-nuevo') {
        camera.detenerVisor();
        const visor = document.getElementById('camera-viewport');
        if (visor) visor.style.display = 'none';
      }

      // Si entra a control offline, refrescar cola
      if (targetView === 'vista-sync') {
        refrescarColaSyncUI();
      }
    });
  });
}

/**
 * 4. RENDERIZADO DEL TABLERO DE INCIDENCIAS (CSR)
 */
async function cargarReportesEnUI() {
  const listaContenedor = document.getElementById('lista-reportes');
  if (!listaContenedor) return;

  const reportes = await dbStore.obtenerReportes();

  // Filtrado por categoría
  const filtrados = estadoUI.filtroActual === 'todos' 
    ? reportes 
    : reportes.filter(r => r.categoria === estadoUI.filtroActual);

  if (filtrados.length === 0) {
    listaContenedor.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted); background: var(--bg-card); border-radius: 12px;">
        <p style="font-size: 1.1rem; font-weight: 600; color: #fff;">No hay incidencias en esta categoría</p>
        <p style="font-size: 0.85rem; margin-top: 6px;">Usa el botón "Reportar" para registrar una nueva falla en infraestructura.</p>
      </div>
    `;
    return;
  }

  // Sustitución de los skeletons por contenido real
  listaContenedor.innerHTML = filtrados.map(r => {
    const estatusLabels = {
      'local_retenido': 'Pendiente de Sincronización',
      'despachado': 'Despachado a Servidor',
      'resuelto': 'Solucionado / Verificado'
    };

    const estatusIcons = {
      'local_retenido': '⏳',
      'despachado': '📡',
      'resuelto': '✅'
    };

    const severidadColores = {
      'critica': 'var(--color-critico)',
      'alta': 'var(--color-alto)',
      'media': 'var(--color-medio)',
      'baja': 'var(--color-bajo)'
    };

    const coordStr = r.coordenadas 
      ? `${r.coordenadas.latitud}, ${r.coordenadas.longitud} (±${r.coordenadas.precision}m)`
      : 'Sin georreferencia';

    const fechaStr = new Date(r.creadoEn).toLocaleString('es-MX', {
      dateStyle: 'short',
      timeStyle: 'short'
    });

    const fotoHtml = r.evidenciaFotografica && r.evidenciaFotografica.dataUrl
      ? `<img src="${r.evidenciaFotografica.dataUrl}" alt="Evidencia de ${r.titulo}" class="card-img-preview" loading="lazy" />`
      : '';

    return `
      <article class="report-card" data-id="${r.id}">
        <div class="card-header-row">
          <span class="card-category-badge" style="border-left: 3px solid ${severidadColores[r.severidad] || '#fff'}">
            ${r.categoria.replace('_', ' ')}
          </span>
          <span class="card-status-badge status-${r.estatus}">
            ${estatusIcons[r.estatus] || '•'} ${estatusLabels[r.estatus] || r.estatus}
          </span>
        </div>

        <h3 class="card-title">${escapeHtml(r.titulo)}</h3>
        <p class="card-desc">${escapeHtml(r.descripcion)}</p>

        ${fotoHtml}

        <div class="card-meta-row">
          <span class="meta-item">📍 ${coordStr}</span>
          <span class="meta-item">🕒 ${fechaStr}</span>
          <span class="meta-item" style="color: ${severidadColores[r.severidad]}; font-weight: 700;">
            Nivel: ${r.severidad.toUpperCase()}
          </span>
        </div>
      </article>
    `;
  }).join('');
}

/**
 * 5. ACTUALIZAR MÉTRICAS DE PERSISTENCIA
 */
async function actualizarMetricasUI() {
  const m = await dbStore.obtenerMetricas();
  const elTotal = document.getElementById('stat-total');
  const elRetenidos = document.getElementById('stat-retenidos');
  const elSincronizados = document.getElementById('stat-sincronizados');
  const elResueltos = document.getElementById('stat-resueltos');

  if (elTotal) elTotal.textContent = m.total;
  if (elRetenidos) elRetenidos.textContent = m.pendientes;
  if (elSincronizados) elSincronizados.textContent = m.sincronizados;
  if (elResueltos) elResueltos.textContent = m.resueltos;
}

/**
 * 6. CONFIGURACIÓN DE SENSORES DE HARDWARE (CÁMARA Y GPS)
 */
function configurarSensoresHardware() {
  // GPS
  const btnGps = document.getElementById('btn-capturar-gps');
  const gpsInfo = document.getElementById('gps-resultado-info');

  if (btnGps) {
    btnGps.addEventListener('click', async () => {
      btnGps.disabled = true;
      btnGps.innerHTML = '🛰️ Consultando Satélites...';
      gpsInfo.innerHTML = '<span style="color: var(--utm-green-light)">Activando sensor GPS de alta precisión...</span>';

      try {
        const coords = await GeolocationHardware.capturarCoordenadas();
        estadoUI.coordenadasCapturadas = coords;
        gpsInfo.innerHTML = `
          <strong style="color: var(--utm-green-light)">✅ Coordenadas Fijadas:</strong><br>
          Latitud: <b>${coords.latitud}</b> | Longitud: <b>${coords.longitud}</b><br>
          Margen de error GPS: <b>±${coords.precision} metros</b>
        `;
        mostrarToast('GPS: Posicionamiento satelital fijado.', 'success');
      } catch (err) {
        gpsInfo.innerHTML = `<span style="color: var(--color-critico)">❌ ${err.message}</span>`;
        mostrarToast(err.message, 'error');
      } finally {
        btnGps.disabled = false;
        btnGps.innerHTML = '📍 Adquirir Coordenadas GPS';
      }
    });
  }

  // CÁMARA
  const btnIniciarCamara = document.getElementById('btn-iniciar-camara');
  const btnDisparar = document.getElementById('btn-disparar-foto');
  const btnSwitch = document.getElementById('btn-switch-camara');
  const visor = document.getElementById('camera-viewport');
  const videoElem = document.getElementById('camera-stream');
  const fotoPreview = document.getElementById('foto-preview-resultado');
  const inputFallback = document.getElementById('input-foto-fallback');

  if (btnIniciarCamara) {
    btnIniciarCamara.addEventListener('click', async () => {
      try {
        visor.style.display = 'block';
        await camera.iniciarVisor(videoElem);
        mostrarToast('Cámara iniciada.', 'info');
      } catch (err) {
        mostrarToast('Visor en vivo no disponible. Abriendo selector de captura.', 'warning');
        inputFallback.click();
      }
    });
  }

  if (btnDisparar) {
    btnDisparar.addEventListener('click', () => {
      try {
        const snapshot = camera.capturarInstantanea();
        estadoUI.evidenciaFotografica = snapshot;
        camera.detenerVisor();
        visor.style.display = 'none';

        fotoPreview.innerHTML = `
          <img src="${snapshot.dataUrl}" style="max-height: 160px; border-radius: 8px; border: 1px solid var(--border-color); margin-top: 8px;" />
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
            Evidencia comprimida en WebP: <b>${snapshot.tamanioKB} KB</b> (${snapshot.dimensiones})
          </p>
        `;
        mostrarToast('Fotografía capturada y comprimida.', 'success');
      } catch (e) {
        mostrarToast(e.message, 'error');
      }
    });
  }

  if (btnSwitch) {
    btnSwitch.addEventListener('click', async () => {
      await camera.alternarCamara();
    });
  }

  // Fallback de selector de archivo
  if (inputFallback) {
    inputFallback.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        const snapshot = await CameraHardware.procesarArchivoImagen(e.target.files[0]);
        estadoUI.evidenciaFotografica = snapshot;
        fotoPreview.innerHTML = `
          <img src="${snapshot.dataUrl}" style="max-height: 160px; border-radius: 8px; border: 1px solid var(--border-color); margin-top: 8px;" />
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
            Fotografía cargada: <b>${snapshot.tamanioKB} KB</b> (${snapshot.dimensiones})
          </p>
        `;
      }
    });
  }
}

/**
 * 7. FORMULARIO DE NUEVO REPORTE
 */
function configurarFormularioReporte() {
  const form = document.getElementById('form-nuevo-reporte');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const titulo = document.getElementById('rep-titulo').value.trim();
    const categoria = document.getElementById('rep-categoria').value;
    const severidad = document.getElementById('rep-severidad').value;
    const descripcion = document.getElementById('rep-descripcion').value.trim();

    if (!titulo || !descripcion) {
      mostrarToast('Por favor completa el título y la descripción.', 'error');
      return;
    }

    // Coordenadas por defecto si el usuario no activó el GPS
    const coordenadas = estadoUI.coordenadasCapturadas || {
      latitud: 20.9385,
      longitud: -89.6247,
      precision: 10.0,
      altitud: null,
      timestamp: Date.now()
    };

    const nuevoReporte = {
      titulo,
      categoria,
      severidad,
      descripcion,
      coordenadas,
      evidenciaFotografica: estadoUI.evidenciaFotografica,
      estatus: 'local_retenido',
      creadoEn: new Date().toISOString()
    };

    // 1. Guardar en IndexedDB (Transaccional Asíncrono - CERO localStorage)
    const guardado = await dbStore.guardarReporte(nuevoReporte);

    // 2. Programar Background Sync
    await BackgroundSyncManager.solicitarSincronizacion();

    // 3. Resetear formulario
    form.reset();
    estadoUI.coordenadasCapturadas = null;
    estadoUI.evidenciaFotografica = null;
    document.getElementById('gps-resultado-info').innerHTML = 'Coordenadas pendientes de adquisición';
    document.getElementById('foto-preview-resultado').innerHTML = '';

    mostrarToast(`✅ Reporte #${guardado.id} retenido en IndexedDB local.`, 'success');

    // 4. Actualizar tablero y regresar a la vista principal
    await actualizarMetricasUI();
    await cargarReportesEnUI();
    document.querySelector('.nav-item[data-target="vista-tablero"]').click();
  });

  // Filtros de categoría en el tablero
  const chips = document.querySelectorAll('.chip-filter');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      estadoUI.filtroActual = chip.getAttribute('data-categoria');
      cargarReportesEnUI();
    });
  });
}

/**
 * 8. CENTRO DE CONTROL OFFLINE, SYNC Y PUSH (Semanas 3 y 4)
 */
function configurarCentroControlSync() {
  // Simulador de Modo Avión
  const btnToggleModoAvion = document.getElementById('btn-toggle-modo-avion');
  if (btnToggleModoAvion) {
    btnToggleModoAvion.addEventListener('click', () => {
      estadoUI.modoAvionSimulado = !estadoUI.modoAvionSimulado;
      btnToggleModoAvion.textContent = estadoUI.modoAvionSimulado 
        ? '✈️ Salir de Modo Avión' 
        : '✈️ Simular Modo Avión (Desconectar)';
      
      window.dispatchEvent(new Event(estadoUI.modoAvionSimulado ? 'offline' : 'online'));
    });
  }

  // Sincronización Manual Forzada
  const btnForzarSync = document.getElementById('btn-forzar-sync');
  if (btnForzarSync) {
    btnForzarSync.addEventListener('click', async () => {
      btnForzarSync.disabled = true;
      btnForzarSync.textContent = '🔄 Sincronizando...';

      const res = await BackgroundSyncManager.procesarColaDirecta();
      mostrarToast(`Sincronización manual: ${res.despachados} despachados, ${res.pendientes} pendientes.`, 'info');

      await actualizarMetricasUI();
      await cargarReportesEnUI();
      await refrescarColaSyncUI();

      btnForzarSync.disabled = false;
      btnForzarSync.textContent = '🚀 Forzar Sincronización Inmediata';
    });
  }

  // Notificación Push de Demostración
  const btnPushDemo = document.getElementById('btn-demo-push');
  if (btnPushDemo) {
    btnPushDemo.addEventListener('click', async () => {
      try {
        await PushNotificationService.simularAlertaResolucion('REP-UTM-002', 'Fuga de agua potable frente al Campus UTM');
        mostrarToast('📲 Alerta push despachada al sistema operativo.', 'success');
      } catch (err) {
        mostrarToast('Error al emitir notificación: ' + err.message, 'error');
      }
    });
  }
}

/**
 * Refresca la tabla de la cola de sincronización en la vista de control
 */
async function refrescarColaSyncUI() {
  const contenedor = document.getElementById('tabla-cola-sync');
  if (!contenedor) return;

  const cola = await dbStore.obtenerColaSync();

  if (cola.length === 0) {
    contenedor.innerHTML = '<p style="color: var(--utm-green-light); font-size: 0.85rem;">✨ Cola vacía. Todos los reportes han sido sincronizados.</p>';
    return;
  }

  contenedor.innerHTML = `
    <div style="font-size: 0.8rem; overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
            <th style="padding: 6px;">ID</th>
            <th style="padding: 6px;">Título</th>
            <th style="padding: 6px;">Intentos</th>
            <th style="padding: 6px;">Fecha Retención</th>
          </tr>
        </thead>
        <tbody>
          ${cola.map(c => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 6px; font-weight: 700; color: #fff;">${c.idReporte}</td>
              <td style="padding: 6px;">${escapeHtml(c.payload.titulo)}</td>
              <td style="padding: 6px;">${c.intentos}</td>
              <td style="padding: 6px; color: var(--text-muted);">${new Date(c.creadoEn).toLocaleTimeString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Sistema Toast de retroalimentación en pantalla
 */
function mostrarToast(mensaje, tipo = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  
  const iconos = {
    'info': 'ℹ️',
    'success': '✅',
    'warning': '⚠️',
    'error': '❌'
  };

  toast.innerHTML = `<span>${iconos[tipo] || '•'}</span> <span>${escapeHtml(mensaje)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
