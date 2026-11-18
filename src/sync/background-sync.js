/**
 * Orquestador de Background Sync API y Resiliencia de Red
 * CivicGuard PWA - UTM Proyecto Integrador 2
 */

import { dbStore } from '../db/indexed-store.js';

export class BackgroundSyncManager {
  /**
   * Programa la sincronización automática de reportes retenidos
   */
  static async solicitarSincronizacion() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register('sync-civic-reports');
        console.log('[Background Sync] 🔄 Tarea "sync-civic-reports" registrada en Service Worker.');
        return { modo: 'ServiceWorkerSync', exitoso: true };
      } catch (err) {
        console.warn('[Background Sync] ⚠️ No se pudo registrar SyncManager en SW, usando fallback:', err);
      }
    }

    // Fallback: Si el navegador no soporta SyncManager (iOS Safari / Firefox)
    console.log('[Background Sync] 🌐 Usando fallback reactivo a evento "online" de ventana.');
    if (navigator.onLine) {
      this.procesarColaDirecta();
    }
    return { modo: 'FallbackOnline', exitoso: true };
  }

  /**
   * Despacha directamente los elementos retenidos hacia el endpoint REST
   */
  static async procesarColaDirecta(notificarCallback = null) {
    if (!navigator.onLine) {
      console.log('[Background Sync] 🚫 Dispositivo desconectado. Permanecen retenidos en IndexedDB.');
      return { despachados: 0, pendientes: (await dbStore.obtenerColaSync()).length };
    }

    const cola = await dbStore.obtenerColaSync();
    if (cola.length === 0) {
      console.log('[Background Sync] ✨ Cola de sincronización vacía.');
      return { despachados: 0, pendientes: 0 };
    }

    console.log(`[Background Sync] 🚀 Procesando ${cola.length} reporte(s) retenidos...`);
    let exitosos = 0;

    for (const item of cola) {
      try {
        const respuesta = await fetch('/api/reportes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        });

        if (respuesta.ok || respuesta.status === 201) {
          await dbStore.actualizarEstatusReporte(item.idReporte, 'despachado', {
            sincronizadoEn: new Date().toISOString()
          });
          exitosos++;
          console.log(`[Background Sync] ✅ Reporte #${item.idReporte} sincronizado exitosamente con el centro de mando.`);
        }
      } catch (err) {
        console.warn(`[Background Sync] ⚠️ Reintento fallido para reporte #${item.idReporte}:`, err.message);
      }
    }

    if (notificarCallback && exitosos > 0) {
      notificarCallback(exitosos);
    }

    return { despachados: exitosos, pendientes: cola.length - exitosos };
  }
}
