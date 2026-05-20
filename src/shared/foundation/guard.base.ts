import { z, type ZodType } from 'zod';

interface FilterResult<T> {
  valid: T[];
  rejected: { rawData: unknown; issues: z.core.$ZodIssue[] }[];
}

export interface Guard<T> {
  isValid: (data: unknown) => data is T;
  parse: (data: unknown) => T;
  safeParse: (data: unknown) => z.ZodSafeParseResult<T>;
  isValidCollection: (data: unknown) => data is T[];
  parseCollection: (data: unknown) => T[];
  safeParseCollection: (data: unknown) => z.ZodSafeParseResult<T[]>;
  filterCollection: (items: unknown[]) => FilterResult<T>;
}

/**
 * Creates a Guard around a Zod schema.
 *
 * @param schema      Zod schema to validate against.
 * @param instigator  Label included in thrown error messages — gives callers
 *                    a clear hint about which guard rejected their input.
 *                    Use the entity / schema name (e.g. 'reviewAction').
 */
export function createGuard<T>(schema: ZodType<T>, instigator: string): Guard<T> {
  const arraySchema = z.array(schema);

  return {
    isValid: (data: unknown): data is T => {
      return schema.safeParse(data).success;
    },

    parse: (data: unknown): T => {
      const result = schema.safeParse(data);
      if (!result.success) {
        throw new Error(`[${instigator}] Validation failed: ${result.error.message}`);
      }
      return result.data;
    },

    safeParse: (data: unknown): z.ZodSafeParseResult<T> => {
      return schema.safeParse(data);
    },

    isValidCollection: (data: unknown): data is T[] => {
      return arraySchema.safeParse(data).success;
    },

    parseCollection: (data: unknown): T[] => {
      const result = arraySchema.safeParse(data);
      if (!result.success) {
        throw new Error(`[${instigator}] Collection validation failed: ${result.error.message}`);
      }
      return result.data;
    },

    safeParseCollection: (data: unknown): z.ZodSafeParseResult<T[]> => {
      return arraySchema.safeParse(data);
    },

    filterCollection: (items: unknown[]): FilterResult<T> => {
      const valid: T[] = [];
      const rejected: FilterResult<T>['rejected'] = [];

      for (const item of items) {
        const result = schema.safeParse(item);
        if (result.success) {
          valid.push(result.data);
        } else {
          rejected.push({ rawData: item, issues: result.error.issues });
        }
      }

      return { valid, rejected };
    },
  };
}
