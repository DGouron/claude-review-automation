import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(process.cwd(), 'src');

const ALLOWED_PATHS: string[] = [
  'src/cli/parseCliArgs.ts',
  'src/frameworks/claude/claudeInsightsInvoker.ts',
  'src/frameworks/claude/streamJsonParser.ts',
  'src/tests/units/architecture/noClaudePInProduction.test.ts',
];

function listTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      results.push(...listTsFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function relativePath(absolutePath: string): string {
  return absolutePath.startsWith(process.cwd())
    ? absolutePath.slice(process.cwd().length + 1)
    : absolutePath;
}

function isAllowed(relPath: string): boolean {
  return ALLOWED_PATHS.includes(relPath);
}

describe('Architecture rule: no `claude -p` or `claude --print` in production review dispatch', () => {
  it('rejects forbidden invocation flags everywhere except the documented allowlist', () => {
    const offenders: Array<{ file: string; line: number; content: string }> = [];

    for (const file of listTsFiles(SRC_ROOT)) {
      const rel = relativePath(file);
      if (isAllowed(rel)) continue;
      if (rel.startsWith('src/tests/')) continue;

      const text = readFileSync(file, 'utf-8');
      const lines = text.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        if (/['"]-p['"]/.test(line) || /['"]--print['"]/.test(line)) {
          offenders.push({ file: rel, line: index + 1, content: line.trim() });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
