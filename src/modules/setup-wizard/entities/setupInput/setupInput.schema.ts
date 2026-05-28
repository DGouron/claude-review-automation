import { z } from 'zod';

export const setupInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), value: z.string() }),
  z.object({ kind: z.literal('confirm'), value: z.boolean() }),
  z.object({ kind: z.literal('choice'), value: z.string() }),
  z.object({ kind: z.literal('multiSelect'), value: z.array(z.string()) }),
]);

export type SetupInput = z.infer<typeof setupInputSchema>;

export function serializeSetupInput(input: SetupInput): string {
  if (input.kind === 'text') {
    return input.value;
  }
  return JSON.stringify(input.value);
}
