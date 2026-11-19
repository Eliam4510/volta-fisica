// La versión es una sola: package.json, Cargo.toml, tauri.conf.json y CHANGELOG.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const leer = p => readFileSync(join(raiz, p), 'utf8');

describe('versión', () => {
  const paquete = JSON.parse(leer('package.json')).version;

  it('sigue el versionado semántico', () => {
    expect(paquete).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('coincide en tauri.conf.json', () => {
    expect(JSON.parse(leer('src-tauri/tauri.conf.json')).version).toBe(paquete);
  });
  it('coincide en Cargo.toml', () => {
    expect(leer('src-tauri/Cargo.toml')).toMatch(new RegExp(`^version = "${paquete.replace(/\./g, '\\.')}"`, 'm'));
  });
  it('tiene su entrada en el CHANGELOG', () => {
    expect(leer('CHANGELOG.md')).toContain(`## [${paquete}]`);
  });
});
