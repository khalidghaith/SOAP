import path from 'path';
import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createHub, MCP_PATH } from './mcp/hub';

// Serves the SOAP MCP bridge (AI clients at /mcp, the SOAP tab at /soap-bridge) from the dev/preview server
const soapMcpBridge = (): Plugin => {
    const mount = (server: ViteDevServer | PreviewServer) => {
        const hub = createHub({
            // Extra hostnames allowed to reach /mcp, e.g. a tunnel for ChatGPT: SOAP_MCP_ALLOWED_HOSTS=abc.trycloudflare.com
            extraAllowedHosts: (process.env.SOAP_MCP_ALLOWED_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean),
            log: msg => server.config.logger.info(`[soap-mcp] ${msg}`, { timestamp: true }),
        });
        // Exactly /mcp — not the mcp/ source folder the app itself imports from
        server.middlewares.use(MCP_PATH, (req, res, next) => {
            const rest = req.url || '/';
            if (rest !== '/' && !rest.startsWith('/?')) return next();
            hub.handleHttp(req, res);
        });
        server.httpServer?.on('upgrade', (req, socket, head) => { hub.handleUpgrade(req, socket, head); });
    };
    return { name: 'soap-mcp-bridge', configureServer: mount, configurePreviewServer: mount };
};

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      preview: {
        port: 3000,
      },
      plugins: [react(), soapMcpBridge()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
