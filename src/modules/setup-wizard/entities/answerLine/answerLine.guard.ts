import { createGuard } from '@/shared/foundation/guard.base.js';
import {
  confirmAnswerSchema,
  choiceAnswerSchema,
  multiSelectAnswerSchema,
} from '@/modules/setup-wizard/entities/answerLine/answerLine.schema.js';

export const confirmAnswerGuard = createGuard(confirmAnswerSchema, 'confirmAnswer');
export const choiceAnswerGuard = createGuard(choiceAnswerSchema, 'choiceAnswer');
export const multiSelectAnswerGuard = createGuard(multiSelectAnswerSchema, 'multiSelectAnswer');
