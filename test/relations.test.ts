import { describe, test, expect } from 'bun:test';
import { extractRelations, flattenLinksNesting, renderRelationshipsZone } from '../src/core/relations.ts';
import { buildTitleMap } from '../src/core/normalize.ts';

describe('flattenLinksNesting', () => {
  test('flattens links: nested keys to top level', () => {
    const fm = {
      type: 'task',
      title: 'Test',
      links: {
        assigned_projects: ['projects/foo'],
        related_people: ['people/bar'],
      },
    };
    const result = flattenLinksNesting(fm);
    expect(result.assigned_projects).toEqual(['projects/foo']);
    expect(result.related_people).toEqual(['people/bar']);
    expect(result.links).toBeUndefined();
  });

  test('preserves top-level keys when links: nesting conflicts', () => {
    const fm = {
      assigned_projects: ['projects/top-level'],
      links: {
        assigned_projects: ['projects/nested'],
        related_people: ['people/bar'],
      },
    };
    const result = flattenLinksNesting(fm);
    expect(result.assigned_projects).toEqual(['projects/top-level']);
    expect(result.related_people).toEqual(['people/bar']);
  });

  test('returns fm unchanged when links is an array', () => {
    const fm = { links: ['a', 'b'] };
    const result = flattenLinksNesting(fm);
    expect(result.links).toEqual(['a', 'b']);
  });

  test('returns fm unchanged when links is a string', () => {
    const fm = { links: 'not-an-object' };
    const result = flattenLinksNesting(fm);
    expect(result.links).toBe('not-an-object');
  });

  test('returns fm unchanged when no links key', () => {
    const fm = { type: 'task', assigned_projects: ['projects/x'] };
    const result = flattenLinksNesting(fm);
    expect(result).toEqual(fm);
  });
});

