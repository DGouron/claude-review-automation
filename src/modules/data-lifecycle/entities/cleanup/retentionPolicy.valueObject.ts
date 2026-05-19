const MILLISECONDS_PER_DAY = 86_400_000;

export class RetentionPolicy {
  private constructor(private readonly retentionDays: number) {}

  static create(days = 14): RetentionPolicy {
    if (!Number.isInteger(days) || days < 1) {
      throw new Error('Retention days must be a positive integer (minimum 1)');
    }
    return new RetentionPolicy(days);
  }

  get days(): number {
    return this.retentionDays;
  }

  isExpired(fileDate: Date, now: Date = new Date()): boolean {
    const cutoff = new Date(now.getTime() - this.retentionDays * MILLISECONDS_PER_DAY);
    return fileDate.getTime() < cutoff.getTime();
  }
}
