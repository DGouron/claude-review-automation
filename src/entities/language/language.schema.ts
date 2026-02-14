import { z } from 'zod';

export const languageSchema = z.enum(['en', 'fr']);

export type Language = z.infer<typeof languageSchema>;
