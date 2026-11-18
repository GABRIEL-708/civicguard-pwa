/**
 * Módulo de Notificaciones Push y Alertas Nativas (Semana 4)
 * CivicGuard PWA - UTM Proyecto Integrador 2
 */

export class PushNotificationService {
  /**
   * Comprueba si las notificaciones están soportadas
   */
  static esCompatible() {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  /**
   * Obtiene el estado actual del permiso de notificaciones
   */
  static obtenerEstadoPermiso() {
    if (!this.esCompatible()) return 'incompatible';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  }

  /**
   * Solicita el permiso al usuario
   */
  static async solicitarPermiso() {
    if (!this.esCompatible()) {
      throw new Error('Las notificaciones no están soportadas en este dispositivo.');
    }

    const permiso = await Notification.requestPermission();
    console.log('[Notificaciones Push] 🔔 Permiso concedido:', permiso);
    return permiso;
  }

  /**
   * Emite una notificación nativa del sistema a través del Service Worker
   * @param {string} titulo 
   * @param {Object} opciones 
   */
  static async emitirNotificacion(titulo, opciones = {}) {
    if (Notification.permission !== 'granted') {
      const permiso = await this.solicitarPermiso();
      if (permiso !== 'granted') {
        throw new Error('Permiso de notificaciones denegado.');
      }
    }

    const opcionesPredeterminadas = {
      body: opciones.body || 'Alerta de Infraestructura Urbana',
      icon: opciones.icon || '/assets/icons/icon-192.png',
      badge: '/assets/icons/badge-72.png',
      vibrate: [200, 100, 200],
      tag: opciones.tag || 'civicguard-alerta',
      renotify: true,
      data: {
        url: opciones.url || '/',
        fecha: new Date().toISOString()
      }
    };

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(titulo, opcionesPredeterminadas);
      console.log('[Notificaciones Push] 📲 Notificación nativa mostrada vía Service Worker.');
      return true;
    } else {
      new Notification(titulo, opcionesPredeterminadas);
      return true;
    }
  }

  /**
   * Simula la resolución de un reporte y emite la alerta del sistema
   */
  static async simularAlertaResolucion(idReporte, tituloReporte) {
    return this.emitirNotificacion('🛠️ Reporte Solucionado - Cuadrilla Municipal', {
      body: `La incidencia "${tituloReporte}" (#${idReporte}) ha sido reparada y verificada exitosamente.`,
      tag: `solucion-${idReporte}`,
      url: `/#tablero`
    });
  }
}
