/**
 * The SOAP helper. "Add to Claude" packs it into SOAP.mcpb (bundled to one file by vite.config.ts), and Claude
 * Desktop starts it with its built-in Node.js. It talks MCP with Claude over stdio and waits on this computer
 * (127.0.0.1:HELPER_PORT) for the SOAP tab, so even the hosted SOAP needs no server of its own.
 *
 * Only one helper can listen at a time. Another one (Claude restarting, or a second AI app) forwards its tool
 * calls to the listening helper over HTTP (/mcp) and takes over the port when that one exits.
 *
 * Environment: SOAP_ORIGINS — comma-separated SOAP sites whose tab may connect (baked in by SOAP);
 * SOAP_HELPER_PORT — another port (tests).
 */
import http from 'node:http';
import { createHub, MCP_PATH } from './hub';
import { HELPER_PORT, SERVER_INFO, initializeResult, clientOf, handleRpc, Rpc, ClientInfo } from './core';

const port = Number(process.env.SOAP_HELPER_PORT) || HELPER_PORT;
const origins = (process.env.SOAP_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const site = origins.find(o => !/\/\/(localhost|127\.0\.0\.1)(:|$)/.test(o)) || origins[0];
const hostUrl = `http://127.0.0.1:${port}${MCP_PATH}`;

const log = (text: string) => { process.stderr.write(`[soap] ${text}\n`); };
const write = (msg: unknown) => { process.stdout.write(JSON.stringify(msg) + '\n'); };

const hub = createHub({
    tabOrigins: origins,
    hello: { mode: 'helper', version: SERVER_INFO.version },
    notConnectedMessage:
        `SOAP isn't open. Ask the user to open SOAP${site ? ` (${site})` : ''} in their browser with AI access on (plug icon in the toolbar); ` +
        'it connects by itself within a few seconds. Then try again.',
    log,
});

let client: ClientInfo | null = null;  // the app on the other end of stdio, once it has initialized
let initMessage: Rpc | null = null;
let hosting = false;
let server: http.Server | null = null;
let localSession: string | null = null; // our app, as shown in SOAP while we host
let peerSession: string | null = null;  // our app's session on the listening helper, while we don't

// --- Listening for the SOAP tab (and for other helpers) ---

const tryHost = () => new Promise<boolean>(resolve => {
    if (hosting) return resolve(true);
    const s = http.createServer((req, res) => {
        if (new URL(req.url || '/', 'http://localhost').pathname === MCP_PATH) return void hub.handleHttp(req, res);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('SOAP helper');
    });
    s.on('upgrade', (req, socket, head) => { if (!hub.handleUpgrade(req, socket, head)) socket.destroy(); });
    s.once('error', () => { s.close(); resolve(false); }); // in use: another helper is listening
    s.listen(port, '127.0.0.1', () => {
        s.removeAllListeners('error');
        s.on('error', e => log(`Server error: ${e.message}`));
        server = s;
        hosting = true;
        if (client) localSession = hub.addSession(client);
        log(`Waiting for SOAP on 127.0.0.1:${port}`);
        resolve(true);
    });
});

// Keep trying, so a helper is always listening while any AI app runs
const hostTimer = setInterval(() => { if (!hosting) tryHost(); }, 3000);
const ready = tryHost().then(ok => { if (!ok) log(`Another SOAP helper is listening on port ${port}; sharing it.`); });

// --- Forwarding tool calls to the listening helper ---

const postToHost = async (msg: Rpc): Promise<{ status: number; data: any }> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (peerSession && msg.method !== 'initialize') headers['Mcp-Session-Id'] = peerSession;
    const res = await fetch(hostUrl, { method: 'POST', headers, body: JSON.stringify(msg) });
    const sid = res.headers.get('mcp-session-id');
    if (sid) peerSession = sid;
    const text = await res.text();
    let data: any = null;
    if (text) { try { data = JSON.parse(text); } catch { throw new Error(`Port ${port} is used by another program.`); } }
    return { status: res.status, data };
};

const forward = async (msg: Rpc, retry = true): Promise<unknown> => {
    if (!peerSession) {
        await postToHost({ ...(initMessage || { params: { clientInfo: client } }), jsonrpc: '2.0', method: 'initialize', id: 'soap-peer-init' });
        await postToHost({ jsonrpc: '2.0', method: 'notifications/initialized' });
    }
    const { status, data } = await postToHost(msg);
    // The listening helper restarted and forgot us
    if (status === 404 && retry) { peerSession = null; return forward(msg, false); }
    return data;
};

// --- MCP over stdio ---

const handle = async (msg: Rpc) => {
    if (msg.method === 'initialize') {
        initMessage = msg;
        client = clientOf(msg);
        if (hosting && !localSession) localSession = hub.addSession(client);
        write(initializeResult(msg));
        return;
    }
    if (!msg.method || msg.id === undefined || msg.id === null) return; // notifications and replies
    const who = client || { name: 'unknown', version: '' };
    await ready;
    if (msg.method === 'tools/call' && !hosting) {
        try {
            write(await forward(msg));
            return;
        } catch {
            // The listening helper went away: take over if we can
            peerSession = null;
            if (!(await tryHost())) {
                write({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `Cannot reach the SOAP helper on port ${port}. Try again in a few seconds.` }], isError: true } });
                return;
            }
        }
    }
    write(await handleRpc(msg, who, { callTab: hub.callTab }));
};

let buffer = '';
let queue = Promise.resolve();
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg: Rpc;
        try { msg = JSON.parse(line); } catch { log('Ignored a line that is not JSON'); continue; }
        // One at a time, like SOAP applies them
        queue = queue.then(() => handle(msg)).catch(e => log(e instanceof Error ? e.message : String(e)));
    }
});
process.stdin.on('end', () => {
    queue.then(async () => {
        clearInterval(hostTimer);
        if (peerSession) {
            try { await fetch(hostUrl, { method: 'DELETE', headers: { 'Mcp-Session-Id': peerSession } }); } catch { /* gone */ }
        }
        hub.close();
        server?.close();
        process.exit(0);
    });
});
