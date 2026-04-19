import { describe, test, expect } from 'bun:test';
import { buildSyncManifest, isSyncable, pathToSlug, scopeToSubdir } from '../src/core/sync.ts';

describe('buildSyncManifest', () => {
  test('parses A/M/D entries from single commit', () => {
    const output = `A\tpeople/new-person.md\nM\tpeople/existing-person.md\nD\tpeople/deleted-person.md`;
    const manifest = buildSyncManifest(output);
    expect(manifest.added).toEqual(['people/new-person.md']);
    expect(manifest.modified).toEqual(['people/existing-person.md']);
    expect(manifest.deleted).toEqual(['people/deleted-person.md']);
    expect(manifest.renamed).toEqual([]);
  });

  test('parses R100 rename entries', () => {
    const output = `R100\tpeople/old-name.md\tpeople/new-name.md`;
    const manifest = buildSyncManifest(output);
    expect(manifest.renamed).toEqual([{ from: 'people/old-name.md', to: 'people/new-name.md' }]);
    expect(manifest.added).toEqual([]);
    expect(manifest.modified).toEqual([]);
    expect(manifest.deleted).toEqual([]);
  });

  test('parses partial rename (R075)', () => {
    const output = `R075\tpeople/old.md\tpeople/new.md`;
    const manifest = buildSyncManifest(output);
    expect(manifest.renamed).toEqual([{ from: 'people/old.md', to: 'people/new.md' }]);
  });

  test('handles empty diff', () => {
    const manifest = buildSyncManifest('');
    expect(manifest.added).toEqual([]);
    expect(manifest.modified).toEqual([]);
    expect(manifest.deleted).toEqual([]);
    expect(manifest.renamed).toEqual([]);
  });

  test('handles mixed entries with blank lines', () => {
    const output = `A\tpeople/a.md\n\nM\tpeople/b.md\n\nD\tpeople/c.md`;
    const manifest = buildSyncManifest(output);
    expect(manifest.added).toEqual(['people/a.md']);
    expect(manifest.modified).toEqual(['people/b.md']);
    expect(manifest.deleted).toEqual(['people/c.md']);
  });

  test('skips malformed lines', () => {
    const output = `A\tpeople/a.md\ngarbage line\nM\tpeople/b.md`;
    const manifest = buildSyncManifest(output);
    expect(manifest.added).toEqual(['people/a.md']);
    expect(manifest.modified).toEqual(['people/b.md']);
  });
});

describe('isSyncable', () => {
  test('accepts normal .md files', () => {
    expect(isSyncable('people/pedro-franceschi.md')).toBe(true);
    expect(isSyncable('meetings/2026-04-03-lunch.md')).toBe(true);
    expect(isSyncable('daily/2026-04-05.md')).toBe(true);
    expect(isSyncable('notes.md')).toBe(true);
  });

  test('accepts .mdx files', () => {
    expect(isSyncable('components/hero.mdx')).toBe(true);
    expect(isSyncable('docs/getting-started.mdx')).toBe(true);
  });

  test('rejects non-.md/.mdx files', () => {
    expect(isSyncable('people/photo.jpg')).toBe(false);
    expect(isSyncable('config.json')).toBe(false);
    expect(isSyncable('src/cli.ts')).toBe(false);
  });

  test('rejects files in hidden directories', () => {
    expect(isSyncable('.git/config')).toBe(false);
    expect(isSyncable('.obsidian/plugins.md')).toBe(false);
    expect(isSyncable('people/.hidden/secret.md')).toBe(false);
  });

  test('rejects .raw/ sidecar directories', () => {
    expect(isSyncable('people/pedro.raw/source.md')).toBe(false);
    expect(isSyncable('dir/.raw/notes.md')).toBe(false);
  });

  test('rejects skip-list basenames', () => {
    expect(isSyncable('schema.md')).toBe(false);
    expect(isSyncable('index.md')).toBe(false);
    expect(isSyncable('log.md')).toBe(false);
    expect(isSyncable('README.md')).toBe(false);
    expect(isSyncable('people/README.md')).toBe(false);
  });

  test('rejects ops/ directory', () => {
    expect(isSyncable('ops/deploy-log.md')).toBe(false);
    expect(isSyncable('ops/config.md')).toBe(false);
  });
});

describe('pathToSlug', () => {
  test('strips .md extension and lowercases', () => {
    expect(pathToSlug('people/pedro-franceschi.md')).toBe('people/pedro-franceschi');
  });

  test('normalizes to lowercase', () => {
    expect(pathToSlug('People/Pedro-Franceschi.md')).toBe('people/pedro-franceschi');
  });

  test('strips leading slash', () => {
    expect(pathToSlug('/people/pedro.md')).toBe('people/pedro');
  });

  test('normalizes backslash separators', () => {
    expect(pathToSlug('people\\pedro.md')).toBe('people/pedro');
  });

  test('handles flat files', () => {
    expect(pathToSlug('notes.md')).toBe('notes');
  });

  test('handles nested paths', () => {
    expect(pathToSlug('projects/gbrain/spec.md')).toBe('projects/gbrain/spec');
  });

  test('adds repo prefix when provided', () => {
    expect(pathToSlug('people/pedro.md', 'brain')).toBe('brain/people/pedro');
  });

  test('no prefix when not provided', () => {
    expect(pathToSlug('people/pedro.md')).toBe('people/pedro');
  });

  test('handles empty string', () => {
    expect(pathToSlug('')).toBe('');
  });

  test('handles file with only extension', () => {
    expect(pathToSlug('.md')).toBe('');
  });

  test('slugifies spaces to hyphens', () => {
    expect(pathToSlug('Apple Notes/2017-05-03 ohmygreen.md')).toBe('apple-notes/2017-05-03-ohmygreen');
  });

  test('strips special characters', () => {
    expect(pathToSlug('notes/meeting (march 2024).md')).toBe('notes/meeting-march-2024');
  });
});

