import { inject, Injectable } from '@angular/core';
import {
  collection,
  collectionGroup,
  doc,
  Firestore,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type DocumentReference,
  type Unsubscribe,
} from '@angular/fire/firestore';

import { FirestoreContextService } from '../firestore-context.service';
import type { ProjectChatMessage } from '../project-chat-service/project-chat.types';
import type { TaskChatMessage } from '../task-chat-service/task-chat.types';

const PROJECT_MESSAGES = 'messages';
const TASK_MESSAGES = 'messages';

@Injectable({
  providedIn: 'root',
})
export class ChatFirestoreService {
  private readonly firestore = inject(Firestore);
  private readonly firestoreContext = inject(FirestoreContextService);

  async listProjectMessages(projectManagementNumber: string): Promise<ProjectChatMessage[]> {
    const scopeId = projectManagementNumber.trim();
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(
        collection(this.firestore, 'projects', scopeId, PROJECT_MESSAGES),
      );
      return snap.docs.map((d) => d.data() as ProjectChatMessage);
    });
  }

  listenProjectMessages(
    projectManagementNumber: string,
    onMessages: (messages: ProjectChatMessage[]) => void,
    onError?: (error: unknown) => void,
  ): Unsubscribe {
    const scopeId = projectManagementNumber.trim();
    return this.firestoreContext.run(() =>
      onSnapshot(
        collection(this.firestore, 'projects', scopeId, PROJECT_MESSAGES),
        (snap) => {
          this.firestoreContext.run(() => {
            onMessages(snap.docs.map((d) => d.data() as ProjectChatMessage));
          });
        },
        (err) => onError?.(err),
      ),
    );
  }

  listenTaskMessages(
    taskManagementNo: string,
    onMessages: (messages: TaskChatMessage[]) => void,
    onError?: (error: unknown) => void,
  ): Unsubscribe {
    const scopeId = taskManagementNo.trim();
    return this.firestoreContext.run(() =>
      onSnapshot(
        collection(this.firestore, 'tasks', scopeId, TASK_MESSAGES),
        (snap) => {
          this.firestoreContext.run(() => {
            onMessages(snap.docs.map((d) => d.data() as TaskChatMessage));
          });
        },
        (err) => onError?.(err),
      ),
    );
  }

  async listTaskMessages(taskManagementNo: string): Promise<TaskChatMessage[]> {
    const scopeId = taskManagementNo.trim();
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collection(this.firestore, 'tasks', scopeId, TASK_MESSAGES));
      return snap.docs.map((d) => d.data() as TaskChatMessage);
    });
  }

  async listAllProjectMessages(): Promise<ProjectChatMessage[]> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collectionGroup(this.firestore, PROJECT_MESSAGES));
      return snap.docs
        .filter((d) => d.ref.path.startsWith('projects/'))
        .map((d) => d.data() as ProjectChatMessage);
    });
  }

  async listAllTaskMessages(): Promise<TaskChatMessage[]> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collectionGroup(this.firestore, TASK_MESSAGES));
      return snap.docs
        .filter((d) => d.ref.path.startsWith('tasks/'))
        .map((d) => d.data() as TaskChatMessage);
    });
  }

  async setProjectMessage(
    projectManagementNumber: string,
    message: ProjectChatMessage,
  ): Promise<void> {
    const scopeId = projectManagementNumber.trim();
    await this.firestoreContext.runAsync(async () => {
      await setDoc(
        doc(this.firestore, 'projects', scopeId, PROJECT_MESSAGES, message.id),
        this.projectMessageToFirestore(message),
      );
    });
  }

  async setTaskMessage(taskManagementNo: string, message: TaskChatMessage): Promise<void> {
    const scopeId = taskManagementNo.trim();
    await this.firestoreContext.runAsync(async () => {
      await setDoc(
        doc(this.firestore, 'tasks', scopeId, TASK_MESSAGES, message.id),
        this.taskMessageToFirestore(message),
      );
    });
  }

  async deleteAllProjectMessages(projectManagementNumber: string): Promise<void> {
    const scopeId = projectManagementNumber.trim();
    await this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(
        collection(this.firestore, 'projects', scopeId, PROJECT_MESSAGES),
      );
      await this.batchDelete(snap.docs.map((d) => d.ref as DocumentReference));
    });
  }

  async deleteAllTaskMessages(taskManagementNo: string): Promise<void> {
    const scopeId = taskManagementNo.trim();
    await this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collection(this.firestore, 'tasks', scopeId, TASK_MESSAGES));
      await this.batchDelete(snap.docs.map((d) => d.ref as DocumentReference));
    });
  }

  async restoreProjectMessages(
    projectManagementNumber: string,
    messages: readonly ProjectChatMessage[],
  ): Promise<void> {
    const scopeId = projectManagementNumber.trim();
    await this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(
        collection(this.firestore, 'projects', scopeId, PROJECT_MESSAGES),
      );
      await this.batchDelete(snap.docs.map((d) => d.ref as DocumentReference));
      if (messages.length === 0) {
        return;
      }
      const batch = writeBatch(this.firestore);
      for (const msg of messages) {
        batch.set(
          doc(this.firestore, 'projects', scopeId, PROJECT_MESSAGES, msg.id),
          this.projectMessageToFirestore(msg),
        );
      }
      await batch.commit();
    });
  }

  async restoreTaskMessages(
    taskManagementNo: string,
    messages: readonly TaskChatMessage[],
  ): Promise<void> {
    const scopeId = taskManagementNo.trim();
    await this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collection(this.firestore, 'tasks', scopeId, TASK_MESSAGES));
      await this.batchDelete(snap.docs.map((d) => d.ref as DocumentReference));
      if (messages.length === 0) {
        return;
      }
      const batch = writeBatch(this.firestore);
      for (const msg of messages) {
        batch.set(
          doc(this.firestore, 'tasks', scopeId, TASK_MESSAGES, msg.id),
          this.taskMessageToFirestore(msg),
        );
      }
      await batch.commit();
    });
  }

  private projectMessageToFirestore(message: ProjectChatMessage): ProjectChatMessage {
    return {
      ...message,
      mentions: message.mentions.map((m) => ({ ...m })),
    };
  }

  private taskMessageToFirestore(message: TaskChatMessage): TaskChatMessage {
    return {
      ...message,
      mentions: message.mentions.map((m) => ({ ...m })),
    };
  }

  private async batchDelete(refs: DocumentReference[]): Promise<void> {
    const CHUNK = 400;
    for (let i = 0; i < refs.length; i += CHUNK) {
      const batch = writeBatch(this.firestore);
      for (const ref of refs.slice(i, i + CHUNK)) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  }
}
