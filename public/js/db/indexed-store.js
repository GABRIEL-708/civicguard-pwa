/**
 * Módulo de Persistencia Asíncrona Transaccional IndexedDB
 * CivicGuard PWA - UTM Proyecto Integrador 2
 * 
 * NOTA DE CONFORMIDAD ARQUITECTÓNICA:
 * Queda estrictamente PROHIBIDO el uso de APIs síncronas bloqueantes como `localStorage`.
 * Toda persistencia se ejecuta asíncronamente en IndexedDB sin impacto en el UI Thread.
 */

const DB_NAME = 'CivicGuardDB';
const DB_VERSION = 1;

class IndexedStore {
  constructor() {
    this.db = null;
    this._initPromise = null;
  }

  /**
   * Abre o crea la base de datos IndexedDB
   */
  async init() {
    if (this.db) return this.db;
    if (this._initPromise) return this._initPromise;

    this._initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('[IndexedDB] 🛠️ Creando/actualizando esquema de CivicGuardDB v' + DB_VERSION);

        // Store 1: Reportes de incidencias
        if (!db.objectStoreNames.contains('reportes')) {
          const store = db.createObjectStore('reportes', { keyPath: 'id' });
          store.createIndex('categoria', 'categoria', { unique: false });
          store.createIndex('estatus', 'estatus', { unique: false });
          store.createIndex('creadoEn', 'creadoEn', { unique: false });
          store.createIndex('severidad', 'severidad', { unique: false });
        }

        // Store 2: Cola de Background Sync
        if (!db.objectStoreNames.contains('cola_sincronizacion')) {
          const syncStore = db.createObjectStore('cola_sincronizacion', { keyPath: 'idReporte' });
          syncStore.createIndex('intentos', 'intentos', { unique: false });
          syncStore.createIndex('creadoEn', 'creadoEn', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('[IndexedDB] ✅ Conexión establecida exitosamente con CivicGuardDB.');
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('[IndexedDB] ❌ Error fatal al abrir base de datos:', event.target.error);
        reject(event.target.error);
      };
    });