describe('isSyncable edge cases', () => {
  test('rejects uppercase .MD extension', () => {
    // isSyncable checks path.endsWith('.md'), so .MD should fail
    expect(isSyncable('people/someone.MD')).toBe(false);
  });

  test('rejects files with no extension', () => {
    expect(isSyncable('README')).toBe(false);
  });

  test('accepts deeply nested .md files', () => {
    expect(isSyncable('a/b/c/d/e/f/deep.md')).toBe(true);
  });

  test('rejects .md files inside nested hidden dirs', () => {
    expect(isSyncable('docs/.internal/secret.md')).toBe(false);
  });
});

describe('buildSyncManifest edge cases', () => {
  test('handles tab-separated fields correctly', () => {
    const output = "A\tpath/to/file.md";
    const manifest = buildSyncManifest(output);
    expect(manifest.added).toEqual(['path/to/file.md']);
  });

  test('handles multiple renames', () => {
    const output = [
      'R100\told/a.md\tnew/a.md',
      'R095\told/b.md\tnew/b.md',
    ].join('\n');
    const manifest = buildSyncManifest(output);
    expect(manifest.renamed).toHaveLength(2);
    expect(manifest.renamed[0].from).toBe('old/a.md');
    expect(manifest.renamed[1].from).toBe('old/b.md');
  });

  test('ignores unknown status codes', () => {
    const output = "X\tunknown/file.md";
    const manifest = buildSyncManifest(output);
    expect(manifest.added).toEqual([]);
    expect(manifest.modified).toEqual([]);
    expect(manifest.deleted).toEqual([]);
    expect(manifest.renamed).toEqual([]);
  });
});

describe('scopeToSubdir', () => {
  test('filters to only files under the subdir and strips prefix', () => {
    const manifest = buildSyncManifest(
      'A\tbrain/people/joe.md\nA\texports/dump.md\nM\tbrain/tasks/fix-bug.md'
    );
    const scoped = scopeToSubdir(manifest, 'brain');
    expect(scoped.added).toEqual(['people/joe.md']);
    expect(scoped.modified).toEqual(['tasks/fix-bug.md']);
  });

  test('handles subdir with trailing slash', () => {
    const manifest = buildSyncManifest('A\tbrain/people/joe.md\nA\tREADME.md');
    const scoped = scopeToSubdir(manifest, 'brain/');
    expect(scoped.added).toEqual(['people/joe.md']);
  });

  test('filters deleted files', () => {
    const manifest = buildSyncManifest(
      'D\tbrain/people/old.md\nD\texports/old.md'
    );
    const scoped = scopeToSubdir(manifest, 'brain');
    expect(scoped.deleted).toEqual(['people/old.md']);
  });

  test('filters and strips renamed files', () => {
    const manifest = buildSyncManifest(
      'R100\tbrain/people/old-name.md\tbrain/people/new-name.md\n' +
      'R100\texports/a.md\texports/b.md'
    );
    const scoped = scopeToSubdir(manifest, 'brain');
    expect(scoped.renamed).toEqual([{ from: 'people/old-name.md', to: 'people/new-name.md' }]);
  });

  test('returns empty manifest when no files match', () => {
    const manifest = buildSyncManifest('A\texports/dump.md\nM\tREADME.md');
    const scoped = scopeToSubdir(manifest, 'brain');
    expect(scoped.added).toEqual([]);
    expect(scoped.modified).toEqual([]);
    expect(scoped.deleted).toEqual([]);
    expect(scoped.renamed).toEqual([]);
  });

  test('does not match partial directory names', () => {
    const manifest = buildSyncManifest('A\tbrainstorm/idea.md\nA\tbrain/people/joe.md');
    const scoped = scopeToSubdir(manifest, 'brain');
    expect(scoped.added).toEqual(['people/joe.md']);
  });

  test('handles nested subdir', () => {
    const manifest = buildSyncManifest('A\tdata/brain/people/joe.md\nA\tdata/other/file.md');
    const scoped = scopeToSubdir(manifest, 'data/brain');
    expect(scoped.added).toEqual(['people/joe.md']);
  });
});

describe('brain/ as standalone repo (no subdir needed)', () => {
  test('when brain/ is its own git repo, no subdir stripping is needed', () => {
    // brain/ is a standalone git repo, so git diff paths are relative to brain/
    // e.g. "people/joe.md" not "brain/people/joe.md"
    const manifest = buildSyncManifest(
      'A\tpeople/joe.md\nA\ttasks/fix.md\nM\tresources/doc.md'
    );
    // No scopeToSubdir call — all paths are already relative
    expect(manifest.added).toEqual(['people/joe.md', 'tasks/fix.md']);
    expect(manifest.modified).toEqual(['resources/doc.md']);
  });

  test('scopeToSubdir is only needed for monorepo layouts', () => {
    // Monorepo: brain data is in a subdir of a larger repo
    const manifest = buildSyncManifest(
      'A\tbrain/people/joe.md\nA\tREADME.md\nA\tsrc/cli.ts'
    );
    const scoped = scopeToSubdir(manifest, 'brain');
    expect(scoped.added).toEqual(['people/joe.md']);
  });

  test('standalone brain/ repo does not need prefix stripping', () => {
    // pathToSlug works directly on repo-relative paths
    expect(pathToSlug('people/joe.md')).toBe('people/joe');
    expect(pathToSlug('tasks/fix-bug.md')).toBe('tasks/fix-bug');
    expect(pathToSlug('resources/architecture-rfc.md')).toBe('resources/architecture-rfc');
  });
});
