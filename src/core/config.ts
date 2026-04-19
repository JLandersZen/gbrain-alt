import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import type { EngineConfig } from './types.ts';

let _resolvedConfigDir: string | null = null;

function discoverConfigDir(startDir?: string): string {
  const home = homedir();
  const globalDir = join(home, '.gbrain');
  let current = resolve(startDir || process.cwd());

  while (true) {
    const candidate = join(current, '.gbrain', 'config.json');
    if (existsSync(candidate)) {
      return join(current, '.gbrain');
    }

    const parent = dirname(current);
    if (parent === current) break;
    if (current === home) break;
    current = parent;
  }

  return globalDir;
}

function getConfigDir(): string {
  if (!_resolvedConfigDir) {
    _resolvedConfigDir = discoverConfigDir();
  }
  return _resolvedConfigDir;
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

export interface GBrainConfig {
  engine: 'postgres' | 'pglite';
  database_url?: string;
  database_path?: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
}

/**
 * Load config with credential precedence: env vars > config file.
 * Walks up from cwd looking for .gbrain/config.json, falls back to ~/.gbrain/.
 */
export function loadConfig(): GBrainConfig | null {
  let fileConfig: GBrainConfig | null = null;
  try {
    const raw = readFileSync(getConfigPath(), 'utf-8');
    fileConfig = JSON.parse(raw) as GBrainConfig;
  } catch { /* no config file */ }

  // Try env vars
  const dbUrl = process.env.GBRAIN_DATABASE_URL || process.env.DATABASE_URL;

  if (!fileConfig && !dbUrl) return null;

  // Infer engine type if not explicitly set
  const inferredEngine: 'postgres' | 'pglite' = fileConfig?.engine
    || (fileConfig?.database_path ? 'pglite' : 'postgres');

  // Merge: env vars override config file
  const merged = {
    ...fileConfig,
    engine: inferredEngine,
    ...(dbUrl ? { database_url: dbUrl } : {}),
    ...(process.env.OPENAI_API_KEY ? { openai_api_key: process.env.OPENAI_API_KEY } : {}),
  };
  return merged as GBrainConfig;
}

export function saveConfig(config: GBrainConfig): void {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  const path = getConfigPath();
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // chmod may fail on some platforms
  }
}

export function toEngineConfig(config: GBrainConfig): EngineConfig {
  return {
    engine: config.engine,
    database_url: config.database_url,
    database_path: config.database_path,
  };
}

export function configDir(): string {
  return getConfigDir();
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

export function globalConfigDir(): string {
  return join(homedir(), '.gbrain');
}

export function setConfigDir(dir: string): void {
  _resolvedConfigDir = dir;
}

export function resetConfigDir(): void {
  _resolvedConfigDir = null;
}
