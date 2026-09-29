import connectorSource from '../mcp/connector/index.js?raw';
import { TOOLS, SERVER_INFO } from '../mcp/core';

// Builds a personal Claude Desktop extension (SOAP.mcpb) in the browser: a zip with a manifest and the
// dependency-free connector, with the user's private SOAP link baked in. Opening the file in Claude
// Desktop installs it; Claude ships its own Node.js, so nothing else is needed.

// --- Minimal zip writer (stored entries, no compression) ---

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

export const crc32 = (data: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

export const zip = (files: { name: string; data: Uint8Array }[]): Uint8Array => {
    const enc = new TextEncoder();
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;
    // DOS date/time: 2026-01-01 00:00 (a fixed stamp keeps bundles reproducible)
    const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
    for (const f of files) {
        const name = enc.encode(f.name);
        const crc = crc32(f.data);
        const local = new Uint8Array(30 + name.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);        // version needed
        lv.setUint16(6, 0x0800, true);    // UTF-8 names
        lv.setUint16(8, 0, true);         // stored
        lv.setUint16(10, dosTime, true);
        lv.setUint16(12, dosDate, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, f.data.length, true);
        lv.setUint32(22, f.data.length, true);
        lv.setUint16(26, name.length, true);
        local.set(name, 30);
        locals.push(local, f.data);

        const central = new Uint8Array(46 + name.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0x0800, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, dosTime, true);
        cv.setUint16(14, dosDate, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, f.data.length, true);
        cv.setUint32(24, f.data.length, true);
        cv.setUint16(28, name.length, true);
        cv.setUint32(42, offset, true);
        central.set(name, 46);
        centrals.push(central);
        offset += local.length + f.data.length;
    }
    const centralSize = centrals.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    const parts = [...locals, ...centrals, end];
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let p = 0;
    for (const part of parts) { out.set(part, p); p += part.length; }
    return out;
};

// --- The bundle ---

export const claudeManifest = (mcpUrl: string, hasIcon: boolean) => ({
    manifest_version: '0.3',
    name: 'soap',
    display_name: 'SOAP',
    version: SERVER_INFO.version,
    description: 'Lets Claude read and edit your open SOAP project: place spaces, check the layout and see the plan.',
    long_description:
        'Connects Claude to SOAP, the architectural programming and space-planning app, while SOAP is open in your browser with AI access on. ' +
        'Claude can read the program and site, add and place spaces, run the planning-rule check and look at a picture of each floor. ' +
        'Every change is one undo step in SOAP.',
    author: { name: 'SOAP' },
    ...(hasIcon ? { icon: 'icon.png' } : {}),
    server: {
        type: 'node',
        entry_point: 'server/index.js',
        mcp_config: {
            command: 'node',
            args: ['${__dirname}/server/index.js'],
            env: { SOAP_MCP_URL: mcpUrl },
        },
    },
    tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
    compatibility: {
        platforms: ['darwin', 'win32', 'linux'],
        runtimes: { node: '>=18.0.0' },
    },
});

export const buildClaudeBundle = (mcpUrl: string, iconPng?: Uint8Array): Uint8Array => {
    const enc = new TextEncoder();
    const files = [
        { name: 'manifest.json', data: enc.encode(JSON.stringify(claudeManifest(mcpUrl, !!iconPng), null, 2)) },
        { name: 'server/index.js', data: enc.encode(connectorSource) },
    ];
    if (iconPng) files.push({ name: 'icon.png', data: iconPng });
    return zip(files);
};

/** Renders an SVG (by URL) to PNG bytes, for the extension icon. Browser only; resolves undefined on failure. */
export const svgUrlToPng = async (url: string, size = 256): Promise<Uint8Array | undefined> => {
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;
        ctx.drawImage(img, 0, 0, size, size);
        const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
        return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
    } catch {
        return undefined;
    }
};

/** Starts a browser download of the bundle. */
export const downloadClaudeBundle = (bytes: Uint8Array, filename = 'SOAP.mcpb') => {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
};
