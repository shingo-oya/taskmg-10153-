export interface UsersRow {
  /** Firestore ドキュメント ID（Firebase Auth uid） */
  uid?: string;
  department: string;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
  /** 表示用（例: 有効 / 無効） */
  status: string;
}
