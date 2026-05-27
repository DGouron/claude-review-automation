import type { FastifyPluginAsync } from 'fastify';
import {
  claudeModelSchema,
  getModel,
  setModel,
  getDefaultLanguage,
  setDefaultLanguage,
  getSettings,
} from '@/frameworks/settings/runtimeSettings.js';
import { languageSchema } from '@/modules/shared-kernel/entities/language/language.schema.js';

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/settings', async () => {
    return getSettings();
  });

  fastify.get('/api/settings/model', async () => {
    return { model: getModel() };
  });

  fastify.post('/api/settings/model', async (request, reply) => {
    const { model } = request.body as { model?: unknown };

    const parsed = claudeModelSchema.safeParse(model);
    if (!parsed.success) {
      reply.code(400);
      return { success: false, error: `Invalid model. Use: ${claudeModelSchema.options.join(', ')}` };
    }

    await setModel(parsed.data);
    return { success: true, model: getModel() };
  });

  fastify.post('/api/settings/language', async (request, reply) => {
    const { language } = request.body as { language?: unknown };

    const parsed = languageSchema.safeParse(language);
    if (!parsed.success) {
      reply.code(400);
      return { success: false, error: `Invalid language. Use: ${languageSchema.options.join(', ')}` };
    }

    await setDefaultLanguage(parsed.data);
    return { success: true, language: getDefaultLanguage() };
  });
};
