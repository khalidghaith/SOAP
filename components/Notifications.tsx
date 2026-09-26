import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';

// In-app replacement for window.alert / window.confirm.
// `notify` and `confirmDialog` can be called from anywhere (components, hooks, plain helpers);
// <NotificationHost /> renders them and must be mounted once.

export type NotificationKind = 'success' | 'error' | 'warning' | 'info';

export interface NotifyOptions {
    kind?: NotificationKind;
    title: string;
    message?: string;
    details?: string[];          // shown as a bulleted list
    durationMs?: number;         // 0 = stays until dismissed
}

interface Toast extends Required<Pick<NotifyOptions, 'kind' | 'title'>> {
    id: number;
    message?: string;
    details?: string[];
    durationMs: number;
}

export interface ConfirmOptions {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
    resolve: (ok: boolean) => void;
}

let toasts: Toast[] = [];
let pendingConfirm: PendingConfirm | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
let snapshot: { toasts: Toast[]; pendingConfirm: PendingConfirm | null } = { toasts, pendingConfirm };
const emit = () => {
    snapshot = { toasts, pendingConfirm };
    listeners.forEach(l => l());
};

export const dismissNotification = (id: number) => {
    toasts = toasts.filter(t => t.id !== id);
    emit();
};

export const notify = ({ kind = 'info', title, message, details, durationMs }: NotifyOptions) => {
    const id = nextId++;
    // Errors and long lists stay until dismissed; everything else fades out
    const duration = durationMs ?? (kind === 'error' || (details && details.length > 0) ? 0 : 4000);
    toasts = [...toasts.slice(-4), { id, kind, title, message, details, durationMs: duration }];
    emit();
    return id;
};

export const confirmDialog = (options: ConfirmOptions): Promise<boolean> =>
    new Promise(resolve => {
        pendingConfirm?.resolve(false);
        pendingConfirm = { ...options, resolve };
        emit();
    });

const settleConfirm = (ok: boolean) => {
    pendingConfirm?.resolve(ok);
    pendingConfirm = null;
    emit();
};

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const KIND_STYLES: Record<NotificationKind, { icon: React.ReactNode; accent: string }> = {
    success: { icon: <CheckCircle2 size={18} />, accent: 'text-emerald-500' },
    error: { icon: <XCircle size={18} />, accent: 'text-red-500' },
    warning: { icon: <AlertTriangle size={18} />, accent: 'text-amber-500' },
    info: { icon: <Info size={18} />, accent: 'text-orange-500' },
};

const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
    useEffect(() => {
        if (!toast.durationMs) return;
        const t = setTimeout(() => dismissNotification(toast.id), toast.durationMs);
        return () => clearTimeout(t);
    }, [toast.id, toast.durationMs]);

    const { icon, accent } = KIND_STYLES[toast.kind];
    return (
        <div
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto w-full bg-white dark:bg-dark-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl p-4 flex gap-3 animate-in slide-in-from-bottom-2 fade-in duration-200"
        >
            <span className={`shrink-0 mt-0.5 ${accent}`}>{icon}</span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">{toast.title}</p>
                {toast.message && <p className="mt-1 text-xs text-slate-600 dark:text-gray-300 whitespace-pre-line break-words">{toast.message}</p>}
                {toast.details && toast.details.length > 0 && (
                    <ul className="mt-2 max-h-48 overflow-y-auto space-y-1 text-xs text-slate-600 dark:text-gray-300 list-disc pl-4">
                        {toast.details.map((d, i) => <li key={i} className="break-words">{d}</li>)}
                    </ul>
                )}
            </div>
            <button onClick={() => dismissNotification(toast.id)} aria-label="Dismiss" className="shrink-0 self-start text-slate-400 hover:text-slate-700 dark:hover:text-gray-200">
                <X size={16} />
            </button>
        </div>
    );
};

const ConfirmModal: React.FC<{ confirm: PendingConfirm }> = ({ confirm }) => {
    const confirmRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        confirmRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); settleConfirm(false); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [confirm]);

    return (
        <div className="fixed inset-0 z-[600] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={() => settleConfirm(false)}>
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="soap-confirm-title"
                aria-describedby={confirm.message ? 'soap-confirm-message' : undefined}
                className="w-full max-w-sm bg-white dark:bg-dark-surface rounded-3xl shadow-2xl border border-slate-100 dark:border-white/10 p-6 animate-in zoom-in-95 duration-200"
                onMouseDown={e => e.stopPropagation()}
            >
                <h2 id="soap-confirm-title" className="text-base font-black text-slate-800 dark:text-gray-100">{confirm.title}</h2>
                {confirm.message && <p id="soap-confirm-message" className="mt-2 text-sm text-slate-600 dark:text-gray-300">{confirm.message}</p>}
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={() => settleConfirm(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5">
                        {confirm.cancelLabel || 'Cancel'}
                    </button>
                    <button
                        ref={confirmRef}
                        onClick={() => settleConfirm(true)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold text-white ${confirm.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'}`}
                    >
                        {confirm.confirmLabel || 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const NotificationHost: React.FC = () => {
    const state = useSyncExternalStore(subscribe, () => snapshot);
    return (
        <>
            <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-[550] flex flex-col gap-2 pointer-events-none" aria-live="polite">
                {state.toasts.map(t => <ToastItem key={t.id} toast={t} />)}
            </div>
            {state.pendingConfirm && <ConfirmModal confirm={state.pendingConfirm} />}
        </>
    );
};
