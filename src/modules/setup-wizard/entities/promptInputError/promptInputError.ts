export class AwaitingInputClosedError extends Error {
  constructor() {
    super('Aucune réponse reçue, le setup est interrompu');
    this.name = 'AwaitingInputClosedError';
  }
}

export class NonInteractiveInputError extends Error {
  constructor() {
    super('Mode non-interactif : aucune entrée disponible pour cette étape');
    this.name = 'NonInteractiveInputError';
  }
}
