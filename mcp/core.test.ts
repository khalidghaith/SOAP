import { describe, it, expect, vi } from 'vitest';
import { handleMcpHttp, validate, TabCalls, TOOLS, McpContext, ClientInfo, TAB_NOT_CONNECTED } from './core';
import { checkProject, PLANNING_RULES } from '../utils/bridgeCommands';
import { FLOORS, ZONE_COLORS } from '../types';

const makeCtx = (callTab: McpContext['callTab'] = async () => ({ ok: true })) => {
    const sessions = new Map<string, ClientInfo>();
    let n = 0;
    const ctx: McpContext = {
        createSession: async c => { const id = `s${++n}`; sessions.set(id, c); return id; },
        getSession: async id => sessions.get(id) ?? null,
        deleteSession: async id => { sessions.delete(id); },
        callTab: vi.fn(callTab),
    };
    return { ctx, sessions };
};
const init = (version = '2025-06-18') => ({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 'claude-ai', version: '1.2' } } });
const parse = (r: { body?: string }) => JSON.parse(r.body!);

describe('handleMcpHttp', () => {
    it('initializes a session and negotiates the protocol version', async () => {
        const { ctx, sessions } = makeCtx();
        const r = await handleMcpHttp('POST', undefined, init(), ctx);
        expect(r.status).toBe(200);
        expect(r.headers['Mcp-Session-Id']).toBe('s1');
        expect(parse(r).result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'soap' }, capabilities: { tools: {} } });
        expect(sessions.get('s1')).toEqual({ name: 'claude-ai', version: '1.2' });
        const old = await handleMcpHttp('POST', undefined, init('1999-01-01'), ctx);
        expect(parse(old).result.protocolVersion).toBe('2025-06-18');
    });

    it('requires a valid session for everything else', async () => {
        const { ctx } = makeCtx();
        expect((await handleMcpHttp('POST', undefined, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx)).status).toBe(400);
        expect((await handleMcpHttp('POST', 'nope', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx)).status).toBe(404);
    });

    it('lists tools and accepts notifications', async () => {
        const { ctx } = makeCtx();
        await handleMcpHttp('POST', undefined, init(), ctx);
        expect((await handleMcpHttp('POST', 's1', { jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)).status).toBe(202);
        const list = parse(await handleMcpHttp('POST', 's1', { jsonrpc: '2.0', id: 3, method: 'tools/list' }, ctx));
        expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(TOOLS.map(t => t.name));
        expect(list.result.tools[0]).toHaveProperty('inputSchema');
    });

    it('relays tool calls to the tab with the client identity', async () => {
        const { ctx } = makeCtx(async () => ({ placed: 1 }));
        await handleMcpHttp('POST', undefined, init(), ctx);
        const call = { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'place_spaces', arguments: { placements: [{ id: 'a', floor: 0, x: 0, y: 0, width: 4, height: 3 }] } } };
        const r = parse(await handleMcpHttp('POST', 's1', call, ctx));
        expect(r.result.content[0].text).toContain('"placed": 1');
        expect(ctx.callTab).toHaveBeenCalledWith('place_spaces', call.params.arguments, { name: 'claude-ai', version: '1.2' });
    });

    it('returns bad arguments and tab errors as tool errors the AI can read', async () => {
        const { ctx } = makeCtx(async () => { throw new Error('The Claude bridge is switched off in SOAP.'); });
        await handleMcpHttp('POST', undefined, init(), ctx);
        const bad = parse(await handleMcpHttp('POST', 's1', { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'place_spaces', arguments: { placements: [{ id: 'a', floor: 0.5, x: 0, y: 0, width: 4, height: 3 }] } } }, ctx));
        expect(bad.result).toMatchObject({ isError: true });
        expect(bad.result.content[0].text).toContain('placements[0].floor must be integer');
        expect(ctx.callTab).not.toHaveBeenCalled();
        const off = parse(await handleMcpHttp('POST', 's1', { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_project' } }, ctx));
        expect(off.result).toEqual({ content: [{ type: 'text', text: 'The Claude bridge is switched off in SOAP.' }], isError: true });
        const unknown = parse(await handleMcpHttp('POST', 's1', { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'rm_rf' } }, ctx));
        expect(unknown.error.code).toBe(-32602);
    });

    it('returns plan images as MCP image content', async () => {
        const { ctx } = makeCtx(async () => ({ image: 'iVBOR', mimeType: 'image/png', floor: 0 }));
        await handleMcpHttp('POST', undefined, init(), ctx);
        const r = parse(await handleMcpHttp('POST', 's1', { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'get_plan_image', arguments: {} } }, ctx));
        expect(r.result.content).toEqual([{ type: 'image', data: 'iVBOR', mimeType: 'image/png' }, { type: 'text', text: '{"floor":0}' }]);
    });

    it('handles batches, DELETE and GET', async () => {
        const { ctx, sessions } = makeCtx();
        await handleMcpHttp('POST', undefined, init(), ctx);
        const batch = parse(await handleMcpHttp('POST', 's1', [{ jsonrpc: '2.0', id: 9, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/x' }], ctx));
        expect(batch).toEqual([{ jsonrpc: '2.0', id: 9, result: {} }]);
        expect((await handleMcpHttp('GET', 's1', undefined, ctx)).status).toBe(405);
        expect((await handleMcpHttp('DELETE', 's1', undefined, ctx)).status).toBe(200);
        expect(sessions.size).toBe(0);
    });
});

describe('validate', () => {
    const schema = TOOLS.find(t => t.name === 'set_site')!.inputSchema;
    it('accepts valid input and names the first problem', () => {
        expect(validate(schema, { boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], constraints: { edgeSetbacks: [2, null, 3] } })).toBeNull();
        expect(validate(schema, { boundary: [{ x: 0, y: 0 }] })).toBe('arguments.boundary needs at least 3 item(s)');
        expect(validate(schema, { constraints: { maxFAR: 0 } })).toBe('arguments.constraints.maxFAR must be greater than 0');
        expect(validate(schema, { colour: 'red' })).toBe('arguments.colour is not a known field');
    });
});

describe('TabCalls', () => {
    it('matches results to calls and tags the client kind', async () => {
        const sent: any[] = [];
        const calls = new TabCalls(m => { sent.push(m); return true; });
        const p = calls.call('get_project', {}, { name: 'gemini-cli-mcp-client', version: '1' });
        expect(sent[0]).toMatchObject({ type: 'call', tool: 'get_project', client: { kind: 'gemini' } });
        calls.receive(JSON.stringify({ type: 'result', id: sent[0].id, ok: true, result: { a: 1 } }));
        await expect(p).resolves.toEqual({ a: 1 });
    });

    it('fails fast without a tab, and on disconnect or timeout', async () => {
        await expect(new TabCalls(() => false).call('x', {}, { name: 'c', version: '' })).rejects.toThrow(TAB_NOT_CONNECTED);
        const calls = new TabCalls(() => true, 20);
        const p = calls.call('x', {}, { name: 'c', version: '' });
        await expect(p).rejects.toThrow('did not answer in time');
        const q = new TabCalls(() => true).call('x', {}, { name: 'c', version: '' });
        const t = new TabCalls(() => true);
        const r = t.call('y', {}, { name: 'c', version: '' });
        t.failAll();
        await expect(r).rejects.toThrow('disconnected');
        void q.catch(() => {});
    });
});

describe('tab-side check and rules', () => {
    it('provides the planning rules without frontmatter', () => {
        expect(PLANNING_RULES.startsWith('# SOAP space planning')).toBe(true);
    });

    it('runs the layout checker on the project file', () => {
        const rooms = [{ id: 'a', name: 'Office', area: 10, zone: 'Admin', isPlaced: true, floor: 0, x: 0, y: 0, width: 60, height: 60 }];
        const state = { projectName: 'T', rooms, floors: FLOORS, currentFloor: 0, zoneColors: ZONE_COLORS, siteProperties: { locationName: '', latitude: 0, longitude: 0, northAngle: 0 } };
        const r = checkProject({ rooms, floors: FLOORS, siteProperties: state.siteProperties }, state);
        expect(r.errors.some(e => e.includes('does not open onto any circulation'))).toBe(true);
        expect(r.summary).toMatch(/error\(s\)/);
        expect(r.site).toBeNull();
    });
});
