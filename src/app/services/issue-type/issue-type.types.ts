/** 設定で保存する課題種別 */
export interface IssueTypePreset {
  id: string;
  /** @deprecated 互換用。新規登録では空文字 */
  department: string;
  /** 種別の内容（課題登録・編集の「種別」に反映） */
  content: string;
  createdAt: string;
}
