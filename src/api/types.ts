export interface Teacher {
  username: string;
  name: string;
  salt: string;
  hash: string;
  active: boolean;
  createdAt: string;
}

export interface Session {
  tokenHash: string;
  role: 'admin' | 'teacher';
  username: string;
  name: string;
  expiresAt: number;
}

export interface ClassItem {
  classId: string;
  code: string;
  name: string;
  username: string;
  createdAt: string;
}

export interface Student {
  studentId: string;
  classId: string;
  name: string;
  pinHash: string;
  createdAt: string;
}

export interface Assignment {
  assignmentId: string;
  classId: string;
  examId: string;
  openAt: string;
  dueAt: string;
  createdAt: string;
}

export interface ExamRecord {
  id: string;
  title: string;
  subject: string;
  grade: number | null;
  durationMinutes: number | null;
  questionCount: number;
  group: string;
  revision: number;
  updatedAt: string;
  owner: string;
  examJson: string;
}

export interface ResultRecord {
  attempt_id: string;
  exam_id: string;
  exam_version_id: string;
  candidate_display: string;
  started_at: string;
  submitted_at: string;
  duration_seconds: number;
  score_p1: string;
  max_p1: string;
  score_p2: string;
  max_p2: string;
  score_p3: string;
  max_p3: string;
  total: string;
  maxTotal: string;
  policy_version: string;
  raw_answers_json: string;
  class_code: string;
  assignment_id: string;
  recorded_at: string;
}

export interface CatalogExam {
  id: string;
  title: string;
  subject?: string;
  grade?: number;
  durationMinutes?: number;
  questionCount?: number;
  group?: string;
  [k: string]: unknown;
}

export interface Store {
  getTeacher(username: string): Promise<Teacher | null>;
  saveTeacher(teacher: Teacher): Promise<void>;
  listTeachers(): Promise<Teacher[]>;
  deleteTeacherSessions(username: string): Promise<void>;

  createSession(session: Session): Promise<void>;
  getSession(tokenHash: string): Promise<Session | null>;
  deleteSession(tokenHash: string): Promise<void>;

  getClassById(classId: string): Promise<ClassItem | null>;
  getClassByCode(code: string): Promise<ClassItem | null>;
  saveClass(cls: ClassItem): Promise<void>;
  listClassesByTeacher(username: string): Promise<ClassItem[]>;
  countClasses(): Promise<number>;

  saveAssignment(assignment: Assignment): Promise<void>;
  getAssignment(assignmentId: string): Promise<Assignment | null>;
  listAssignmentsByClass(classId: string): Promise<Assignment[]>;

  saveExam(exam: ExamRecord): Promise<void>;
  getExam(examId: string): Promise<ExamRecord | null>;
  listExams(): Promise<ExamRecord[]>;
  deleteExam(examId: string): Promise<void>;
  countExams(): Promise<number>;

  saveResult(result: ResultRecord): Promise<void>;
  getResult(attemptId: string): Promise<ResultRecord | null>;
  listResultsByClass(classCode: string, assignmentId?: string): Promise<ResultRecord[]>;
  countResults(): Promise<number>;
}

export interface RequestContext {
  store: Store;
  now: () => number;
  adminPassword?: string;
  env?: Record<string, string | undefined>;
  catalog?: readonly CatalogExam[];
}

export interface ApiRequest {
  method: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ApiResponsePayload {
  success: boolean;
  error?: string;
  message?: string;
  [k: string]: unknown;
}

export interface ApiResponse {
  status: number;
  body: ApiResponsePayload;
}
