/** プロジェクト新規登録用テンプレート */
export interface ProjectRegistrationTemplate {
  id: string;
  /** 設定画面・選択プルダウン用の名前 */
  label: string;
  name: string;
  description: string;
  departments: string[];
  createdAt: string;
}

/** 課題新規登録用テンプレート */
export interface TaskRegistrationTemplate {
  id: string;
  label: string;
  type: string;
  taskname: string;
  taskContent: string;
  departments: string[];
  createdAt: string;
}

export type ProjectTemplateInput = Omit<ProjectRegistrationTemplate, 'id' | 'createdAt'>;
export type TaskTemplateInput = Omit<TaskRegistrationTemplate, 'id' | 'createdAt'>;
