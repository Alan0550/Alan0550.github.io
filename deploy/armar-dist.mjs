#!/usr/bin/env node
/*
 * Arma dist/: lo que se publica en Cloudflare, y nada más.
 *
 * Lista de lo permitido (no de lo excluido): solo archivos que git rastrea,
 * con una extensión web. Así quedan afuera docs/, README, .env.example, los
 * .zip y los PDF que hay entre las fotos, .DS_Store, y todo lo que git ignora
 * (temp/, scripts/). En CI y en local sale lo
 * mismo.
 *
 * Run: node deploy/armar-dist.mjs
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');

// Lo de la raíz que se publica, además de los .html.
const SUELTOS = new Set(['robots.txt', 'sitemap.xml', 'manifest.json']);
// Carpetas publicables y las extensiones que se aceptan en cada una.
const CARPETAS = {
    'css/': ['.css'],
    'js/': ['.js', '.json'],
    'imagenes/': ['.webp', '.png', '.jpg', '.jpeg', '.avif', '.svg', '.gif', '.ico']
};

function publicable(ruta) {
    const nombre = ruta.toLowerCase();
    if (!ruta.includes('/')) {
        return nombre.endsWith('.html') || SUELTOS.has(ruta);
    }
    const carpeta = Object.keys(CARPETAS).find(prefijo => ruta.startsWith(prefijo));
    return !!carpeta && CARPETAS[carpeta].some(ext => nombre.endsWith(ext));
}

const rastreados = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);

rmSync(DIST, { recursive: true, force: true });
let archivos = 0;
let bytes = 0;
for (const ruta of rastreados.filter(publicable)) {
    const origen = join(RAIZ, ruta);
    // Borrado en el árbol pero aún en el índice: se saltea.
    if (!existsSync(origen)) continue;
    const destino = join(DIST, ruta);
    mkdirSync(dirname(destino), { recursive: true });
    copyFileSync(origen, destino);
    archivos += 1;
    bytes += statSync(origen).size;
}
copyFileSync(join(RAIZ, 'deploy', '_headers'), join(DIST, '_headers'));

console.log(`dist/: ${archivos} archivos, ${(bytes / 2 ** 20).toFixed(1)} MB`);
