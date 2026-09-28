import React, { useState } from 'react';
import { X, Plug, Copy, Check, ChevronDown, ChevronRight, RefreshCw, Trash2, AlertTriangle, ShieldCheck, Cloud, Laptop, KeyRound, Circle, CheckCircle2, ExternalLink, Lightbulb } from 'lucide-react';
import { bridge, useBridge, bridgeEndpoints, CLIENT_LABELS, BridgeStatus } from '../services/bridgeClient';
import type { BridgeClientKind } from '../utils/bridgeCommands';
import { confirmDialog } from './Notifications';

interface BridgesModalProps {
    onClose: () => void;
}

const STATUS: Record<BridgeStatus, { label: string; tone: string }> = {
    off: { label: 'Off', tone: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-gray-400' },
    connecting: { label: 'Connecting…', tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
    connected: { label: 'Ready', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
    unavailable: { label: 'Not connected', tone: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' },
};

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }> = ({ checked, onChange, disabled, label }) => (
    <label className={`relative inline-flex items-center ${disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`} title={label}>
        <input type="checkbox" className="sr-only peer" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} aria-label={label} />
        <div className="w-9 h-5 bg-slate-200 dark:bg-white/10 rounded-full peer peer-checked:bg-orange-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
    </label>
);

const useCopy = () => {
    const [copied, setCopied] = useState<string | null>(null);
    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(text);
            setTimeout(() => setCopied(c => (c === text ? null : c)), 1500);
        } catch { /* clipboard blocked */ }
    };
    return { copied, copy };
};

const CopyBlock: React.FC<{ text: string }> = ({ text }) => {
    const { copied, copy } = useCopy();
    return (
        <div className="relative">
            <pre className="text-[10px] leading-relaxed font-mono bg-slate-900 text-slate-100 rounded-lg p-2.5 pr-9 overflow-x-auto whitespace-pre">{text}</pre>
            <button onClick={() => copy(text)} className="absolute top-1.5 right-1.5 p-1 rounded-md bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white" title="Copy">
                {copied === text ? <Check size={12} /> : <Copy size={12} />}
            </button>
        </div>
    );
};

