/**
 * Tests for FFmpeg Process Manager
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the logger
vi.mock('./logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocking
import { getFFmpegManager } from './ffmpeg-manager';

describe('FFmpegProcessManager', () => {
  let manager: ReturnType<typeof getFFmpegManager>;
  let mockProcesses: ChildProcess[] = [];

  beforeEach(() => {
    // Get fresh manager instance
    manager = getFFmpegManager();
    mockProcesses = [];
  });

  afterEach(() => {
    // Clean up any spawned processes
    for (const proc of mockProcesses) {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Process may already be dead
      }
    }
    mockProcesses = [];
  });

  /**
   * Helper to create a real but harmless process for testing
   */
  function createTestProcess(): ChildProcess {
    // Use 'sleep' as a harmless long-running process
    const proc = spawn('sleep', ['60'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    mockProcesses.push(proc);
    return proc;
  }

  describe('register', () => {
    it('should register a process and return an ID', () => {
      const proc = createTestProcess();
      const id = manager.register(proc, { fileName: 'test.mkv' });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^ffmpeg-\d+-\d+$/);
    });

    it('should track registered processes in stats', () => {
      const proc = createTestProcess();
      manager.register(proc, { fileName: 'test.mkv' });

      const stats = manager.getStats();
      expect(stats.activeCount).toBeGreaterThanOrEqual(1);
      expect(stats.processes.length).toBeGreaterThanOrEqual(1);
    });

    it('should include context in stats', () => {
      const proc = createTestProcess();
      const id = manager.register(proc, { 
        fileName: 'movie.mkv',
        infohash: 'abc123',
        fileIndex: 0,
      });

      const stats = manager.getStats();
      const tracked = stats.processes.find(p => p.id === id);
      
      expect(tracked).toBeDefined();
      expect(tracked?.context.fileName).toBe('movie.mkv');
      expect(tracked?.context.infohash).toBe('abc123');
      expect(tracked?.context.fileIndex).toBe(0);
    });

    it('should track runtime in stats', async () => {
      const proc = createTestProcess();
      manager.register(proc, { fileName: 'test.mkv' });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = manager.getStats();
      expect(stats.processes[0]?.runtimeMs).toBeGreaterThanOrEqual(100);
    });
  });

  describe('unregister', () => {
    it('should remove process from tracking when unregistered', () => {
      const proc = createTestProcess();
      const id = manager.register(proc, { fileName: 'test.mkv' });

      const statsBefore = manager.getStats();
      const countBefore = statsBefore.processes.filter(p => p.id === id).length;
      expect(countBefore).toBe(1);

      manager['unregister'](id); // Access private method for testing

      const statsAfter = manager.getStats();
      const countAfter = statsAfter.processes.filter(p => p.id === id).length;
      expect(countAfter).toBe(0);
    });
  });

  describe('killProcess', () => {
    it('should kill a registered process', async () => {
      const proc = createTestProcess();
      const id = manager.register(proc, { fileName: 'test.mkv' });

      const result = manager.killProcess(id, 'test');
      expect(result).toBe(true);

      // Wait for process to die
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = manager.getStats();
      const tracked = stats.processes.find(p => p.id === id);
      expect(tracked).toBeUndefined();
    });

    it('should return false for non-existent process', () => {
      const result = manager.killProcess('non-existent-id', 'test');
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return correct active count', () => {
      const proc1 = createTestProcess();
      const proc2 = createTestProcess();

      const initialStats = manager.getStats();
      const initialCount = initialStats.activeCount;

      manager.register(proc1, { fileName: 'test1.mkv' });
      manager.register(proc2, { fileName: 'test2.mkv' });

      const stats = manager.getStats();
      expect(stats.activeCount).toBe(initialCount + 2);
    });

    it('should include pid in process info', () => {
      const proc = createTestProcess();
      manager.register(proc, { fileName: 'test.mkv' });

      const stats = manager.getStats();
      const tracked = stats.processes.find(p => p.pid === proc.pid);
      expect(tracked).toBeDefined();
      expect(tracked?.pid).toBe(proc.pid);
    });
  });

  describe('automatic cleanup on process exit', () => {
    it('should unregister process when it exits naturally', async () => {
      // Use a process that exits quickly
      const proc = spawn('echo', ['hello'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      mockProcesses.push(proc);

      const id = manager.register(proc, { fileName: 'test.mkv' });

      // Wait for process to exit
      await new Promise(resolve => setTimeout(resolve, 200));

      const stats = manager.getStats();
      const tracked = stats.processes.find(p => p.id === id);
      expect(tracked).toBeUndefined();
    });
  });

  describe('killAll', () => {
    it('should kill all registered processes', async () => {
      const proc1 = createTestProcess();
      const proc2 = createTestProcess();

      const id1 = manager.register(proc1, { fileName: 'test1.mkv' });
      const id2 = manager.register(proc2, { fileName: 'test2.mkv' });

      manager.killAll('test');

      // Wait for processes to die
      await new Promise(resolve => setTimeout(resolve, 200));

      const stats = manager.getStats();
      const tracked1 = stats.processes.find(p => p.id === id1);
      const tracked2 = stats.processes.find(p => p.id === id2);
      
      expect(tracked1).toBeUndefined();
      expect(tracked2).toBeUndefined();
    });
  });
});
