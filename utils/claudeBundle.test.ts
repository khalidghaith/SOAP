import { describe, it, expect } from 'vitest';
import { crc32, zip, buildClaudeBundle, claudeManifest } from './claudeBundle';
import { TOOLS } from '../mcp/core';

// Reads a stored-entry zip back (the same way unzip tools walk the central directory)
const unzip = (bytes: Uint8Array) => {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = bytes.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    const count = v.getUint16(eocd + 10, true);
    let p = v.getUint32(eocd + 16, true);
    const out: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
        expect(v.getUint32(p, true)).toBe(0x02014b50);
        const size = v.getUint32(p + 24, true), nameLen = v.getUint16(p + 28, true), local = v.getUint32(p + 42, true);
        const crc = v.getUint32(p + 16, true);
        const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
        const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
        const data = bytes.subarray(start, start + size);
        expect(crc32(data)).toBe(crc);
        out[name] = new TextDecoder().decode(data);
        p += 46 + nameLen;
    }
    return out;
};

describe('zip', () => {
    it('computes standard CRC-32', () => {
        expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    });

    it('round-trips files', () => {
        const files = unzip(zip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }, { name: 'dir/b.json', data: new TextEncoder().encode('{}') }]));
        expect(files).toEqual({ 'a.txt': 'hello', 'dir/b.json': '{}' });
    });
});

describe('Claude Desktop bundle', () => {
    const link = 'https://soap-relay.example.workers.dev/mcp/abcdefghijklmnopqrstuvwxyz012345';

    it('contains a manifest with the private link and the connector', () => {
        const files = unzip(buildClaudeBundle(link));
        expect(Object.keys(files).sort()).toEqual(['manifest.json', 'server/index.js']);
        const manifest = JSON.parse(files['manifest.json']);
        expect(manifest).toMatchObject({
            manifest_version: '0.3',
            name: 'soap',
            server: { type: 'node', entry_point: 'server/index.js', mcp_config: { command: 'node', args: ['${__dirname}/server/index.js'], env: { SOAP_MCP_URL: link } } },
        });
        expect(manifest.tools.map((t: { name: string }) => t.name)).toEqual(TOOLS.map(t => t.name));
        expect(files['server/index.js']).toContain('SOAP_MCP_URL');
    });

    it('includes the icon only when given one', () => {
        expect(claudeManifest(link, false)).not.toHaveProperty('icon');
        const files = unzip(buildClaudeBundle(link, new Uint8Array([137, 80, 78, 71])));
        expect(Object.keys(files)).toContain('icon.png');
        expect(JSON.parse(files['manifest.json']).icon).toBe('icon.png');
    });
});
