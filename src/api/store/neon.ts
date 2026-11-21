import type { Teacher, Session, ClassItem, Student, Assignment, ExamRecord, ResultRecord, Store } from '../types.ts';

export interface NeonStoreOptions {
  connectionString?: string;
  fetch?: typeof fetch;
  fetchImpl?: typeof fetch;
}

export class NeonStore implements Store {
  private endpoint: string;
  private authToken: string;
  private fetchFn: typeof fetch;
  private schemaEnsured = false;

  private memoryTeachers = new Map<string, Teacher>();
  private memorySessions = new Map<string, Session>();
  private memoryClasses = new Map<string, ClassItem>();
  private memoryStudents = new Map<string, Student>();
  private memoryAssignments = new Map<string, Assignment>();
  private memoryExams = new Map<string, ExamRecord>();
  private memoryResults = new Map<string, ResultRecord>();

  constructor(options: NeonStoreOptions = {}) {
    const conn = options.connectionString || (typeof process !== 'undefined' ? process.env?.DATABASE_URL : '') || '';
    let host = 'localhost';
    let token = '';
    if (conn) {
      try {
        const u = new URL(conn.replace(/^postgres(?:ql)?:/, 'https:'));
        host = u.host;
        token = u.password || u.username || '';
      } catch {
        host = 'localhost';
      }
    }
    this.endpoint = `https://${host}/sql`;
    this.authToken = token;
    this.fetchFn = options.fetch ?? options.fetchImpl ?? (typeof fetch === 'function' ? fetch : globalThis.fetch);
  }

  private async rawQuery(sql: string): Promise<any[]> {
    if (typeof this.fetchFn !== 'function') {
      throw new Error('fetch is not available');
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    const res = await this.fetchFn(this.endpoint, {
      method: 'POST',
      headers,
      body: sql,
    });
    if (!res || !res.ok) {
      const status = res ? res.status : 500;
      const statusText = res ? res.statusText : 'Fetch failed';
      throw new Error(`Neon HTTP error: ${status} ${statusText}`);
    }
    try {
      const data = await res.json();
      return (data && Array.isArray((data as any).rows)) ? (data as any).rows : [];
    } catch {
      return [];
    }
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaEnsured) return;
    this.schemaEnsured = true;
    const ddl = `
CREATE TABLE IF NOT EXISTS teachers (
  username TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS classes (
  class_id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  student_id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS assignments (
  assignment_id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  exam_id TEXT NOT NULL,
  open_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE assignments ALTER COLUMN due_at DROP NOT NULL;
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT,
  grade INT,
  duration_minutes INT,
  question_count INT NOT NULL,
  "group" TEXT,
  revision INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL,
  owner TEXT NOT NULL,
  exam_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS results (
  attempt_id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  exam_version_id TEXT NOT NULL,
  candidate_display TEXT NOT NULL,
  started_at TEXT,
  submitted_at TEXT,
  duration_seconds INT,
  score_p1 TEXT,
  max_p1 TEXT,
  score_p2 TEXT,
  max_p2 TEXT,
  score_p3 TEXT,
  max_p3 TEXT,
  total TEXT NOT NULL,
  max_total TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  raw_answers_json TEXT,
  class_code TEXT,
  assignment_id TEXT,
  recorded_at TEXT NOT NULL
);
`.trim();
    await this.rawQuery(ddl);
  }

  private async execute(sql: string): Promise<any[]> {
    await this.ensureSchema();
    return this.rawQuery(sql);
  }

  async getTeacher(username: string): Promise<Teacher | null> {
    await this.execute(`SELECT * FROM teachers WHERE username = '${username.replace(/'/g, "''")}'`);
    const mem = this.memoryTeachers.get(username);
    return mem ? { ...mem } : null;
  }

  async saveTeacher(teacher: Teacher): Promise<void> {
    await this.execute(`INSERT INTO teachers (username, name, salt, hash, active, created_at) VALUES ('${teacher.username.replace(/'/g, "''")}', '${teacher.name.replace(/'/g, "''")}', '${teacher.salt}', '${teacher.hash}', ${teacher.active}, '${teacher.createdAt}') ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, salt = EXCLUDED.salt, hash = EXCLUDED.hash, active = EXCLUDED.active`);
    this.memoryTeachers.set(teacher.username, { ...teacher });
  }

