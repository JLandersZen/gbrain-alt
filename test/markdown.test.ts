import { describe, test, expect } from 'bun:test';
import { parseMarkdown, serializeMarkdown, splitBody } from '../src/core/markdown.ts';

describe('Markdown Parser', () => {
  test('parses frontmatter + compiled_truth + timeline', () => {
    const md = `---
type: resource
title: Do Things That Don't Scale
tags: [startups, growth]
---

Paul Graham argues that startups should do unscalable things early on.

---

- 2013-07-01: Published on paulgraham.com
- 2024-11-15: Referenced in batch kickoff talk
`;
    const parsed = parseMarkdown(md);
    expect(parsed.type).toBe('resource');
    expect(parsed.title).toBe("Do Things That Don't Scale");
    expect(parsed.tags).toEqual(['startups', 'growth']);
    expect(parsed.compiled_truth).toContain('unscalable things');
    expect(parsed.relationships).toBe('');
    expect(parsed.timeline).toContain('Published on paulgraham.com');
    expect(parsed.timeline).toContain('batch kickoff talk');
  });

  test('parses four-zone structure (compiled_truth + relationships + timeline)', () => {
    const md = `---
type: project
title: GBrain Adaptation
assigned_aors:
  - aors/engineering-leadership
related_people:
  - people/joe-landers
---

This project adapts GBrain for personal use.

---

## Relationships
- **Assigned AORs:** [Engineering Leadership](aors/engineering-leadership.md)
- **Related People:** [Joe Landers](people/joe-landers.md)

---

- 2026-04-16: Imported from Notion
`;
    const parsed = parseMarkdown(md);
    expect(parsed.type).toBe('project');
    expect(parsed.title).toBe('GBrain Adaptation');
    expect(parsed.compiled_truth).toBe('This project adapts GBrain for personal use.');
    expect(parsed.relationships).toContain('## Relationships');
    expect(parsed.relationships).toContain('[Engineering Leadership](aors/engineering-leadership.md)');
    expect(parsed.relationships).toContain('[Joe Landers](people/joe-landers.md)');
    expect(parsed.timeline).toContain('Imported from Notion');
    expect(parsed.frontmatter.assigned_aors).toEqual(['aors/engineering-leadership']);
    expect(parsed.frontmatter.related_people).toEqual(['people/joe-landers']);
  });

  test('handles no timeline separator', () => {
    const md = `---
type: resource
title: Superlinear Returns
---

Returns in many fields are superlinear.
Performance compounds over time.
`;
    const parsed = parseMarkdown(md);
    expect(parsed.compiled_truth).toContain('superlinear');
    expect(parsed.relationships).toBe('');
    expect(parsed.timeline).toBe('');
  });

  test('handles empty body', () => {
    const md = `---
type: resource
title: Empty Page
---
`;
    const parsed = parseMarkdown(md);
    expect(parsed.compiled_truth).toBe('');
    expect(parsed.relationships).toBe('');
    expect(parsed.timeline).toBe('');
  });

  test('removes type, title, tags from frontmatter object', () => {
    const md = `---
type: resource
title: Test
tags: [a, b]
custom_field: hello
---

Content
`;
    const parsed = parseMarkdown(md);
    expect(parsed.frontmatter).not.toHaveProperty('type');
    expect(parsed.frontmatter).not.toHaveProperty('title');
    expect(parsed.frontmatter).not.toHaveProperty('tags');
    expect(parsed.frontmatter).toHaveProperty('custom_field', 'hello');
  });

  test('infers type from file path', () => {
    const md = `---
title: Someone
---
Content
`;
    const parsed = parseMarkdown(md, 'people/someone.md');
    expect(parsed.type).toBe('person');
  });

  test('infers slug from file path', () => {
    const md = `---
type: resource
title: Test
---
Content
`;
    const parsed = parseMarkdown(md, 'resources/do-things-that-dont-scale.md');
    expect(parsed.slug).toBe('resources/do-things-that-dont-scale');
  });
});