describe('extractRelations', () => {
  test('extracts assigned_* relations', () => {
    const fm = {
      assigned_projects: ['projects/alpha', 'projects/beta'],
      assigned_aors: ['aors/engineering'],
      assigned_contexts: ['contexts/at-work'],
    };
    const links = extractRelations(fm, 'tasks/my-task');
    expect(links).toContainEqual({ targetSlug: 'projects/alpha', linkType: 'assigned_project' });
    expect(links).toContainEqual({ targetSlug: 'projects/beta', linkType: 'assigned_project' });
    expect(links).toContainEqual({ targetSlug: 'aors/engineering', linkType: 'assigned_aor' });
    expect(links).toContainEqual({ targetSlug: 'contexts/at-work', linkType: 'assigned_context' });
  });

  test('extracts related_* relations', () => {
    const fm = {
      related_people: ['people/alice', 'people/bob'],
      related_events: ['events/standup'],
    };
    const links = extractRelations(fm, 'tasks/my-task');
    expect(links).toContainEqual({ targetSlug: 'people/alice', linkType: 'related_person' });
    expect(links).toContainEqual({ targetSlug: 'people/bob', linkType: 'related_person' });
    expect(links).toContainEqual({ targetSlug: 'events/standup', linkType: 'related_event' });
  });

  test('extracts parent relation with type-aware link type', () => {
    const links = extractRelations(
      { parent: 'projects/parent-proj' },
      'projects/child-proj',
    );
    expect(links).toContainEqual({ targetSlug: 'projects/parent-proj', linkType: 'parent_project' });
  });

  test('extracts parent for tasks', () => {
    const links = extractRelations(
      { parent: 'tasks/parent-task' },
      'tasks/sub-task',
    );
    expect(links).toContainEqual({ targetSlug: 'tasks/parent-task', linkType: 'parent_task' });
  });

  test('extracts parent for organizations', () => {
    const links = extractRelations(
      { parent: 'organizations/parent-org' },
      'organizations/child-org',
    );
    expect(links).toContainEqual({ targetSlug: 'organizations/parent-org', linkType: 'parent_org' });
  });

  test('extracts parent for contexts', () => {
    const links = extractRelations(
      { parent: 'contexts/top-context' },
      'contexts/sub-context',
    );
    expect(links).toContainEqual({ targetSlug: 'contexts/top-context', linkType: 'parent_context' });
  });

  test('extracts parent for aors', () => {
    const links = extractRelations(
      { parent: 'aors/parent-aor' },
      'aors/child-aor',
    );
    expect(links).toContainEqual({ targetSlug: 'aors/parent-aor', linkType: 'parent_aor' });
  });

  test('falls back to generic parent link type for unknown dir', () => {
    const links = extractRelations(
      { parent: 'unknown/foo' },
      'unknown/bar',
    );
    expect(links).toContainEqual({ targetSlug: 'unknown/foo', linkType: 'parent' });
  });

  test('extracts single-valued delegate', () => {
    const links = extractRelations({ delegate: 'people/joe' }, 'tasks/my-task');
    expect(links).toContainEqual({ targetSlug: 'people/joe', linkType: 'delegate' });
  });

  test('extracts single-valued manager', () => {
    const links = extractRelations({ manager: 'people/jane' }, 'organizations/acme');
    expect(links).toContainEqual({ targetSlug: 'people/jane', linkType: 'manages' });
  });

  test('extracts organizations as belongs_to', () => {
    const links = extractRelations(
      { organizations: ['organizations/acme', 'organizations/globex'] },
      'people/alice',
    );
    expect(links).toContainEqual({ targetSlug: 'organizations/acme', linkType: 'belongs_to' });
    expect(links).toContainEqual({ targetSlug: 'organizations/globex', linkType: 'belongs_to' });
  });

  test('extracts people as has_member', () => {
    const links = extractRelations(
      { people: ['people/alice', 'people/bob'] },
      'organizations/acme',
    );
    expect(links).toContainEqual({ targetSlug: 'people/alice', linkType: 'has_member' });
    expect(links).toContainEqual({ targetSlug: 'people/bob', linkType: 'has_member' });
  });

  test('extracts supers and subs', () => {
    const links = extractRelations(
      { supers: ['people/boss'], subs: ['people/report'] },
      'people/middle-manager',
    );
    expect(links).toContainEqual({ targetSlug: 'people/boss', linkType: 'super' });
    expect(links).toContainEqual({ targetSlug: 'people/report', linkType: 'sub' });
  });

  test('extracts delegated_tasks and delegated_projects', () => {
    const links = extractRelations(
      {
        delegated_tasks: ['tasks/task-a'],
        delegated_projects: ['projects/proj-b'],
      },
      'people/alice',
    );
    expect(links).toContainEqual({ targetSlug: 'tasks/task-a', linkType: 'delegated_task' });
    expect(links).toContainEqual({ targetSlug: 'projects/proj-b', linkType: 'delegated_project' });
  });

  test('skips Notion UUID paths', () => {
    const links = extractRelations(
      {
        assigned_projects: [
          'projects/good-one',
          'nat-instance-migration-network-9908-projectsnat20instance20abc12345def67890abc12345def67890.md',
        ],
      },
      'tasks/my-task',
    );
    expect(links).toHaveLength(1);
    expect(links[0].targetSlug).toBe('projects/good-one');
  });

  test('handles links: nesting from Notion export', () => {
    const fm = {
      type: 'task',
      title: 'Nested Relations',
      links: {
        assigned_projects: ['projects/alpha'],
        related_people: ['people/bob'],
      },
    };
    const links = extractRelations(fm, 'tasks/nested');
    expect(links).toContainEqual({ targetSlug: 'projects/alpha', linkType: 'assigned_project' });
    expect(links).toContainEqual({ targetSlug: 'people/bob', linkType: 'related_person' });
  });

  test('returns empty array for frontmatter with no relations', () => {
    const fm = { type: 'resource', title: 'Plain', status: 'done' };
    const links = extractRelations(fm, 'resources/plain');
    expect(links).toHaveLength(0);
  });

  test('handles string values for multi-valued fields', () => {
    const links = extractRelations(
      { assigned_projects: 'projects/single' },
      'tasks/my-task',
    );
    expect(links).toContainEqual({ targetSlug: 'projects/single', linkType: 'assigned_project' });
  });

  test('skips empty string values', () => {
    const links = extractRelations(
      { assigned_projects: ['', 'projects/valid', ''] },
      'tasks/my-task',
    );
    expect(links).toHaveLength(1);
    expect(links[0].targetSlug).toBe('projects/valid');
  });

  test('skips undefined and null relation values', () => {
    const fm = {
      assigned_projects: undefined,
      related_people: null,
      delegate: '',
    };
    const links = extractRelations(fm, 'tasks/my-task');
    expect(links).toHaveLength(0);
  });

  test('handles related_interests', () => {
    const links = extractRelations(
      { related_interests: ['interests/distributed-systems'] },
      'resources/cap-theorem',
    );
    expect(links).toContainEqual({
      targetSlug: 'interests/distributed-systems',
      linkType: 'related_interest',
    });
  });
});

