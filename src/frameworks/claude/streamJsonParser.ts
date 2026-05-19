import { z } from 'zod';
import type { TokenUsage } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';

const systemEventSchema = z.object({
  type: z.literal('system'),
  subtype: z.string(),
  session_id: z.string().optional(),
  model: z.string().optional(),
});

const assistantEventSchema = z.object({
  type: z.literal('assistant'),
  message: z.object({
    content: z.array(
      z.object({
        type: z.string(),
        text: z.string().optional(),
      })
    ),
  }),
});

const resultEventSchema = z.object({
  type: z.literal('result'),
  subtype: z.string(),
  total_cost_usd: z.number(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    cache_creation_input_tokens: z.number(),
    cache_read_input_tokens: z.number(),
  }),
});

export type StreamJsonEvent =
  | z.infer<typeof systemEventSchema>
  | z.infer<typeof assistantEventSchema>
  | z.infer<typeof resultEventSchema>
  | { type: string };

export class StreamJsonParser {
  private buffer = '';
  private assistantText = '';
  private usage: TokenUsage | null = null;
  private rawEvents: StreamJsonEvent[] = [];

  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      this.parseLine(line);
    }
  }

  getAssistantText(): string {
    return this.assistantText;
  }

  getUsage(): TokenUsage | null {
    return this.usage;
  }

  getRawEvents(): readonly StreamJsonEvent[] {
    return this.rawEvents;
  }

  private parseLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }

    if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) {
      return;
    }

    const event = parsed as { type: string };

    const assistantResult = assistantEventSchema.safeParse(event);
    if (assistantResult.success) {
      this.rawEvents.push(assistantResult.data);
      for (const content of assistantResult.data.message.content) {
        if (content.type === 'text' && content.text !== undefined) {
          this.assistantText += content.text;
        }
      }
      return;
    }

    const resultResult = resultEventSchema.safeParse(event);
    if (resultResult.success) {
      this.rawEvents.push(resultResult.data);
      const { usage, total_cost_usd } = resultResult.data;
      this.usage = {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationInputTokens: usage.cache_creation_input_tokens,
        cacheReadInputTokens: usage.cache_read_input_tokens,
        costUsd: total_cost_usd,
      };
      return;
    }

    const systemResult = systemEventSchema.safeParse(event);
    if (systemResult.success) {
      this.rawEvents.push(systemResult.data);
      return;
    }

    this.rawEvents.push(event);
  }
}
