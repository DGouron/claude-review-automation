import type { PromptGateway, PromptChoice } from '@/modules/setup-wizard/entities/prompt/prompt.gateway.js';
import type { LineReader } from '@/modules/setup-wizard/entities/lineReader/lineReader.gateway.js';
import type { WizardEventEmitter } from '@/modules/setup-wizard/services/wizardEventEmitter.js';
import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import {
  AwaitingInputClosedError,
  NonInteractiveInputError,
} from '@/modules/setup-wizard/entities/promptInputError/promptInputError.js';
import {
  confirmAnswerGuard,
  choiceAnswerGuard,
  multiSelectAnswerGuard,
} from '@/modules/setup-wizard/entities/answerLine/answerLine.guard.js';

export interface PromptStdinJsonGatewayDependencies {
  lineReader: LineReader;
  emitter: WizardEventEmitter;
  currentStepId: () => StepId;
  isNonInteractive: () => boolean;
}

type Accepted<T> = { accepted: true; value: T };
type Refused = { accepted: false; refusal: string };
type Validation<T> = Accepted<T> | Refused;

function accept<T>(value: T): Accepted<T> {
  return { accepted: true, value };
}

function refuse(refusal: string): Refused {
  return { accepted: false, refusal };
}

function parseJson(line: string): Validation<unknown> {
  try {
    return accept(JSON.parse(line));
  } catch {
    return refuse('Réponse illisible');
  }
}

export class PromptStdinJsonGateway implements PromptGateway {
  constructor(private readonly dependencies: PromptStdinJsonGatewayDependencies) {}

  async askText(prompt: string, defaultValue?: string): Promise<string> {
    const line = await this.requestLine(prompt);
    if (line.length === 0) return defaultValue ?? '';
    return line;
  }

  async askConfirm(prompt: string): Promise<boolean> {
    return this.requestValidated(prompt, (line) => {
      const parsed = parseJson(line);
      if (!parsed.accepted) return parsed;
      if (!confirmAnswerGuard.isValid(parsed.value)) return refuse('Réponse invalide');
      return accept(parsed.value);
    });
  }

  async askChoice(prompt: string, choices: PromptChoice[]): Promise<string> {
    const offered = choices.map((choice) => choice.value);
    return this.requestValidated(prompt, (line) => {
      const parsed = parseJson(line);
      if (!parsed.accepted) return parsed;
      if (!choiceAnswerGuard.isValid(parsed.value)) return refuse('Réponse invalide');
      if (!offered.includes(parsed.value)) {
        return refuse('Choix invalide, sélectionnez une option proposée');
      }
      return accept(parsed.value);
    });
  }

  async askMultiSelect(prompt: string, choices: PromptChoice[]): Promise<string[]> {
    const offered = choices.map((choice) => choice.value);
    return this.requestValidated(prompt, (line) => {
      const parsed = parseJson(line);
      if (!parsed.accepted) return parsed;
      if (!multiSelectAnswerGuard.isValid(parsed.value)) return refuse('Réponse invalide');
      if (!parsed.value.every((value) => offered.includes(value))) {
        return refuse("Sélection invalide, une valeur n'est pas proposée");
      }
      return accept(parsed.value);
    });
  }

  private guardInteractive(): void {
    if (this.dependencies.isNonInteractive()) {
      throw new NonInteractiveInputError();
    }
  }

  private async requestLine(prompt: string): Promise<string> {
    this.guardInteractive();
    this.dependencies.emitter.emitAwaitingInput(this.dependencies.currentStepId(), prompt);
    const line = await this.dependencies.lineReader.read();
    if (line === null) throw new AwaitingInputClosedError();
    return line;
  }

  private async requestValidated<T>(prompt: string, validate: (line: string) => Validation<T>): Promise<T> {
    for (;;) {
      const line = await this.requestLine(prompt);
      const validation = validate(line);
      if (validation.accepted) return validation.value;
      this.dependencies.emitter.emitWarning(validation.refusal);
    }
  }
}
