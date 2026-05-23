import { describe, it, expect, beforeEach } from 'vitest';
import {
  SupervisorLockFileSystemGateway,
  type SupervisorLockFileSystem,
} from '@/modules/supervisor-management/interface-adapters/gateways/supervisorLock.fileSystem.gateway.js';

class FakeFileSystem implements SupervisorLockFileSystem {
  files = new Map<string, string>();
  ensuredDirs: string[] = [];
  alivePids = new Set<number>();

  readFile(path: string): string | null {
    return this.files.get(path) ?? null;
  }

  writeFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  deleteFile(path: string): void {
    this.files.delete(path);
  }

  ensureDirectory(path: string): void {
    this.ensuredDirs.push(path);
  }

  isProcessAlive(pid: number): boolean {
    return this.alivePids.has(pid);
  }
}

describe('SupervisorLockFileSystemGateway', () => {
  let fileSystem: FakeFileSystem;

  beforeEach(() => {
    fileSystem = new FakeFileSystem();
  });

  it('acquires the lock when no lock file exists, writing the current pid', async () => {
    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });

    const result = await gateway.acquire();

    expect(result.acquired).toBe(true);
    expect(fileSystem.files.get('/lock')).toBe('1000');
  });

  it('refuses to acquire when the lock file already exists and the owner is alive', async () => {
    fileSystem.files.set('/lock', '2222');
    fileSystem.alivePids.add(2222);

    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });

    const result = await gateway.acquire();

    expect(result.acquired).toBe(false);
    expect(result.reason).toMatch(/2222/);
    expect(fileSystem.files.get('/lock')).toBe('2222');
  });

  it('takes over a stale lock when the recorded pid is dead', async () => {
    fileSystem.files.set('/lock', '9999');

    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });

    const result = await gateway.acquire();

    expect(result.acquired).toBe(true);
    expect(fileSystem.files.get('/lock')).toBe('1000');
  });

  it('treats a corrupted lock file (non-integer) as stale and takes over', async () => {
    fileSystem.files.set('/lock', 'garbage');

    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });

    const result = await gateway.acquire();

    expect(result.acquired).toBe(true);
    expect(fileSystem.files.get('/lock')).toBe('1000');
  });

  it('releases the lock only when we still own it', async () => {
    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });
    await gateway.acquire();

    await gateway.release();

    expect(fileSystem.files.has('/lock')).toBe(false);
  });

  it('does not delete the lock on release when ownership has changed', async () => {
    fileSystem.files.set('/lock', '5555');

    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });

    await gateway.release();

    expect(fileSystem.files.get('/lock')).toBe('5555');
  });
});
