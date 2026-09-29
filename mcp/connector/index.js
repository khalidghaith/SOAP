// SOAP connector for Claude Desktop (packed into SOAP.mcpb by SOAP's "Add to Claude" button).
// Passes MCP messages between Claude (newline-delimited JSON on stdin/stdout) and SOAP's relay (HTTPS),
// whose address — including the user's private link — arrives in SOAP_MCP_URL.
// Dependency-free and module-format agnostic (no import/require), so it runs on Claude's built-in Node.

const endpoint = process.env.SOAP_MCP_URL;
let sessionId = null;
let initMessage = null; // replayed if the relay forgets our session
let buffer = '';
let queue = Promise.resolve();

const write = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const log = text => process.stderr.write(`[soap] ${text}\n`);

const post = async (msg, allowRetry = true) => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (sessionId && msg.method !== 'initialize') headers['Mcp-Session-Id'] = sessionId;
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(msg) });
    const sid = res.headers.get('mcp-session-id');
    if (sid) sessionId = sid;

    // Session expired on the relay: start a new one quietly and try again
    if (res.status === 404 && allowRetry && initMessage && msg.method !== 'initialize') {
        sessionId = null;
        await post({ ...initMessage, id: `soap-reinit-${Date.now()}` }, false);
        await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, false);
        return post(msg, false);
    }
    const text = await res.text();
    if (!text || res.status === 202) return;
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`Unexpected reply from SOAP (${res.status})`); }
    for (const reply of Array.isArray(data) ? data : [data]) {
        // Replies to our own re-initialize are internal
        if (typeof reply.id === 'string' && reply.id.startsWith('soap-reinit-')) continue;
        write(reply);
    }
};

const handle = async msg => {
    if (msg.method === 'initialize') initMessage = msg;
    try {
        if (!endpoint) throw new Error('This SOAP connector has no link. In SOAP, click the plug icon and add Claude again.');
        await post(msg);
    } catch (e) {
        log(e && e.message ? e.message : String(e));
        if (msg.id !== undefined && msg.id !== null) {
            write({
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: -32000, message: `Cannot reach SOAP. Check your internet connection and that SOAP is open in your browser. (${e && e.message ? e.message : e})` },
            });
        }
    }
};

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { log('Ignored a line that is not JSON'); continue; }
        // One at a time, so the session is set up before anything else goes out
        queue = queue.then(() => handle(msg));
    }
});
process.stdin.on('end', () => {
    queue.then(async () => {
        if (sessionId && endpoint) {
            try { await fetch(endpoint, { method: 'DELETE', headers: { 'Mcp-Session-Id': sessionId } }); } catch { /* offline */ }
        }
        process.exit(0);
    });
});
