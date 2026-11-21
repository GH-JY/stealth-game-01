// Builds the hand-in. It copies the playable game and the real screenshots into the output directory
// (MAKEFUN_OUTPUT_DIR, else /output), then writes dossier.json there with the vendored make.fun
// library and the kit's caps, exactly as the scorer will read it. Node 22, standard library only.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(outDir, { recursive: true });
for (const name of ['game', 'screenshots']) {
  const target = join(outDir, name);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(root, name), target, { recursive: true });
}

const dossier = buildDossier(outDir, caps);
writeFileSync(join(outDir, 'dossier.json'), dossier);
process.stdout.write(`Wrote ${join(outDir, 'dossier.json')} (${dossier.length} bytes).\n`);
