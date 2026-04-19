/**
 * E2E Relations Pipeline Tests -- Tier 1 (no API keys required)
 *
 * Tests the full import->links table->relationships zone->reverse links pipeline
 * against a real Postgres+pgvector database. Validates that:
 * - Frontmatter relations populate the links table
 * - Relationships zone is generated on disk
 * - Reverse links are reconstructed across pages
 * - The pipeline is idempotent
 *
 * Run: DATABASE_URL=... bun test test/e2e/relations-pipeline.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join, relative } from 'path';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import {
  hasDatabase, setupDB, teardownDB, getEngine,
} from './helpers.ts';
import { importFromFile, importFromContent } from '../../src/core/import-file.ts';
import { parseMarkdown, serializeMarkdown } from '../../src/core/markdown.ts';
import { buildTitleMap, type TitleMap } from '../../src/core/normalize.ts';
import { reconstructReverseLinks, renderRelationshipsZone } from '../../src/core/relations.ts';
import matter from 'gray-matter';

const skip = !hasDatabase();
const describeE2E = skip ? describe.skip : describe;

if (skip) {
  console.log('Skipping E2E relations pipeline tests (DATABASE_URL not set)');
}

function createRelationsTestDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gbrain-relations-e2e-'));

  mkdirSync(join(dir, 'projects'), { recursive: true });
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  mkdirSync(join(dir, 'people'), { recursive: true });
  mkdirSync(join(dir, 'organizations'), { recursive: true });
  mkdirSync(join(dir, 'aors'), { recursive: true });
  mkdirSync(join(dir, 'contexts'), { recursive: true });

  writeFileSync(join(dir, 'contexts/at-work.md'), [
    '---',
    'type: context',
    'title: At Work',
    'tags: []',
    '---',
    '',
    'The work context covers all professional activities.',
  ].join('\n'));

  writeFileSync(join(dir, 'aors/engineering.md'), [
    '---',
    'type: aor',
    'title: Engineering',
    'tags: []',
    'assigned_contexts:',
    '  - contexts/at-work',
    '---',
    '',
    'Engineering area of responsibility.',
  ].join('\n'));

  writeFileSync(join(dir, 'projects/alpha.md'), [
    '---',
    'type: project',
    'title: Project Alpha',
    'status: in-progress',
    'assigned_aors:',
    '  - aors/engineering',
    'related_people:',
    '  - people/alice',
    '---',
    '',
    'Alpha is our flagship project.',
    '',
    '<!-- timeline -->',
    '',
    '- 2026-01-01: Project kickoff',
  ].join('\n'));

  writeFileSync(join(dir, 'tasks/implement-api.md'), [
    '---',
    'type: task',
    'title: Implement API',
    'status: in-progress',
    'assigned_projects:',
    '  - projects/alpha',
    'related_people:',
    '  - people/alice',
    '  - people/bob',
    '---',
    '',
    'Build the REST API for Project Alpha.',
  ].join('\n'));

  writeFileSync(join(dir, 'tasks/write-tests.md'), [
    '---',
    'type: task',
    'title: Write Tests',
    'status: not-started',
    'assigned_projects:',
    '  - projects/alpha',
    'related_people:',
    '  - people/bob',
    '---',
    '',
    'Write comprehensive test coverage.',
  ].join('\n'));

  writeFileSync(join(dir, 'people/alice.md'), [
    '---',
    'type: person',
    'title: Alice Smith',
    'organizations:',
    '  - organizations/acme',
    '---',
    '',
    'Alice is a senior engineer.',
  ].join('\n'));

  writeFileSync(join(dir, 'people/bob.md'), [
    '---',
    'type: person',
    'title: Bob Jones',
    'organizations:',
    '  - organizations/acme',
    'supers:',
    '  - people/alice',
    '---',
    '',
    'Bob is a junior engineer.',
  ].join('\n'));

  writeFileSync(join(dir, 'organizations/acme.md'), [
    '---',
    'type: organization',
    'title: Acme Corp',
    'people:',
    '  - people/alice',
    '  - people/bob',
    '---',
    '',
    'Acme Corp builds widgets.',
  ].join('\n'));

  return dir;
}

function buildTestTitleMap(dir: string): TitleMap {
  const entries: { title: string; slug: string }[] = [];
  function scan(d: string) {
    const { readdirSync, statSync } = require('fs');
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        scan(full);
      } else if (entry.endsWith('.md')) {
        const raw = readFileSync(full, 'utf-8');
        const { data } = matter(raw);
        const rel = relative(dir, full);
        const slug = rel.replace(/\.md$/, '');
        const title = (data.title as string) || slug.split('/').pop()?.replace(/-/g, ' ') || slug;
        entries.push({ title, slug });
      }
    }
  }
  scan(dir);
  return buildTitleMap(entries);
}

describeE2E('E2E: Relations Pipeline', () => {
  let testDir: string;
  let titleMap: TitleMap;

  beforeAll(async () => {
    await setupDB();
    testDir = createRelationsTestDir();
    titleMap = buildTestTitleMap(testDir);
  });

  afterAll(async () => {
    await teardownDB();
    if (testDir) rmSync(testDir, { recursive: true, force: true });
  });

  test('import populates links table from frontmatter relations', async () => {
    const engine = getEngine();

    const files = [
      'contexts/at-work.md',
      'organizations/acme.md',
      'people/alice.md',
      'people/bob.md',
      'aors/engineering.md',
      'projects/alpha.md',
      'tasks/implement-api.md',
      'tasks/write-tests.md',
    ];

    for (const f of files) {
      const result = await importFromFile(engine, join(testDir, f), f, { noEmbed: true, titleMap });
      expect(result.status).toBe('imported');
    }

    const taskLinks = await engine.getLinks('tasks/implement-api');
    const taskLinkTypes = taskLinks.map((l: any) => l.link_type);
    expect(taskLinkTypes).toContain('assigned_project');
    expect(taskLinkTypes).toContain('related_person');

    const projectTargets = taskLinks
      .filter((l: any) => l.link_type === 'assigned_project')
      .map((l: any) => l.to_slug);
    expect(projectTargets).toContain('projects/alpha');

    const personTargets = taskLinks
      .filter((l: any) => l.link_type === 'related_person')
      .map((l: any) => l.to_slug);
    expect(personTargets).toContain('people/alice');
    expect(personTargets).toContain('people/bob');
  });

  test('import populates parent links with type-aware link types', async () => {
    const engine = getEngine();

    const aorLinks = await engine.getLinks('aors/engineering');
    const contextLink = aorLinks.find((l: any) => l.to_slug === 'contexts/at-work');
    expect(contextLink).toBeDefined();
    expect(contextLink!.link_type).toBe('assigned_context');
  });

  test('import populates belongs_to links from organizations field', async () => {
    const engine = getEngine();

    const aliceLinks = await engine.getLinks('people/alice');
    const belongsTo = aliceLinks.filter((l: any) => l.link_type === 'belongs_to');
    expect(belongsTo.length).toBe(1);
    expect(belongsTo[0].to_slug).toBe('organizations/acme');
  });

  test('import populates super links from supers field', async () => {
    const engine = getEngine();

    const bobLinks = await engine.getLinks('people/bob');
    const superLink = bobLinks.find((l: any) => l.link_type === 'super');
    expect(superLink).toBeDefined();
    expect(superLink!.to_slug).toBe('people/alice');
  });

  test('backlinks work for populated links', async () => {
    const engine = getEngine();

    const backlinks = await engine.getBacklinks('projects/alpha');
    const fromSlugs = backlinks.map((l: any) => l.from_slug);
    expect(fromSlugs).toContain('tasks/implement-api');
    expect(fromSlugs).toContain('tasks/write-tests');
  });

  test('relationships zone is generated on disk', async () => {
    const taskContent = readFileSync(join(testDir, 'tasks/implement-api.md'), 'utf-8');
    expect(taskContent).toContain('## Relationships');
    expect(taskContent).toContain('[Project Alpha](projects/alpha.md)');
    expect(taskContent).toContain('[Alice Smith](people/alice.md)');
    expect(taskContent).toContain('[Bob Jones](people/bob.md)');
  });

  test('relationships zone preserves four-zone structure', async () => {
    const content = readFileSync(join(testDir, 'projects/alpha.md'), 'utf-8');
    const parsed = parseMarkdown(content, 'projects/alpha.md');

    expect(parsed.compiled_truth).toContain('Alpha is our flagship project.');
    expect(parsed.relationships).toContain('## Relationships');
    expect(parsed.timeline).toContain('2026-01-01: Project kickoff');
  });

  test('relationships zone is idempotent on re-import', async () => {
    const engine = getEngine();

    const contentBefore = readFileSync(join(testDir, 'tasks/implement-api.md'), 'utf-8');

    await importFromFile(
      engine,
      join(testDir, 'tasks/implement-api.md'),
      'tasks/implement-api.md',
      { noEmbed: true, titleMap },
    );

    const contentAfter = readFileSync(join(testDir, 'tasks/implement-api.md'), 'utf-8');
    expect(contentAfter).toBe(contentBefore);
  });

  test('reverse links are reconstructed across pages', async () => {
    const allPages: { slug: string; frontmatter: Record<string, unknown> }[] = [];
    const files = [
      'contexts/at-work.md', 'aors/engineering.md', 'projects/alpha.md',
      'tasks/implement-api.md', 'tasks/write-tests.md',
      'people/alice.md', 'people/bob.md', 'organizations/acme.md',
    ];

    for (const f of files) {
      const raw = readFileSync(join(testDir, f), 'utf-8');
      const { data } = matter(raw);
      const slug = f.replace(/\.md$/, '');
      allPages.push({ slug, frontmatter: data });
    }

    const changes = reconstructReverseLinks(allPages);

    const alphaChange = changes.find(c => c.slug === 'projects/alpha');
    expect(alphaChange).toBeDefined();
    expect(alphaChange!.patches.tasks).toContain('tasks/implement-api');
    expect(alphaChange!.patches.tasks).toContain('tasks/write-tests');

    const aliceChange = changes.find(c => c.slug === 'people/alice');
    expect(aliceChange).toBeDefined();
    expect(aliceChange!.patches.related_tasks).toContain('tasks/implement-api');
    expect(aliceChange!.patches.related_projects).toContain('projects/alpha');
  });

  test('reverse link patches applied to disk produce valid four-zone files', async () => {
    const engine = getEngine();

    const allPages: { slug: string; frontmatter: Record<string, unknown> }[] = [];
    const files = [
      'contexts/at-work.md', 'aors/engineering.md', 'projects/alpha.md',
      'tasks/implement-api.md', 'tasks/write-tests.md',
      'people/alice.md', 'people/bob.md', 'organizations/acme.md',
    ];

    for (const f of files) {
      const raw = readFileSync(join(testDir, f), 'utf-8');
      const { data } = matter(raw);
      const slug = f.replace(/\.md$/, '');
      allPages.push({ slug, frontmatter: data });
    }

    const changes = reconstructReverseLinks(allPages);
    for (const change of changes) {
      const filePath = join(testDir, change.slug + '.md');
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = parseMarkdown(raw, change.slug + '.md');

      const updatedFm = { ...parsed.frontmatter };
      for (const [field, values] of Object.entries(change.patches)) {
        updatedFm[field] = values;
      }

      const zone = renderRelationshipsZone(
        { ...updatedFm, type: parsed.type, title: parsed.title },
        titleMap,
      );

      const updated = serializeMarkdown(
        updatedFm,
        parsed.compiled_truth,
        parsed.timeline,
        { type: parsed.type, title: parsed.title, tags: parsed.tags },
        zone,
      );

      writeFileSync(filePath, updated, 'utf-8');

      await importFromFile(engine, filePath, change.slug + '.md', { noEmbed: true, titleMap });
    }

    const alphaContent = readFileSync(join(testDir, 'projects/alpha.md'), 'utf-8');
    expect(alphaContent).toContain('## Relationships');
    expect(alphaContent).toContain('[Implement API](tasks/implement-api.md)');
    expect(alphaContent).toContain('[Write Tests](tasks/write-tests.md)');

    const alphaParsed = parseMarkdown(alphaContent, 'projects/alpha.md');
    expect(alphaParsed.compiled_truth).toContain('Alpha is our flagship project.');
    expect(alphaParsed.relationships).toContain('## Relationships');
    expect(alphaParsed.timeline).toContain('2026-01-01: Project kickoff');
  });

  test('reverse links update the links table correctly', async () => {
    const engine = getEngine();

    const alphaLinks = await engine.getLinks('projects/alpha');
    const linkTypes = alphaLinks.map((l: any) => l.link_type);
    expect(linkTypes).toContain('assigned_aor');
    expect(linkTypes).toContain('related_person');
  });

  test('pages without relations have no relationships zone', async () => {
    const engine = getEngine();

    const isolatedFile = join(testDir, 'resources/standalone.md');
    mkdirSync(join(testDir, 'resources'), { recursive: true });
    writeFileSync(isolatedFile, [
      '---',
      'type: resource',
      'title: Standalone Note',
      'tags: [misc]',
      '---',
      '',
      'A resource with zero relations.',
    ].join('\n'));

    titleMap = buildTestTitleMap(testDir);

    await importFromFile(engine, isolatedFile, 'resources/standalone.md', { noEmbed: true, titleMap });

    const content = readFileSync(isolatedFile, 'utf-8');
    expect(content).not.toContain('## Relationships');

    const parsed = parseMarkdown(content, 'resources/standalone.md');
    expect(parsed.compiled_truth).toContain('A resource with zero relations.');
    expect(parsed.relationships).toBe('');
  });

  test('links: nesting (Notion format) is handled correctly', async () => {
    const engine = getEngine();

    const notionFile = join(testDir, 'tasks/notion-style.md');
    writeFileSync(notionFile, [
      '---',
      'type: task',
      'title: Notion Style Task',
      'links:',
      '  assigned_projects:',
      '    - projects/alpha',
      '  related_people:',
      '    - people/alice',
      '---',
      '',
      'A task imported from Notion with nested links.',
    ].join('\n'));

    const result = await importFromFile(
      engine, notionFile, 'tasks/notion-style.md', { noEmbed: true, titleMap },
    );
    expect(result.status).toBe('imported');

    const links = await engine.getLinks('tasks/notion-style');
    const types = links.map((l: any) => l.link_type);
    expect(types).toContain('assigned_project');
    expect(types).toContain('related_person');

    const content = readFileSync(notionFile, 'utf-8');
    expect(content).toContain('## Relationships');
    expect(content).toContain('[Project Alpha](projects/alpha.md)');
  });

  test('stale links are removed when relations change', async () => {
    const engine = getEngine();

    const filePath = join(testDir, 'tasks/implement-api.md');
    const raw = readFileSync(filePath, 'utf-8');
    const updated = raw.replace(
      '  - people/bob',
      '',
    );
    writeFileSync(filePath, updated, 'utf-8');

    const result = await importFromFile(
      engine, filePath, 'tasks/implement-api.md', { noEmbed: true, titleMap },
    );
    expect(result.status).toBe('imported');

    const links = await engine.getLinks('tasks/implement-api');
    const personTargets = links
      .filter((l: any) => l.link_type === 'related_person')
      .map((l: any) => l.to_slug);
    expect(personTargets).toContain('people/alice');
    expect(personTargets).not.toContain('people/bob');
  });

  test('graph traversal works with relation links', async () => {
    const engine = getEngine();

    const graph = await engine.traverseGraph('tasks/implement-api', 1);
    const connectedSlugs = graph.map((n: any) => n.slug || n.to_slug);
    expect(connectedSlugs).toContain('projects/alpha');
  });
});

describeE2E('E2E: Sync Pipeline with Relations', () => {
  let repoPath: string;
  let titleMap: TitleMap;

  beforeAll(async () => {
    await setupDB();
    repoPath = createSyncRelationsRepo();
    titleMap = buildTestTitleMap(repoPath);
  });

  afterAll(async () => {
    await teardownDB();
    if (repoPath) rmSync(repoPath, { recursive: true, force: true });
  });

  test('sync populates links table and generates relationships zone', async () => {
    const { performSync } = await import('../../src/commands/sync.ts');
    const engine = getEngine();

    const result = await performSync(engine, {
      repoPath,
      noPull: true,
      noEmbed: true,
    });

    expect(result.status).toBe('first_sync');

    const taskLinks = await engine.getLinks('tasks/sync-task');
    expect(taskLinks.length).toBeGreaterThan(0);
    const projectLink = taskLinks.find((l: any) => l.to_slug === 'projects/sync-project');
    expect(projectLink).toBeDefined();
    expect(projectLink!.link_type).toBe('assigned_project');

    const taskContent = readFileSync(join(repoPath, 'tasks/sync-task.md'), 'utf-8');
    expect(taskContent).toContain('## Relationships');
    expect(taskContent).toContain('[Sync Project](projects/sync-project.md)');
  });

  test('second sync is idempotent', async () => {
    const { performSync } = await import('../../src/commands/sync.ts');
    const engine = getEngine();

    // Commit any zone changes from the first sync so git sees a clean state
    execSync('git add -A && git commit -m "zones generated" --allow-empty', {
      cwd: repoPath, stdio: 'pipe',
    });

    // Second sync: processes the zone-commit diff (synced), but no further file changes
    const result = await performSync(engine, {
      repoPath,
      noPull: true,
      noEmbed: true,
    });

    const contentAfterSecondSync = readFileSync(join(repoPath, 'tasks/sync-task.md'), 'utf-8');

    // Commit any changes from second sync, then third sync should be up_to_date
    execSync('git add -A && git commit -m "second sync" --allow-empty', {
      cwd: repoPath, stdio: 'pipe',
    });

    const result2 = await performSync(engine, {
      repoPath,
      noPull: true,
      noEmbed: true,
    });

    expect(result2.status).toBe('up_to_date');

    const contentAfterThirdSync = readFileSync(join(repoPath, 'tasks/sync-task.md'), 'utf-8');
    expect(contentAfterThirdSync).toBe(contentAfterSecondSync);
  });
});

function createSyncRelationsRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gbrain-sync-relations-e2e-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });

  mkdirSync(join(dir, 'projects'), { recursive: true });
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  mkdirSync(join(dir, 'people'), { recursive: true });

  writeFileSync(join(dir, 'projects/sync-project.md'), [
    '---',
    'type: project',
    'title: Sync Project',
    'status: in-progress',
    '---',
    '',
    'A project for testing sync relations.',
  ].join('\n'));

  writeFileSync(join(dir, 'tasks/sync-task.md'), [
    '---',
    'type: task',
    'title: Sync Task',
    'assigned_projects:',
    '  - projects/sync-project',
    'related_people:',
    '  - people/sync-person',
    '---',
    '',
    'A task that references the project and a person.',
  ].join('\n'));

  writeFileSync(join(dir, 'people/sync-person.md'), [
    '---',
    'type: person',
    'title: Sync Person',
    '---',
    '',
    'A person for sync testing.',
  ].join('\n'));

  execSync('git add -A && git commit -m "initial commit with relations"', {
    cwd: dir, stdio: 'pipe',
  });

  return dir;
}
