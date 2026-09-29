/**
 * SOAP's MCP server, protocol side. Dependency-free so it runs in the SOAP helper that Claude Desktop starts
 * (mcp/helper.ts), the dev-server bridge (mcp/hub.ts) and the cloud relay (relay/src/worker.ts).
 *
 * Speaks MCP over stdio (one JSON message per line, handleRpc) and Streamable HTTP with JSON responses
 * (handleMcpHttp; no server-initiated streams). All tools are relayed to the open SOAP tab, which does the
 * work and enforces the per-client switches.
 */

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER_INFO = { name: 'soap', title: 'SOAP', version: '2.0.0' };

/** Where the SOAP helper listens on the user's computer (127.0.0.1 only): the tab at /soap-bridge, other MCP apps at /mcp. */
export const HELPER_PORT = 47913;

export const SERVER_INSTRUCTIONS =
    'SOAP is an architectural programming and space-planning app. Units are meters; x grows east (right), y grows south (down). ' +
    'Start with get_project. Before arranging rooms, read get_planning_rules and follow them (circulation first, no dead-end corridors). ' +
    'After placing spaces, run check_layout and fix every error, and look at get_plan_image to see the plan as the user will. ' +
    'Each change you make is one undo step for the user.';

export interface ClientInfo { name: string; version: string }

export interface McpContext {
    createSession(client: ClientInfo): Promise<string>;
    getSession(id: string): Promise<ClientInfo | null>;
    deleteSession(id: string): Promise<void>;
    /** Runs a tool in the SOAP tab. Rejects with a message the AI can act on. */
    callTab(tool: string, args: Record<string, unknown>, client: ClientInfo): Promise<unknown>;
}

// --- Tools (JSON Schema) ---

type Schema = Record<string, unknown>;
const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: 'object', properties, required, additionalProperties: false });
const num = (description?: string, extra: Schema = {}): Schema => ({ type: 'number', ...(description ? { description } : {}), ...extra });
const int = (description?: string, extra: Schema = {}): Schema => ({ type: 'integer', ...(description ? { description } : {}), ...extra });
const str = (description?: string, extra: Schema = {}): Schema => ({ type: 'string', ...(description ? { description } : {}), ...extra });
const bool = (description?: string): Schema => ({ type: 'boolean', ...(description ? { description } : {}) });
const arr = (items: Schema, extra: Schema = {}): Schema => ({ type: 'array', items, ...extra });
const point = obj({ x: num(), y: num() }, ['x', 'y']);
const spaceType = str(undefined, { enum: ['standard', 'outdoor', 'terrace', 'multistory', 'verticalConnection'] });
const readOnly = { readOnlyHint: true, openWorldHint: false };
const edit = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export interface ToolDef {
    name: string;
    title: string;
    description: string;
    inputSchema: Schema;
    annotations: Record<string, boolean>;
    image?: boolean; // result is { image, mimeType, ...meta }
}