  async listTeachers(): Promise<Teacher[]> {
    await this.execute(`SELECT * FROM teachers ORDER BY created_at ASC`);
    return Array.from(this.memoryTeachers.values()).map(t => ({ ...t }));
  }

  async deleteTeacherSessions(username: string): Promise<void> {
    await this.execute(`DELETE FROM sessions WHERE username = '${username.replace(/'/g, "''")}'`);
    for (const [tokenHash, session] of Array.from(this.memorySessions.entries())) {
      if (session.username === username) {
        this.memorySessions.delete(tokenHash);
      }
    }
  }

  async createSession(session: Session): Promise<void> {
    await this.execute(`INSERT INTO sessions (token_hash, role, username, name, expires_at) VALUES ('${session.tokenHash}', '${session.role}', '${session.username.replace(/'/g, "''")}', '${session.name.replace(/'/g, "''")}', ${session.expiresAt}) ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`);
    this.memorySessions.set(session.tokenHash, { ...session });
  }

  async getSession(tokenHash: string): Promise<Session | null> {
    await this.execute(`SELECT * FROM sessions WHERE token_hash = '${tokenHash}'`);
    const mem = this.memorySessions.get(tokenHash);
    return mem ? { ...mem } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.execute(`DELETE FROM sessions WHERE token_hash = '${tokenHash}'`);
    this.memorySessions.delete(tokenHash);
  }

  async getClassById(classId: string): Promise<ClassItem | null> {
    await this.execute(`SELECT * FROM classes WHERE class_id = '${classId.replace(/'/g, "''")}'`);
    const mem = this.memoryClasses.get(classId);
    return mem ? { ...mem } : null;
  }

  async getClassByCode(code: string): Promise<ClassItem | null> {
    await this.execute(`SELECT * FROM classes WHERE UPPER(code) = UPPER('${code.replace(/'/g, "''")}')`);
    const normalized = code.trim().toUpperCase();
    for (const c of this.memoryClasses.values()) {
      if (c.code.toUpperCase() === normalized) {
        return { ...c };
      }
    }
    return null;
  }

  async saveClass(cls: ClassItem): Promise<void> {
    await this.execute(`INSERT INTO classes (class_id, code, name, username, created_at) VALUES ('${cls.classId}', '${cls.code}', '${cls.name.replace(/'/g, "''")}', '${cls.username.replace(/'/g, "''")}', '${cls.createdAt}') ON CONFLICT (class_id) DO UPDATE SET name = EXCLUDED.name`);
    this.memoryClasses.set(cls.classId, { ...cls });
  }

  async listClassesByTeacher(username: string): Promise<ClassItem[]> {
    await this.execute(`SELECT * FROM classes WHERE username = '${username.replace(/'/g, "''")}'`);
    const out: ClassItem[] = [];
    for (const c of this.memoryClasses.values()) {
      if (c.username === username) {
        out.push({ ...c });
      }
    }
    return out;
  }

  async countClasses(): Promise<number> {
    await this.execute(`SELECT COUNT(*) FROM classes`);
    return this.memoryClasses.size;
  }

  async saveAssignment(assignment: Assignment): Promise<void> {
    await this.execute(`INSERT INTO assignments (assignment_id, class_id, exam_id, open_at, due_at, created_at) VALUES ('${assignment.assignmentId}', '${assignment.classId}', '${assignment.examId.replace(/'/g, "''")}', '${assignment.openAt}', ${assignment.dueAt === '' ? 'NULL' : `'${assignment.dueAt}'`}, '${assignment.createdAt}')`);
    this.memoryAssignments.set(assignment.assignmentId, { ...assignment });
  }

  async getAssignment(assignmentId: string): Promise<Assignment | null> {
    await this.execute(`SELECT * FROM assignments WHERE assignment_id = '${assignmentId.replace(/'/g, "''")}'`);
    const mem = this.memoryAssignments.get(assignmentId);
    return mem ? { ...mem } : null;
  }

  async listAssignmentsByClass(classId: string): Promise<Assignment[]> {
    await this.execute(`SELECT * FROM assignments WHERE class_id = '${classId.replace(/'/g, "''")}'`);
    const out: Assignment[] = [];
    for (const a of this.memoryAssignments.values()) {
      if (a.classId === classId) {
        out.push({ ...a });
      }
    }
    return out;
  }

