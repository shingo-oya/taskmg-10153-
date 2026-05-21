import { projectMemberNames, type ProjectRow } from '../components/project-list/project-row';
import { taskMemberNames, type TaskRow } from '../components/task-list/task-row';

export interface ChatMentionRef {
  displayName: string;
}

/** チャット投稿・通知用: 本文からメンションを抽出（`@氏名` / `＠氏名` の完全一致） */
export function resolveChatMentions(
  body: string,
  knownDisplayNames: readonly string[],
): ChatMentionRef[] {
  const sorted = [...knownDisplayNames].sort((a, b) => b.length - a.length);
  const found: ChatMentionRef[] = [];
  const seen = new Set<string>();
  for (const name of sorted) {
    const n = name.trim();
    if (!n) {
      continue;
    }
    if ((body.includes(`@${n}`) || body.includes(`＠${n}`)) && !seen.has(n)) {
      seen.add(n);
      found.push({ displayName: n });
    }
  }
  return found;
}

export function isMentionedInBody(body: string, displayName: string): boolean {
  const n = displayName.trim();
  if (!n) {
    return false;
  }
  return body.includes(`@${n}`) || body.includes(`＠${n}`);
}

export function mergeMentionCandidateNames(...sources: readonly (readonly string[] | string)[]): string[] {
  const out = new Set<string>();
  for (const src of sources) {
    if (typeof src === 'string') {
      const t = src.trim();
      if (t) {
        out.add(t);
      }
      continue;
    }
    for (const name of src) {
      const t = name.trim();
      if (t) {
        out.add(t);
      }
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'ja'));
}

/** プロジェクト詳細チャットのメンション候補（参加者・承認者など） */
export function projectChatMentionCandidates(
  project: ProjectRow | null | undefined,
  extraNames: readonly string[] = [],
): string[] {
  if (!project) {
    return mergeMentionCandidateNames(extraNames);
  }
  return mergeMentionCandidateNames(
    projectMemberNames(project),
    project.participants.map((p) => p.name),
    project.members,
    project.approver,
    project.lastUpdatedBy,
    extraNames,
  );
}

/** 課題詳細チャットのメンション候補 */
export function taskChatMentionCandidates(
  task: TaskRow | null | undefined,
  extraNames: readonly string[] = [],
): string[] {
  if (!task) {
    return mergeMentionCandidateNames(extraNames);
  }
  return mergeMentionCandidateNames(
    taskMemberNames(task),
    task.participants.map((p) => p.name),
    task.members,
    task.approver,
    task.creator,
    task.lastUpdatedBy,
    extraNames,
  );
}
