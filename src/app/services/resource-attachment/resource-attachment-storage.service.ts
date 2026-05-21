import { EnvironmentInjector, inject, Injectable, runInInjectionContext } from '@angular/core';
import {
  Storage,
  getDownloadURL,
  ref,
  uploadBytes,
  type UploadMetadata,
} from '@angular/fire/storage';

import { FILE_ATTACHMENT_UNAVAILABLE_MESSAGE } from '../../shared/file-attachments.config';
import { environment } from '../../../environments/environment';

const MAX_BYTES = 25 * 1024 * 1024;

export type ResourceAttachmentScope = 'projects' | 'tasks';

@Injectable({
  providedIn: 'root',
})
export class ResourceAttachmentStorageService {
  private readonly storage = inject(Storage);
  private readonly injector = inject(EnvironmentInjector);

  async upload(
    scope: ResourceAttachmentScope,
    scopeId: string,
    folderId: string,
    file: File,
  ): Promise<{ ok: true; downloadUrl: string } | { ok: false; reason: string }> {
    if (!environment.fileAttachmentsEnabled) {
      return { ok: false, reason: FILE_ATTACHMENT_UNAVAILABLE_MESSAGE };
    }

    const id = scopeId.trim();
    const fid = folderId.trim();
    if (!id || !fid) {
      return { ok: false, reason: '添付先が不正です。' };
    }
    if (!file || file.size <= 0) {
      return { ok: false, reason: 'ファイルを選択してください。' };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, reason: 'ファイルサイズは 25MB 以下にしてください。' };
    }

    const safeName = sanitizeStorageFileName(file.name);
    const objectPath = `attachments/${scope}/${id}/${fid}/${Date.now()}_${safeName}`;
    const metadata: UploadMetadata = {
      contentType: file.type || 'application/octet-stream',
      customMetadata: {
        originalName: file.name.slice(0, 200),
      },
    };

    try {
      const downloadUrl = await runInInjectionContext(this.injector, async () => {
        const storageRef = ref(this.storage, objectPath);
        const result = await uploadBytes(storageRef, file, metadata);
        return getDownloadURL(result.ref);
      });
      return { ok: true, downloadUrl };
    } catch {
      return {
        ok: false,
        reason: 'ファイルのアップロードに失敗しました。Storage の有効化とルールを確認してください。',
      };
    }
  }
}

function sanitizeStorageFileName(name: string): string {
  const base = name.trim() || 'file';
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return sanitized.length > 0 ? sanitized.slice(0, 120) : 'file';
}
