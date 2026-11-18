import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5173;
const HOST = '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8'
};

// Base de datos en memoria para el servidor Mock
let reportesServidor = [];

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Habilitar CORS para pruebas con ngrok o dominios externos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API REST ENDPOINTS ---
  if (pathname.startsWith('/api/')) {
    // Endpoint para recibir reportes sincronizados
    if (pathname === '/api/reportes' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const nuevoReporte = JSON.parse(body);
          nuevoReporte.servidorRecibidoEn = new Date().toISOString();
          nuevoReporte.estatus = 'despachado';
          reportesServidor.push(nuevoReporte);

          console.log(`[API MOCK] 📥 Reporte recibido en servidor: #${nuevoReporte.id} - ${nuevoReporte.titulo}`);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            mensaje: 'Reporte cívico sincronizado exitosamente con el centro de mando.',
            reporte: nuevoReporte
          }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload JSON inválido' }));
        }
      });
      return;
    }

    // Endpoint para consultar reportes en el servidor
    if (pathname === '/api/reportes' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reportes: reportesServidor }));
      return;
    }

    // Endpoint para simular resolución de incidencia (Disparador de Notificación)
    if (pathname.startsWith('/api/reportes/resolver/') && req.method === 'POST') {
      const id = pathname.split('/').pop();
      const rep = reportesServidor.find(r => r.id === id);
      if (rep) {
        rep.estatus = 'resuelto';
        rep.resueltoEn = new Date().toISOString();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, mensaje: `Reporte ${id} marcado como resuelto.` }));
      return;
    }
  }

  // --- SERVIDO DE ARCHIVOS ESTÁTICOS ---
  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.join(__dirname, pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback para SPA o archivo no encontrado
      if (path.extname(pathname) === '') {
        const fallbackIndex = path.join(__dirname, 'index.html');
        return servirArchivo(fallbackIndex, res, '.html');
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found - Recurso no encontrado en CivicGuard PWA');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    servirArchivo(filePath, res, ext);
  });
});

function servirArchivo(filePath, res, ext) {
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  // Supresión estricta de cachés HTTP clásicas en desarrollo y para sw.js / index.html
  // según la directriz del Reporte de Configuración de Entorno de la Semana 1
  const esRecursoCriticoSW = filePath.endsWith('sw.js') || filePath.endsWith('manifest.json') || filePath.endsWith('index.html');

  if (esRecursoCriticoSW) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else {
    // Assets estáticos con revalidación
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }

  res.setHeader('Content-Type', contentType);

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Error interno al leer archivo');
  });
  stream.pipe(res);
}

server.listen(PORT, HOST, () => {
  console.log(`\n============================================================`);
  console.log(`🛡️  CivicGuard PWA - Servidor Local Seguro Inicializado`);
  console.log(`============================================================`);
  console.log(`📍 Loopback Local:    http://localhost:${PORT}`);
  console.log(`🌐 Red Local (LAN):   http://${HOST}:${PORT}`);
  console.log(`⚙️  Contexto Seguro:   Validado para localhost y túneles HTTPS`);
  console.log(`🚫 Supresión Caché:   Cabeceras no-store activas para sw.js e index.html`);
  console.log(`📡 API Mock:          http://localhost:${PORT}/api/reportes`);
  console.log(`============================================================\n`);
});
