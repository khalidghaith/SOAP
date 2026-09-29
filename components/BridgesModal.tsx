import React, { useState } from 'react';
import { X, Plug, Copy, Check, RefreshCw, Trash2, AlertTriangle, Download, CheckCircle2, Loader2, Lightbulb, ChevronRight, ShieldAlert } from 'lucide-react';
import { bridge, useBridge, bridgeEndpoints, isLocalhost, CLIENT_LABELS, BridgeStatus, BridgeSnapshot } from '../services/bridgeClient';
import type { BridgeClientKind } from '../utils/bridgeCommands';
import { SERVER_INFO } from '../mcp/core';
import { confirmDialog } from './Notifications';
import SoapLogo from '../lib/symbols/SOAP-Logo.svg';

interface BridgesModalProps {
    onClose: () => void;
}

const STATUS: Record<BridgeStatus, { label: string; tone: string }> = {
    off: { label: 'Off', tone: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-gray-400' },
    connecting: { label: 'Connecting…', tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
    connected: { label: 'On', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
    unavailable: { label: 'Not connected', tone: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' },
};

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }> = ({ checked, onChange, disabled, label }) => (
    <label className={`relative inline-flex items-center ${disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`} title={label}>
        <input type="checkbox" className="sr-only peer" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} aria-label={label} />
        <div className="w-9 h-5 bg-slate-200 dark:bg-white/10 rounded-full peer peer-checked:bg-orange-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
    </label>
);

const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
};

const CopyBlock: React.FC<{ text: string }> = ({ text }) => {
    const [done, setDone] = useState(false);
    return (
        <div className="relative">
            <pre className="text-[10px] leading-relaxed font-mono bg-slate-900 text-slate-100 rounded-lg p-2.5 pr-9 overflow-x-auto whitespace-pre">{text}</pre>
            <button onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1500); } }} className="absolute top-1.5 right-1.5 p-1 rounded-md bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white" title="Copy">
                {done ? <Check size={12} /> : <Copy size={12} />}
            </button>
        </div>
    );
};

