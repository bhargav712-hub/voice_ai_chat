import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    {
      name: 'serve-ort-wasm',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/wasm/')) {
            const fileName = req.url.replace('/wasm/', '').split('?')[0];
            const filePath = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist', fileName);
            if (fs.existsSync(filePath)) {
              if (fileName.endsWith('.wasm')) {
                res.setHeader('Content-Type', 'application/wasm');
              } else if (fileName.endsWith('.mjs') || fileName.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript');
              }
              return fs.createReadStream(filePath).pipe(res);
            }
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      // Proxy all /api requests to FastAPI during development.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});

