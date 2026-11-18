/**
 * Módulo de Acceso a Hardware: Cámara y Evidencia Fotográfica
 * (MediaDevices API, getUserMedia y HTML5 Canvas Compression)
 * CivicGuard PWA - UTM Proyecto Integrador 2
 */

export class CameraHardware {
  constructor() {
    this.stream = null;
    this.videoElement = null;
    this.canvasElement = null;
    this.facingMode = 'environment'; // Cámara trasera por defecto para incidencias urbanas
  }

  /**
   * Verifica compatibilidad de la API de Cámara
   */
  static esCompatible() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Inicia el visor de cámara en vivo sobre un elemento <video>
   * @param {HTMLVideoElement} videoElem 
   */
  async iniciarVisor(videoElem) {
    if (!CameraHardware.esCompatible()) {
      throw new Error('La API MediaDevices/getUserMedia no es compatible en este navegador.');
    }

    this.detenerVisor(); // Detener flujo previo si existe
    this.videoElement = videoElem;

    const constraints = {
      video: {
        facingMode: this.facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      console.log('[Hardware Cámara] 📸 Visor de video activo en modo:', this.facingMode);
      return true;
    } catch (err) {
      console.error('[Hardware Cámara] ❌ Error al solicitar stream de video:', err);
      throw new Error('No se pudo acceder a la cámara: ' + (err.message || 'Permiso denegado'));
    }
  }

  /**
   * Alterna entre cámara trasera y cámara frontal
   */
  async alternarCamara() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    if (this.videoElement) {
      return await this.iniciarVisor(this.videoElement);
    }
  }

  /**
   * Captura una instantánea del video actual y la comprime a WebP
   * @returns {Object} { dataUrl, tamanioBytes, dimensiones }
   */
  capturarInstantanea() {
    if (!this.stream || !this.videoElement) {
      throw new Error('El visor de cámara no está activo.');
    }

    const video = this.videoElement;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    // Compresión WebP al 80% (o JPEG como fallback nativo)
    let dataUrl = canvas.toDataURL('image/webp', 0.8);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    }

    // Cálculo aproximado de peso en bytes del Base64
    const tamanioBytes = Math.round((dataUrl.length * 3) / 4);

    console.log(`[Hardware Cámara] 🖼️ Evidencia capturada: ${width}x${height} px, ${(tamanioBytes / 1024).toFixed(1)} KB`);

    return {
      dataUrl,
      tamanioBytes,
      tamanioKB: (tamanioBytes / 1024).toFixed(1),
      dimensiones: `${width}x${height}`,
      timestamp: Date.now()
    };
  }

  /**
   * Detiene el flujo de la cámara y libera el hardware físico
   */
  detenerVisor() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      console.log('[Hardware Cámara] 🛑 Hardware de video liberado.');
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  /**
   * Procesa una fotografía seleccionada mediante archivo/fallback
   * @param {File} file 
   * @returns {Promise<Object>}
   */
  static procesarArchivoImagen(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_WIDTH = 1280;
          const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          let dataUrl = canvas.toDataURL('image/webp', 0.8);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          }

          const tamanioBytes = Math.round((dataUrl.length * 3) / 4);
          resolve({
            dataUrl,
            tamanioBytes,
            tamanioKB: (tamanioBytes / 1024).toFixed(1),
            dimensiones: `${canvas.width}x${canvas.height}`,
            timestamp: Date.now()
          });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
