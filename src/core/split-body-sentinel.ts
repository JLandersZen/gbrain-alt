/**
 * Sentinel-based four-zone body splitter.
 *
 * Extends upstream's two-zone sentinel approach to support our four-zone page structure:
 *   Zone 1: compiled_truth (main content)
 *   Zone 2: relationships (auto-generated from frontmatter relations)
 *   Zone 3: timeline (append-only evidence log)
 *
 * Sentinel precedence for each zone:
 *   Relationships: `<!-- relationships -->` or `<!--relationships-->`
 *   Timeline: `<!-- timeline -->` (preferred), `--- timeline ---`, or
 *             `---` when followed by `## Timeline` / `## History` heading
 *
 * Bare `---` is NEVER a zone separator (upstream's fix for 83% content truncation).
 * Pages without sentinels return all content as compiled_truth.
 */

export interface SplitResult {
  compiled_truth: string;
  relationships: string;
  timeline: string;
}

export function splitBody(body: string): SplitResult {
  const lines = body.split('\n');

  // Find timeline first (from start), then only accept relationships if before it
  const timeIdx = findTimelineSplitIndex(lines, 0);
  const relIdx = findRelationshipsSplitIndex(lines, timeIdx);

  if (relIdx === -1 && timeIdx === -1) {
    return { compiled_truth: body, relationships: '', timeline: '' };
  }

  if (relIdx !== -1 && timeIdx !== -1) {
    const compiled_truth = lines.slice(0, relIdx).join('\n');
    const relationships = lines.slice(relIdx + 1, timeIdx).join('\n');
    const timeline = lines.slice(timeIdx + 1).join('\n');
    return { compiled_truth, relationships, timeline };
  }

  if (relIdx !== -1) {
    const compiled_truth = lines.slice(0, relIdx).join('\n');
    const relationships = lines.slice(relIdx + 1).join('\n');
    return { compiled_truth, relationships, timeline: '' };
  }

  // timeIdx !== -1
  const compiled_truth = lines.slice(0, timeIdx).join('\n');
  const timeline = lines.slice(timeIdx + 1).join('\n');
  return { compiled_truth, relationships: '', timeline };
}

function findRelationshipsSplitIndex(lines: string[], beforeIndex: number): number {
  const limit = beforeIndex === -1 ? lines.length : beforeIndex;
  for (let i = 0; i < limit; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '<!-- relationships -->' || trimmed === '<!--relationships-->') {
      return i;
    }
  }
  return -1;
}

function findTimelineSplitIndex(lines: string[], startFrom: number): number {
  for (let i = startFrom; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed === '<!-- timeline -->' || trimmed === '<!--timeline-->') {
      return i;
    }

    if (trimmed === '--- timeline ---' || /^---\s+timeline\s+---$/i.test(trimmed)) {
      return i;
    }

    if (trimmed === '---') {
      const beforeContent = lines.slice(0, i).join('\n').trim();
      if (beforeContent.length === 0) continue;

      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next.length === 0) continue;
        if (/^##\s+(timeline|history)\b/i.test(next)) return i;
        break;
      }
    }
  }
  return -1;
}

export const RELATIONSHIPS_SENTINEL = '<!-- relationships -->';
export const TIMELINE_SENTINEL = '<!-- timeline -->';
