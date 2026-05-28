export interface PromptChoice {
  label: string;
  value: string;
}

export interface PromptGateway {
  askText(prompt: string, defaultValue?: string): Promise<string>;
  askConfirm(prompt: string, defaultValue?: boolean): Promise<boolean>;
  askChoice(prompt: string, choices: PromptChoice[]): Promise<string>;
  askMultiSelect(prompt: string, choices: PromptChoice[]): Promise<string[]>;
}
