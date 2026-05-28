export interface LineReader {
  read(): Promise<string | null>;
}
