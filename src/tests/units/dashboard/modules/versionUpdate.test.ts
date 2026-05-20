import { describe, it, expect } from 'vitest';
import { renderVersionUpdateArea } from '@/dashboard/modules/versionUpdate.js';

const translate = (key: string, params?: Record<string, string | number>) =>
  params?.version ? `${key}:${params.version}` : key;

describe('renderVersionUpdateArea', () => {
  it('renders only the current version label when no update is available', () => {
    const html = renderVersionUpdateArea(
      { currentVersion: '3.10.0', updateAvailable: false, latestVersion: null },
      translate,
    );
    expect(html).toContain('v3.10.0');
    expect(html).not.toContain('version-update-btn');
  });

  it('renders an update button mentioning the latest version when available', () => {
    const html = renderVersionUpdateArea(
      { currentVersion: '3.10.0', updateAvailable: true, latestVersion: '4.0.0' },
      translate,
    );
    expect(html).toContain('v3.10.0');
    expect(html).toContain('4.0.0');
    expect(html).toContain('version-update-btn');
  });
});
