// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { buildHelper } from './buildHelper';
import { TOOLS } from './core';

// Runs the bundled helper the way Claude Desktop does (node + stdio) against a fake SOAP tab

const SITE = 'https://soap.example.com';
const PORT = 47000 + Math.floor(Math.random() * 900);
let dir = '';
let script = '';

beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'soap-helper-'));
    script = path.join(dir, 'index.js');
    writeFileSync(script, (await buildHelper()).source);
}, 30000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const until = async <T>(fn: () => T | undefined | false, ms = 8000): Promise<T> => {
    const end = Date.now() + ms;
    for (;;) {
        const v = fn();
        if (v) return v;
        if (Date.now() > end) throw new Error('Timed out');
        await new Promise(r => setTimeout(r, 25));
    }
};

class Helper {
    proc: ChildProcessWithoutNullStreams;
    replies = new Map<unknown, any>();
    stderr = '';
    private buf = '';
    private seq = 0;
    constructor(name = 'claude-ai') {
        this.proc = spawn(process.execPath, [script], { env: { ...process.env, SOAP_HELPER_PORT: String(PORT), SOAP_ORIGINS: SITE } });
        this.proc.stdout.setEncoding('utf8');
        this.proc.stdout.on('data', (c: string) => {
            this.buf += c;
            let nl;
            while ((nl = this.buf.indexOf('\n')) >= 0) {
                const msg = JSON.parse(this.buf.slice(0, nl));
                this.buf = this.buf.slice(nl + 1);
                this.replies.set(msg.id, msg);
            }
        });
        this.proc.stderr.on('data', c => { this.stderr += c; });
        this.send({ jsonrpc: '2.0', id: 'init', method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name, version: '1' }, capabilities: {} } });
        this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    }
    send(msg: object) { this.proc.stdin.write(JSON.stringify(msg) + '\n'); }
    async request(method: string, params?: object) {
        const id = ++this.seq;
        this.send({ jsonrpc: '2.0', id, method, params });
        return until(() => this.replies.get(id));
    }
    callTool(name: string, args: object = {}) { return this.request('tools/call', { name, arguments: args }); }
    stop() {
        return new Promise<void>(resolve => {
            if (this.proc.exitCode !== null) return resolve();
            this.proc.on('exit', () => resolve());
            this.proc.stdin.end();
        });
    }
}

// A SOAP tab: answers get_project with the calling app's name
class Tab {
    ws: WebSocket;
    messages: any[] = [];
    closeCode: number | null = null;
    constructor(origin = SITE) {
        this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/soap-bridge`, { origin });
        this.ws.on('message', data => {
            const msg = JSON.parse(String(data));
            this.messages.push(msg);
            if (msg.type === 'call') this.ws.send(JSON.stringify({ type: 'result', id: msg.id, ok: true, result: { project: 'Test', caller: msg.client.name } }));
        });
        this.ws.on('close', code => { this.closeCode = code; });
        this.ws.on('error', () => {});
    }
    last(type: string) { return [...this.messages].reverse().find(m => m.type === type); }
}

const running: Helper[] = [];
const tabs: Tab[] = [];
const helper = (name?: string) => { const h = new Helper(name); running.push(h); return h; };
const tab = (origin?: string) => { const t = new Tab(origin); tabs.push(t); return t; };
const listening = (h: Helper) => until(() => h.stderr.includes('Waiting for SOAP'));
afterEach(async () => {
    tabs.splice(0).forEach(t => t.ws.close());
    await Promise.all(running.splice(0).map(h => h.stop()));
});

describe('SOAP helper', () => {
    it('answers the MCP handshake and tool list without SOAP open', async () => {
        const h = helper();
        const init = await until(() => h.replies.get('init'));
        expect(init.result.serverInfo.name).toBe('soap');
        const list = await h.request('tools/list');
        expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(TOOLS.map(t => t.name));
        const call = await h.callTool('get_project');
        expect(call.result.isError).toBe(true);
        expect(call.result.content[0].text).toContain(SITE);
    }, 15000);

    it('relays tool calls to the SOAP tab', async () => {
        const h = helper();
        await listening(h);
        const t = tab();
        await until(() => t.last('hello'));
        expect(t.last('hello')).toMatchObject({ mode: 'helper' });
        await until(() => t.last('sessions')?.sessions.length === 1);
        expect(t.last('sessions').sessions[0]).toMatchObject({ name: 'claude-ai', kind: 'claude' });
        const call = await h.callTool('get_project');
        expect(JSON.parse(call.result.content[0].text)).toEqual({ project: 'Test', caller: 'claude-ai' });
        const bad = await h.callTool('place_spaces', { placements: [] });
        expect(bad.result.content[0].text).toContain('Invalid arguments');
    }, 15000);

    it('refuses a tab from another website', async () => {
        const h = helper();
        await listening(h);
        const t = tab('https://evil.example.com');
        await until(() => t.closeCode);
        expect(t.closeCode).toBe(4003);
        expect(t.messages).toEqual([]);
    }, 15000);

    it('refuses MCP requests from web pages', async () => {
        const h = helper();
        await listening(h);
        const res = await fetch(`http://127.0.0.1:${PORT}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: '{}' });
        expect(res.status).toBe(403);
    }, 15000);

    it('shares one port between two apps and hands over when the first quits', async () => {
        const first = helper('claude-ai');
        await listening(first);
        const second = helper('codex-mcp-client');
        await until(() => second.stderr.includes('sharing it'));
        const t = tab();
        await until(() => t.last('hello'));

        const viaSecond = await second.callTool('get_project');
        expect(JSON.parse(viaSecond.result.content[0].text).caller).toBe('codex-mcp-client');
        expect(t.last('sessions').sessions.map((s: { kind: string }) => s.kind).sort()).toEqual(['chatgpt', 'claude']);

        // Claude quits: the second helper takes the port and the tab reconnects to it
        await first.stop();
        await listening(second);
        const t2 = tab();
        await until(() => t2.last('sessions')?.sessions.length === 1);
        const after = await second.callTool('get_project');
        expect(JSON.parse(after.result.content[0].text).caller).toBe('codex-mcp-client');
    }, 20000);
});
