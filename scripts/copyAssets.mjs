import { cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(rootDir, 'src', 'dashboard');
const target = join(rootDir, 'dist', 'dashboard');

mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });

const animeSource = join(rootDir, 'node_modules', 'animejs', 'dist', 'bundles', 'anime.esm.min.js');
const animeTargetSrc = join(source, 'vendor', 'anime.esm.min.js');
const animeTargetDist = join(target, 'vendor', 'anime.esm.min.js');
mkdirSync(dirname(animeTargetSrc), { recursive: true });
mkdirSync(dirname(animeTargetDist), { recursive: true });
cpSync(animeSource, animeTargetSrc);
cpSync(animeSource, animeTargetDist);
