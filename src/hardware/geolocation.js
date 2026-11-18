/**
 * Módulo de Acceso a Hardware: Geolocalización Satelital (W3C Geolocation API)
 * CivicGuard PWA - UTM Proyecto Integrador 2
 */

export class GeolocationHardware {
  /**
   * Verifica la compatibilidad de la API de Geolocalización
   */
  static esCompatible() {
    return 'geolocation' in navigator;
  }

  /**
   * Adquiere las coordenadas GNSS de alta precisión del operador en campo
   * @param {Object} opcionesConfig
   * @returns {Promise<Object>}
   */
  static capturarCoordenadas(opcionesConfig = {}) {
    return new Promise((resolve, reject) => {
      if (!this.esCompatible()) {
        return reject(new Error('La API de Geolocalización no está disponible en este dispositivo.'));
      }

      const opciones = {
        enableHighAccuracy: true, // Forzar uso del receptor GPS físico
        timeout: opcionesConfig.timeout || 12000, // 12 segundos de tolerancia
        maximumAge: 0 // No usar lecturas previas en caché del sensor
      };

      navigator.geolocation.getCurrentPosition(
        (posicion) => {
          const resultado = {
            latitud: Number(posicion.coords.latitude.toFixed(6)),
            longitud: Number(posicion.coords.longitude.toFixed(6)),
            precision: Number(posicion.coords.accuracy.toFixed(1)), // en metros
            altitud: posicion.coords.altitude ? Number(posicion.coords.altitude.toFixed(1)) : null,
            timestamp: posicion.timestamp,
            fechaLectura: new Date(posicion.timestamp).toLocaleTimeString()
          };
          console.log('[Hardware GPS] 📍 Posicionamiento satelital adquirido:', resultado);
          resolve(resultado);
        },
        (error) => {
          console.warn('[Hardware GPS] ⚠️ Error en adquisición GNSS:', error.message);
          let motivo = 'Fallo en sensor GPS.';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              motivo = 'Permiso de ubicación denegado por el usuario. Habilítalo en la barra del navegador.';
              break;
            case error.POSITION_UNAVAILABLE:
              motivo = 'Señal satelital no disponible (sin vista despejada al cielo).';
              break;
            case error.TIMEOUT:
              motivo = 'Tiempo de espera agotado al consultar satélites GPS.';
              break;
          }
          reject(new Error(motivo));
        },
        opciones
      );
    });
  }

  /**
   * Genera un enlace de mapa (OpenStreetMap) seguro y sin dependencias pesadas
   */
  static generarUrlMapaOSM(lat, lon) {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
  }
}