describe('renderRelationshipsZone', () => {
  test('renders basic relations as markdown links', () => {
    const fm = {
      assigned_aors: ['aors/engineering-leadership'],
      related_people: ['people/joe-landers'],
    };
    const result = renderRelationshipsZone(fm);
    expect(result).toContain('## Relationships');
    expect(result).toContain('- **Assigned AORs:** [Engineering Leadership](aors/engineering-leadership.md)');
    expect(result).toContain('- **Related People:** [Joe Landers](people/joe-landers.md)');
  });

  test('resolves titles from titleMap', () => {
    const titleMap = buildTitleMap([
      { title: 'My Engineering AOR', slug: 'aors/engineering-leadership' },
      { title: 'Joe Landers', slug: 'people/joe-landers' },
    ]);
    const fm = {
      assigned_aors: ['aors/engineering-leadership'],
      related_people: ['people/joe-landers'],
    };
    const result = renderRelationshipsZone(fm, titleMap);
    expect(result).toContain('[My Engineering AOR](aors/engineering-leadership.md)');
    expect(result).toContain('[Joe Landers](people/joe-landers.md)');
  });

  test('returns empty string when no relations exist', () => {
    const fm = { type: 'resource', title: 'Plain', status: 'done' };
    expect(renderRelationshipsZone(fm)).toBe('');
  });

  test('returns empty string when relation arrays are empty', () => {
    const fm = { assigned_projects: [], related_people: [] };
    expect(renderRelationshipsZone(fm)).toBe('');
  });

  test('handles single-valued fields (delegate, manager)', () => {
    const fm = {
      delegate: 'people/carol',
      manager: 'people/jane',
    };
    const result = renderRelationshipsZone(fm);
    expect(result).toContain('- **Delegate:** [Carol](people/carol.md)');
    expect(result).toContain('- **Manager:** [Jane](people/jane.md)');
  });

  test('handles parent relation', () => {
    const fm = { parent: 'projects/mega-project' };
    const result = renderRelationshipsZone(fm);
    expect(result).toContain('- **Parent:** [Mega Project](projects/mega-project.md)');
  });

  test('renders multiple values comma-separated', () => {
    const fm = {
      related_people: ['people/alice', 'people/bob', 'people/carol'],
    };
    const result = renderRelationshipsZone(fm);
    expect(result).toContain('[Alice](people/alice.md), [Bob](people/bob.md), [Carol](people/carol.md)');
  });

  test('handles links: nesting from Notion export', () => {
    const fm = {
      links: {
        assigned_projects: ['projects/alpha'],
        related_people: ['people/bob'],
      },
    };
    const result = renderRelationshipsZone(fm);
    expect(result).toContain('[Alpha](projects/alpha.md)');
    expect(result).toContain('[Bob](people/bob.md)');
  });

  test('skips null/undefined/empty string values', () => {
    const fm = {
      assigned_projects: null,
      related_people: undefined,
      delegate: '',
      assigned_aors: ['aors/eng'],
    };
    const result = renderRelationshipsZone(fm);
    expect(result).toContain('**Assigned AORs:**');
    expect(result).not.toContain('Assigned Projects');
    expect(result).not.toContain('Related People');
    expect(result).not.toContain('Delegate');
  });

  test('preserves field ordering', () => {
    const fm = {
      related_people: ['people/alice'],
      parent: 'projects/top',
      assigned_contexts: ['contexts/work'],
    };
    const result = renderRelationshipsZone(fm);
    const parentIdx = result.indexOf('Parent');
    const contextIdx = result.indexOf('Assigned Contexts');
    const peopleIdx = result.indexOf('Related People');
    expect(parentIdx).toBeLessThan(contextIdx);
    expect(contextIdx).toBeLessThan(peopleIdx);
  });

  test('falls back to slug-derived title when titleMap has no entry', () => {
    const titleMap = buildTitleMap([]);
    const fm = { related_people: ['people/unknown-person'] };
    const result = renderRelationshipsZone(fm, titleMap);
    expect(result).toContain('[Unknown Person](people/unknown-person.md)');
  });

  test('full round-trip: frontmatter → zone → parse matches original relations', () => {
    const fm = {
      assigned_aors: ['aors/engineering-leadership'],
      assigned_projects: ['projects/gbrain-adaptation'],
      related_people: ['people/joe-landers'],
      parent: 'tasks/taxonomy-replacement',
      delegate: 'people/someone',
    };
    const zone = renderRelationshipsZone(fm);
    expect(zone).toContain('## Relationships');
    expect(zone.split('\n').filter(l => l.startsWith('- **')).length).toBe(5);
  });
});