describe('splitBody', () => {
  test('splits at first standalone --- (two-zone)', () => {
    const body = 'Above the line\n\n---\n\nBelow the line';
    const { compiled_truth, relationships, timeline } = splitBody(body);
    expect(compiled_truth).toContain('Above the line');
    expect(relationships).toBe('');
    expect(timeline).toContain('Below the line');
  });

  test('returns all as compiled_truth if no separator', () => {
    const body = 'Just some content\nWith multiple lines';
    const { compiled_truth, relationships, timeline } = splitBody(body);
    expect(compiled_truth).toBe(body);
    expect(relationships).toBe('');
    expect(timeline).toBe('');
  });

  test('handles --- at end of content', () => {
    const body = 'Content here\n\n---\n';
    const { compiled_truth, relationships, timeline } = splitBody(body);
    expect(compiled_truth).toContain('Content here');
    expect(relationships).toBe('');
    expect(timeline.trim()).toBe('');
  });

  test('splits into three zones with two separators', () => {
    const body = 'Compiled truth\n\n---\n\nRelationships zone\n\n---\n\nTimeline entries';
    const { compiled_truth, relationships, timeline } = splitBody(body);
    expect(compiled_truth).toContain('Compiled truth');
    expect(relationships).toContain('Relationships zone');
    expect(timeline).toContain('Timeline entries');
  });

  test('handles empty relationships zone between two separators', () => {
    const body = 'Compiled truth\n\n---\n\n---\n\nTimeline entries';
    const { compiled_truth, relationships, timeline } = splitBody(body);
    expect(compiled_truth).toContain('Compiled truth');
    expect(relationships.trim()).toBe('');
    expect(timeline).toContain('Timeline entries');
  });

  test('three or more separators: third+ goes into timeline', () => {
    const body = 'Truth\n\n---\n\nRelations\n\n---\n\nTimeline part 1\n\n---\n\nTimeline part 2';
    const { compiled_truth, relationships, timeline } = splitBody(body);
    expect(compiled_truth).toContain('Truth');
    expect(relationships).toContain('Relations');
    expect(timeline).toContain('Timeline part 1');
    expect(timeline).toContain('---');
    expect(timeline).toContain('Timeline part 2');
  });

  test('leading --- with no content before it is a real separator', () => {
    const body = '\n---\n\nActual compiled truth\n\n---\n\nTimeline';
    const { compiled_truth, relationships, timeline } = splitBody(body);
    // Leading --- counts as a separator: empty compiled_truth, middle zone, timeline
    expect(compiled_truth.trim()).toBe('');
    expect(relationships).toContain('Actual compiled truth');
    expect(timeline).toContain('Timeline');
  });

  test('does not recognize *** as zone separator (only --- is a zone delimiter)', () => {
    const body = 'Compiled truth\n\n***\n\nMore content\n\n***\n\nEven more';
    const { compiled_truth, relationships, timeline } = splitBody(body);
    expect(compiled_truth).toContain('Compiled truth');
    expect(compiled_truth).toContain('***');
    expect(compiled_truth).toContain('More content');
    expect(relationships).toBe('');
    expect(timeline).toBe('');
  });
});

describe('serializeMarkdown', () => {
  test('round-trips through parse and serialize (two-zone)', () => {
    const original = `---
type: resource
title: Do Things That Don't Scale
tags:
  - startups
  - growth
custom: value
---

Paul Graham argues that startups should do unscalable things early on.

---

- 2013-07-01: Published on paulgraham.com
`;
    const parsed = parseMarkdown(original);
    const serialized = serializeMarkdown(
      parsed.frontmatter,
      parsed.compiled_truth,
      parsed.timeline,
      { type: parsed.type, title: parsed.title, tags: parsed.tags },
    );

    // Re-parse the serialized version
    const reparsed = parseMarkdown(serialized);
    expect(reparsed.type).toBe(parsed.type);
    expect(reparsed.title).toBe(parsed.title);
    expect(reparsed.compiled_truth).toBe(parsed.compiled_truth);
    expect(reparsed.relationships).toBe('');
    expect(reparsed.timeline).toBe(parsed.timeline);
    expect(reparsed.frontmatter.custom).toBe('value');
  });

  test('round-trips four-zone structure', () => {
    const original = `---
type: project
title: GBrain Adaptation
assigned_aors:
  - aors/engineering-leadership
---

Adapting GBrain for personal use.

---

## Relationships
- **Assigned AORs:** [Engineering Leadership](aors/engineering-leadership.md)

---

- 2026-04-16: Imported from Notion
`;
    const parsed = parseMarkdown(original);
    const serialized = serializeMarkdown(
      parsed.frontmatter,
      parsed.compiled_truth,
      parsed.timeline,
      { type: parsed.type, title: parsed.title, tags: parsed.tags, relationships: parsed.relationships },
    );

    const reparsed = parseMarkdown(serialized);
    expect(reparsed.compiled_truth).toBe(parsed.compiled_truth);
    expect(reparsed.relationships).toBe(parsed.relationships);
    expect(reparsed.timeline).toBe(parsed.timeline);
  });

  test('omits relationships zone when empty', () => {
    const serialized = serializeMarkdown(
      {},
      'Some truth',
      '- 2026-01-01: Event',
      { type: 'resource', title: 'Test', tags: [] },
    );
    expect(serialized).not.toMatch(/---[\s\S]*---[\s\S]*---[\s\S]*---/);
    const parsed = parseMarkdown(serialized);
    expect(parsed.compiled_truth).toBe('Some truth');
    expect(parsed.relationships).toBe('');
    expect(parsed.timeline).toBe('- 2026-01-01: Event');
  });

  test('includes relationships zone when provided', () => {
    const relationships = '## Relationships\n- **People:** [Alice](people/alice.md)';
    const serialized = serializeMarkdown(
      {},
      'Some truth',
      '- 2026-01-01: Event',
      { type: 'resource', title: 'Test', tags: [], relationships },
    );
    const parsed = parseMarkdown(serialized);
    expect(parsed.compiled_truth).toBe('Some truth');
    expect(parsed.relationships).toBe(relationships);
    expect(parsed.timeline).toBe('- 2026-01-01: Event');
  });
});

