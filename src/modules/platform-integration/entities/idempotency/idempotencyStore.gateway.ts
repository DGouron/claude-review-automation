export interface IdempotencyStore {
  recordIfAbsent(eventKey: string): Promise<boolean>;
}
