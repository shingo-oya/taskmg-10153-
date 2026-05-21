/**
 * Firestore 上のデモシード（project-seed-data / task-seed-data と同 ID）を削除する。
 *
 * 事前:
 *   npx firebase-tools login
 *
 * 実行:
 *   npm run firestore:delete-demo
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ids = JSON.parse(readFileSync(join(__dirname, 'demo-seed-ids.json'), 'utf8'));
const projectId = ids.firebaseProjectId;

let failures = 0;

function runDelete(path) {
  const args = [
    'firebase-tools',
    'firestore:delete',
    path,
    '-r',
    '-f',
    '--project',
    projectId,
  ];
  console.log(`> npx ${args.join(' ')}`);
  const result = spawnSync('npx', args, { encoding: 'utf8', shell: true });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    failures += 1;
    if (out.includes('Failed to authenticate')) {
      console.error('\nFirebase にログインしてください:\n  npx firebase-tools login\n');
      process.exit(1);
    }
    console.warn(`  (skip or failed: ${path})`);
    if (out.trim()) {
      console.warn(out.trim());
    }
  }
}

console.log(`Deleting demo data from Firestore project: ${projectId}\n`);

for (const taskId of ids.tasks) {
  runDelete(`tasks/${taskId}`);
  runDelete(`trashTasks/${taskId}`);
}

for (const prjId of ids.projects) {
  runDelete(`projects/${prjId}`);
  runDelete(`trashProjects/${prjId}`);
}

if (failures > 0) {
  console.error(`\nFinished with ${failures} failed path(s).`);
  process.exit(1);
}

console.log('\nDone. Demo projects, tasks, and trash copies were removed.');
