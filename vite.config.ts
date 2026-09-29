import path from 'path';
import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createHub, MCP_PATH } from './mcp/hub';
import { buildHelper } from './mcp/buildHelper';

// `import helperSource from 'virtual:soap-helper'`: the SOAP helper bundled into one script (mcp/buildHelper.ts)
const soapHelperSource = (): Plugin => {
    const id = 'virtual:soap-helper';
    const resolved = '\0' + id;
    return {
        name: 'soap-helper-source',
        resolveId: source => (source === id ? resolved : undefined),
        async load(loadId) {
            if (loadId !== resolved) return;
            const { source, inputs } = await buildHelper();
            inputs.forEach(f => this.addWatchFile(f));
            return `export default ${JSON.stringify(source)};`;
        },
    };
};

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
        port: Number(process.env.PORT) || 3000,
        host: '0.0.0.0',
      },
      preview: {
        port: Number(process.env.PORT) || 3000,
      },
      plugins: [react(), soapMcpBridge(), soapHelperSource()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
