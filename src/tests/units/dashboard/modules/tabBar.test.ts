import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTabBarModel,
  renderTabBarHtml,
  readActiveTab,
  writeActiveTab,
} from '@/dashboard/modules/tabBar.js';

interface TestStorage {
  store: Map<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function createTestStorage(): TestStorage {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe('tabBar module', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  describe('buildTabBarModel', () => {
    it('marks Overview as active when no activeTabId is provided', () => {
      const model = buildTabBarModel({
        repositories: [{ name: 'frontend', localPath: '/repos/frontend' }],
        activeTabId: null,
      });

      expect(model.tabs[0]?.id).toBe('overview');
      expect(model.tabs[0]?.label).toBe('Overview');
      expect(model.tabs[0]?.isActive).toBe(true);
      expect(model.tabs[1]?.isActive).toBe(false);
    });

    it('marks the matching project tab as active and Overview as inactive', () => {
      const model = buildTabBarModel({
        repositories: [
          { name: 'frontend', localPath: '/repos/frontend' },
          { name: 'api', localPath: '/repos/api' },
        ],
        activeTabId: '/repos/api',
      });

      expect(model.tabs.find((tab) => tab.id === 'overview')?.isActive).toBe(false);
      expect(model.tabs.find((tab) => tab.id === '/repos/api')?.isActive).toBe(true);
      expect(model.tabs.find((tab) => tab.id === '/repos/frontend')?.isActive).toBe(false);
    });

    it('falls back to Overview when the active tab id matches no repository', () => {
      const model = buildTabBarModel({
        repositories: [{ name: 'frontend', localPath: '/repos/frontend' }],
        activeTabId: '/repos/missing',
      });

      expect(model.tabs.find((tab) => tab.id === 'overview')?.isActive).toBe(true);
    });

    it('builds a tab per repository using the repository name as label', () => {
      const model = buildTabBarModel({
        repositories: [
          { name: 'frontend', localPath: '/repos/frontend' },
          { name: 'api', localPath: '/repos/api' },
        ],
        activeTabId: null,
      });

      expect(model.tabs).toHaveLength(3);
      expect(model.tabs[1]).toEqual({ id: '/repos/frontend', label: 'frontend', isActive: false });
      expect(model.tabs[2]).toEqual({ id: '/repos/api', label: 'api', isActive: false });
    });
  });

  describe('renderTabBarHtml', () => {
    it('renders a <nav> element with one button per tab and marks the active one', () => {
      const html = renderTabBarHtml({
        tabs: [
          { id: 'overview', label: 'Overview', isActive: true },
          { id: '/repos/frontend', label: 'frontend', isActive: false },
        ],
      });

      expect(html).toContain('<nav');
      expect(html).toContain('data-tab-id="overview"');
      expect(html).toContain('data-tab-id="/repos/frontend"');
      expect(html).toContain('aria-selected="true"');
    });

    it('escapes the label to prevent HTML injection', () => {
      const html = renderTabBarHtml({
        tabs: [{ id: 'overview', label: '<script>alert(1)</script>', isActive: true }],
      });

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('localStorage round-trip', () => {
    it('writeActiveTab persists the id and readActiveTab returns it', () => {
      const storage = createTestStorage();
      vi.stubGlobal('localStorage', storage);

      writeActiveTab('/repos/api');

      expect(readActiveTab()).toBe('/repos/api');
      expect(storage.store.get('review-flow-active-tab')).toBe('/repos/api');
    });

    it('readActiveTab returns null when nothing has been stored', () => {
      const storage = createTestStorage();
      vi.stubGlobal('localStorage', storage);

      expect(readActiveTab()).toBeNull();
    });
  });
});
