import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MODULES_DIR = resolve(
  process.cwd(),
  'src/interface-adapters/views/dashboard/modules'
);

const TESTS_DIR = resolve(
  process.cwd(),
  'src/tests/units/interface-adapters/views/dashboard/modules'
);

function listJsModules(): string[] {
  if (!existsSync(MODULES_DIR)) {
    return [];
  }
  return readdirSync(MODULES_DIR)
    .filter((file) => file.endsWith('.js'))
    .map((file) => file.replace(/\.js$/, ''));
}

function listTestFiles(): string[] {
  if (!existsSync(TESTS_DIR)) {
    return [];
  }
  return readdirSync(TESTS_DIR)
    .filter((file) => file.endsWith('.test.ts'))
    .map((file) => file.replace(/\.test\.ts$/, ''));
}

describe('Acceptance — Spec #51: dashboard modules coverage', () => {
  // Outer-loop SDD acceptance test. Stays skipped until spec-051 implementation
  // closes the gap (6 uncovered modules: cleanup, collapsibleList, mrSheet,
  // sharedViewHelpers, statsCharts, versionUpdate). Remove `.skip` when
  // implementing the spec and let it turn GREEN.
  it.skip('every dashboard module has a corresponding test file', () => {
    const modules = listJsModules();
    const tests = listTestFiles();

    expect(modules.length).toBeGreaterThan(0);

    const uncovered = modules.filter((module) => !tests.includes(module));

    expect(uncovered, `Modules sans test: ${uncovered.join(', ')}`).toEqual([]);
  });

  it.skip('every test file targets an existing dashboard module', () => {
    const modules = listJsModules();
    const tests = listTestFiles();

    const orphans = tests.filter((test) => !modules.includes(test));

    expect(orphans, `Tests orphelins: ${orphans.join(', ')}`).toEqual([]);
  });

  it('dashboard modules directory exists', () => {
    expect(
      existsSync(MODULES_DIR),
      'Aucun module dashboard détecté'
    ).toBe(true);
  });
});