export const BridgesModal: React.FC<BridgesModalProps> = ({ onClose }) => {
    const { settings, status, sessions, log } = useBridge();
    const [open, setOpen] = useState<BridgeClientKind | null>(null);
    const [relayDraft, setRelayDraft] = useState(settings.relayUrl);
    const [showLink, setShowLink] = useState(false);
    const { copied, copy } = useCopy();
    const endpoints = bridgeEndpoints(settings);
    const isRelay = settings.connection === 'relay';
    const link = endpoints?.mcp || '';
    const shown = link && !showLink && isRelay ? link.replace(settings.room, `${settings.room.slice(0, 4)}••••••••`) : link;

    // Remember that the current link was copied (for the checklist)
    const COPIED_KEY = 'SOAP_AI_LINK_COPIED';
    const [copiedRoom, setCopiedRoom] = useState(() => { try { return localStorage.getItem(COPIED_KEY) || ''; } catch { return ''; } });
    const copyLink = () => {
        copy(link);
        setCopiedRoom(settings.room);
        try { localStorage.setItem(COPIED_KEY, settings.room); } catch { /* storage unavailable */ }
    };
    const needsRelay = isRelay && !endpoints;
    const steps = [
        { done: settings.enabled && status === 'connected', label: 'Turn on AI access', hint: settings.enabled && status !== 'connected' ? 'Connecting…' : 'Use the button here or the switch below.' },
        { done: copiedRoom === settings.room && !!link, label: 'Copy your AI link', hint: 'It works like a password — keep it private.' },
        { done: sessions.length > 0, label: 'Add the link to your AI app', hint: sessions.length ? `Connected: ${[...new Set(sessions.map(x => x.name))].join(', ')}` : 'Pick your app for the exact steps.' },
    ];

    const resetLink = async () => {
        const ok = await confirmDialog({
            title: 'Reset your AI link?',
            message: 'AI apps using the current link will lose access. You will need to paste the new link into each one.',
            confirmLabel: 'Reset link',
        });
        if (ok) bridge.resetLink();
    };

    const L = link || '<your link>';
    const setup: Record<BridgeClientKind, React.ReactNode> = {
        claude: (
            <div className="space-y-2">
                <p><b>Claude (claude.ai or the desktop app)</b>: Settings → Connectors → <b>Add custom connector</b>, name it SOAP and paste your link.</p>
                <p><b>Claude Code</b>: run once in a terminal:</p>
                <CopyBlock text={`claude mcp add --transport http soap ${L}`} />
                <p>Older Claude Desktop without custom connectors: add this to <code>claude_desktop_config.json</code> (needs Node.js), then restart Claude:</p>
                <CopyBlock text={JSON.stringify({ mcpServers: { soap: { command: 'npx', args: ['-y', 'mcp-remote', L] } } }, null, 2)} />
            </div>
        ),
        gemini: (
            <div className="space-y-2">
                <p><b>Gemini CLI</b>: add to <code>~/.gemini/settings.json</code>:</p>
                <CopyBlock text={JSON.stringify({ mcpServers: { soap: { httpUrl: L } } }, null, 2)} />
            </div>
        ),
        chatgpt: isRelay ? (
            <div className="space-y-2">
                <p><b>ChatGPT</b>: Settings → Apps &amp; Connectors → Advanced settings → turn on <b>Developer mode</b>. Then create a connector named SOAP with your link as the server URL and <b>No authentication</b>. (Menu names change from time to time.)</p>
            </div>
        ) : (
            <p>ChatGPT connects from OpenAI's servers and can't reach this computer. Use the <b>Online relay</b> connection instead.</p>
        ),
        other: (
            <div className="space-y-2">
                <p>Any MCP app that supports Streamable HTTP (Cursor, VS Code, Windsurf…) can use your link as the server URL:</p>
                <CopyBlock text={L} />
            </div>
        ),
    };

    const kinds: BridgeClientKind[] = ['claude', 'gemini', 'chatgpt', 'other'];

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[250] flex items-center justify-center p-4 animate-in fade-in duration-200" onMouseDown={onClose}>
            <div
                className="bg-white dark:bg-dark-surface w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 dark:border-white/10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300"
                onMouseDown={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-slate-100 dark:border-dark-border flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 flex items-center justify-center"><Plug size={20} /></div>
                        <div>
                            <h2 className="text-base font-black text-slate-800 dark:text-gray-100 uppercase tracking-tight">AI Bridges</h2>
                            <p className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">Let Claude, Gemini or ChatGPT read and edit this project through MCP</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 rounded-full hover:bg-slate-100 dark:hover:bg-white/5"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5 text-[11px] text-slate-600 dark:text-gray-300">
                    {/* Guide */}
                    {needsRelay ? (
                        <div className="rounded-2xl border border-orange-200 dark:border-orange-500/30 bg-orange-50/60 dark:bg-orange-500/10 p-4 space-y-3">
                            <h3 className="text-xs font-black text-slate-800 dark:text-gray-100 uppercase tracking-wide">One-time setup: the relay</h3>
                            <p>Claude, ChatGPT and Gemini run on their own servers, so they need an internet address to reach SOAP in your browser. A small, free <b>relay</b> on Cloudflare gives them one. It is set up once for this site; after that, everyone just copies their own AI link.</p>
                            <p className="font-semibold">Not the owner of this site? Ask the owner for the relay address and paste it into <i>Relay address</i> below.</p>
                            <details className="rounded-xl bg-white/70 dark:bg-black/20 border border-orange-100 dark:border-white/10 p-3" open>
                                <summary className="cursor-pointer font-bold text-slate-800 dark:text-gray-100">Site owner: set up the relay (about 5 minutes)</summary>
                                <ol className="list-decimal pl-4 mt-2 space-y-2">
                                    <li>Create a free Cloudflare account: <a className="text-orange-600 hover:underline inline-flex items-center gap-0.5" href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer">dash.cloudflare.com/sign-up <ExternalLink size={10} /></a></li>
                                    <li>Install Node.js (the LTS version) if you do not have it: <a className="text-orange-600 hover:underline inline-flex items-center gap-0.5" href="https://nodejs.org" target="_blank" rel="noreferrer">nodejs.org <ExternalLink size={10} /></a></li>
                                    <li>Open a terminal in your SOAP code folder and run these one at a time. The login step opens your browser: sign in to Cloudflare and click <b>Allow</b>.
                                        <CopyBlock text={'cd relay\nnpm install\nnpx wrangler login\nnpx wrangler deploy'} />
                                    </li>
                                    <li>The last command prints an address ending in <code>.workers.dev</code>. Paste it into <b>Relay address</b> below.</li>
                                    <li>So everyone gets it automatically: in Vercel, open the project → <b>Settings → Environment Variables</b>, add <code>VITE_SOAP_RELAY_URL</code> with that address (for Production and Preview), then redeploy.</li>
                                </ol>
                            </details>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-slate-200/60 dark:border-white/10 p-4 space-y-2.5">
                            <h3 className="text-xs font-black text-slate-800 dark:text-gray-100 uppercase tracking-wide">Connect your AI in 3 steps</h3>
                            <ol className="space-y-2">
                                {steps.map((st, i) => (
                                    <li key={i} className="flex items-start gap-2.5">
                                        {st.done ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" /> : <Circle size={16} className="text-slate-300 dark:text-gray-600 shrink-0" />}
                                        <div className="flex-1 min-w-0">
                                            <div className={`font-bold ${st.done ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-gray-100'}`}>{i + 1}. {st.label}</div>
                                            <div className="text-[10px] text-slate-400">{st.hint}</div>
                                        </div>
                                        {i === 0 && !settings.enabled && (
                                            <button onClick={() => bridge.updateSettings({ enabled: true })} className="px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold">Turn on</button>
                                        )}
                                        {i === 1 && (
                                            <button disabled={!link} onClick={copyLink} className="px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[10px] font-bold flex items-center gap-1">
                                                {copied === link && link ? <Check size={11} /> : <Copy size={11} />} Copy link
                                            </button>
                                        )}
                                        {i === 2 && (
                                            <div className="flex gap-1">
                                                {(['claude', 'chatgpt', 'gemini'] as BridgeClientKind[]).map(k => (
                                                    <button key={k} onClick={() => setOpen(k)} className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${open === k ? 'border-orange-400 text-orange-600' : 'border-slate-200 dark:border-white/10 text-slate-500 hover:text-orange-600'}`}>{CLIENT_LABELS[k]}</button>
                                                ))}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ol>
                            <p className="flex items-start gap-1.5 text-[10px] text-slate-500 dark:text-gray-400 pt-1 border-t border-slate-100 dark:border-white/5">
                                <Lightbulb size={12} className="shrink-0 mt-0.5 text-amber-500" />
                                <span>Then just ask, e.g. <i>"Look at my SOAP project, arrange the ground floor following the planning rules, and show me the plan."</i> Keep this SOAP tab open while the AI works.</span>
                            </p>
                        </div>
                    )}

                    {/* Master switch */}
                    <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/10">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-800 dark:text-gray-100 uppercase tracking-wide">AI access</span>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${STATUS[status].tone}`}>{STATUS[status].label}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">
                                {status === 'unavailable'
                                    ? (isRelay
                                        ? (endpoints ? 'Could not reach the relay. Check the relay address below and your internet connection.' : 'Enter the relay address below to connect.')
                                        : 'Could not reach the bridge on this computer. It runs with the dev server: "npm run dev", then open SOAP at localhost.')
                                    : 'When on, AI apps with your link can read the project and make changes while SOAP is open. Every change is one Ctrl+Z.'}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {status === 'unavailable' && endpoints && (
                                <button onClick={() => bridge.retry()} className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-white dark:hover:bg-white/10" title="Try again"><RefreshCw size={14} /></button>
                            )}
                            <Toggle checked={settings.enabled} onChange={v => bridge.updateSettings({ enabled: v })} label="AI access" />
                        </div>
                    </div>

                    {/* Connection */}
                    <div className="space-y-3">
                        <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl gap-1">
                            {([['relay', <Cloud size={13} />, 'Online relay'], ['local', <Laptop size={13} />, 'This computer (dev server)']] as const).map(([value, icon, label]) => (
                                <button
                                    key={value}
                                    onClick={() => bridge.updateSettings({ connection: value })}
                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${settings.connection === value ? 'bg-white dark:bg-dark-surface text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-gray-200'}`}
                                >
                                    {icon}{label}
                                </button>
                            ))}
                        </div>

                        {isRelay && (
                            <label className="block space-y-1">
                                <span className="text-[10px] font-bold text-slate-500">Relay address</span>
                                <input
                                    value={relayDraft}
                                    placeholder="https://soap-relay.your-account.workers.dev"
                                    onChange={e => setRelayDraft(e.target.value)}
                                    onBlur={() => relayDraft !== settings.relayUrl && bridge.updateSettings({ relayUrl: relayDraft.trim() })}
                                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    className="w-full text-[11px] font-mono bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                                />
                            </label>
                        )}

                        <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5"><KeyRound size={11} /> Your AI link</span>
                            <div className="flex items-center gap-1.5">
                                <code className="flex-1 min-w-0 truncate text-[11px] bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg py-1.5 px-2 select-all" onClick={() => setShowLink(true)} title={isRelay ? 'Click to reveal' : undefined}>
                                    {shown || 'Enter the relay address first'}
                                </code>
                                <button disabled={!link} onClick={copyLink} className="px-2.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[10px] font-bold flex items-center gap-1">
                                    {copied === link && link ? <Check size={12} /> : <Copy size={12} />} Copy
                                </button>
                                {isRelay && (
                                    <button onClick={resetLink} className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-[10px] font-bold text-slate-500 hover:text-red-600" title="Make a new link; the old one stops working">
                                        Reset
                                    </button>
                                )}
                            </div>
                            {isRelay && (
                                <p className="flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-300">
                                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                    Treat this link like a password: anyone who has it can use your open SOAP while AI access is on. Reset it if it leaks.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Per-client switches */}
                    <div className="space-y-2">
                        {kinds.map(kind => {
                            const connected = sessions.filter(s => s.kind === kind);
                            return (
                                <div key={kind} className="rounded-2xl border border-slate-200/60 dark:border-white/10 overflow-hidden">
                                    <div className="flex items-center gap-3 px-4 py-3">
                                        <button onClick={() => setOpen(open === kind ? null : kind)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                                            {open === kind ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                                            <span className="text-xs font-bold text-slate-800 dark:text-gray-100">{CLIENT_LABELS[kind]}</span>
                                            {connected.length > 0 && (
                                                <span className="truncate px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" title={connected.map(s => `${s.name} ${s.version}`).join(', ')}>
                                                    ● {[...new Set(connected.map(s => s.name))].join(', ')}
                                                </span>
                                            )}
                                            <span className="text-[10px] text-slate-400 ml-auto shrink-0">Setup</span>
                                        </button>
                                        <Toggle
                                            checked={settings.clients[kind]}
                                            disabled={!settings.enabled}
                                            onChange={v => bridge.updateSettings({ clients: { [kind]: v } as Record<BridgeClientKind, boolean> })}
                                            label={`Allow ${CLIENT_LABELS[kind]}`}
                                        />
                                    </div>
                                    {open === kind && <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-white/5 space-y-2">{setup[kind]}</div>}
                                </div>
                            );
                        })}
                        <p className="flex items-start gap-1.5 text-[10px] text-slate-400">
                            <ShieldCheck size={12} className="shrink-0 mt-0.5" />
                            Your link is what protects access. Apps are then recognised by the name they report, so the switches choose which assistants you're working with; they aren't a password.
                        </p>
                    </div>

                    {/* Activity */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Activity</h3>
                            {log.length > 0 && <button onClick={() => bridge.clearLog()} className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-1"><Trash2 size={11} /> Clear</button>}
                        </div>
                        {log.length === 0 ? (
                            <p className="text-[10px] text-slate-400">No AI activity yet.</p>
                        ) : (
                            <ul className="divide-y divide-slate-100 dark:divide-white/5 rounded-xl border border-slate-200/60 dark:border-white/10 max-h-48 overflow-y-auto custom-scrollbar">
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
            </div>
        </div>
    );
};
