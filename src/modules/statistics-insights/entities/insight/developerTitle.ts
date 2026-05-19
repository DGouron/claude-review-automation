import { z } from 'zod';

export const DEVELOPER_TITLES = [
  'architect',
  'firefighter',
  'workhorse',
  'sentinel',
  'polyvalent',
  'risingStar',
] as const;

export const developerTitleSchema = z.enum(DEVELOPER_TITLES);

export type DeveloperTitle = z.infer<typeof developerTitleSchema>;
