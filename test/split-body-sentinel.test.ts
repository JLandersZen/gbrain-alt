import { describe, test, expect } from 'bun:test';
import { splitBody, RELATIONSHIPS_SENTINEL, TIMELINE_SENTINEL } from '../src/core/markdown.ts';

describe('splitBody (sentinel-based four-zone)', () => {

  describe('no sentinels', () => {
    test('returns all as compiled_truth when no sentinels present', () => {
      const body = 'Just some content\nWith multiple lines';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe(body);
      expect(result.relationships).toBe('');
      expect(result.timeline).toBe('');
    });

    test('empty body returns empty zones', () => {
      const result = splitBody('');
      expect(result.compiled_truth).toBe('');
      expect(result.relationships).toBe('');
      expect(result.timeline).toBe('');
    });

    test('bare --- is NOT a zone separator', () => {
      const body = 'Above the line\n\n---\n\nBelow the line';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe(body);
      expect(result.relationships).toBe('');
      expect(result.timeline).toBe('');
    });

    test('multiple bare --- are NOT zone separators', () => {
      const body = 'Section 1\n\n---\n\nSection 2\n\n---\n\nSection 3';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe(body);
      expect(result.relationships).toBe('');
      expect(result.timeline).toBe('');
    });
  });

  describe('timeline sentinel only (two-zone: compiled_truth + timeline)', () => {
    test('splits at <!-- timeline --> sentinel', () => {
      const body = 'Main content here\n\n<!-- timeline -->\n\n- 2024-01-01: Event';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('Main content here\n');
      expect(result.relationships).toBe('');
      expect(result.timeline).toBe('\n- 2024-01-01: Event');
    });

    test('splits at <!--timeline--> (no spaces)', () => {
      const body = 'Content\n\n<!--timeline-->\n\nTimeline stuff';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('Content\n');
      expect(result.relationships).toBe('');
      expect(result.timeline).toBe('\nTimeline stuff');
    });

    test('splits at --- timeline --- decorated sentinel', () => {
      const body = 'Content\n\n--- timeline ---\n\nTimeline stuff';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('Content\n');
      expect(result.relationships).toBe('');
      expect(result.timeline).toBe('\nTimeline stuff');
    });

    test('splits at --- followed by ## Timeline heading (backward compat)', () => {
      const body = 'Article content\n\n---\n\n## Timeline\n\n- 2024: Event';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('Article content\n');
      expect(result.relationships).toBe('');
      expect(result.timeline).toContain('## Timeline');
      expect(result.timeline).toContain('Event');
    });

    test('splits at --- followed by ## History heading (backward compat)', () => {
      const body = 'Article content\n\n---\n\n## History\n\n- 2020: Founded';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('Article content\n');
      expect(result.relationships).toBe('');
      expect(result.timeline).toContain('## History');
    });

    test('does NOT split at --- followed by non-timeline heading', () => {
      const body = 'Content\n\n---\n\n## Notes\n\nSome notes';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe(body);
      expect(result.timeline).toBe('');
    });

    test('--- at start of file (no preceding content) is not a separator', () => {
      const body = '---\n\n## Timeline\n\n- Event';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe(body);
      expect(result.timeline).toBe('');
    });
  });

  describe('relationships sentinel only (two-zone: compiled_truth + relationships)', () => {
    test('splits at <!-- relationships --> sentinel', () => {
      const body = 'Main content\n\n<!-- relationships -->\n\n## Relationships\n- **Parent:** [X](x.md)';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('Main content\n');
      expect(result.relationships).toContain('## Relationships');
      expect(result.relationships).toContain('[X](x.md)');
      expect(result.timeline).toBe('');
    });

    test('splits at <!--relationships--> (no spaces)', () => {
      const body = 'Content\n\n<!--relationships-->\n\nRelations here';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('Content\n');
      expect(result.relationships).toBe('\nRelations here');
      expect(result.timeline).toBe('');
    });
  });

  describe('both sentinels (three-zone: compiled_truth + relationships + timeline)', () => {
    test('splits into three zones with both sentinels', () => {
      const body = [
        'Main content about the topic.',
        '',
        '<!-- relationships -->',
        '',
        '## Relationships',
        '- **Parent:** [Engineering](aors/engineering.md)',
        '',
        '<!-- timeline -->',
        '',
        '- 2024-01-01: Created',
        '- 2024-03-15: Updated',
      ].join('\n');

      const result = splitBody(body);
      expect(result.compiled_truth).toBe('Main content about the topic.\n');
      expect(result.relationships).toContain('## Relationships');
      expect(result.relationships).toContain('Engineering');
      expect(result.timeline).toContain('2024-01-01: Created');
      expect(result.timeline).toContain('2024-03-15: Updated');
    });

    test('handles relationships before timeline (correct order)', () => {
      const body = 'CT\n<!-- relationships -->\nREL\n<!-- timeline -->\nTL';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('CT');
      expect(result.relationships).toBe('REL');
      expect(result.timeline).toBe('TL');
    });

    test('relationships sentinel after timeline sentinel is treated as timeline content', () => {
      // If someone puts <!-- relationships --> after <!-- timeline -->, the relationships
      // sentinel is part of the timeline zone (timeline sentinel wins first)
      const body = 'CT\n<!-- timeline -->\nTL\n<!-- relationships -->\nREL';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('CT');
      expect(result.relationships).toBe('');
      expect(result.timeline).toBe('TL\n<!-- relationships -->\nREL');
    });

    test('empty relationships zone between sentinels', () => {
      const body = 'Content\n<!-- relationships -->\n<!-- timeline -->\nTimeline';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('Content');
      expect(result.relationships).toBe('');
      expect(result.timeline).toBe('Timeline');
    });

    test('relationships sentinel + decorated timeline separator', () => {
      const body = 'CT\n\n<!-- relationships -->\n\nREL\n\n--- timeline ---\n\nTL';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('CT\n');
      expect(result.relationships).toContain('REL');
      expect(result.timeline).toContain('TL');
    });

    test('relationships sentinel + heading-based timeline (backward compat)', () => {
      const body = 'CT\n\n<!-- relationships -->\n\nREL\n\n---\n\n## Timeline\n\n- Event';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('CT\n');
      expect(result.relationships).toContain('REL');
      expect(result.timeline).toContain('## Timeline');
    });
  });

  describe('round-trip stability', () => {
    test('parse → serialize → parse produces identical three-zone output', () => {
      const original = [
        'Paul Graham argues that startups should do unscalable things early.',
        '',
        RELATIONSHIPS_SENTINEL,
        '',
        '## Relationships',
        '- **Assigned AORs:** [Engineering](aors/engineering.md)',
        '- **Related Projects:** [Alpha](projects/alpha.md)',
        '',
        TIMELINE_SENTINEL,
        '',
        '- 2013-07-01: Published on paulgraham.com',
        '- 2024-11-15: Referenced in batch kickoff talk',
      ].join('\n');

      const parsed = splitBody(original);

      // Simulate serialize: rebuild with sentinels
      let serialized = parsed.compiled_truth;
      if (parsed.relationships) {
        serialized += '\n' + RELATIONSHIPS_SENTINEL + '\n' + parsed.relationships;
      }
      if (parsed.timeline) {
        serialized += '\n' + TIMELINE_SENTINEL + '\n' + parsed.timeline;
      }

      const reparsed = splitBody(serialized);
      expect(reparsed.compiled_truth).toBe(parsed.compiled_truth);
      expect(reparsed.relationships).toBe(parsed.relationships);
      expect(reparsed.timeline).toBe(parsed.timeline);
    });

    test('parse → serialize → parse with no relationships zone', () => {
      const original = [
        'Content here.',
        '',
        TIMELINE_SENTINEL,
        '',
        '- 2024-01-01: Event happened',
      ].join('\n');

      const parsed = splitBody(original);

      let serialized = parsed.compiled_truth;
      if (parsed.relationships) {
        serialized += '\n' + RELATIONSHIPS_SENTINEL + '\n' + parsed.relationships;
      }
      if (parsed.timeline) {
        serialized += '\n' + TIMELINE_SENTINEL + '\n' + parsed.timeline;
      }

      const reparsed = splitBody(serialized);
      expect(reparsed.compiled_truth).toBe(parsed.compiled_truth);
      expect(reparsed.relationships).toBe(parsed.relationships);
      expect(reparsed.timeline).toBe(parsed.timeline);
    });

    test('parse → serialize → parse with only compiled_truth', () => {
      const original = 'Just content, no zones.\nMultiple lines.\n\nWith paragraphs.';
      const parsed = splitBody(original);

      let serialized = parsed.compiled_truth;
      if (parsed.relationships) {
        serialized += '\n' + RELATIONSHIPS_SENTINEL + '\n' + parsed.relationships;
      }
      if (parsed.timeline) {
        serialized += '\n' + TIMELINE_SENTINEL + '\n' + parsed.timeline;
      }

      const reparsed = splitBody(serialized);
      expect(reparsed).toEqual(parsed);
    });
  });

  describe('edge cases', () => {
    test('sentinel as the very first line', () => {
      const body = '<!-- timeline -->\nTimeline from start';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('');
      expect(result.timeline).toBe('Timeline from start');
    });

    test('sentinel as the very last line', () => {
      const body = 'Content\n<!-- timeline -->';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('Content');
      expect(result.timeline).toBe('');
    });

    test('sentinel with leading/trailing whitespace on line', () => {
      const body = 'Content\n   <!-- timeline -->   \nTimeline';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('Content');
      expect(result.timeline).toBe('Timeline');
    });

    test('sentinel inside a code block is still recognized (raw split, no AST)', () => {
      // Note: this is the expected behavior for a line-based splitter.
      // In practice, sentinels won't appear in code blocks because
      // they're emitted by our serializer, not by users.
      const body = 'Content\n```\n<!-- timeline -->\n```\nMore';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('Content\n```');
      expect(result.timeline).toBe('```\nMore');
    });

    test('content with HTML comments that are NOT sentinels', () => {
      const body = 'Content\n<!-- this is a normal comment -->\nMore content';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe(body);
      expect(result.relationships).toBe('');
      expect(result.timeline).toBe('');
    });

    test('bare --- between relationships and timeline sentinels is not a splitter', () => {
      const body = 'CT\n<!-- relationships -->\nREL\n---\nMore REL\n<!-- timeline -->\nTL';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe('CT');
      expect(result.relationships).toBe('REL\n---\nMore REL');
      expect(result.timeline).toBe('TL');
    });
  });

  describe('upstream compatibility', () => {
    test('upstream two-zone page (timeline sentinel only) works identically', () => {
      const body = 'Paul Graham argues startups should do unscalable things.\n\n<!-- timeline -->\n\n- 2013-07-01: Published';
      const result = splitBody(body);
      expect(result.compiled_truth).toContain('unscalable things');
      expect(result.relationships).toBe('');
      expect(result.timeline).toContain('Published');
    });

    test('upstream page with --- timeline --- works', () => {
      const body = 'Content\n\n--- timeline ---\n\n- 2024: Event';
      const result = splitBody(body);
      expect(result.compiled_truth).toContain('Content');
      expect(result.timeline).toContain('Event');
    });

    test('upstream page with heading-based fallback works', () => {
      const body = 'Content\n\n---\n\n## Timeline\n\n- 2024: Event';
      const result = splitBody(body);
      expect(result.compiled_truth).toContain('Content');
      expect(result.timeline).toContain('## Timeline');
    });

    test('plain --- in body does NOT split (upstream fix for truncation bug)', () => {
      const body = 'Above the line\n\n---\n\nBelow the line';
      const result = splitBody(body);
      expect(result.compiled_truth).toBe(body);
      expect(result.timeline).toBe('');
    });
  });
});
