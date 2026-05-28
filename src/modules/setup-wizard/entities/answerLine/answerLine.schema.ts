import { z } from 'zod';

export const confirmAnswerSchema = z.boolean();
export const choiceAnswerSchema = z.string();
export const multiSelectAnswerSchema = z.array(z.string());

export type ConfirmAnswer = z.infer<typeof confirmAnswerSchema>;
export type ChoiceAnswer = z.infer<typeof choiceAnswerSchema>;
export type MultiSelectAnswer = z.infer<typeof multiSelectAnswerSchema>;
