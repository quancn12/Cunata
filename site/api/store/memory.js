export class MemoryStore {
    teachers = new Map();
    sessions = new Map();
    classes = new Map();
    students = new Map();
    assignments = new Map();
    exams = new Map();
    results = new Map();
    async getTeacher(username) {
        const t = this.teachers.get(username);
        return t ? { ...t } : null;
    }
    async saveTeacher(teacher) {
        this.teachers.set(teacher.username, { ...teacher });
    }
    async listTeachers() {
        return Array.from(this.teachers.values()).map(t => ({ ...t }));
    }
    async deleteTeacherSessions(username) {
        for (const [tokenHash, session] of Array.from(this.sessions.entries())) {
            if (session.username === username) {
                this.sessions.delete(tokenHash);
            }
        }
    }
    async createSession(session) {
        this.sessions.set(session.tokenHash, { ...session });
    }
    async getSession(tokenHash) {
        const s = this.sessions.get(tokenHash);
        return s ? { ...s } : null;
    }
    async deleteSession(tokenHash) {
        this.sessions.delete(tokenHash);
    }
    async getClassById(classId) {
        const c = this.classes.get(classId);
        return c ? { ...c } : null;
    }
    async getClassByCode(code) {
        const normalized = code.trim().toUpperCase();
        for (const c of this.classes.values()) {
            if (c.code.toUpperCase() === normalized) {
                return { ...c };
            }
        }
        return null;
    }
    async saveClass(cls) {
        this.classes.set(cls.classId, { ...cls });
    }
    async listClassesByTeacher(username) {
        const out = [];
        for (const c of this.classes.values()) {
            if (c.username === username) {
                out.push({ ...c });
            }
        }
        return out;
    }
    async countClasses() {
        return this.classes.size;
    }
    async saveAssignment(assignment) {
        this.assignments.set(assignment.assignmentId, { ...assignment });
    }
    async getAssignment(assignmentId) {
        const a = this.assignments.get(assignmentId);
        return a ? { ...a } : null;
    }
    async listAssignmentsByClass(classId) {
        const out = [];
        for (const a of this.assignments.values()) {
            if (a.classId === classId) {
                out.push({ ...a });
            }
        }
        return out;
    }
    async saveExam(exam) {
        this.exams.set(exam.id, { ...exam });
    }
    async getExam(examId) {
        const e = this.exams.get(examId);
        return e ? { ...e } : null;
    }
    async listExams() {
        return Array.from(this.exams.values()).map(e => ({ ...e }));
    }
    async deleteExam(examId) {
        this.exams.delete(examId);
    }
    async countExams() {
        return this.exams.size;
    }
    async saveResult(result) {
        this.results.set(result.attempt_id, { ...result });
    }
    async getResult(attemptId) {
        const r = this.results.get(attemptId);
        return r ? { ...r } : null;
    }
    async listResultsByClass(classCode, assignmentId) {
        const normCode = classCode.trim().toUpperCase();
        const out = [];
        for (const r of this.results.values()) {
            if (r.class_code.toUpperCase() === normCode && (!assignmentId || r.assignment_id === assignmentId)) {
                out.push({ ...r });
            }
        }
        return out;
    }
    async countResults() {
        return this.results.size;
    }
}
export function createMemoryStore() {
    return new MemoryStore();
}
export default MemoryStore;