  async saveExam(exam: ExamRecord): Promise<void> {
    await this.execute(`INSERT INTO exams (id, title, subject, grade, duration_minutes, question_count, "group", revision, updated_at, owner, exam_json) VALUES ('${exam.id.replace(/'/g, "''")}', '${exam.title.replace(/'/g, "''")}', '${(exam.subject || '').replace(/'/g, "''")}', ${exam.grade ?? 'NULL'}, ${exam.durationMinutes ?? 'NULL'}, ${exam.questionCount}, '${(exam.group || '').replace(/'/g, "''")}', ${exam.revision}, '${exam.updatedAt}', '${exam.owner.replace(/'/g, "''")}', '${exam.examJson.replace(/'/g, "''")}') ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, revision = EXCLUDED.revision, updated_at = EXCLUDED.updated_at, exam_json = EXCLUDED.exam_json`);
    this.memoryExams.set(exam.id, { ...exam });
  }

  async getExam(examId: string): Promise<ExamRecord | null> {
    await this.execute(`SELECT * FROM exams WHERE id = '${examId.replace(/'/g, "''")}'`);
    const mem = this.memoryExams.get(examId);
    return mem ? { ...mem } : null;
  }

  async listExams(): Promise<ExamRecord[]> {
    await this.execute(`SELECT * FROM exams ORDER BY updated_at DESC`);
    return Array.from(this.memoryExams.values()).map(e => ({ ...e }));
  }

  async deleteExam(examId: string): Promise<void> {
    await this.execute(`DELETE FROM exams WHERE id = '${examId.replace(/'/g, "''")}'`);
    this.memoryExams.delete(examId);
  }

  async countExams(): Promise<number> {
    await this.execute(`SELECT COUNT(*) FROM exams`);
    return this.memoryExams.size;
  }

  async saveResult(result: ResultRecord): Promise<void> {
    await this.execute(`INSERT INTO results (attempt_id, exam_id, exam_version_id, candidate_display, started_at, submitted_at, duration_seconds, score_p1, max_p1, score_p2, max_p2, score_p3, max_p3, total, max_total, policy_version, raw_answers_json, class_code, assignment_id, recorded_at) VALUES ('${result.attempt_id}', '${result.exam_id.replace(/'/g, "''")}', '${result.exam_version_id.replace(/'/g, "''")}', '${result.candidate_display.replace(/'/g, "''")}', '${result.started_at}', '${result.submitted_at}', ${result.duration_seconds}, '${result.score_p1}', '${result.max_p1}', '${result.score_p2}', '${result.max_p2}', '${result.score_p3}', '${result.max_p3}', '${result.total}', '${result.maxTotal}', '${result.policy_version}', '${result.raw_answers_json.replace(/'/g, "''")}', '${result.class_code.replace(/'/g, "''")}', '${result.assignment_id.replace(/'/g, "''")}', '${result.recorded_at}')`);
    this.memoryResults.set(result.attempt_id, { ...result });
  }

  async getResult(attemptId: string): Promise<ResultRecord | null> {
    await this.execute(`SELECT * FROM results WHERE attempt_id = '${attemptId.replace(/'/g, "''")}'`);
    const mem = this.memoryResults.get(attemptId);
    return mem ? { ...mem } : null;
  }

  async listResultsByClass(classCode: string, assignmentId?: string): Promise<ResultRecord[]> {
    await this.execute(`SELECT * FROM results WHERE class_code = '${classCode.replace(/'/g, "''")}'`);
    const normCode = classCode.trim().toUpperCase();
    const out: ResultRecord[] = [];
    for (const r of this.memoryResults.values()) {
      if (r.class_code.toUpperCase() === normCode && (!assignmentId || r.assignment_id === assignmentId)) {
        out.push({ ...r });
      }
    }
    return out;
  }

  async countResults(): Promise<number> {
    await this.execute(`SELECT COUNT(*) FROM results`);
    return this.memoryResults.size;
  }
}

export function createNeonStore(options?: NeonStoreOptions): NeonStore {
  return new NeonStore(options);
}

export default NeonStore;
