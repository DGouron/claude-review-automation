export interface AgentDefinition {
  name: string;
  displayName: string;
}

export const DEFAULT_AGENTS: AgentDefinition[] = [
  { name: 'clean-architecture', displayName: 'Clean Archi' },
  { name: 'ddd', displayName: 'DDD' },
  { name: 'react-best-practices', displayName: 'React' },
  { name: 'solid', displayName: 'SOLID' },
  { name: 'testing', displayName: 'Testing' },
  { name: 'code-quality', displayName: 'Code Quality' },
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];

export const DEFAULT_FOLLOWUP_AGENTS: AgentDefinition[] = [
  { name: 'context', displayName: 'Contexte' },
  { name: 'verify', displayName: 'Vérification' },
  { name: 'scan', displayName: 'Scan' },
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];

export const DEFAULT_FRONT_AGENTS: AgentDefinition[] = [
  { name: 'clean-architecture', displayName: 'Clean Archi' },
  { name: 'ddd', displayName: 'DDD' },
  { name: 'react-best-practices', displayName: 'React' },
  { name: 'solid', displayName: 'SOLID' },
  { name: 'testing', displayName: 'Testing' },
  { name: 'code-quality', displayName: 'Code Quality' },
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];

export const DEFAULT_BACK_AGENTS: AgentDefinition[] = [
  { name: 'clean-architecture', displayName: 'Clean Archi' },
  { name: 'ddd', displayName: 'DDD' },
  { name: 'solid', displayName: 'SOLID' },
  { name: 'testing', displayName: 'Testing' },
  { name: 'code-quality', displayName: 'Code Quality' },
  { name: 'security', displayName: 'Security' },
  { name: 'performance', displayName: 'Performance' },
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];

export const DEFAULT_FULLSTACK_AGENTS: AgentDefinition[] = [
  { name: 'clean-architecture', displayName: 'Clean Archi' },
  { name: 'ddd', displayName: 'DDD' },
  { name: 'react-best-practices', displayName: 'React' },
  { name: 'solid', displayName: 'SOLID' },
  { name: 'testing', displayName: 'Testing' },
  { name: 'code-quality', displayName: 'Code Quality' },
  { name: 'security', displayName: 'Security' },
  { name: 'performance', displayName: 'Performance' },
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];

export const DEFAULT_DOC_AGENTS: AgentDefinition[] = [
  { name: 'markdown-quality', displayName: 'Markdown Quality' },
  { name: 'link-validity', displayName: 'Link Validity' },
  { name: 'terminology', displayName: 'Terminology' },
  { name: 'freshness', displayName: 'Freshness' },
  { name: 'examples-validity', displayName: 'Examples Validity' },
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];
