import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';

/**
 * Load .env files into process.env. Does NOT override existing env vars.
 *
 * Search order (first found wins per variable):
 *   1. Walk up from cwd looking for .env (stops at home dir)
 *   2. .gbrain/.env (same walk-up that finds .gbrain/config.json)
 *
 * Only simple KEY=VALUE and KEY="VALUE" lines are parsed.
 * Comments (#) and blank lines are skipped.
 */
export function loadEnvFiles(): void {
  const home = homedir();
  const envPaths: string[] = [];

  let current = resolve(process.cwd());
  while (true) {
    const envFile = join(current, '.env');
    if (existsSync(envFile)) {
      envPaths.push(envFile);
    }
    const gbrainEnv = join(current, '.gbrain', '.env');
    if (existsSync(gbrainEnv)) {
      envPaths.push(gbrainEnv);
    }

    const parent = dirname(current);
    if (parent === current) break;
    if (current === home) break;
    current = parent;
  }

  const globalEnv = join(home, '.gbrain', '.env');
  if (existsSync(globalEnv)) {
    envPaths.push(globalEnv);
  }

  for (const filePath of envPaths) {
    parseEnvFile(filePath);
  }
}

function parseEnvFile(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!trimmed.slice(eqIdx + 1).trim().startsWith('"') &&
        !trimmed.slice(eqIdx + 1).trim().startsWith("'")) {
      const commentIdx = value.indexOf(' #');
      if (commentIdx !== -1) {
        value = value.slice(0, commentIdx).trim();
      }
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
