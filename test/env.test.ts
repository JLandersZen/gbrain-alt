import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('env loader', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};
  const savedCwd = process.cwd();

  beforeEach(() => {
    tempDir = join(tmpdir(), `gbrain-env-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    Object.keys(savedEnv).forEach(k => delete savedEnv[k]);

    process.chdir(savedCwd);
    try { rmSync(tempDir, { recursive: true }); } catch {}
  });

  function saveEnvVar(key: string) {
    if (!(key in savedEnv)) {
      savedEnv[key] = process.env[key];
    }
  }

  test('parses KEY=VALUE lines', async () => {
    writeFileSync(join(tempDir, '.env'), 'TEST_ENV_A=hello\nTEST_ENV_B=world\n');
    saveEnvVar('TEST_ENV_A');
    saveEnvVar('TEST_ENV_B');
    delete process.env.TEST_ENV_A;
    delete process.env.TEST_ENV_B;

    process.chdir(tempDir);

    const { loadEnvFiles } = await import('../src/core/env.ts');
    loadEnvFiles();

    expect(process.env.TEST_ENV_A).toBe('hello');
    expect(process.env.TEST_ENV_B).toBe('world');
  });

  test('strips quotes from values', async () => {
    writeFileSync(join(tempDir, '.env'), 'TEST_ENV_QUOTED="quoted value"\nTEST_ENV_SINGLE=\'single quoted\'\n');
    saveEnvVar('TEST_ENV_QUOTED');
    saveEnvVar('TEST_ENV_SINGLE');
    delete process.env.TEST_ENV_QUOTED;
    delete process.env.TEST_ENV_SINGLE;

    process.chdir(tempDir);
    const { loadEnvFiles } = await import('../src/core/env.ts');
    loadEnvFiles();

    expect(process.env.TEST_ENV_QUOTED).toBe('quoted value');
    expect(process.env.TEST_ENV_SINGLE).toBe('single quoted');
  });

  test('does not override existing env vars', async () => {
    writeFileSync(join(tempDir, '.env'), 'TEST_ENV_EXISTING=from-file\n');
    saveEnvVar('TEST_ENV_EXISTING');
    process.env.TEST_ENV_EXISTING = 'from-shell';

    process.chdir(tempDir);
    const { loadEnvFiles } = await import('../src/core/env.ts');
    loadEnvFiles();

    expect(process.env.TEST_ENV_EXISTING).toBe('from-shell');
  });

  test('skips comments and blank lines', async () => {
    writeFileSync(join(tempDir, '.env'), '# comment\n\nTEST_ENV_UNCOMMENTED=yes\n# another comment\n');
    saveEnvVar('TEST_ENV_UNCOMMENTED');
    delete process.env.TEST_ENV_UNCOMMENTED;

    process.chdir(tempDir);
    const { loadEnvFiles } = await import('../src/core/env.ts');
    loadEnvFiles();

    expect(process.env.TEST_ENV_UNCOMMENTED).toBe('yes');
  });

  test('loads from .gbrain/.env', async () => {
    const gbrainDir = join(tempDir, '.gbrain');
    mkdirSync(gbrainDir, { recursive: true });
    writeFileSync(join(gbrainDir, '.env'), 'TEST_ENV_GBRAIN=from-gbrain\n');
    saveEnvVar('TEST_ENV_GBRAIN');
    delete process.env.TEST_ENV_GBRAIN;

    process.chdir(tempDir);
    const { loadEnvFiles } = await import('../src/core/env.ts');
    loadEnvFiles();

    expect(process.env.TEST_ENV_GBRAIN).toBe('from-gbrain');
  });

  test('project root .env takes precedence over .gbrain/.env', async () => {
    const gbrainDir = join(tempDir, '.gbrain');
    mkdirSync(gbrainDir, { recursive: true });
    writeFileSync(join(tempDir, '.env'), 'TEST_ENV_PRIORITY=from-root\n');
    writeFileSync(join(gbrainDir, '.env'), 'TEST_ENV_PRIORITY=from-gbrain\n');
    saveEnvVar('TEST_ENV_PRIORITY');
    delete process.env.TEST_ENV_PRIORITY;

    process.chdir(tempDir);
    const { loadEnvFiles } = await import('../src/core/env.ts');
    loadEnvFiles();

    expect(process.env.TEST_ENV_PRIORITY).toBe('from-root');
  });

  test('handles inline comments for unquoted values', async () => {
    writeFileSync(join(tempDir, '.env'), 'TEST_ENV_INLINE=value # this is a comment\n');
    saveEnvVar('TEST_ENV_INLINE');
    delete process.env.TEST_ENV_INLINE;

    process.chdir(tempDir);
    const { loadEnvFiles } = await import('../src/core/env.ts');
    loadEnvFiles();

    expect(process.env.TEST_ENV_INLINE).toBe('value');
  });

  test('handles values with = signs', async () => {
    writeFileSync(join(tempDir, '.env'), 'TEST_ENV_EQVAL=base64==abc\n');
    saveEnvVar('TEST_ENV_EQVAL');
    delete process.env.TEST_ENV_EQVAL;

    process.chdir(tempDir);
    const { loadEnvFiles } = await import('../src/core/env.ts');
    loadEnvFiles();

    expect(process.env.TEST_ENV_EQVAL).toBe('base64==abc');
  });

  test('handles empty values', async () => {
    writeFileSync(join(tempDir, '.env'), 'TEST_ENV_EMPTY=\n');
    saveEnvVar('TEST_ENV_EMPTY');
    delete process.env.TEST_ENV_EMPTY;

    process.chdir(tempDir);
    const { loadEnvFiles } = await import('../src/core/env.ts');
    loadEnvFiles();

    expect(process.env.TEST_ENV_EMPTY).toBe('');
  });
});