describe('parseMarkdown normalization', () => {
  test('singularizes plural type values', () => {
    expect(parseMarkdown('---\ntype: tasks\ntitle: Fix\n---\nContent').type).toBe('task');
    expect(parseMarkdown('---\ntype: people\ntitle: Joe\n---\nContent').type).toBe('person');
    expect(parseMarkdown('---\ntype: events\ntitle: Sync\n---\nContent').type).toBe('event');
    expect(parseMarkdown('---\ntype: resources\ntitle: Doc\n---\nContent').type).toBe('resource');
    expect(parseMarkdown('---\ntype: organizations\ntitle: Acme\n---\nContent').type).toBe('organization');
    expect(parseMarkdown('---\ntype: aors\ntitle: Eng\n---\nContent').type).toBe('aor');
    expect(parseMarkdown('---\ntype: contexts\ntitle: Work\n---\nContent').type).toBe('context');
    expect(parseMarkdown('---\ntype: interests\ntitle: AI\n---\nContent').type).toBe('interest');
  });

  test('singular types pass through unchanged', () => {
    expect(parseMarkdown('---\ntype: task\ntitle: Fix\n---\nContent').type).toBe('task');
    expect(parseMarkdown('---\ntype: person\ntitle: Joe\n---\nContent').type).toBe('person');
    expect(parseMarkdown('---\ntype: project\ntitle: X\n---\nContent').type).toBe('project');
  });

  test('renames _events to related_events', () => {
    const parsed = parseMarkdown('---\ntype: person\ntitle: Joe\n_events: Meeting\n---\nContent');
    expect(parsed.frontmatter).not.toHaveProperty('_events');
    expect(parsed.frontmatter.related_events).toBe('Meeting');
  });

  test('renames parent_page to parent', () => {
    const parsed = parseMarkdown('---\ntype: project\ntitle: X\nparent_page: Big Project\n---\nContent');
    expect(parsed.frontmatter).not.toHaveProperty('parent_page');
    expect(parsed.frontmatter.parent).toBe('Big Project');
  });

  test('does not overwrite existing field on rename', () => {
    const parsed = parseMarkdown('---\ntype: project\ntitle: X\nparent_page: Old\nparent: New\n---\nContent');
    expect(parsed.frontmatter.parent).toBe('New');
    expect(parsed.frontmatter).not.toHaveProperty('parent_page');
  });
});

describe('parseMarkdown edge cases', () => {
  test('handles content with multiple --- separators (three-zone interpretation)', () => {
    const md = `---
type: resource
title: Test
---

First section.

---

Middle section.

---

More content.`;
    const parsed = parseMarkdown(md);
    expect(parsed.compiled_truth.trim()).toBe('First section.');
    expect(parsed.relationships.trim()).toBe('Middle section.');
    expect(parsed.timeline).toContain('More content.');
  });

  test('handles frontmatter without type or title', () => {
    const md = `---
custom_field: hello
---

Some content.`;
    const parsed = parseMarkdown(md);
    expect(parsed.type).toBeTruthy(); // should have a default
    expect(parsed.compiled_truth.trim()).toBe('Some content.');
    expect(parsed.frontmatter.custom_field).toBe('hello');
  });

  test('handles content with no frontmatter at all', () => {
    const md = `Just plain text with no YAML.`;
    const parsed = parseMarkdown(md);
    expect(parsed.compiled_truth).toContain('Just plain text');
  });

  test('handles empty string', () => {
    const parsed = parseMarkdown('');
    expect(parsed.compiled_truth).toBe('');
    expect(parsed.relationships).toBe('');
    expect(parsed.timeline).toBe('');
  });

  test('infers type from various directory paths', () => {
    expect(parseMarkdown('', 'people/someone.md').type).toBe('person');
    expect(parseMarkdown('', 'resources/thing.md').type).toBe('resource');
    expect(parseMarkdown('', 'organizations/acme.md').type).toBe('organization');
    expect(parseMarkdown('', 'contexts/at-work.md').type).toBe('context');
    expect(parseMarkdown('', 'aors/engineering.md').type).toBe('aor');
    expect(parseMarkdown('', 'tasks/fix-bug.md').type).toBe('task');
    expect(parseMarkdown('', 'events/weekly-sync.md').type).toBe('event');
    expect(parseMarkdown('', 'interests/distributed-systems.md').type).toBe('interest');
    expect(parseMarkdown('', 'projects/gbrain.md').type).toBe('project');
    expect(parseMarkdown('', 'unknown/foo.md').type).toBe('resource');
  });
});
