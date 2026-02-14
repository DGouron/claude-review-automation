import type { FastifyPluginAsync } from 'fastify';
import { getModel, setModel, getDefaultLanguage, setDefaultLanguage, getSettings, type ClaudeModel } from '@/frameworks/settings/runtimeSettings.js';
import { languageSchema } from '@/entities/language/language.schema.js';

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/settings', async () => {
    return getSettings();
  });

  fastify.post('/api/settings/model', async (request, reply) => {
    const { model } = request.body as { model?: ClaudeModel };

    if (!model) {
      reply.code(400);
      return { success: false, error: 'Model is required' };
    }

    const validModels: ClaudeModel[] = ['opus', 'sonnet'];
    if (!validModels.includes(model)) {
      reply.code(400);
      return { success: false, error: 'Invalid model. Use: opus, sonnet' };
    }

    setModel(model);
    return { success: true, model: getModel() };
  });

  fastify.post('/api/settings/language', async (request, reply) => {
    const { language } = request.body as { language?: string };

    const parsed = languageSchema.safeParse(language);
    if (!parsed.success) {
      reply.code(400);
      return { success: false, error: 'Invalid language. Use: en, fr' };
    }

    setDefaultLanguage(parsed.data);
    return { success: true, language: getDefaultLanguage() };
  });
};
