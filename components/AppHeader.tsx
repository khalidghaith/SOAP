import React, { useState } from 'react';
import {
    Download, Undo2, Redo2, RotateCcw, TableProperties, PencilRuler, Key, X, Settings,
    Moon, Sun, Box, Save, CircleHelp, Info, Menu, Plug,
} from 'lucide-react';
import SoapLogo from '../lib/symbols/SOAP-Logo.svg';
import type { useBridge } from '../services/bridgeClient';

export type ViewMode = 'EDITOR' | 'CANVAS' | 'VOLUMES';

const VIEW_TABS: { mode: ViewMode; label: string; Icon: typeof Box }[] = [
    { mode: 'EDITOR', label: 'Program', Icon: TableProperties },
    { mode: 'CANVAS', label: 'Canvas', Icon: PencilRuler },
    { mode: 'VOLUMES', label: 'Volumes', Icon: Box },
];

interface AppHeaderProps {
    projectName: string;
    onProjectNameChange: (name: string) => void;
    /** The logo block matches the inventory sidebar's width. */
    isInventoryOpen: boolean;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    darkMode: boolean;
    onToggleDarkMode: () => void;
    bridgeState: ReturnType<typeof useBridge>;
    hasApiKey: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onResetProject: () => void;
    onOpenBridges: () => void;
    onOpenApiKey: () => void;
    onOpenSettings: () => void;
    onOpenHelp: () => void;
    onOpenAbout: () => void;
    onOpenSave: () => void;
    onImportProject: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Top bar: project name, app actions, the Program / Canvas / Volumes switch, save and open. */
export const AppHeader: React.FC<AppHeaderProps> = ({
    projectName, onProjectNameChange, isInventoryOpen, viewMode, onViewModeChange, darkMode, onToggleDarkMode,
    bridgeState, hasApiKey, canUndo, canRedo, onUndo, onRedo, onResetProject,
    onOpenBridges, onOpenApiKey, onOpenSettings, onOpenHelp, onOpenAbout, onOpenSave, onImportProject,
}) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    // Runs a menu action and closes the mobile menu
    const fromMenu = (action: () => void) => () => { action(); setIsMobileMenuOpen(false); };

