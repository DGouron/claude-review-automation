import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { Platform } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';
import { succeeded } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import { NextActionsPresenter } from '@/modules/setup-wizard/interface-adapters/presenters/nextActions.presenter.js';
import { isValidSecret } from '@/shared/services/secretGenerator.js';

const DEFAULT_HOST = 'YOUR_HOST';
const DEFAULT_PORT = 3847;

function pickPlatformOrDefault(platform: Platform | null): Platform {
  if (platform === 'github' || platform === 'gitlab') return platform;
  return 'github';
}

export class DisplayNextActionsStep implements SetupStep {
  readonly id = 'next-actions' as const;
  readonly title = 'Prochaines actions';

  async detect(_context: WizardContext): Promise<StepOutcome | null> {
    return null;
  }

  async execute(context: WizardContext): Promise<StepOutcome> {
    const presenter = new NextActionsPresenter();
    const platform = pickPlatformOrDefault(context.project.platform);
    const projectPath = context.project.localPath ?? '/unknown';
    const envContents = context.gateways.envFile.read(projectPath);
    const candidateSecret =
      platform === 'github' ? envContents.githubSecret : envContents.gitlabSecret;
    const webhookSecret = candidateSecret && isValidSecret(candidateSecret) ? candidateSecret : '';

    const viewModel = presenter.present({
      platform,
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
      webhookSecret,
      projectPath,
      showSecrets: context.flags.showSecrets,
    });

    return succeeded('Prochaines actions affichées', {
      webhookUrl: viewModel.webhookUrl,
      eventType: viewModel.eventType,
      maskedSecret: viewModel.maskedSecret,
      fullSecret: viewModel.fullSecret,
      lines: viewModel.lines,
    });
  }
}
