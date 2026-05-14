import { describe, it, expect } from 'vitest';
import { StreamJsonParser } from '@/frameworks/claude/streamJsonParser.js';

const systemEvent = JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-1', model: 'claude-opus-4-7' });
const assistantEvent = (text: string) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const resultEvent = JSON.stringify({
  type: 'result',
  subtype: 'success',
  duration_ms: 12345,
  total_cost_usd: 0.0042,
  usage: {
    input_tokens: 12000,
    cache_creation_input_tokens: 500,
    cache_read_input_tokens: 8000,
    output_tokens: 420,
  },
});

describe('StreamJsonParser', () => {
  it('should parse a complete typical stream', () => {
    const parser = new StreamJsonParser();
    const stream = [systemEvent, assistantEvent('Hello world'), resultEvent].join('\n') + '\n';

    parser.feed(stream);

    expect(parser.getAssistantText()).toBe('Hello world');
    expect(parser.getUsage()).toEqual({
      inputTokens: 12000,
      outputTokens: 420,
      cacheCreationInputTokens: 500,
      cacheReadInputTokens: 8000,
      costUsd: 0.0042,
    });
  });

  it('should handle chunks split mid-line', () => {
    const parser = new StreamJsonParser();
    const fullLine = assistantEvent('Split text');
    const half = Math.floor(fullLine.length / 2);

    parser.feed(fullLine.slice(0, half));
    parser.feed(fullLine.slice(half) + '\n');
    parser.feed(resultEvent + '\n');

    expect(parser.getAssistantText()).toBe('Split text');
    expect(parser.getUsage()).not.toBeNull();
  });

  it('should ignore invalid JSON lines without crashing', () => {
    const parser = new StreamJsonParser();

    parser.feed('not valid json\n');
    parser.feed(assistantEvent('After bad line') + '\n');
    parser.feed(resultEvent + '\n');

    expect(parser.getAssistantText()).toBe('After bad line');
    expect(parser.getUsage()).not.toBeNull();
  });

  it('should ignore empty lines', () => {
    const parser = new StreamJsonParser();

    parser.feed('\n\n');
    parser.feed(assistantEvent('After empty lines') + '\n');
    parser.feed('\n');
    parser.feed(resultEvent + '\n');

    expect(parser.getAssistantText()).toBe('After empty lines');
  });

  it('should return null usage when no result event', () => {
    const parser = new StreamJsonParser();

    parser.feed(assistantEvent('Some text') + '\n');

    expect(parser.getUsage()).toBeNull();
  });

  it('should concatenate multiple assistant text events in order', () => {
    const parser = new StreamJsonParser();

    parser.feed(assistantEvent('Part 1 ') + '\n');
    parser.feed(assistantEvent('Part 2 ') + '\n');
    parser.feed(assistantEvent('Part 3') + '\n');

    expect(parser.getAssistantText()).toBe('Part 1 Part 2 Part 3');
  });

  it('should expose raw events for debugging', () => {
    const parser = new StreamJsonParser();

    parser.feed(systemEvent + '\n');
    parser.feed(assistantEvent('text') + '\n');

    const events = parser.getRawEvents();
    expect(events.length).toBe(2);
  });

  it('should ignore unknown event types', () => {
    const parser = new StreamJsonParser();

    parser.feed(JSON.stringify({ type: 'unknown_future_event', data: {} }) + '\n');
    parser.feed(assistantEvent('After unknown') + '\n');

    expect(parser.getAssistantText()).toBe('After unknown');
  });
});
