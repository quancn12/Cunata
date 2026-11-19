export class NeonStore {
    endpoint;
    authToken;
    fetchFn;
    schemaEnsured = false;
    memoryTeachers = new Map();
    memorySessions = new Map();
    memoryClasses = new Map();
    memoryStudents = new Map();
    memoryAssignments = new Map();
    memoryExams = new Map();
    memoryResults = new Map();
    constructor(options = {}) {
        const conn = options.connectionString || (typeof process !== 'undefined' ? process.env?.DATABASE_URL : '') || '';
        let host = 'localhost';
        let token = '';
        if (conn) {
            try {
                const u = new URL(conn.replace(/^postgres(?:ql)?:/, 'https:'));
                host = u.host;
                token = u.password || u.username || '';
            }
            catch {
                host = 'localhost';
            }
        }
        this.endpoint = `https://${host}/sql`;
        this.authToken = token;
        this.fetchFn = options.fetch ?? options.fetchImpl ?? (typeof fetch === 'function' ? fetch : globalThis.fetch);
    }
    async rawQuery(sql) {
        if (typeof this.fetchFn !== 'function') {
            throw new Error('fetch is not available');
        }
        const headers = {
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
            return (data && Array.isArray(data.rows)) ? data.rows : [];
        }
        catch {
            return [];
        }
    }
    async ensureSchema() {
        if (this.schemaEnsured)
            return;
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
  due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
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
    async execute(sql) {
        await this.ensureSchema();
        return this.rawQuery(sql);
    }
    async getTeacher(username) {
        await this.execute(`SELECT * FROM teachers WHERE username = '${username.replace(/'/g, "''")}'`);
        const mem = this.memoryTeachers.get(username);
        return mem ? { ...mem } : null;
    }
    async saveTeacher(teacher) {
        await this.execute(`INSERT INTO teachers (username, name, salt, hash, active, created_at) VALUES ('${teacher.username.replace(/'/g, "''")}', '${teacher.name.replace(/'/g, "''")}', '${teacher.salt}', '${teacher.hash}', ${teacher.active}, '${teacher.createdAt}') ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, salt = EXCLUDED.salt, hash = EXCLUDED.hash, active = EXCLUDED.active`);
        this.memoryTeachers.set(teacher.username, { ...teacher });
    }
    async listTeachers() {
        await this.execute(`SELECT * FROM teachers ORDER BY created_at ASC`);
        return Array.from(this.memoryTeachers.values()).map(t => ({ ...t }));
    }
    async deleteTeacherSessions(username) {
        await this.execute(`DELETE FROM sessions WHERE username = '${username.replace(/'/g, "''")}'`);
        for (const [tokenHash, session] of Array.from(this.memorySessions.entries())) {
            if (session.username === username) {
                this.memorySessions.delete(tokenHash);
            }
        }
    }
    async createSession(session) {
        await this.execute(`INSERT INTO sessions (token_hash, role, username, name, expires_at) VALUES ('${session.tokenHash}', '${session.role}', '${session.username.replace(/'/g, "''")}', '${session.name.replace(/'/g, "''")}', ${session.expiresAt}) ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`);
        this.memorySessions.set(session.tokenHash, { ...session });
    }
    async getSession(tokenHash) {
        await this.execute(`SELECT * FROM sessions WHERE token_hash = '${tokenHash}'`);
        const mem = this.memorySessions.get(tokenHash);
        return mem ? { ...mem } : null;
    }
    async deleteSession(tokenHash) {
        await this.execute(`DELETE FROM sessions WHERE token_hash = '${tokenHash}'`);
        this.memorySessions.delete(tokenHash);
    }
    async getClassById(classId) {
        await this.execute(`SELECT * FROM classes WHERE class_id = '${classId.replace(/'/g, "''")}'`);
        const mem = this.memoryClasses.get(classId);
        return mem ? { ...mem } : null;
    }
    async getClassByCode(code) {
        await this.execute(`SELECT * FROM classes WHERE UPPER(code) = UPPER('${code.replace(/'/g, "''")}')`);
        const normalized = code.trim().toUpperCase();
        for (const c of this.memoryClasses.values()) {
            if (c.code.toUpperCase() === normalized) {
                return { ...c };
            }
        }
        return null;
    }
    async saveClass(cls) {
        await this.execute(`INSERT INTO classes (class_id, code, name, username, created_at) VALUES ('${cls.classId}', '${cls.code}', '${cls.name.replace(/'/g, "''")}', '${cls.username.replace(/'/g, "''")}', '${cls.createdAt}') ON CONFLICT (class_id) DO UPDATE SET name = EXCLUDED.name`);
        this.memoryClasses.set(cls.classId, { ...cls });
    }
    async listClassesByTeacher(username) {
        await this.execute(`SELECT * FROM classes WHERE username = '${username.replace(/'/g, "''")}'`);
        const out = [];
        for (const c of this.memoryClasses.values()) {
            if (c.username === username) {
                out.push({ ...c });
            }
        }
        return out;
    }
    async countClasses() {
        await this.execute(`SELECT COUNT(*) FROM classes`);
        return this.memoryClasses.size;
    }
    async saveAssignment(assignment) {
        await this.execute(`INSERT INTO assignments (assignment_id, class_id, exam_id, open_at, due_at, created_at) VALUES ('${assignment.assignmentId}', '${assignment.classId}', '${assignment.examId.replace(/'/g, "''")}', '${assignment.openAt}', '${assignment.dueAt}', '${assignment.createdAt}')`);
        this.memoryAssignments.set(assignment.assignmentId, { ...assignment });
    }
    async getAssignment(assignmentId) {
        await this.execute(`SELECT * FROM assignments WHERE assignment_id = '${assignmentId.replace(/'/g, "''")}'`);
        const mem = this.memoryAssignments.get(assignmentId);
        return mem ? { ...mem } : null;
    }
    async listAssignmentsByClass(classId) {
        await this.execute(`SELECT * FROM assignments WHERE class_id = '${classId.replace(/'/g, "''")}'`);
        const out = [];
        for (const a of this.memoryAssignments.values()) {
            if (a.classId === classId) {
                out.push({ ...a });
            }
        }
        return out;
    }
    async saveExam(exam) {
        await this.execute(`INSERT INTO exams (id, title, subject, grade, duration_minutes, question_count, "group", revision, updated_at, owner, exam_json) VALUES ('${exam.id.replace(/'/g, "''")}', '${exam.title.replace(/'/g, "''")}', '${(exam.subject || '').replace(/'/g, "''")}', ${exam.grade ?? 'NULL'}, ${exam.durationMinutes ?? 'NULL'}, ${exam.questionCount}, '${(exam.group || '').replace(/'/g, "''")}', ${exam.revision}, '${exam.updatedAt}', '${exam.owner.replace(/'/g, "''")}', '${exam.examJson.replace(/'/g, "''")}') ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, revision = EXCLUDED.revision, updated_at = EXCLUDED.updated_at, exam_json = EXCLUDED.exam_json`);
        this.memoryExams.set(exam.id, { ...exam });
    }
    async getExam(examId) {
        await this.execute(`SELECT * FROM exams WHERE id = '${examId.replace(/'/g, "''")}'`);
        const mem = this.memoryExams.get(examId);
        return mem ? { ...mem } : null;
    }
    async listExams() {
        await this.execute(`SELECT * FROM exams ORDER BY updated_at DESC`);
        return Array.from(this.memoryExams.values()).map(e => ({ ...e }));
    }
    async deleteExam(examId) {
        await this.execute(`DELETE FROM exams WHERE id = '${examId.replace(/'/g, "''")}'`);
        this.memoryExams.delete(examId);
    }
    async countExams() {
        await this.execute(`SELECT COUNT(*) FROM exams`);
        return this.memoryExams.size;
    }
    async saveResult(result) {
        await this.execute(`INSERT INTO results (attempt_id, exam_id, exam_version_id, candidate_display, started_at, submitted_at, duration_seconds, score_p1, max_p1, score_p2, max_p2, score_p3, max_p3, total, max_total, policy_version, raw_answers_json, class_code, assignment_id, recorded_at) VALUES ('${result.attempt_id}', '${result.exam_id.replace(/'/g, "''")}', '${result.exam_version_id.replace(/'/g, "''")}', '${result.candidate_display.replace(/'/g, "''")}', '${result.started_at}', '${result.submitted_at}', ${result.duration_seconds}, '${result.score_p1}', '${result.max_p1}', '${result.score_p2}', '${result.max_p2}', '${result.score_p3}', '${result.max_p3}', '${result.total}', '${result.maxTotal}', '${result.policy_version}', '${result.raw_answers_json.replace(/'/g, "''")}', '${result.class_code.replace(/'/g, "''")}', '${result.assignment_id.replace(/'/g, "''")}', '${result.recorded_at}')`);
        this.memoryResults.set(result.attempt_id, { ...result });
    }
    async getResult(attemptId) {
        await this.execute(`SELECT * FROM results WHERE attempt_id = '${attemptId.replace(/'/g, "''")}'`);
        const mem = this.memoryResults.get(attemptId);
        return mem ? { ...mem } : null;
    }
    async listResultsByClass(classCode, assignmentId) {
        await this.execute(`SELECT * FROM results WHERE class_code = '${classCode.replace(/'/g, "''")}'`);
        const normCode = classCode.trim().toUpperCase();
        const out = [];
        for (const r of this.memoryResults.values()) {
            if (r.class_code.toUpperCase() === normCode && (!assignmentId || r.assignment_id === assignmentId)) {
                out.push({ ...r });
            }
        }
        return out;
    }
    async countResults() {
        await this.execute(`SELECT COUNT(*) FROM results`);
        return this.memoryResults.size;
    }
}
export function createNeonStore(options) {
    return new NeonStore(options);
}
export default NeonStore;
