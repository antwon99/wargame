import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import path from 'path';

const outputDir = 'dist';

export default {
    input: 'scripts/bundle-entry.js',
    output: {
        dir: outputDir,
        format: 'iife',
        sourcemap: true,
        entryFileNames: 'assets/game-[hash].js',
        inlineDynamicImports: true
    },
    plugins: [
        nodeResolve({ browser: true }),
        commonjs()
    ],
    onwarn(warning, warn) {
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        warn(warning);
    }
};

export function getDistBundlePath(chunk) {
    return path.join(outputDir, chunk);
}