export const TOOLS: ToolDef[] = [
    {
        name: 'get_project', title: 'Get project', annotations: readOnly, inputSchema: obj({}),
        description: 'The open SOAP project: floors, zones, every space (program area, and position/size in meters if placed) and the site (boundary, setbacks, no-build zones, compliance report).',
    },
    {
        name: 'get_planning_rules', title: 'Get planning rules', annotations: readOnly, inputSchema: obj({}),
        description: "The architect's rules for arranging spaces into floor plans (circulation, access, zoning, geometry, site). Read before placing spaces.",
    },
    {
        name: 'add_spaces', title: 'Add spaces', annotations: edit,
        description: 'Adds spaces to the program (unplaced, in the inventory). Returns their ids.',
        inputSchema: obj({
            spaces: arr(obj({
                name: str(undefined, { minLength: 1 }),
                area: num('Target area in m²', { exclusiveMinimum: 0 }),
                zone: str('e.g. Public, Private, Service, Circulation, Outdoor, Admin; new names create a zone'),
                description: str(),
                spaceType,
                vcType: str('Makes it a vertical connection', { enum: ['stair', 'elevator', 'ramp'] }),
            }, ['name', 'area']), { minItems: 1 }),
        }, ['spaces']),
    },
    {
        name: 'update_spaces', title: 'Update spaces', annotations: edit,
        description: "Changes spaces' name, target area, zone, description or type.",
        inputSchema: obj({
            updates: arr(obj({ id: str(), name: str(), area: num(undefined, { exclusiveMinimum: 0 }), zone: str(), description: str(), spaceType }, ['id']), { minItems: 1 }),
        }, ['updates']),
    },
    {
        name: 'place_spaces', title: 'Place spaces', annotations: edit,
        description: 'Places spaces on the plan as rectangles (meters; x,y is the top-left corner). All placements apply as one undo step. Use a 0.5 m grid.',
        inputSchema: obj({
            placements: arr(obj({
                id: str(),
                floor: int('Floor id from get_project (0 = ground)'),
                x: num(), y: num(),
                width: num(undefined, { exclusiveMinimum: 0 }), height: num(undefined, { exclusiveMinimum: 0 }),
                rotation: num('Degrees clockwise about the rectangle centre'),
            }, ['id', 'floor', 'x', 'y', 'width', 'height']), { minItems: 1 }),
        }, ['placements']),
    },
    {
        name: 'unplace_spaces', title: 'Unplace spaces', annotations: edit,
        description: 'Takes spaces off the plan and back to the inventory (they stay in the program).',
        inputSchema: obj({ ids: arr(str(), { minItems: 1 }) }, ['ids']),
    },
    {
        name: 'remove_spaces', title: 'Remove spaces', annotations: { ...edit, destructiveHint: true },
        description: 'Deletes spaces from the program. The user can undo it in SOAP.',
        inputSchema: obj({ ids: arr(str(), { minItems: 1 }) }, ['ids']),
    },
    {
        name: 'update_floors', title: 'Update floors', annotations: edit,
        description: 'Renames floors or changes floor-to-floor heights (meters).',
        inputSchema: obj({ floors: arr(obj({ id: int(), label: str(), height: num(undefined, { exclusiveMinimum: 0 }) }, ['id']), { minItems: 1 }) }, ['floors']),
    },
    {
        name: 'set_site', title: 'Set site', annotations: edit,
        description: 'Sets the site boundary (meters, same frame as the spaces), north angle, constraints (setbacks per edge, max height/coverage/FAR) and no-build zones. Omitted fields are kept; noBuildZones replaces all zones.',
        inputSchema: obj({
            boundary: arr(point, { minItems: 3 }),
            northAngle: num('Degrees clockwise from plan-up to true north'),
            constraints: obj({
                defaultSetback: num(undefined, { minimum: 0 }),
                edgeSetbacks: arr({ type: ['number', 'null'], minimum: 0 }, { description: 'Per edge; edge i runs from corner i to i+1; null = default' }),
                maxHeight: num(undefined, { exclusiveMinimum: 0 }),
                maxCoverage: num('Percent of site area', { exclusiveMinimum: 0 }),
                maxFAR: num(undefined, { exclusiveMinimum: 0 }),
            }),
            noBuildZones: arr(obj({ name: str(), points: arr(point, { minItems: 3 }) }, ['name', 'points'])),
        }),
    },
    {
        name: 'check_layout', title: 'Check layout', annotations: readOnly, inputSchema: obj({}),
        description: 'Checks the placed spaces against the planning rules (overlaps, grid, areas, access from circulation, dead-end corridors) and the site (boundary, setbacks, no-build zones, height/coverage/FAR).',
    },
    {
        name: 'get_plan_image', title: 'Get plan image', annotations: readOnly, image: true,
        description: 'A picture of one floor: spaces coloured by zone and labelled with name and area, a meter grid whose labels match the x/y coordinates, the site boundary, setback line, no-build zones and rule breaks (red), north arrow and scale. Look at it after placing spaces to check the plan reads well.',
        inputSchema: obj({
            floor: int('Floor id; defaults to the floor the user is viewing'),
            ghostFloor: int('Also outline another floor faintly, e.g. the one below, to line up stairs and walls'),
            width: int('Image width in pixels (default 1024)', { minimum: 400, maximum: 2048 }),
            showSite: bool('Draw the site (default true)'),
            showUnderlay: bool('Draw the satellite/reference images on this floor (default false)'),
        }),
    },
    {
        name: 'show_floor', title: 'Show floor', annotations: readOnly,
        description: 'Switches the SOAP canvas to a floor so the user sees it.',
        inputSchema: obj({ floor: int() }, ['floor']),
    },
    {
        name: 'undo', title: 'Undo', annotations: edit, inputSchema: obj({}),
        description: 'Undoes the last change in SOAP (the same as Ctrl+Z).',
    },
];

const TOOL_MAP = new Map(TOOLS.map(t => [t.name, t]));

// --- Argument validation (the JSON Schema subset used above) ---

