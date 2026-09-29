import { useSyncExternalStore } from 'react';
import type { BridgeClientKind } from '../utils/bridgeCommands';
import { HELPER_PORT } from '../mcp/core';

// Connects the SOAP tab to an MCP bridge and enforces the per-client switches. Three ways to connect:
// - helper: the SOAP helper on this computer (mcp/helper.ts), which Claude Desktop runs once SOAP.mcpb is installed.
//   The default: works for the hosted app too, with no server of our own.
// - relay: the cloud relay (relay/). AI apps use a personal link containing `room`.
// - local: the dev server's built-in bridge (mcp/hub.ts), for `npm run dev`.

export type BridgeConnection = 'helper' | 'relay' | 'local';

export interface BridgeSettings {
    enabled: boolean;
    clients: Record<BridgeClientKind, boolean>;
    connection: BridgeConnection;
    relayUrl: string;    // e.g. https://soap-relay.you.workers.dev
    room: string;        // secret part of the personal relay link
    helperSeen: boolean; // the helper has answered at least once (so it is installed)
}

export interface BridgeSession { id: string; name: string; version: string; kind: BridgeClientKind }

export interface BridgeLogEntry {
    time: number;
    client: string;
    kind: BridgeClientKind;
    tool: string;
    ok: boolean;
    message?: string;
}

export type BridgeStatus = 'off' | 'connecting' | 'connected' | 'unavailable';

/** Why the helper can't be reached, when we can tell. */
export type BridgeProblem = 'untrusted' | 'blocked' | null;

export interface BridgeSnapshot {
    settings: BridgeSettings;
    status: BridgeStatus;
    problem: BridgeProblem;
    sessions: BridgeSession[];
    log: BridgeLogEntry[];
    hub: { mode?: string; version?: string } | null;
}

export type BridgeHandler = (tool: string, args: unknown, client: BridgeSession) => Promise<unknown> | unknown;

const SETTINGS_KEY = 'SOAP_AI_BRIDGES';
const SETTINGS_VERSION = 2; // 2: the helper became the default connection
const LOG_LIMIT = 50;
export const CLIENT_LABELS: Record<BridgeClientKind, string> = { claude: 'Claude', gemini: 'Gemini / Antigravity', chatgpt: 'Codex / ChatGPT', other: 'Other apps' };

// Optional, for the relay: VITE_SOAP_RELAY_URL=https://soap-relay.<account>.workers.dev
const DEFAULT_RELAY = ((import.meta as any).env?.VITE_SOAP_RELAY_URL as string | undefined)?.replace(/\/+$/, '') || '';
export const isLocalhost = () => typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/** A new unguessable link secret (192 bits, URL-safe). */
export const newRoom = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const saveSettings = (settings: BridgeSettings) => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, v: SETTINGS_VERSION })); } catch { /* storage unavailable */ }
};

const loadSettings = (): BridgeSettings => {
    const defaults: BridgeSettings = {
        enabled: false,
        clients: { claude: true, gemini: true, chatgpt: true, other: false },
        connection: 'helper',
        relayUrl: DEFAULT_RELAY,
        room: '',
        helperSeen: false,
    };
    let settings = defaults;
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
        if (saved && typeof saved === 'object') {
            // Settings from before the helper default start on the helper
            const connection = saved.v === SETTINGS_VERSION && ['helper', 'relay', 'local'].includes(saved.connection) ? saved.connection : defaults.connection;
            settings = {
                ...defaults,
                enabled: !!saved.enabled,
                clients: { ...defaults.clients, ...saved.clients },
                connection,
                helperSeen: !!saved.helperSeen,
                ...(typeof saved.relayUrl === 'string' && saved.relayUrl ? { relayUrl: saved.relayUrl } : {}),
                ...(typeof saved.room === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(saved.room) ? { room: saved.room } : {}),
            };
        }
    } catch { /* storage unavailable */ }
    if (!settings.room) {
        settings = { ...settings, room: newRoom() };
        saveSettings(settings);
    }
    return settings;
};

/** Where the tab connects, and the address AI apps use. Null when the relay address isn't set. */
export const bridgeEndpoints = (s: BridgeSettings): { ws: string; mcp: string } | null => {
    if (s.connection === 'helper') {
        // 127.0.0.1, not localhost: the helper listens on IPv4 only
        return { ws: `ws://127.0.0.1:${HELPER_PORT}/soap-bridge`, mcp: `http://127.0.0.1:${HELPER_PORT}/mcp` };
    }
    if (s.connection === 'local') {
        const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
        return { ws: `${wsProto}://${location.host}/soap-bridge`, mcp: `${location.origin}/mcp` };
    }
    const base = s.relayUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(base)) return null;
    return { ws: `${base.replace(/^http/, 'ws')}/bridge/${s.room}`, mcp: `${base}/mcp/${s.room}` };
};

let snapshot: BridgeSnapshot = { settings: loadSettings(), status: 'off', problem: null, sessions: [], log: [], hub: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<BridgeSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(l => l());
};

let socket: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let handler: BridgeHandler | null = null;
// Calls run one at a time, so each sees the previous call's changes
let queue: Promise<void> = Promise.resolve();

const addLog = (entry: BridgeLogEntry) => set({ log: [entry, ...snapshot.log].slice(0, LOG_LIMIT) });

