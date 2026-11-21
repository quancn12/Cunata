const teacherColumns = 'username, name, salt, hash, active, created_at AS "createdAt", auth_gen AS "authGen"';
const sessionColumns = 'token_hash AS "tokenHash", role, username, name, expires_at AS "expiresAt", auth_gen AS "authGen"';
const classColumns = 'class_id AS "classId", code, name, username, created_at AS "createdAt"';
const assignmentColumns = 'assignment_id AS "assignmentId", class_id AS "classId", exam_id AS "examId", open_at AS "openAt", due_at AS "dueAt", created_at AS "createdAt"';
const examColumns = 'id, title, subject, grade, duration_minutes AS "durationMinutes", question_count AS "questionCount", "group", revision, updated_at AS "updatedAt", owner, exam_json AS "examJson"';
export class NeonStore {
    endpoint;
    connectionString;
    fetchFn;
    schemaEnsured = false;
    constructor(options = {}) {
        const conn = options.connectionString || (typeof process !== 'undefined' ? process.env?.DATABASE_URL : '') || '';
        if (!conn)
            throw new Error('DATABASE_URL is not configured');
        let host;
        try {
            host = new URL(conn).host;
        }
        catch {
            throw new Error('Invalid DATABASE_URL');
        }
        this.endpoint = `https://${host}/sql`;
        this.connectionString = conn;
        this.fetchFn = options.fetch ?? options.fetchImpl ?? globalThis.fetch;
    }
    async rawQuery(query, params = []) {
        const res = await this.fetchFn(this.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Neon-Connection-String': this.connectionString,
            },
            body: JSON.stringify({ query, params }),
        }).catch(() => { throw new Error('Neon request failed'); });
        if (!res.ok)
            throw new Error(`Neon HTTP error: ${res.status}`);
        const data = await res.json().catch(() => { throw new Error('Invalid Neon response'); });
        if (!Array.isArray(data?.rows))
            throw new Error('Invalid Neon response');
        return data.rows;
    }
    async ensureSchema() {
        if (this.schemaEnsured)
            return;
        const ddl = `
CREATE TABLE IF NOT EXISTS teachers (
  username TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  auth_gen INT NOT NULL DEFAULT 1
);
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS auth_gen INT NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  auth_gen INT NOT NULL DEFAULT 1
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS auth_gen INT NOT NULL DEFAULT 1;
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
        for (const statement of ddl.split(';').filter(s => s.trim())) {
            await this.rawQuery(statement);
        }
        this.schemaEnsured = true;
    }
    async execute(query, params = []) {
        await this.ensureSchema();
        return this.rawQuery(query, params);
    }
    async getTeacher(username) {
        const rows = await this.execute(`SELECT ${teacherColumns} FROM teachers WHERE username = $1`, [username]);
        return rows[0] ? { ...rows[0], authGen: Number(rows[0].authGen ?? 1) } : null;
    }
    async saveTeacher(teacher) {
        const authGen = teacher.authGen ?? 1;
        await this.execute(`INSERT INTO teachers (username, name, salt, hash, active, created_at, auth_gen) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, salt = EXCLUDED.salt, hash = EXCLUDED.hash, active = EXCLUDED.active, auth_gen = EXCLUDED.auth_gen`, [teacher.username, teacher.name, teacher.salt, teacher.hash, teacher.active, teacher.createdAt, authGen]);
    }
    async listTeachers() {
        const rows = await this.execute(`SELECT ${teacherColumns} FROM teachers ORDER BY created_at ASC`);
        return rows.map(r => ({ ...r, authGen: Number(r.authGen ?? 1) }));
    }
    async deleteTeacherSessions(username) {
        await this.execute('DELETE FROM sessions WHERE username = $1', [username]);
    }
    async createSession(session) {
        const authGen = session.authGen ?? 1;
        await this.execute(`INSERT INTO sessions (token_hash, role, username, name, expires_at, auth_gen) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at, auth_gen = EXCLUDED.auth_gen`, [session.tokenHash, session.role, session.username, session.name, session.expiresAt, authGen]);
    }
    async getSession(tokenHash) {
        const rows = await this.execute(`SELECT ${sessionColumns} FROM sessions WHERE token_hash = $1`, [tokenHash]);
        return rows[0] ? { ...rows[0], expiresAt: Number(rows[0].expiresAt), authGen: Number(rows[0].authGen ?? 1) } : null;
    }
    async deleteSession(tokenHash) {
        await this.execute('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    }
    async getClassById(classId) {
        const rows = await this.execute(`SELECT ${classColumns} FROM classes WHERE class_id = $1`, [classId]);
        return rows[0] ?? null;
    }
    async getClassByCode(code) {
        const rows = await this.execute(`SELECT ${classColumns} FROM classes WHERE UPPER(code) = UPPER($1)`, [code.trim()]);
        return rows[0] ?? null;
    }
    async saveClass(cls) {
        await this.execute(`INSERT INTO classes (class_id, code, name, username, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (class_id) DO UPDATE SET name = EXCLUDED.name`, [cls.classId, cls.code, cls.name, cls.username, cls.createdAt]);
    }
    async listClassesByTeacher(username) {
        return this.execute(`SELECT ${classColumns} FROM classes WHERE username = $1`, [username]);
    }
    async countClasses() {
        const rows = await this.execute('SELECT COUNT(*) FROM classes');
        return Number(rows[0]?.count ?? 0);
    }
    async saveAssignment(assignment) {
        await this.execute(`INSERT INTO assignments (assignment_id, class_id, exam_id, open_at, due_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [assignment.assignmentId, assignment.classId, assignment.examId, assignment.openAt, assignment.dueAt === '' ? null : assignment.dueAt, assignment.createdAt]);
    }
    async getAssignment(assignmentId) {
        const rows = await this.execute(`SELECT ${assignmentColumns} FROM assignments WHERE assignment_id = $1`, [assignmentId]);
        return rows[0] ? { ...rows[0], dueAt: rows[0].dueAt ?? '' } : null;
    }
    async listAssignmentsByClass(classId) {
        const rows = await this.execute(`SELECT ${assignmentColumns} FROM assignments WHERE class_id = $1`, [classId]);
        return rows.map(row => ({ ...row, dueAt: row.dueAt ?? '' }));
    }
    async saveExam(exam) {
        const rows = await this.execute(`INSERT INTO exams (id, title, subject, grade, duration_minutes, question_count, "group", revision, updated_at, owner, exam_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, subject = EXCLUDED.subject, grade = EXCLUDED.grade, duration_minutes = EXCLUDED.duration_minutes, question_count = EXCLUDED.question_count, "group" = EXCLUDED."group", revision = exams.revision + 1, updated_at = EXCLUDED.updated_at, exam_json = EXCLUDED.exam_json WHERE exams.owner = EXCLUDED.owner RETURNING revision, owner`, [exam.id, exam.title, exam.subject, exam.grade, exam.durationMinutes, exam.questionCount, exam.group, exam.revision || 1, exam.updatedAt, exam.owner, exam.examJson]);
        if (!rows || rows.length === 0) {
            const cur = await this.getExam(exam.id);
            if (cur && cur.owner !== exam.owner) {
                return { ok: false, revision: 0, error: 'FORBIDDEN' };
            }
            return { ok: true, revision: cur ? cur.revision : (exam.revision || 1) };
        }
        return { ok: true, revision: Number(rows[0].revision) };
    }
    async getExam(examId) {
        const rows = await this.execute(`SELECT ${examColumns} FROM exams WHERE id = $1`, [examId]);
        return rows[0] ?? null;
    }
    async listExams() {
        return this.execute(`SELECT ${examColumns} FROM exams ORDER BY updated_at DESC`);
    }
    async deleteExam(examId) {
        await this.execute('DELETE FROM exams WHERE id = $1', [examId]);
    }
    async countExams() {
        const rows = await this.execute('SELECT COUNT(*) FROM exams');
        return Number(rows[0]?.count ?? 0);
    }
    async saveResult(result) {
        const rows = await this.execute(`INSERT INTO results (attempt_id, exam_id, exam_version_id, candidate_display, started_at, submitted_at, duration_seconds, score_p1, max_p1, score_p2, max_p2, score_p3, max_p3, total, max_total, policy_version, raw_answers_json, class_code, assignment_id, recorded_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) ON CONFLICT (attempt_id) DO NOTHING RETURNING *, max_total AS "maxTotal"`, [result.attempt_id, result.exam_id, result.exam_version_id, result.candidate_display, result.started_at, result.submitted_at, result.duration_seconds, result.score_p1, result.max_p1, result.score_p2, result.max_p2, result.score_p3, result.max_p3, result.total, result.maxTotal, result.policy_version, result.raw_answers_json, result.class_code, result.assignment_id, result.recorded_at]);
        if (rows && rows.length > 0) {
            return { inserted: true, record: rows[0] };
        }
        const existing = await this.getResult(result.attempt_id);
        return { inserted: false, record: existing || result };
    }
    async getResult(attemptId) {
        const rows = await this.execute('SELECT *, max_total AS "maxTotal" FROM results WHERE attempt_id = $1', [attemptId]);
        return rows[0] ?? null;
    }
    async listResultsByClass(classCode, assignmentId) {
        return this.execute(`SELECT *, max_total AS "maxTotal" FROM results WHERE UPPER(class_code) = UPPER($1)${assignmentId ? ' AND assignment_id = $2' : ''}`, assignmentId ? [classCode.trim(), assignmentId] : [classCode.trim()]);
    }
    async countResults() {
        const rows = await this.execute('SELECT COUNT(*) FROM results');
        return Number(rows[0]?.count ?? 0);
    }
}
export function createNeonStore(options) {
    return new NeonStore(options);
}
export default NeonStore;