    await this._initPromise;
    await this._sembrarDatosInicialesSiAplica();
    return this.db;
  }

  /**
   * Guarda un nuevo reporte de incidencia en IndexedDB
   * @param {Object} reporte 
   */
  async guardarReporte(reporte) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['reportes', 'cola_sincronizacion'], 'readwrite');
      const storeReportes = tx.objectStore('reportes');
      const storeSync = tx.objectStore('cola_sincronizacion');

      // Garantizar timestamp y estatus
      if (!reporte.id) reporte.id = 'REP-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();
      if (!reporte.creadoEn) reporte.creadoEn = new Date().toISOString();
      if (!reporte.estatus) reporte.estatus = 'local_retenido'; // Operación Offline-First

      storeReportes.put(reporte);

      // Si aún no está sincronizado, encolar para el Service Worker
      if (reporte.estatus === 'local_retenido') {
        storeSync.put({
          idReporte: reporte.id,
          intentos: 0,
          creadoEn: reporte.creadoEn,
          payload: {
            id: reporte.id,
            titulo: reporte.titulo,
            categoria: reporte.categoria,
            descripcion: reporte.descripcion,
            severidad: reporte.severidad,
            coordenadas: reporte.coordenadas,
            creadoEn: reporte.creadoEn
          }
        });
      }

      tx.oncomplete = () => {
        console.log(`[IndexedDB] 💾 Reporte #${reporte.id} retenido exitosamente en disco local.`);
        resolve(reporte);
      };

      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene todos los reportes ordenados de más reciente a más antiguo
   */
  async obtenerReportes() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reportes', 'readonly');
      const store = tx.objectStore('reportes');
      const request = store.getAll();

      request.onsuccess = () => {
        const reportes = request.result || [];
        // Orden descendente por fecha
        reportes.sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn));
        resolve(reportes);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene un reporte específico por su ID
   */
  async obtenerReportePorId(id) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reportes', 'readonly');
      const store = tx.objectStore('reportes');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Actualiza el estatus de un reporte (ej. local_retenido -> despachado -> resuelto)
   */
  async actualizarEstatusReporte(id, nuevoEstatus, extra = {}) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['reportes', 'cola_sincronizacion'], 'readwrite');
      const store = tx.objectStore('reportes');
      const syncStore = tx.objectStore('cola_sincronizacion');

      const req = store.get(id);
      req.onsuccess = () => {
        const rep = req.result;
        if (!rep) return reject(new Error('Reporte no encontrado: ' + id));

        rep.estatus = nuevoEstatus;
        Object.assign(rep, extra);
        store.put(rep);

        // Si ya fue despachado o resuelto, se retira de la cola de sync pendiente
        if (nuevoEstatus === 'despachado' || nuevoEstatus === 'resuelto') {
          syncStore.delete(id);
        }

        tx.oncomplete = () => resolve(rep);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene la lista de elementos en la cola de Background Sync
   */
  async obtenerColaSync() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cola_sincronizacion', 'readonly');
      const store = tx.objectStore('cola_sincronizacion');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene estadísticas agregadas de la persistencia local
   */
  async obtenerMetricas() {
    const reportes = await this.obtenerReportes();
    const pendientes = reportes.filter(r => r.estatus === 'local_retenido').length;
    const sincronizados = reportes.filter(r => r.estatus === 'despachado').length;
    const resueltos = reportes.filter(r => r.estatus === 'resuelto').length;

    return {
      total: reportes.length,
      pendientes,
      sincronizados,
      resueltos
    };
  }

  /**
   * Sembrado inicial para demostración de entrega académica UTM
   */
  async _sembrarDatosInicialesSiAplica() {
    const tx = this.db.transaction('reportes', 'readonly');
    const store = tx.objectStore('reportes');
    const countReq = store.count();

    countReq.onsuccess = () => {
      if (countReq.result === 0) {
        console.log('[IndexedDB] 🌱 Sembrando datos cívicos de demostración para evaluación UTM...');
        const writeTx = this.db.transaction(['reportes', 'cola_sincronizacion'], 'readwrite');
        const rStore = writeTx.objectStore('reportes');

        const semillas = [
          {
            id: 'REP-UTM-001',
            titulo: 'Bache profundo en carril derecho de Av. Circuito Colonias',
            categoria: 'bacheo',
            severidad: 'alta',
            descripcion: 'Diámetro aproximado de 1.2m, pone en riesgo el paso de motocicletas y transporte público.',
            coordenadas: {
              latitud: 20.9385,
              longitud: -89.6247,
              precision: 4.8
            },
            estatus: 'despachado',
            creadoEn: new Date(Date.now() - 86400000 * 2).toISOString(),
            sincronizadoEn: new Date(Date.now() - 86400000 * 2 + 15000).toISOString(),
            evidenciaFotografica: null
          },
          {
            id: 'REP-UTM-002',
            titulo: 'Fuga de agua potable frente al Campus UTM',
            categoria: 'fuga_agua',
            severidad: 'critica',
            descripcion: 'Presión constante brotando del pavimento. Se genera encharcamiento en entrada peatonal.',
            coordenadas: {
              latitud: 20.9254,
              longitud: -89.6178,
              precision: 3.2
            },
            estatus: 'resuelto',
            creadoEn: new Date(Date.now() - 86400000).toISOString(),
            sincronizadoEn: new Date(Date.now() - 86400000 + 10000).toISOString(),
            resueltoEn: new Date(Date.now() - 3600000 * 5).toISOString(),
            evidenciaFotografica: null
          },
          {
            id: 'REP-UTM-003',
            titulo: 'Luminaria intermitente y cable expuesto en parque central',
            categoria: 'luminarias',
            severidad: 'media',
            descripcion: 'Poste metálico presenta chisporroteo durante la noche, zona oscura para transeúntes.',
            coordenadas: {
              latitud: 20.9410,
              longitud: -89.6290,
              precision: 6.1
            },
            estatus: 'local_retenido',
            creadoEn: new Date().toISOString(),
            sincronizadoEn: null,
            evidenciaFotografica: null
          }
        ];

        for (const sem of semillas) {
          rStore.put(sem);
        }
      }
    };
  }
}

export const dbStore = new IndexedStore();
