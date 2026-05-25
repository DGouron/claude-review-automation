/**
 * RepositoryEntry — the raw shape of a repository line as it lives in
 * `config.json` on disk (before any enrichment).
 *
 * For the enriched, runtime shape (with `platform` and `remoteUrl`),
 * see `RepositoryConfig` in `@/frameworks/config/configLoader.ts`.
 */
export interface RepositoryEntry {
  name: string;
  localPath: string;
  enabled: boolean;
}
