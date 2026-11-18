/**
 * Orquestador de Background Sync API y Resiliencia de Red
 * CivicGuard PWA - UTM Proyecto Integrador 2
 */

import { dbStore } from '../db/indexed-store.js';
import { SupabaseClient } from '../db/supabase-client.js';

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
    if (navigator.onLine) {
      this.procesarColaDirecta();
    }
    return { modo: 'FallbackOnline', exitoso: true };
  }

  /**
   * Despacha directamente los elementos retenidos hacia Supabase Cloud
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

    console.log(`[Background Sync] 🚀 Despachando ${cola.length} reporte(s) hacia Supabase Cloud...`);
    let exitosos = 0;

    for (const item of cola) {
      try {
        // 1. Obtener reporte completo de IndexedDB (incluyendo foto si tiene)
        const reporteCompleto = await dbStore.obtenerReportePorId(item.idReporte) || item.payload;

        // 2. Enviar a Supabase PostgreSQL
        await SupabaseClient.enviarReporte(reporteCompleto);

        // 3. Marcar como despachado en IndexedDB local
        await dbStore.actualizarEstatusReporte(item.idReporte, 'despachado', {
          sincronizadoEn: new Date().toISOString()
        });
        exitosos++;
        console.log(`[Background Sync] ☁️ Reporte #${item.idReporte} persistido exitosamente en Supabase.`);

      } catch (err) {
        console.warn(`[Background Sync] ⚠️ Falló sincronización a Supabase para #${item.idReporte}:`, err.message);
        
        // Fallback al endpoint mock local si Supabase diera error temporal
        try {
          const resLocal = await fetch('/api/reportes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload)
          });
          if (resLocal.ok) {
            await dbStore.actualizarEstatusReporte(item.idReporte, 'despachado');
            exitosos++;
          }
        } catch (e2) {
          // Permanecer en cola para el próximo reintento
        }
      }
    }

    if (notificarCallback && exitosos > 0) {
      notificarCallback(exitosos);
    }

    return { despachados: exitosos, pendientes: cola.length - exitosos };
  }
}
