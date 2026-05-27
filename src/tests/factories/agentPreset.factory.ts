import type { AgentPreset } from '@/modules/setup-wizard/entities/agentPreset/agentPreset.schema.js';
import type { Preset } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

interface AgentPresetOverrides {
  preset?: Preset;
  agents?: string[];
}

export const AgentPresetFactory = {
  create(overrides: AgentPresetOverrides = {}): AgentPreset {
    return {
      preset: overrides.preset ?? 'backend',
      agents: overrides.agents ?? ['architecture', 'solid', 'testing'],
    };
  },
};
