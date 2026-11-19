import type { Teacher, Session, ClassItem, Student, Assignment, ExamRecord, ResultRecord, Store } from '../types.ts';

export class MemoryStore implements Store {
  teachers = new Map<string, Teacher>();
  sessions = new Map<string, Session>();
  classes = new Map<string, ClassItem>();
  students = new Map<string, Student>();
  assignments = new Map<string, Assignment>();
  exams = new Map<string, ExamRecord>();
  results = new Map<string, ResultRecord>();

  async getTeacher(username: string): Promise<Teacher | null> {
    const t = this.teachers.get(username);
    return t ? { ...t } : null;
  }

  async saveTeacher(teacher: Teacher): Promise<void> {
    this.teachers.set(teacher.username, { ...teacher });
  }

  async listTeachers(): Promise<Teacher[]> {
    return Array.from(this.teachers.values()).map(t => ({ ...t }));
  }

  async deleteTeacherSessions(username: string): Promise<void> {
    for (const [tokenHash, session] of Array.from(this.sessions.entries())) {
      if (session.username === username) {
        this.sessions.delete(tokenHash);
      }
    }
  }

  async createSession(session: Session): Promise<void> {
    this.sessions.set(session.tokenHash, { ...session });
  }

  async getSession(tokenHash: string): Promise<Session | null> {
    const s = this.sessions.get(tokenHash);
    return s ? { ...s } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async getClassById(classId: string): Promise<ClassItem | null> {
    const c = this.classes.get(classId);
    return c ? { ...c } : null;
  }

  async getClassByCode(code: string): Promise<ClassItem | null> {
    const normalized = code.trim().toUpperCase();
    for (const c of this.classes.values()) {
      if (c.code.toUpperCase() === normalized) {
        return { ...c };
      }
    }
    return null;
  }

  async saveClass(cls: ClassItem): Promise<void> {
    this.classes.set(cls.classId, { ...cls });
  }

  async listClassesByTeacher(username: string): Promise<ClassItem[]> {
    const out: ClassItem[] = [];
    for (const c of this.classes.values()) {
      if (c.username === username) {
        out.push({ ...c });
      }
    }
    return out;
  }

  async countClasses(): Promise<number> {
    return this.classes.size;
  }

  async saveAssignment(assignment: Assignment): Promise<void> {
    this.assignments.set(assignment.assignmentId, { ...assignment });
  }

  async getAssignment(assignmentId: string): Promise<Assignment | null> {
    const a = this.assignments.get(assignmentId);
    return a ? { ...a } : null;
  }

  async listAssignmentsByClass(classId: string): Promise<Assignment[]> {
    const out: Assignment[] = [];
    for (const a of this.assignments.values()) {
      if (a.classId === classId) {
        out.push({ ...a });
      }
    }
    return out;
  }

  async saveExam(exam: ExamRecord): Promise<void> {
    this.exams.set(exam.id, { ...exam });
  }

  async getExam(examId: string): Promise<ExamRecord | null> {
    const e = this.exams.get(examId);
    return e ? { ...e } : null;
  }

  async listExams(): Promise<ExamRecord[]> {
    return Array.from(this.exams.values()).map(e => ({ ...e }));
  }

  async deleteExam(examId: string): Promise<void> {
    this.exams.delete(examId);
  }

  async countExams(): Promise<number> {
    return this.exams.size;
  }

  async saveResult(result: ResultRecord): Promise<void> {
    this.results.set(result.attempt_id, { ...result });
  }

  async getResult(attemptId: string): Promise<ResultRecord | null> {
    const r = this.results.get(attemptId);
    return r ? { ...r } : null;
  }

  async listResultsByClass(classCode: string, assignmentId?: string): Promise<ResultRecord[]> {
    const normCode = classCode.trim().toUpperCase();
    const out: ResultRecord[] = [];
    for (const r of this.results.values()) {
      if (r.class_code.toUpperCase() === normCode && (!assignmentId || r.assignment_id === assignmentId)) {
        out.push({ ...r });
      }
    }
    return out;
  }

  async countResults(): Promise<number> {
    return this.results.size;
  }
}

export function createMemoryStore(): MemoryStore {
  return new MemoryStore();
}

export default MemoryStore;