const handleCall = async (msg: { id: string; tool: string; args: unknown; client: BridgeSession }) => {
    const reply = (body: object) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'result', id: msg.id, ...body }));
    const client = msg.client || { id: '', name: 'unknown', version: '', kind: 'other' as const };
    const { settings } = snapshot;
    const base = { time: Date.now(), client: client.name, kind: client.kind, tool: msg.tool };
    if (!settings.enabled || !settings.clients[client.kind]) {
        const error = `The ${CLIENT_LABELS[client.kind]} bridge is switched off in SOAP. Ask the user to turn it on (plug icon in the SOAP toolbar).`;
        addLog({ ...base, ok: false, message: 'Blocked: switched off' });
        reply({ ok: false, error });
        return;
    }
    if (!handler) { reply({ ok: false, error: 'SOAP is still loading.' }); return; }
    try {
        const result = await handler(msg.tool, msg.args, client);
        // Let React commit the change before the next call reads the project
        await new Promise(r => setTimeout(r, 0));
        addLog({ ...base, ok: true });
        reply({ ok: true, result });
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        addLog({ ...base, ok: false, message: error });
        reply({ ok: false, error });
    }
};

// Chrome asks before a website may reach this computer; if the user said no, the helper is unreachable.
// Pages on this computer aren't asked (and some embedded browsers report every permission as denied).
const localAccessDenied = async () => {
    if (isLocalhost()) return false;
    for (const name of ['local-network-access', 'loopback-network']) {
        try {
            if ((await navigator.permissions.query({ name: name as PermissionName })).state === 'denied') return true;
        } catch { /* not a permission this browser knows */ }
    }
    return false;
};

const scheduleRetry = (delay: number) => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, delay);
};

const connect = () => {
    if (socket || !snapshot.settings.enabled) return;
    const endpoints = bridgeEndpoints(snapshot.settings);
    if (!endpoints) { set({ status: 'unavailable' }); return; }
    // While waiting for the helper, stay "unavailable" between attempts rather than flickering
    if (snapshot.status !== 'unavailable') set({ status: 'connecting' });
    let opened = false;
    let ws: WebSocket;
    try { ws = new WebSocket(endpoints.ws); } catch { set({ status: 'unavailable' }); return; }
    socket = ws;
    ws.onopen = () => { opened = true; failures = 0; set({ status: 'connected', problem: null }); };
    ws.onmessage = ev => {
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'sessions') set({ sessions: msg.sessions || [] });
        else if (msg.type === 'hello') {
            set({ hub: { mode: msg.mode, version: msg.version } });
            if (msg.mode === 'helper' && !snapshot.settings.helperSeen) bridge.updateSettings({ helperSeen: true });
        }
        else if (msg.type === 'call') queue = queue.then(() => handleCall(msg));
    };
    ws.onclose = async ev => {
        if (socket !== ws) return; // closed on purpose (disconnect/retry)
        socket = null;
        set({ sessions: [] });
        if (!snapshot.settings.enabled) { set({ status: 'off' }); return; }
        // 4000: another tab took over — don't fight it
        if (ev.code === 4000) { set({ status: 'unavailable' }); return; }
        const helper = snapshot.settings.connection === 'helper';
        // 4003: the helper was made for another SOAP address. Keep checking: re-adding Claude restarts it.
        const problem: BridgeProblem = ev.code === 4003 ? 'untrusted' : helper && !opened && (await localAccessDenied()) ? 'blocked' : null;
        if (socket) return; // reconnected meanwhile
        if (!opened) failures++;
        set({ status: opened ? 'connecting' : 'unavailable', problem });
        // Waiting for Claude can take a while: back off to every 10 s (and try at once when SOAP gets focus)
        scheduleRetry(opened ? 1000 : Math.min(10000, (helper ? 1500 : 4000) * 2 ** Math.min(failures - 1, 3)));
    };
};

const disconnect = () => {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    const ws = socket;
    socket = null;
    ws?.close();
    set({ status: 'off', sessions: [], problem: null });
};

/** Try now instead of waiting for the next retry, e.g. when the user comes back from installing in Claude. */
const retrySoon = () => {
    if (!snapshot.settings.enabled || socket) return;
    failures = 0;
    scheduleRetry(0);
};

if (typeof window !== 'undefined') {
    window.addEventListener('focus', retrySoon);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') retrySoon(); });
}

export const bridge = {
    get: () => snapshot,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    setHandler: (h: BridgeHandler | null) => { handler = h; },
    updateSettings: (patch: Partial<BridgeSettings>) => {
        const prev = snapshot.settings;
        const settings = { ...prev, ...patch, clients: { ...prev.clients, ...patch.clients } };
        saveSettings(settings);
        set({ settings });
        // Changing where we connect means a fresh connection
        const moved = settings.connection !== prev.connection || settings.relayUrl !== prev.relayUrl || settings.room !== prev.room;
        if (!settings.enabled) disconnect();
        else if (moved) { disconnect(); failures = 0; connect(); }
        else connect();
    },
    /** Replaces the personal relay link; AI apps using the old one lose access. */
    resetLink: () => bridge.updateSettings({ room: newRoom() }),
    /** Reconnect now. */
    retry: () => { disconnect(); failures = 0; if (snapshot.settings.enabled) connect(); },
    /** Check again now without dropping a working connection. */
    retrySoon,
    clearLog: () => set({ log: [] }),
    start: () => { if (snapshot.settings.enabled) connect(); },
};

export const useBridge = () => useSyncExternalStore(bridge.subscribe, bridge.get);
