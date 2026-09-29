import path from 'node:path';
import { build } from 'esbuild';

/**
 * Bundles the SOAP helper (mcp/helper.ts and everything it uses, including ws) into one Node.js script,
 * which "Add to Claude" packs into SOAP.mcpb. Returns the script and the files it was built from.
 */
export const buildHelper = async () => {
    const out = await build({
        entryPoints: [path.resolve(__dirname, 'helper.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node18',
        write: false,
        metafile: true,
        external: ['bufferutil', 'utf-8-validate'], // optional speed-ups ws loads if present
        banner: { js: '// SOAP helper for Claude Desktop. Built from mcp/helper.ts in the SOAP source.' },
    });
    return { source: out.outputFiles[0].text, inputs: Object.keys(out.metafile.inputs).map(f => path.resolve(f)) };
};
