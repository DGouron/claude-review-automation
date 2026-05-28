import type { LineReader } from '@/modules/setup-wizard/entities/lineReader/lineReader.gateway.js';

export class StubLineReader implements LineReader {
  private readonly lines: string[];

  constructor(lines: string[]) {
    this.lines = [...lines];
  }

  async read(): Promise<string | null> {
    const next = this.lines.shift();
    if (next === undefined) return null;
    return next;
  }
}
