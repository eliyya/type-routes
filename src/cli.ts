#!/usr/bin/env node
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Folder, Root } from './Tree.js';

const ROOT_DIR = './src/app'

async function generateRoutes(dir: string, parentRoute: Folder | Root) {
  const files = await readdir(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    const fileStat = await stat(fullPath);
    if (fileStat.isDirectory()) {
      const route = new Folder(file, parentRoute);
      parentRoute.children.push(route);
      await generateRoutes(fullPath, route);
    }
  }
  return parentRoute;
}

const root = await generateRoutes(ROOT_DIR, new Root());
await writeFile(resolve(import.meta.dirname, '../lib/index.d.ts'), root.generateTypeFile());
await writeFile(resolve(import.meta.dirname, '../lib/index.js'), root.generateJavaScriptFile());
console.log('[type-routes] Routes typed');