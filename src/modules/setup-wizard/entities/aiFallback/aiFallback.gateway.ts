export interface AiFallbackAvailability {
  available: boolean;
  reason: string | null;
}

export interface AiInterpretation {
  resolution: string | null;
  confidence: number;
}

export interface AiFallbackGateway {
  isAvailable(): AiFallbackAvailability;
  interpret(input: string, context: Record<string, unknown>): Promise<AiInterpretation>;
}
