import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import {
  loadConfig,
  saveConfig,
  configDir,
  configPath,
  globalConfigDir,
  setConfigDir,
  resetConfigDir,
} from '../src/core/config.ts';

const TEST_ROOT = join(tmpdir(), `gbrain-config-test-${process.pid}`);

beforeEach(() => {
  resetConfigDir();
  mkdirSync(TEST_ROOT, { recursive: true });
});

afterEach(() => {
  resetConfigDir();
  try { rmSync(TEST_ROOT, { recursive: true, force: true }); } catch {}
});

describe('config discovery', () => {
  test('finds local .gbrain/config.json in cwd', () => {
    const projectDir = join(TEST_ROOT, 'my-project');
    const gbrainDir = join(projectDir, '.gbrain');
    mkdirSync(gbrainDir, { recursive: true });
    writeFileSync(join(gbrainDir, 'config.json'), JSON.stringify({ engine: 'pglite', database_path: '/test/brain.pglite' }));

    setConfigDir(gbrainDir);
    const config = loadConfig();
    expect(config).not.toBeNull();
    expect(config!.engine).toBe('pglite');
    expect(config!.database_path).toBe('/test/brain.pglite');
  });

  test('setConfigDir overrides discovery', () => {
    const customDir = join(TEST_ROOT, 'custom-config');
    mkdirSync(customDir, { recursive: true });
    writeFileSync(join(customDir, 'config.json'), JSON.stringify({ engine: 'pglite' }));

    setConfigDir(customDir);
    expect(configDir()).toBe(customDir);
    expect(configPath()).toBe(join(customDir, 'config.json'));
  });

  test('resetConfigDir clears override', () => {
    const customDir = join(TEST_ROOT, 'custom');
    setConfigDir(customDir);
    expect(configDir()).toBe(customDir);

    resetConfigDir();
    // After reset, it re-discovers (falls back to global since we're not in a project)
    const resolved = configDir();
    expect(resolved).not.toBe(customDir);
  });

  test('globalConfigDir always returns ~/.gbrain', () => {
    const expected = join(homedir(), '.gbrain');
    expect(globalConfigDir()).toBe(expected);

    setConfigDir('/some/random/path');
    expect(globalConfigDir()).toBe(expected);
  });

  test('saveConfig writes to resolved directory', () => {
    const targetDir = join(TEST_ROOT, 'save-test', '.gbrain');
    mkdirSync(targetDir, { recursive: true });
    setConfigDir(targetDir);

    saveConfig({ engine: 'pglite', database_path: '/test/db' });

    const { readFileSync } = require('fs');
    const saved = JSON.parse(readFileSync(join(targetDir, 'config.json'), 'utf-8'));
    expect(saved.engine).toBe('pglite');
    expect(saved.database_path).toBe('/test/db');
  });

  test('saveConfig creates directory if needed', () => {
    const targetDir = join(TEST_ROOT, 'new-dir', '.gbrain');
    setConfigDir(targetDir);

    saveConfig({ engine: 'pglite', database_path: '/test/db' });

    const { existsSync, readFileSync } = require('fs');
    expect(existsSync(join(targetDir, 'config.json'))).toBe(true);
    const saved = JSON.parse(readFileSync(join(targetDir, 'config.json'), 'utf-8'));
    expect(saved.engine).toBe('pglite');
  });

  test('loadConfig returns null when no config exists anywhere', () => {
    const emptyDir = join(TEST_ROOT, 'empty', '.gbrain');
    mkdirSync(emptyDir, { recursive: true });
    setConfigDir(emptyDir);

    // Remove env vars that could provide a fallback
    const savedDbUrl = process.env.GBRAIN_DATABASE_URL;
    const savedDbUrl2 = process.env.DATABASE_URL;
    delete process.env.GBRAIN_DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const config = loadConfig();
      expect(config).toBeNull();
    } finally {
      if (savedDbUrl) process.env.GBRAIN_DATABASE_URL = savedDbUrl;
      if (savedDbUrl2) process.env.DATABASE_URL = savedDbUrl2;
    }
  });

  test('env vars override config file values', () => {
    const targetDir = join(TEST_ROOT, 'env-override', '.gbrain');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'config.json'), JSON.stringify({
      engine: 'pglite',
      database_path: '/test/db',
    }));
    setConfigDir(targetDir);

    const savedKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key-123';

    try {
      const config = loadConfig();
      expect(config!.openai_api_key).toBe('test-key-123');
    } finally {
      if (savedKey) process.env.OPENAI_API_KEY = savedKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  test('configDir and configPath are consistent', () => {
    const targetDir = join(TEST_ROOT, 'consistency');
    setConfigDir(targetDir);

    expect(configDir()).toBe(targetDir);
    expect(configPath()).toBe(join(targetDir, 'config.json'));
  });
});