export const validate = (schema: Schema, value: unknown, path = 'arguments'): string | null => {
    const type = schema.type as string | string[] | undefined;
    const types = Array.isArray(type) ? type : type ? [type] : [];
    const is = (t: string) => {
        switch (t) {
            case 'object': return !!value && typeof value === 'object' && !Array.isArray(value);
            case 'array': return Array.isArray(value);
            case 'number': return typeof value === 'number' && Number.isFinite(value);
            case 'integer': return typeof value === 'number' && Number.isInteger(value);
            case 'string': return typeof value === 'string';
            case 'boolean': return typeof value === 'boolean';
            case 'null': return value === null;
            default: return true;
        }
    };
    if (types.length && !types.some(is)) return `${path} must be ${types.join(' or ')}`;
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return `${path} must be one of ${schema.enum.join(', ')}`;
    if (typeof value === 'number') {
        if (typeof schema.minimum === 'number' && value < schema.minimum) return `${path} must be at least ${schema.minimum}`;
        if (typeof schema.maximum === 'number' && value > schema.maximum) return `${path} must be at most ${schema.maximum}`;
        if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) return `${path} must be greater than ${schema.exclusiveMinimum}`;
    }
    if (typeof value === 'string' && typeof schema.minLength === 'number' && value.length < schema.minLength) return `${path} must not be empty`;
    if (Array.isArray(value)) {
        if (typeof schema.minItems === 'number' && value.length < schema.minItems) return `${path} needs at least ${schema.minItems} item(s)`;
        if (schema.items) for (let i = 0; i < value.length; i++) {
            const e = validate(schema.items as Schema, value[i], `${path}[${i}]`);
            if (e) return e;
        }
    }
    if (types.includes('object') && value && typeof value === 'object' && !Array.isArray(value)) {
        const props = (schema.properties || {}) as Record<string, Schema>;
        for (const r of (schema.required as string[] | undefined) || []) {
            if ((value as Record<string, unknown>)[r] === undefined) return `${path}.${r} is required`;
        }
        for (const [k, v] of Object.entries(value)) {
            if (!props[k]) {
                if (schema.additionalProperties === false) return `${path}.${k} is not a known field`;
                continue;
            }
            if (v === undefined) continue;
            const e = validate(props[k], v, `${path}.${k}`);
            if (e) return e;
        }
    }
    return null;
};

// --- JSON-RPC over Streamable HTTP ---

export interface HttpResult { status: number; headers: Record<string, string>; body?: string }

const json = (status: number, payload: unknown, headers: Record<string, string> = {}): HttpResult =>
    ({ status, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

const toolResult = (tool: ToolDef, value: unknown) => {
    if (tool.image && value && typeof value === 'object' && typeof (value as any).image === 'string') {
        const { image, mimeType, ...meta } = value as { image: string; mimeType?: string };
        return { content: [{ type: 'image', data: image, mimeType: mimeType || 'image/png' }, { type: 'text', text: JSON.stringify(meta) }] };
    }
    return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
};
const toolError = (message: string) => ({ content: [{ type: 'text', text: message }], isError: true });

/** The reply to `initialize`. */
export const initializeResult = (init: Rpc) => {
    const requested = init.params?.protocolVersion;
    const protocolVersion = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
    return {
        jsonrpc: '2.0', id: init.id,
        result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: SERVER_INSTRUCTIONS },
    };
};

export const clientOf = (init: Rpc): ClientInfo => {
    const info = init.params?.clientInfo || {};
    return { name: String(info.name || 'unknown'), version: String(info.version || '') };
};

/** Answers one request (not initialize) from an initialized client. */
export const handleRpc = async (msg: Rpc, client: ClientInfo, ctx: Pick<McpContext, 'callTab'>): Promise<unknown> => {
    switch (msg.method) {
        case 'ping':
            return { jsonrpc: '2.0', id: msg.id, result: {} };
        case 'tools/list':
            return {
                jsonrpc: '2.0', id: msg.id,
                result: { tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) },
            };
        case 'tools/call': {
            const name = msg.params?.name;
            const args = msg.params?.arguments ?? {};
            const tool = TOOL_MAP.get(name);
            if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
            const invalid = validate(tool.inputSchema, args);
            if (invalid) return { jsonrpc: '2.0', id: msg.id, result: toolError(`Invalid arguments: ${invalid}.`) };
            try {
                return { jsonrpc: '2.0', id: msg.id, result: toolResult(tool, await ctx.callTab(name, args, client)) };
            } catch (e) {
                return { jsonrpc: '2.0', id: msg.id, result: toolError(e instanceof Error ? e.message : String(e)) };
            }
        }
        case 'resources/list':
            return { jsonrpc: '2.0', id: msg.id, result: { resources: [] } };
        case 'prompts/list':
            return { jsonrpc: '2.0', id: msg.id, result: { prompts: [] } };
        default:
            return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
    }
};

