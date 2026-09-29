/**
 * SOAP MCP bridge on this computer: AI clients reach it at /mcp (or over stdio, via addSession/callTab),
 * and the SOAP tab connects to /soap-bridge. Used by the SOAP helper that Claude Desktop starts (mcp/helper.ts)
 * and by the Vite dev/preview server (vite.config.ts, http://localhost:3000/mcp).
 * The cloud relay (relay/) speaks the same protocol (mcp/core.ts).
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { handleMcpHttp, TabCalls, kindOf, ClientInfo, TAB_NOT_CONNECTED } from './core';

export const MCP_PATH = '/mcp';
export const BRIDGE_WS_PATH = '/soap-bridge';

/** Close codes the tab understands (see services/bridgeClient.ts). */
export const CLOSE_REPLACED = 4000;   // another SOAP tab took over
export const CLOSE_UNTRUSTED = 4003;  // this SOAP address isn't the one the helper was made for

export interface HubOptions {
    extraAllowedHosts?: string[]; // e.g. a tunnel hostname (SOAP_MCP_ALLOWED_HOSTS)
    /** Sites (exact origins, e.g. https://soap.example.com) whose SOAP tab may connect, besides pages on this computer. */
    tabOrigins?: string[];
    /** Sent to the tab on connect, e.g. { mode: 'helper', version }. */
    hello?: Record<string, unknown>;
    /** What an AI app is told when no SOAP tab is connected. */
    notConnectedMessage?: string;
    log?: (msg: string) => void;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

export const createHub = (opts: HubOptions = {}) => {
    const log = opts.log || (() => {});
    const allowedHosts = new Set([...LOCAL_HOSTS, ...(opts.extraAllowedHosts || [])].map(h => h.toLowerCase()));
    const tabOrigins = new Set((opts.tabOrigins || []).map(o => o.toLowerCase().replace(/\/+$/, '')));
    const sessions = new Map<string, ClientInfo>();
    let tab: WebSocket | null = null;

    // Only this computer (plus explicitly allowed hosts), and no calls from other websites
    const hostOf = (value: string | undefined) => {
        if (!value) return '';
        try { return new URL(value.includes('://') ? value : `http://${value}`).hostname.toLowerCase(); } catch { return ''; }
    };
    const isAllowedHost = (req: IncomingMessage) => {
        const host = hostOf(req.headers.host);
        return allowedHosts.has(host) || allowedHosts.has(`[${host}]`);
    };
    const isAllowed = (req: IncomingMessage) => {
        if (!isAllowedHost(req)) return false;
        const origin = req.headers.origin;
        return !origin || allowedHosts.has(hostOf(origin));
    };
    // The tab may also come from the SOAP site itself (a public origin talking to this computer)
    const isTabOrigin = (origin: string | undefined) =>
        !!origin && (allowedHosts.has(hostOf(origin)) || tabOrigins.has(origin.toLowerCase()));

    const send = (msg: unknown) => {
        if (!tab || tab.readyState !== WebSocket.OPEN) return false;
        tab.send(JSON.stringify(msg));
        return true;
    };
    const calls = new TabCalls(send, undefined, opts.notConnectedMessage || TAB_NOT_CONNECTED);
    const broadcastSessions = () => send({ type: 'sessions', sessions: [...sessions].map(([id, c]) => ({ id, ...c, kind: kindOf(c) })) });

    const addSession = (client: ClientInfo) => {
        const id = randomUUID();
        sessions.set(id, client);
        log(`${client.name} connected (${kindOf(client)})`);
        broadcastSessions();
        return id;
    };
    const removeSession = (id: string) => { if (sessions.delete(id)) broadcastSessions(); };

    const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
    wss.on('connection', (ws, req: IncomingMessage) => {
        if (!isTabOrigin(req.headers.origin)) {
            // Say why, so SOAP can tell the user to add the helper again from this address
            log(`Refused a SOAP tab from ${req.headers.origin || 'an unknown page'}`);
            ws.close(CLOSE_UNTRUSTED, 'This SOAP address is not trusted by this helper');
            return;
        }
        if (tab && tab !== ws) tab.close(CLOSE_REPLACED, 'Another SOAP tab took over the AI bridge');
        tab = ws;
        log('SOAP tab connected');
        send({ type: 'hello', mode: 'local', ...opts.hello });
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
        if (!isAllowedHost(req)) { socket.destroy(); return true; }
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
                createSession: async client => addSession(client),
                getSession: async id => sessions.get(id) ?? null,
                deleteSession: async id => removeSession(id),
                callTab: (tool, args, client) => calls.call(tool, args, client),
            });
            res.writeHead(out.status, out.headers);
            res.end(out.body);
        } catch (e) {
            log(`MCP request failed: ${e instanceof Error ? e.message : e}`);
            if (!res.headersSent) { res.writeHead(500); res.end(); }
        }
    };

    return {
        handleHttp,
        handleUpgrade,
        addSession,
        removeSession,
        callTab: (tool: string, args: unknown, client: ClientInfo) => calls.call(tool, args, client),
        close: () => { calls.failAll(); tab?.close(); wss.close(); },
    };
};
