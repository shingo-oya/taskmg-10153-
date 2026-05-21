import { formatChatTimeShortJapan } from '../../shared/japan-datetime';

export type ProjectChatBodySegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string };

function mergeAdjacentText(segments: ProjectChatBodySegment[]): ProjectChatBodySegment[] {
  const merged: ProjectChatBodySegment[] = [];
  for (const s of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === 'text' && s.kind === 'text') {
      prev.text += s.text;
    } else {
      merged.push(s.kind === 'text' ? { kind: 'text', text: s.text } : { kind: 'mention', text: s.text });
    }
  }
  return merged;
}

/**
 * 本文を表示用に分割。`knownDisplayNames` は Users の氏名一覧など（長い名前を先にマッチ）。
 */
export function segmentMentionBody(body: string, knownDisplayNames: readonly string[]): ProjectChatBodySegment[] {
  if (!body) {
    return [];
  }
  const names = [...new Set(knownDisplayNames.map((n) => n.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  const nextTrigger = (from: number): number => {
    const a = body.indexOf('@', from);
    const w = body.indexOf('＠', from);
    const cands = [a, w].filter((x) => x >= 0);
    return cands.length ? Math.min(...cands) : -1;
  };

  const out: ProjectChatBodySegment[] = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '@' || ch === '＠') {
      let matched: string | null = null;
      for (const n of names) {
        const token = `${ch}${n}`;
        if (body.startsWith(token, i)) {
          matched = token;
          break;
        }
      }
      if (matched) {
        out.push({ kind: 'mention', text: matched });
        i += matched.length;
      } else {
        out.push({ kind: 'text', text: ch });
        i += 1;
      }
    } else {
      const nextAt = nextTrigger(i + 1);
      const end = nextAt === -1 ? body.length : nextAt;
      out.push({ kind: 'text', text: body.slice(i, end) });
      i = end;
    }
  }
  return mergeAdjacentText(out);
}

export function formatChatTimeShort(iso: string): string {
  return formatChatTimeShortJapan(iso);
}