/**
 * Handles one HTTP request to the MCP endpoint.
 * `sessionId` is the Mcp-Session-Id request header; `body` the parsed JSON (POST only).
 */
export const handleMcpHttp = async (method: string, sessionId: string | undefined, body: unknown, ctx: McpContext): Promise<HttpResult> => {
    if (method === 'OPTIONS') return { status: 204, headers: {} };
    if (method === 'GET') return json(405, rpcError(null, -32000, 'This server does not offer a stream; use POST.'), { Allow: 'POST, DELETE' });
    if (method === 'DELETE') {
        if (sessionId) await ctx.deleteSession(sessionId);
        return { status: 200, headers: {} };
    }
    if (method !== 'POST') return json(405, rpcError(null, -32000, 'Method not allowed'), { Allow: 'POST, DELETE' });

    const batch = Array.isArray(body);
    const messages = (batch ? body : [body]) as Rpc[];
    if (!messages.length || messages.some(m => !m || typeof m !== 'object')) return json(400, rpcError(null, -32700, 'Parse error'));

    // Initialization opens a session and must come alone
    const init = messages.find(m => m.method === 'initialize');
    if (init) {
        const id = await ctx.createSession(clientOf(init));
        const result = initializeResult(init);
        return json(200, batch ? [result] : result, { 'Mcp-Session-Id': id });
    }

    if (!sessionId) return json(400, rpcError(null, -32000, 'Missing Mcp-Session-Id header: send initialize first.'));
    const client = await ctx.getSession(sessionId);
    if (!client) return json(404, rpcError(null, -32001, 'Session not found; initialize again.'));

    const requests = messages.filter(m => m.method && m.id !== undefined && m.id !== null);
    if (!requests.length) return { status: 202, headers: {} }; // notifications / responses only
    const responses = await Promise.all(requests.map(m => handleRpc(m, client, ctx)));
    return json(200, batch ? responses : responses[0]);
};

// --- Which switch in SOAP governs a client, from the name it reports ---

export type BridgeClientKind = 'claude' | 'gemini' | 'chatgpt' | 'other';

export const classifyClient = (name: string | undefined): BridgeClientKind => {
    const n = (name || '').toLowerCase();
    if (n.includes('claude') || n.includes('anthropic')) return 'claude';
    if (n.includes('gemini') || n.includes('google') || n.includes('antigravity')) return 'gemini';
    if (n.includes('openai') || n.includes('chatgpt') || n.includes('codex')) return 'chatgpt';
    return 'other';
};

// --- The link to the SOAP tab (shared by the local bridge and the relay) ---
// Messages to the tab:   { type: 'call', id, tool, args, client } · { type: 'sessions', sessions } · { type: 'hello', ... }
// Messages from the tab: { type: 'result', id, ok, result | error }

export const TAB_NOT_CONNECTED =
    'SOAP is not connected. Ask the user to open SOAP in their browser and turn on AI access (plug icon in the toolbar).';

export class TabCalls {
    private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    private seq = 0;

    /** `send` returns false when no tab is connected. */
    constructor(private send: (msg: unknown) => boolean, private timeoutMs = 25000, private notConnected = TAB_NOT_CONNECTED) {}

    call(tool: string, args: unknown, client: ClientInfo): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const id = `${Date.now().toString(36)}-${(this.seq++).toString(36)}`;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('SOAP did not answer in time. Is the SOAP tab still open?'));
            }, this.timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            if (!this.send({ type: 'call', id, tool, args, client: { ...client, kind: classifyClient(client.name) } })) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(new Error(this.notConnected));
            }
        });
    }

    /** Feed a message from the tab. */
    receive(raw: unknown) {
        let msg: any = raw;
        if (typeof raw === 'string') { try { msg = JSON.parse(raw); } catch { return; } }
        if (msg?.type !== 'result' || !this.pending.has(msg.id)) return;
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(msg.error || 'SOAP refused the command.'));
    }

    /** The tab went away: fail everything in flight. */
    failAll(message = 'The SOAP tab disconnected.') {
        this.pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error(message)); });
        this.pending.clear();
    }
}
