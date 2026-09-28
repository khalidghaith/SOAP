/**
 * Local SOAP MCP bridge, for development: mounted on the Vite dev/preview server by vite.config.ts.
 * AI clients use http://localhost:3000/mcp; the SOAP tab connects to /soap-bridge.
 * The hosted app uses the cloud relay instead (relay/), which speaks the same protocol (mcp/core.ts).
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { handleMcpHttp, TabCalls, classifyClient, ClientInfo } from './core';

export const MCP_PATH = '/mcp';
export const BRIDGE_WS_PATH = '/soap-bridge';

export interface HubOptions {
    extraAllowedHosts?: string[]; // e.g. a tunnel hostname (SOAP_MCP_ALLOWED_HOSTS)
    log?: (msg: string) => void;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

export const createHub = (opts: HubOptions = {}) => {
    const log = opts.log || (() => {});
    const allowedHosts = new Set([...LOCAL_HOSTS, ...(opts.extraAllowedHosts || [])].map(h => h.toLowerCase()));
    const sessions = new Map<string, ClientInfo>();
    let tab: WebSocket | null = null;

    // Only this computer (plus explicitly allowed hosts), and no calls from other websites
    const hostOf = (value: string | undefined) => {
        if (!value) return '';
        try { return new URL(value.includes('://') ? value : `http://${value}`).hostname.toLowerCase(); } catch { return ''; }
    };
    const isAllowed = (req: IncomingMessage) => {
        const host = hostOf(req.headers.host);
        if (!allowedHosts.has(host) && !allowedHosts.has(`[${host}]`)) return false;
        const origin = req.headers.origin;
        return !origin || allowedHosts.has(hostOf(origin));
    };

    const send = (msg: unknown) => {
        if (!tab || tab.readyState !== WebSocket.OPEN) return false;
        tab.send(JSON.stringify(msg));
        return true;
    };
    const calls = new TabCalls(send);
    const broadcastSessions = () => send({ type: 'sessions', sessions: [...sessions].map(([id, c]) => ({ id, ...c, kind: classifyClient(c.name) })) });

    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', ws => {
        if (tab && tab !== ws) tab.close(4000, 'Another SOAP tab took over the AI bridge');
        tab = ws;
        log('SOAP tab connected');
        send({ type: 'hello', mode: 'local' });
        broadcastSessions();
        ws.on('message', data => calls.receive(String(data)));
        ws.on('close', () => {
            if (tab !== ws) return;
            tab = null;
            calls.failAll();
            log('SOAP tab disconnected');
        });
    });

    const handleUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (url.pathname !== BRIDGE_WS_PATH) return false;
        if (!isAllowed(req)) { socket.destroy(); return true; }
        wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
        return true;
    };

    const readBody = (req: IncomingMessage): Promise<unknown> => new Promise((resolve, reject) => {
        let data = '';
        req.on('data', c => { data += c; if (data.length > 5_000_000) { reject(new Error('Request too large')); req.destroy(); } });
        req.on('end', () => { try { resolve(data ? JSON.parse(data) : undefined); } catch { resolve(null); } });
        req.on('error', reject);
    });

    const handleHttp = async (req: IncomingMessage, res: ServerResponse) => {
        if (!isAllowed(req)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Forbidden: this bridge only accepts connections from this computer.' } }));
            return;
        }
        try {
            const body = req.method === 'POST' ? await readBody(req) : undefined;
            const out = await handleMcpHttp(req.method || 'GET', req.headers['mcp-session-id'] as string | undefined, body, {
                createSession: async client => {
                    const id = randomUUID();
                    sessions.set(id, client);
                    log(`${client.name} connected (${classifyClient(client.name)})`);
                    broadcastSessions();
                    return id;
                },
                getSession: async id => sessions.get(id) ?? null,
                deleteSession: async id => { if (sessions.delete(id)) broadcastSessions(); },
                callTab: (tool, args, client) => calls.call(tool, args, client),
            });
            res.writeHead(out.status, out.headers);
            res.end(out.body);
        } catch (e) {
            log(`MCP request failed: ${e instanceof Error ? e.message : e}`);
            if (!res.headersSent) { res.writeHead(500); res.end(); }
        }
    };

    return { handleHttp, handleUpgrade, close: () => { calls.failAll(); wss.close(); } };
};
