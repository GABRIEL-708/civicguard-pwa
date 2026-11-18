/**
 * Cliente de Integración Supabase Cloud (PostgreSQL Headless)
 * CivicGuard PWA - UTM Proyecto Integrador 2
 */

export const SUPABASE_CONFIG = {
  url: 'https://wjfbcmkgomxoqjtkeaoe.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZmJjbWtnb214b3FqdGtlYW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMTk1OTIsImV4cCI6MjExMDU5NTU5Mn0.LgehF5fvMGQFly0DbKGezDnCI4gZYmod0iiOHRYcTGs'
};

export class SupabaseClient {
  /**
   * Envía un reporte a la tabla 'reportes' de Supabase
   * @param {Object} reporte
   */
  static async enviarReporte(reporte) {
    const payload = {
      id: reporte.id,
      titulo: reporte.titulo,
      categoria: reporte.categoria,
      severidad: reporte.severidad,
      descripcion: reporte.descripcion,
      latitud: reporte.coordenadas ? reporte.coordenadas.latitud : null,
      longitud: reporte.coordenadas ? reporte.coordenadas.longitud : null,
      precision_gps: reporte.coordenadas ? reporte.coordenadas.precision : null,
      foto_data: reporte.evidenciaFotografica ? reporte.evidenciaFotografica.dataUrl : null,
      estatus: 'despachado',
      creado_en: reporte.creadoEn || new Date().toISOString()
    };

    const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/reportes`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error Supabase (${res.status}): ${errText}`);
    }

    return await res.json();
  }

  /**
   * Obtiene todos los reportes desde Supabase
   */
  static async obtenerReportes() {
    const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/reportes?select=*&order=creado_en.desc`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
      }
    });

    if (!res.ok) {
      throw new Error(`Error al consultar Supabase (${res.status})`);
    }

    const data = await res.json();
    // Mapear al formato interno de CivicGuard
    return data.map(item => ({
      id: item.id,
      titulo: item.titulo,
      categoria: item.categoria,
      severidad: item.severidad,
      descripcion: item.descripcion,
      coordenadas: item.latitud ? {
        latitud: item.latitud,
        longitud: item.longitud,
        precision: item.precision_gps || 5.0
      } : null,
      evidenciaFotografica: item.foto_data ? { dataUrl: item.foto_data } : null,
      estatus: item.estatus || 'despachado',
      creadoEn: item.creado_en
    }));
  }

  /**
   * Actualiza el estatus de un reporte en Supabase (ej. resuelto)
   */
  static async actualizarEstatus(id, nuevoEstatus) {
    const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/reportes?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ estatus: nuevoEstatus })
    });

    return res.ok;
  }
}