    return (
        <header className="h-[42px] glass-panel !border-x-0 !border-t-0 flex items-center justify-between pr-4 shrink-0 z-40 shadow-sm relative transition-colors duration-300">
            <div className="flex flex-1 items-center h-full overflow-hidden">
                {/* Logo Block (matches inventory width) */}
                <div className={`flex items-center h-full transition-all duration-300 shrink-0 ${isInventoryOpen ? 'w-80 border-r border-slate-200/50 dark:border-dark-border pr-2' : 'w-[42px] mr-4'}`}>
                    <img src={SoapLogo} className="w-[42px] h-[42px] object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity" title="Rename Project" alt="SOAP" onClick={() => {
                        const newName = window.prompt("Rename Project:", projectName);
                        if (newName && newName.trim()) onProjectNameChange(newName);
                    }} />
                    <div className={`flex-1 min-w-0 px-3 hidden md:block transition-opacity duration-300 ${isInventoryOpen ? 'opacity-100' : 'opacity-0'}`}>
                        <input className="font-black text-slate-900 dark:text-gray-100 tracking-tight leading-none bg-transparent border-none focus:outline-none focus:ring-0 w-full p-0 text-sm truncate" value={projectName} onChange={(e) => onProjectNameChange(e.target.value)} />
                    </div>
                </div>

                {/* Actions Block */}
                <div className="hidden lg:flex items-center gap-1 pl-2">
                    <button
                        onClick={onToggleDarkMode}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${!darkMode ? 'text-slate-400 hover:text-orange-500 hover:bg-orange-50' : 'text-slate-400 hover:text-orange-400 hover:bg-white/5'}`}
                        title="Toggle Dark Mode"
                    >
                        {darkMode ? <Moon size={14} /> : <Sun size={14} />}
                    </button>
                    <button
                        onClick={onOpenBridges}
                        className={`relative w-8 h-8 rounded-lg flex items-center justify-center ${bridgeState.settings.enabled ? 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-white/5' : 'text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-white/5'}`}
                        title="Connect an AI assistant (Claude)"
                    >
                        <Plug size={14} />
                        {bridgeState.settings.enabled && (
                            // Waiting for Claude Desktop to open is normal (amber); red means something needs fixing
                            <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${bridgeState.status === 'connected' ? (bridgeState.sessions.length ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500') : bridgeState.problem || (bridgeState.status === 'unavailable' && bridgeState.settings.connection !== 'helper') ? 'bg-red-500' : 'bg-amber-400'}`} />
                        )}
                    </button>
                    <button
                        onClick={onOpenApiKey}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasApiKey ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-white/5' : 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 shadow-lg shadow-orange-100'}`}
                        title="Gemini API Key Settings"
                    >
                        <Key size={14} />
                    </button>
                    <button onClick={onOpenSettings} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-white/5" title="Advanced Preferences">
                        <Settings size={14} />
                    </button>
                    <button onClick={onOpenHelp} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-white/5" title="Help">
                        <CircleHelp size={14} />
                    </button>
                    <button onClick={onOpenAbout} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-white/5" title="About">
                        <Info size={14} />
                    </button>

                    <div className="h-6 w-px bg-slate-200/60 dark:bg-dark-border mx-1" />

                    <button onClick={onUndo} disabled={!canUndo} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-30" title="Undo (Ctrl+Z)">
                        <Undo2 size={14} />
                    </button>
                    <button onClick={onRedo} disabled={!canRedo} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-30" title="Redo (Ctrl+Y)">
                        <Redo2 size={14} />
                    </button>
                    <div className="w-px h-3 bg-slate-200 dark:bg-dark-border mx-1" />
                    <button onClick={onResetProject} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Reset Project">
                        <RotateCcw size={14} />
                    </button>
                </div>

                {/* Mobile Menu Button */}
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="lg:hidden ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
                >
                    {isMobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
                </button>
            </div>

            {/* Workspace Toggles - Centered */}
            <div className="flex justify-center flex-none h-[42px] border-x border-slate-200/20 dark:border-dark-border bg-transparent shadow-sm">
                {VIEW_TABS.map(({ mode, label, Icon }, i) => (
                    <React.Fragment key={mode}>
                        {i > 0 && <div className="w-px h-full bg-slate-200/80 dark:bg-dark-border" />}
                        <button
                            onClick={() => onViewModeChange(mode)}
                            className={`flex items-center justify-center gap-2 px-6 h-full text-[10px] font-black uppercase tracking-widest transition-colors ${viewMode === mode ? 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-b-2 border-orange-500 shadow-[inset_0_-2px_10px_rgba(249,115,22,0.05)]' : 'text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-200/30 dark:hover:bg-white/5 border-b-2 border-transparent'}`}
                        >
                            <Icon size={14} /> <span className="hidden lg:inline">{label}</span>
                        </button>
                    </React.Fragment>
                ))}
            </div>

            <div className="flex flex-1 items-center justify-end gap-1.5">
                <button
                    onClick={onOpenSave} className="h-8 px-3 text-slate-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 group"
                >
                    <Save size={14} className="group-hover:-translate-y-0.5" /> Save
                </button>

                <div className="flex items-center">
                    <label className="h-8 px-3 text-slate-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer group">
                        <Download size={14} className="group-hover:-translate-y-0.5" /> Project
                        <input type="file" accept={viewMode === 'EDITOR' ? ".json,.csv" : ".json"} className="hidden" onChange={onImportProject} />
                    </label>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div className="absolute top-[42px] left-0 right-0 bg-white dark:bg-dark-surface border-b border-slate-200 dark:border-dark-border p-4 flex flex-col gap-4 z-50 shadow-xl lg:hidden animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-5 gap-2">
                        <button
                            onClick={fromMenu(onToggleDarkMode)}
                            className={`h-10 rounded-xl flex items-center justify-center ${!darkMode ? 'bg-slate-100 text-slate-600' : 'bg-white/5 text-slate-300'}`}
                        >
                            {darkMode ? <Moon size={16} /> : <Sun size={16} />}
                        </button>
                        <button
                            onClick={fromMenu(onOpenApiKey)}
                            className={`h-10 rounded-xl flex items-center justify-center ${hasApiKey ? 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300' : 'bg-orange-50 text-orange-600 border border-orange-200'}`}
                        >
                            <Key size={16} />
                        </button>
                        <button
                            onClick={fromMenu(onOpenBridges)}
                            className="h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"
                            title="AI Bridges"
                        >
                            <Plug size={16} />
                        </button>
                        <button
                            onClick={fromMenu(onOpenSettings)}
                            className="h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"
                        >
                            <Settings size={16} />
                        </button>
                        <button
                            onClick={fromMenu(onOpenHelp)}
                            className="h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"
                        >
                            <CircleHelp size={16} />
                        </button>
                        <button
                            onClick={fromMenu(onOpenAbout)}
                            className="h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"
                        >
                            <Info size={16} />
                        </button>
                    </div>
                    <div className="h-px bg-slate-100 dark:bg-dark-border" />
                    <div className="grid grid-cols-3 gap-2">
                        <button onClick={fromMenu(onUndo)} disabled={!canUndo} className="h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300 disabled:opacity-50">
                            <Undo2 size={16} />
                        </button>
                        <button onClick={fromMenu(onRedo)} disabled={!canRedo} className="h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300 disabled:opacity-50">
                            <Redo2 size={16} />
                        </button>
                        <button onClick={fromMenu(onResetProject)} className="h-10 rounded-xl flex items-center justify-center bg-red-50 text-red-500 dark:bg-red-900/20">
                            <RotateCcw size={16} />
                        </button>
                    </div>
                </div>
            )}
        </header>
    );
};
