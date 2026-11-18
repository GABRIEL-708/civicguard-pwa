/**
 * Módulo de Notificaciones Push y Alertas Nativas (Semana 4)
 * CivicGuard PWA - UTM Proyecto Integrador 2
 */

export class PushNotificationService {
  static esCompatible() {
    return 'Notification' in window;
  }

  static obtenerEstadoPermiso() {
    if (!this.esCompatible()) return 'incompatible';
    return Notification.permission;
  }

  static async solicitarPermiso() {
    if (!this.esCompatible()) {
      throw new Error('Las notificaciones no están soportadas en este dispositivo.');
    }
    const permiso = await Notification.requestPermission();
    console.log('[Notificaciones Push] 🔔 Permiso concedido:', permiso);
    return permiso;
  }

  static async emitirNotificacion(titulo, opciones = {}) {
    if (!('Notification' in window)) {
      throw new Error('Tu navegador no soporta la API de Notificaciones.');
    }

    if (Notification.permission === 'denied') {
      throw new Error('Las notificaciones están bloqueadas en tu navegador. Haz clic en el candado 🔒 junto a la URL para permitirlas.');
    }

    if (Notification.permission !== 'granted') {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        throw new Error('No se concedió el permiso de notificaciones.');
      }
    }

    const iconUrl = new URL('assets/icons/icon-192.png', window.location.href).href;
    const badgeUrl = new URL('assets/icons/badge-72.png', window.location.href).href;

    const opcionesPredeterminadas = {
      body: opciones.body || 'Alerta de Infraestructura Urbana',
      icon: iconUrl,
      badge: badgeUrl,
      vibrate: [200, 100, 200],
      tag: opciones.tag || 'civicguard-alerta-' + Date.now(),
      renotify: true,
      data: {
        url: window.location.href,
        fecha: new Date().toISOString()
      }
    };

    if ('vibrate' in navigator) {
      try { navigator.vibrate([200, 100, 200]); } catch(e) {}
    }

    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(titulo, opcionesPredeterminadas);
          console.log('[Notificaciones Push] 📲 Notificación emitida vía Service Worker.');
          return true;
        }
      } catch (swErr) {
        console.warn('[Notificaciones Push] Falló vía SW, intentando directa:', swErr);
      }
    }

    try {
      new Notification(titulo, opcionesPredeterminadas);
      return true;
    } catch (directErr) {
      console.error('[Notificaciones Push] Falló Notification directa:', directErr);
      throw new Error('No se pudo desplegar la notificación del sistema: ' + directErr.message);
    }
  }

  static async simularAlertaResolucion(idReporte, tituloReporte) {
    return this.emitirNotificacion('🛠️ Reporte Solucionado - Cuadrilla Municipal', {
      body: `La incidencia "${tituloReporte}" (#${idReporte}) ha sido reparada y verificada exitosamente.`,
      tag: `solucion-${idReporte}`,
      url: window.location.href
    });
  }
}