const Step: React.FC<{ n: number; done?: boolean; active?: boolean; children: React.ReactNode }> = ({ n, done, active, children }) => (
    <div className={`flex items-start gap-2 ${done ? 'text-slate-400' : active ? 'text-slate-800 dark:text-gray-100' : 'text-slate-500 dark:text-gray-400'}`}>
        <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black ${done ? 'bg-emerald-500 text-white' : active ? 'bg-orange-500 text-white' : 'bg-slate-200 dark:bg-white/10'}`}>
            {done ? <Check size={11} /> : n}
        </span>
        <div className="flex-1 min-w-0 pt-0.5">{children}</div>
    </div>
);

type Tone = 'ok' | 'wait' | 'warn' | 'error';
const TONES: Record<Tone, string> = {
    ok: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300',
    wait: 'bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-gray-300',
    warn: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
    error: 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300',
};

/** One line telling the user where the Claude connection stands and what to do next. */
const claudeStatus = (s: BridgeSnapshot, started: boolean): { tone: Tone; text: React.ReactNode } | null => {
    const { settings, status, problem, hub, sessions } = s;
    if (settings.connection !== 'helper' || (!started && !settings.helperSeen && !settings.enabled)) return null;
    if (!settings.enabled) return { tone: 'wait', text: 'AI access is off. Turn it on below to let Claude work in SOAP.' };
    if (problem === 'blocked') return {
        tone: 'error',
        text: <>Your browser is blocking SOAP from reaching Claude on this computer. Click the icon left of the address bar, allow <b>Local network access</b>, then reload SOAP.</>,
    };
    if (problem === 'untrusted') return {
        tone: 'warn',
        text: <>Claude's SOAP extension was added from a different SOAP address. Click <b>Add to Claude</b> again here and install it.</>,
    };
    if (status === 'connected' && hub?.mode === 'helper') {
        if (hub.version && hub.version !== SERVER_INFO.version) return {
            tone: 'warn',
            text: <>Connected, but Claude has an older SOAP extension ({hub.version}). Click <b>Add to Claude</b> to update it.</>,
        };
        return {
            tone: 'ok',
            text: sessions.some(x => x.kind === 'claude')
                ? <>Connected to Claude Desktop. Ask Claude to work on your SOAP project.</>
                : <>Connected to the SOAP helper. Start a chat in Claude Desktop.</>,
        };
    }
    if (settings.helperSeen) return { tone: 'wait', text: <>Waiting for Claude Desktop. Open it and SOAP connects by itself.</> };
    return {
        tone: 'wait',
        text: <>Waiting for the install… If your browser asks to <b>access devices on your local network</b>, click <b>Allow</b>.</>,
    };
};

export const BridgesModal: React.FC<BridgesModalProps> = ({ onClose }) => {
    const snap = useBridge();
    const { settings, status, sessions, log, hub } = snap;
    const endpoints = bridgeEndpoints(settings);
    const link = endpoints?.mcp || '';
    const helper = settings.connection === 'helper';
    const [claudeStarted, setClaudeStarted] = useState(false);
    const [building, setBuilding] = useState(false);
    const [relayDraft, setRelayDraft] = useState(settings.relayUrl);
    const [linkShown, setLinkShown] = useState(false);

    const connected = (kind: BridgeClientKind) => sessions.some(s => s.kind === kind);
    const helperUp = helper && status === 'connected' && hub?.mode === 'helper';
    const claudeLine = claudeStatus(snap, claudeStarted);

    const addToClaude = async () => {
        setBuilding(true);
        try {
            // Adding Claude also turns AI access on for it, through the helper
            bridge.updateSettings({ enabled: true, connection: 'helper', clients: { claude: true } as Record<BridgeClientKind, boolean> });
            // Loaded on demand: it carries the whole helper script
            const { buildClaudeBundle, downloadClaudeBundle, svgUrlToPng } = await import('../utils/claudeBundle');
            const icon = await svgUrlToPng(SoapLogo);
            downloadClaudeBundle(buildClaudeBundle([location.origin], icon));
            setClaudeStarted(true);
        } finally {
            setBuilding(false);
        }
    };

    const resetLink = async () => {
        const ok = await confirmDialog({
            title: 'Reset your AI link?',
            message: 'Apps connected with the current link lose access. Connect them again with the new link afterwards.',
            confirmLabel: 'Reset link',
        });
        if (ok) bridge.resetLink();
    };

    const kinds: BridgeClientKind[] = ['claude', 'chatgpt', 'gemini', 'other'];
    const maskedLink = link && settings.connection === 'relay' && !linkShown ? link.replace(settings.room, `${settings.room.slice(0, 4)}••••••••`) : link;
    const connections = ([
        ['helper', 'Claude Desktop helper'],
        ...(isLocalhost() || settings.connection === 'local' ? [['local', 'Dev server']] : []),
        ['relay', 'Online relay'],
    ] as [typeof settings.connection, string][]);

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[250] flex items-center justify-center p-4 animate-in fade-in duration-200" onMouseDown={onClose}>
            <div
                className="bg-white dark:bg-dark-surface w-full max-w-xl rounded-3xl shadow-2xl border border-slate-100 dark:border-white/10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300"
                onMouseDown={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-slate-100 dark:border-dark-border flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 flex items-center justify-center"><Plug size={20} /></div>
                        <div>
                            <h2 className="text-base font-black text-slate-800 dark:text-gray-100 uppercase tracking-tight">Connect an AI assistant</h2>
                            <p className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">Let Claude work on this project with you — two steps</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 rounded-full hover:bg-slate-100 dark:hover:bg-white/5"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 text-[11px] text-slate-600 dark:text-gray-300">
                    {/* Claude Desktop */}
                    <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black text-slate-800 dark:text-gray-100">Claude Desktop</h3>
                            {helperUp && <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600"><CheckCircle2 size={12} /> Connected</span>}
                        </div>
                        <Step n={1} done={claudeStarted || settings.helperSeen} active={!claudeStarted && !settings.helperSeen}>
                            <button onClick={addToClaude} disabled={building} className="w-full sm:w-auto sm:px-6 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm">
                                {building ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Add to Claude
                            </button>
                        </Step>
                        <Step n={2} done={helperUp} active={(claudeStarted || settings.helperSeen) && !helperUp}>
                            Open <b>SOAP.mcpb</b> from your downloads and click <b>Install</b> in Claude.
                        </Step>
                        {claudeLine && (
                            <div className={`flex items-start gap-2 rounded-xl px-3 py-2 ${TONES[claudeLine.tone]}`} role="status">
                                {claudeLine.tone === 'ok' ? <CheckCircle2 size={13} className="shrink-0 mt-px" />
                                    : claudeLine.tone === 'wait' ? <Loader2 size={13} className="shrink-0 mt-px animate-spin" />
                                    : claudeLine.tone === 'error' ? <ShieldAlert size={13} className="shrink-0 mt-px" />
                                    : <AlertTriangle size={13} className="shrink-0 mt-px" />}
                                <span className="flex-1">{claudeLine.text}</span>
                            </div>
                        )}
                        <p className="text-[10px] text-slate-400">
                            No Claude Desktop yet? <a className="text-orange-600 hover:underline" href="https://claude.ai/download" target="_blank" rel="noreferrer">Download it</a>.
                            SOAP talks to Claude directly on this computer; your project doesn't pass through any server.
                        </p>
                    </div>

                    <p className="flex items-start gap-1.5 text-[10px] text-slate-500 dark:text-gray-400">
                        <Lightbulb size={12} className="shrink-0 mt-0.5 text-amber-500" />
                        <span>Then ask, for example: <i>"Look at my SOAP project, arrange the ground floor following the planning rules, and show me the plan."</i> Keep SOAP open while Claude works. You can undo each change with Ctrl+Z.</span>
                    </p>

                    {/* Access switches */}
                    <div className="rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-800 dark:text-gray-100">AI access</span>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${STATUS[status].tone}`}>{helper && status === 'unavailable' ? 'Waiting for Claude' : STATUS[status].label}</span>
                                {status === 'unavailable' && (
                                    <button onClick={() => bridge.retry()} className="p-1 rounded-lg text-slate-400 hover:text-orange-600" title="Try again"><RefreshCw size={12} /></button>
                                )}
                            </div>
                            <Toggle checked={settings.enabled} onChange={v => bridge.updateSettings({ enabled: v })} label="AI access" />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {kinds.map(kind => (
                                <label key={kind} className={`flex items-center gap-1.5 text-[10px] font-semibold ${settings.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
                                    <Toggle checked={settings.clients[kind]} disabled={!settings.enabled} onChange={v => bridge.updateSettings({ clients: { [kind]: v } as Record<BridgeClientKind, boolean> })} label={`Allow ${CLIENT_LABELS[kind]}`} />
                                    {CLIENT_LABELS[kind]}
                                    {connected(kind) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Connected" />}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Everything else */}
                    <details className="group rounded-2xl border border-slate-200/60 dark:border-white/10">
                        <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-gray-100">
                            <ChevronRight size={13} className="transition-transform group-open:rotate-90" /> More options
                        </summary>
                        <div className="px-4 pb-4 space-y-4">
                            <div className="space-y-1.5">
                                <span className="text-[10px] font-bold text-slate-500">Other AI apps (Codex, Claude Code, Antigravity…)</span>
                                {helper ? (
                                    <p>While Claude Desktop is open with the SOAP extension, other MCP apps on this computer can use it at <code>{link}</code>:</p>
                                ) : (
                                    <p>Use this address as the MCP server URL:</p>
                                )}
                                <p><b>Codex</b>, in a terminal:</p>
                                <CopyBlock text={`codex mcp add soap --url ${link || '<address>'}`} />
                                <p><b>Claude Code</b>:</p>
                                <CopyBlock text={`claude mcp add --transport http soap ${link || '<address>'}`} />
                                <p><b>Antigravity</b>: Settings → Customizations → Open MCP Config, and add:</p>
                                <CopyBlock text={JSON.stringify({ mcpServers: { soap: { serverUrl: link || '<address>' } } }, null, 2)} />
                            </div>

                            <div className="space-y-1.5">
                                <span className="text-[10px] font-bold text-slate-500">Connection</span>
                                <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl gap-1">
                                    {connections.map(([value, label]) => (
                                        <button key={value} onClick={() => bridge.updateSettings({ connection: value })}
                                            className={`flex-1 py-1 rounded-lg text-[10px] font-bold ${settings.connection === value ? 'bg-white dark:bg-dark-surface text-orange-600 shadow-sm' : 'text-slate-500'}`}>{label}</button>
                                    ))}
                                </div>
                                {settings.connection === 'local' && <p className="text-[10px] text-slate-400">For development: the bridge built into <code>npm run dev</code>.</p>}
                                {settings.connection === 'relay' && (
                                    <>
                                        <p className="text-[10px] text-slate-400">For AI apps on other computers or in the cloud. Needs a relay deployed by the site owner (see relay/README.md).</p>
                                        <input
                                            value={relayDraft}
                                            placeholder="Relay address, e.g. https://soap-relay.your-account.workers.dev"
                                            onChange={e => setRelayDraft(e.target.value)}
                                            onBlur={() => relayDraft !== settings.relayUrl && bridge.updateSettings({ relayUrl: relayDraft.trim() })}
                                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                            className="w-full text-[11px] font-mono bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                                        />
                                        <div className="flex items-center gap-1.5">
                                            <code className="flex-1 min-w-0 truncate text-[11px] bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg py-1.5 px-2" onClick={() => setLinkShown(true)} title="Click to reveal">
                                                {maskedLink || '—'}
                                            </code>
                                            <button disabled={!link} onClick={() => copyText(link)} className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-[10px] font-bold text-slate-500 hover:text-orange-600 disabled:opacity-40">Copy</button>
                                            <button onClick={resetLink} className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-[10px] font-bold text-slate-500 hover:text-red-600">Reset</button>
                                        </div>
                                        <p className="flex items-start gap-1.5 text-[10px] text-slate-400">
                                            <AlertTriangle size={11} className="shrink-0 mt-0.5 text-amber-500" />
                                            Anyone with this link can use your open SOAP while AI access is on. Reset it if it leaks.
                                        </p>
                                    </>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-500">Activity</span>
                                    {log.length > 0 && <button onClick={() => bridge.clearLog()} className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-1"><Trash2 size={11} /> Clear</button>}
                                </div>
                                {log.length === 0 ? <p className="text-[10px] text-slate-400">No AI activity yet.</p> : (
                                    <ul className="divide-y divide-slate-100 dark:divide-white/5 rounded-xl border border-slate-200/60 dark:border-white/10 max-h-40 overflow-y-auto custom-scrollbar">
                                        {log.map((e, i) => (
                                            <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-[10px]">
                                                <span className={e.ok ? 'text-emerald-600' : 'text-red-500'}>{e.ok ? '✓' : '✕'}</span>
                                                <span className="font-mono text-slate-400 shrink-0">{new Date(e.time).toLocaleTimeString()}</span>
                                                <span className="font-semibold shrink-0">{e.client}</span>
                                                <span className="font-mono text-orange-600 dark:text-orange-400 shrink-0">{e.tool}</span>
                                                {e.message && <span className="truncate text-slate-400" title={e.message}>{e.message}</span>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </details>
                </div>
            </div>
        </div>
    );
};
