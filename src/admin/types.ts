import type {
  AdminStats,
  TeacherAccountInfo,
  NewTeacherInput,
  ResetPasswordInput,
  SetTeacherActiveInput,
} from '../collect/appsScript.ts';

export type {
  AdminStats,
  TeacherAccountInfo,
  NewTeacherInput,
  ResetPasswordInput,
  SetTeacherActiveInput,
};

export interface AdminState {
  readonly token: string | null;
  readonly stats: AdminStats | null;
  readonly teachers: readonly TeacherAccountInfo[];
  readonly loading: boolean;
  readonly error: string | null;
}

export interface AdminController {
  readonly root: HTMLElement;
  refresh(): Promise<void>;
  login(password: string): Promise<boolean>;
  logout(): void;
  createTeacher(input: NewTeacherInput): Promise<boolean>;
  resetPassword(input: ResetPasswordInput): Promise<boolean>;
  setTeacherActive(input: SetTeacherActiveInput): Promise<boolean>;
  getState(): Readonly<AdminState>;
  dispose(): void;
}
