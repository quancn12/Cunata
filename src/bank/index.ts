import type {
  BankEntry,
  BankFilter,
  Taxonomy,
  Section,
  WebQuestion,
  WebOption,
  WebStatement,
  ExamDraft,
  StoragePort,
  Result,
  WebError,
  Block,
  Cell,
} from './types.ts';
import {
  checkShortAnswer,
  MAX_QUESTIONS_PER_EXAM,
} from '../domain/index.ts';

export type {
  BankEntry,
  BankFilter,
  Taxonomy,
  Section,
  WebQuestion,
  WebOption,
  WebStatement,
  ExamDraft,
  StoragePort,
  Result,
  WebError,
} from './types.ts';

function deepClone<T>(val: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(val);
  }
  return JSON.parse(JSON.stringify(val)) as T;
}

function extractTextFromBlocks(blocks?: readonly Block[]): string {
  if (!blocks || !Array.isArray(blocks)) return '';
  const parts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    } else if (block.type === 'math' && typeof block.source === 'string') {
      parts.push(block.source);
    } else if (block.type === 'image' && typeof block.alt === 'string') {
      parts.push(block.alt);
    } else if (block.type === 'table' && Array.isArray(block.rows)) {
      for (const row of block.rows) {
        if (!Array.isArray(row)) continue;
        for (const cell of row as readonly Cell[]) {
          if (cell && Array.isArray(cell.blocks)) {
            parts.push(extractTextFromBlocks(cell.blocks));
          }
        }
      }
    }
  }
  return parts.join(' ');
}

export function validateBankEntry(entry: unknown): Result<BankEntry> {
  if (!entry || typeof entry !== 'object') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'entry', message: 'BankEntry phải là đối tượng hợp lệ', recoverable: true },
    };
  }

  const raw = entry as Record<string, unknown>;

  if (typeof raw.questionId !== 'string' || raw.questionId.trim() === '') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'questionId', message: 'questionId không được rỗng', recoverable: true },
    };
  }

  if (typeof raw.questionVersionId !== 'string' || raw.questionVersionId.trim() === '') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'questionVersionId', message: 'questionVersionId không được rỗng', recoverable: true },
    };
  }

  if (typeof raw.revision !== 'number' || !Number.isInteger(raw.revision) || raw.revision < 0) {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'revision', message: 'revision phải là số nguyên >= 0', recoverable: true },
    };
  }

  if (!raw.taxonomy || typeof raw.taxonomy !== 'object') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'taxonomy', message: 'taxonomy phải là đối tượng hợp lệ', recoverable: true },
    };
  }

  const tax = raw.taxonomy as Record<string, unknown>;
  if (typeof tax.subject !== 'string' || tax.subject.trim() === '') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'taxonomy.subject', message: 'subject không được rỗng', recoverable: true },
    };
  }

  if (tax.grade !== 10 && tax.grade !== 11 && tax.grade !== 12) {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'taxonomy.grade', message: 'grade phải là 10, 11 hoặc 12', recoverable: true },
    };
  }

  if (typeof tax.topic !== 'string' || tax.topic.trim() === '') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'taxonomy.topic', message: 'topic không được rỗng', recoverable: true },
    };
  }

  if (typeof tax.lesson !== 'string' || tax.lesson.trim() === '') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'taxonomy.lesson', message: 'lesson không được rỗng', recoverable: true },
    };
  }

  const diff = tax.difficulty;
  if (diff !== 'Nhận biết' && diff !== 'Thông hiểu' && diff !== 'Vận dụng') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'taxonomy.difficulty', message: 'difficulty phải là Nhận biết, Thông hiểu hoặc Vận dụng', recoverable: true },
    };
  }

  if (!raw.question || typeof raw.question !== 'object') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'question', message: 'question phải là đối tượng hợp lệ', recoverable: true },
    };
  }

  const q = raw.question as Record<string, unknown>;

  if (q.questionVersionId !== raw.questionVersionId) {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'question.questionVersionId', message: 'questionVersionId trong question và entry phải khớp nhau', recoverable: true },
    };
  }

  if (q.kind !== 'I' && q.kind !== 'II' && q.kind !== 'III') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'question.kind', message: 'kind phải là I, II hoặc III', recoverable: true },
    };
  }

  if (q.kind === 'I') {
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      return {
        ok: false,
        error: { code: 'BANK_ENTRY_INVALID', path: 'question.options', message: 'Câu hỏi phần I phải có đúng 4 lựa chọn', recoverable: true },
      };
    }
    const optionIds = new Set<string>();
    for (let i = 0; i < q.options.length; i++) {
      const opt = q.options[i];
      if (!opt || typeof opt !== 'object' || typeof opt.optionId !== 'string' || opt.optionId.trim() === '') {
        return {
          ok: false,
          error: { code: 'BANK_ENTRY_INVALID', path: `question.options[${i}].optionId`, message: 'optionId không được rỗng', recoverable: true },
        };
      }
      if (typeof (opt as { text?: unknown }).text !== 'string') {
        return {
          ok: false,
          error: { code: 'BANK_ENTRY_INVALID', path: `question.options[${i}].text`, message: 'text trong option phải là chuỗi', recoverable: true },
        };
      }
      if (optionIds.has(opt.optionId)) {
        return {
          ok: false,
          error: { code: 'BANK_ENTRY_INVALID', path: `question.options[${i}].optionId`, message: `optionId trùng lặp: ${opt.optionId}`, recoverable: true },
        };
      }
      optionIds.add(opt.optionId);
    }
    if (typeof q.correctOptionId !== 'string' || !optionIds.has(q.correctOptionId)) {
      return {
        ok: false,
        error: { code: 'BANK_ENTRY_INVALID', path: 'question.correctOptionId', message: 'correctOptionId phải thuộc danh sách options', recoverable: true },
      };
    }
  } else if (q.kind === 'II') {
    if (!Array.isArray(q.statements) || q.statements.length !== 4) {
      return {
        ok: false,
        error: { code: 'BANK_ENTRY_INVALID', path: 'question.statements', message: 'Câu hỏi phần II phải có đúng 4 ý', recoverable: true },
      };
    }
    const statementIds = new Set<string>();
    for (let i = 0; i < q.statements.length; i++) {
      const st = q.statements[i];
      if (!st || typeof st !== 'object' || typeof st.statementId !== 'string' || st.statementId.trim() === '') {
        return {
          ok: false,
          error: { code: 'BANK_ENTRY_INVALID', path: `question.statements[${i}].statementId`, message: 'statementId không được rỗng', recoverable: true },
        };
      }
      if (typeof (st as { text?: unknown }).text !== 'string') {
        return {
          ok: false,
          error: { code: 'BANK_ENTRY_INVALID', path: `question.statements[${i}].text`, message: 'text trong statement phải là chuỗi', recoverable: true },
        };
      }
      if (statementIds.has(st.statementId)) {
        return {
          ok: false,
          error: { code: 'BANK_ENTRY_INVALID', path: `question.statements[${i}].statementId`, message: `statementId trùng lặp: ${st.statementId}`, recoverable: true },
        };
      }
      statementIds.add(st.statementId);
      if (typeof st.answer !== 'boolean') {
        return {
          ok: false,
          error: { code: 'BANK_ENTRY_INVALID', path: `question.statements[${i}].answer`, message: 'answer phải là boolean (true/false)', recoverable: true },
        };
      }
    }
  } else if (q.kind === 'III') {
    if (typeof q.answerKey !== 'string' || q.answerKey.trim() === '') {
      return {
        ok: false,
        error: { code: 'BANK_ENTRY_INVALID', path: 'question.answerKey', message: 'answerKey phải là chuỗi không rỗng', recoverable: true },
      };
    }
    const issues = checkShortAnswer(q.answerKey);
    if (issues.length > 0) {
      return {
        ok: false,
        error: { code: 'BANK_ENTRY_INVALID', path: 'question.answerKey', message: `answerKey không hợp lệ: ${issues.join('; ')}`, recoverable: true },
      };
    }
  }

  return { ok: true, value: entry as BankEntry };
}

export function queryBank(
  entries: readonly BankEntry[],
  filter: Partial<Taxonomy> & { text?: string; kind?: Section },
): readonly BankEntry[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    return Object.freeze([]);
  }

  const results: BankEntry[] = [];
  const textQuery = filter.text ? filter.text.trim().toLowerCase() : '';

  for (const entry of entries) {
    if (!entry || !entry.taxonomy || !entry.question) continue;

    // Filter by subject
    if (filter.subject !== undefined && filter.subject.trim() !== '' && filter.subject.toLowerCase() !== 'all') {
      if (entry.taxonomy.subject.trim().toLowerCase() !== filter.subject.trim().toLowerCase()) {
        continue;
      }
    }

    // Filter by grade
    if (filter.grade !== undefined && String(filter.grade).trim() !== '' && String(filter.grade).toLowerCase() !== 'all') {
      const gNum = Number(filter.grade);
      if (entry.taxonomy.grade !== gNum) {
        continue;
      }
    }

    // Filter by topic
    if (filter.topic !== undefined && filter.topic.trim() !== '' && filter.topic.toLowerCase() !== 'all') {
      if (entry.taxonomy.topic.trim().toLowerCase() !== filter.topic.trim().toLowerCase()) {
        continue;
      }
    }

    // Filter by lesson
    if (filter.lesson !== undefined && filter.lesson.trim() !== '' && filter.lesson.toLowerCase() !== 'all') {
      if (entry.taxonomy.lesson.trim().toLowerCase() !== filter.lesson.trim().toLowerCase()) {
        continue;
      }
    }

    // Filter by difficulty
    if (filter.difficulty !== undefined && filter.difficulty.trim() !== '' && (filter.difficulty as string).toLowerCase() !== 'all') {
      if (entry.taxonomy.difficulty !== filter.difficulty) {
        continue;
      }
    }

    // Filter by kind
    if (filter.kind !== undefined && filter.kind.trim() !== '' && (filter.kind as string).toLowerCase() !== 'all') {
      if (entry.question.kind !== filter.kind) {
        continue;
      }
    }

    // Filter by text search
    if (textQuery !== '') {
      let matched = false;

      // Check IDs and metadata
      if (entry.questionId.toLowerCase().includes(textQuery)) matched = true;
      else if (entry.questionVersionId.toLowerCase().includes(textQuery)) matched = true;
      else if (entry.question.title && entry.question.title.toLowerCase().includes(textQuery)) matched = true;
      else if (entry.question.content && entry.question.content.toLowerCase().includes(textQuery)) matched = true;
      else if (entry.question.explanation && entry.question.explanation.toLowerCase().includes(textQuery)) matched = true;
      else if (entry.taxonomy.subject.toLowerCase().includes(textQuery)) matched = true;
      else if (entry.taxonomy.topic.toLowerCase().includes(textQuery)) matched = true;
      else if (entry.taxonomy.lesson.toLowerCase().includes(textQuery)) matched = true;

      // Check blocks
      if (!matched && entry.question.blocks) {
        const blockText = extractTextFromBlocks(entry.question.blocks).toLowerCase();
        if (blockText.includes(textQuery)) matched = true;
      }

      // Check kind-specific details
      if (!matched) {
        if (entry.question.kind === 'I' && Array.isArray(entry.question.options)) {
          for (const opt of entry.question.options) {
            if (opt.text.toLowerCase().includes(textQuery) || (opt.label && opt.label.toLowerCase().includes(textQuery))) {
              matched = true;
              break;
            }
          }
        } else if (entry.question.kind === 'II' && Array.isArray(entry.question.statements)) {
          for (const st of entry.question.statements) {
            if (
              st.text.toLowerCase().includes(textQuery) ||
              (st.label && st.label.toLowerCase().includes(textQuery)) ||
              (st.explanation && st.explanation.toLowerCase().includes(textQuery))
            ) {
              matched = true;
              break;
            }
          }
        } else if (entry.question.kind === 'III') {
          if (entry.question.answerKey.toLowerCase().includes(textQuery)) {
            matched = true;
          }
        }
      }

      if (!matched) continue;
    }

    results.push(entry);
  }

  return Object.freeze(results);
}

export async function saveBankEntry(
  entry: BankEntry,
  expectedRevision: number | null,
  storage: StoragePort,
): Promise<Result<BankEntry>> {
  const validationRes = validateBankEntry(entry);
  if (!validationRes.ok) {
    return validationRes;
  }

  if (expectedRevision !== null) {
    if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_CONFLICT',
          path: 'expectedRevision',
          message: 'expectedRevision phải là null hoặc số nguyên không âm',
          recoverable: true,
        },
      };
    }
  }

  if (!storage || typeof storage.putObject !== 'function') {
    return {
      ok: false,
      error: {
        code: 'STORAGE_UNAVAILABLE',
        path: 'storage',
        message: 'StoragePort không khả dụng',
        recoverable: false,
      },
    };
  }

  const nextRev = expectedRevision === null ? 1 : expectedRevision + 1;
  const toStore: BankEntry = {
    ...deepClone(entry),
    revision: nextRev,
  };

  const putRes = await storage.putObject('bank', entry.questionVersionId, toStore, expectedRevision);
  if (!putRes.ok) {
    return putRes;
  }

  const saved: BankEntry = {
    ...toStore,
    revision: putRes.value,
  };

  return { ok: true, value: Object.freeze(saved) };
}

export function addToDraft(
  draft: ExamDraft,
  entry: BankEntry,
  id: () => string,
): Result<ExamDraft> {
  if (!draft || typeof draft !== 'object' || !draft.exam || !Array.isArray(draft.exam.questions)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_DRAFT',
        path: 'draft',
        message: 'ExamDraft không hợp lệ',
        recoverable: true,
      },
    };
  }

  const validationRes = validateBankEntry(entry);
  if (!validationRes.ok) {
    return validationRes;
  }

  if (typeof id !== 'function') {
    return {
      ok: false,
      error: {
        code: 'INVALID_ID_GENERATOR',
        path: 'id',
        message: 'id generator function không hợp lệ',
        recoverable: false,
      },
    };
  }

  if (draft.exam.questions.length >= MAX_QUESTIONS_PER_EXAM) {
    return {
      ok: false,
      error: {
        code: 'PAYLOAD_LIMIT',
        path: 'draft.exam.questions',
        message: `Số lượng câu hỏi vượt quá giới hạn tối đa (${MAX_QUESTIONS_PER_EXAM})`,
        recoverable: true,
      },
    };
  }

  const existingQVersionIds = new Set<string>();
  const existingOptionIds = new Set<string>();
  const existingStatementIds = new Set<string>();

  for (const q of draft.exam.questions) {
    if (!q) continue;
    if (typeof q.questionVersionId === 'string') {
      existingQVersionIds.add(q.questionVersionId);
    }
    if (q.kind === 'I' && Array.isArray(q.options)) {
      for (const opt of q.options) {
        if (opt && typeof opt.optionId === 'string') {
          existingOptionIds.add(opt.optionId);
        }
      }
    } else if (q.kind === 'II' && Array.isArray(q.statements)) {
      for (const st of q.statements) {
        if (st && typeof st.statementId === 'string') {
          existingStatementIds.add(st.statementId);
        }
      }
    }
  }

  const isDuplicateQ = existingQVersionIds.has(entry.question.questionVersionId);

  let hasDuplicateOption = false;
  if (entry.question.kind === 'I' && Array.isArray(entry.question.options)) {
    hasDuplicateOption = entry.question.options.some(opt => existingOptionIds.has(opt.optionId));
  }

  let hasDuplicateStatement = false;
  if (entry.question.kind === 'II' && Array.isArray(entry.question.statements)) {
    hasDuplicateStatement = entry.question.statements.some(st => existingStatementIds.has(st.statementId));
  }

  const needsRemap = isDuplicateQ || hasDuplicateOption || hasDuplicateStatement;

  let finalQ: WebQuestion;

  if (!needsRemap) {
    // Preserve immutable question and version identity exactly
    if (entry.question.kind === 'I') {
      const cloned = deepClone(entry.question);
      finalQ = {
        ...cloned,
        subject: entry.taxonomy.subject,
        grade: entry.taxonomy.grade,
        topic: entry.taxonomy.topic,
        lesson: entry.taxonomy.lesson,
        difficulty: entry.taxonomy.difficulty,
        questionId: entry.questionId,
      };
    } else if (entry.question.kind === 'II') {
      const cloned = deepClone(entry.question);
      finalQ = {
        ...cloned,
        subject: entry.taxonomy.subject,
        grade: entry.taxonomy.grade,
        topic: entry.taxonomy.topic,
        lesson: entry.taxonomy.lesson,
        difficulty: entry.taxonomy.difficulty,
        questionId: entry.questionId,
      };
    } else {
      const cloned = deepClone(entry.question);
      finalQ = {
        ...cloned,
        subject: entry.taxonomy.subject,
        grade: entry.taxonomy.grade,
        topic: entry.taxonomy.topic,
        lesson: entry.taxonomy.lesson,
        difficulty: entry.taxonomy.difficulty,
        questionId: entry.questionId,
      };
    }
  } else {
    // Remap version identity and duplicate option/statement IDs consistently
    const newVersionId = isDuplicateQ ? id() : entry.question.questionVersionId;

    if (entry.question.kind === 'I') {
      const oldOptions = entry.question.options;
      const oldCorrectOptionId = entry.question.correctOptionId;

      const correctIdx = oldOptions.findIndex(
        opt => Object.hasOwn(opt, 'optionId') && opt.optionId === oldCorrectOptionId,
      );

      const remappedOptions: WebOption[] = oldOptions.map((opt) => ({
        ...deepClone(opt),
        optionId: id(),
      }));

      const newCorrectOptionId = correctIdx >= 0 && remappedOptions[correctIdx]
        ? remappedOptions[correctIdx]!.optionId
        : (remappedOptions[0]?.optionId ?? '');

      const clonedBase = deepClone(entry.question);
      finalQ = {
        ...clonedBase,
        questionVersionId: newVersionId,
        options: remappedOptions,
        correctOptionId: newCorrectOptionId,
        subject: entry.taxonomy.subject,
        grade: entry.taxonomy.grade,
        topic: entry.taxonomy.topic,
        lesson: entry.taxonomy.lesson,
        difficulty: entry.taxonomy.difficulty,
        questionId: entry.questionId,
      };
    } else if (entry.question.kind === 'II') {
      const oldStatements = entry.question.statements;
      const remappedStatements: WebStatement[] = oldStatements.map((st) => ({
        ...deepClone(st),
        statementId: id(),
      }));

      const clonedBase = deepClone(entry.question);
      finalQ = {
        ...clonedBase,
        questionVersionId: newVersionId,
        statements: remappedStatements,
        subject: entry.taxonomy.subject,
        grade: entry.taxonomy.grade,
        topic: entry.taxonomy.topic,
        lesson: entry.taxonomy.lesson,
        difficulty: entry.taxonomy.difficulty,
        questionId: entry.questionId,
      };
    } else {
      // Kind III
      const clonedBase = deepClone(entry.question);
      finalQ = {
        ...clonedBase,
        questionVersionId: newVersionId,
        subject: entry.taxonomy.subject,
        grade: entry.taxonomy.grade,
        topic: entry.taxonomy.topic,
        lesson: entry.taxonomy.lesson,
        difficulty: entry.taxonomy.difficulty,
        questionId: entry.questionId,
      };
    }
  }

  const updatedDraft: ExamDraft = {
    ...draft,
    revision: draft.revision + 1,
    exam: {
      ...draft.exam,
      questions: Object.freeze([...draft.exam.questions, Object.freeze(finalQ)]),
    },
  };

  return { ok: true, value: Object.freeze(updatedDraft) };
}

export function createNewVersion(
  entry: BankEntry,
  newVersionId: string,
  patch?: Partial<WebQuestion>,
): Result<BankEntry> {
  if (!newVersionId || typeof newVersionId !== 'string' || newVersionId.trim() === '') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'newVersionId', message: 'newVersionId không được rỗng', recoverable: true },
    };
  }

  const baseRes = validateBankEntry(entry);
  if (!baseRes.ok) return baseRes;

  let patchedQuestion: WebQuestion;
  if (entry.question.kind === 'I') {
    const base = deepClone(entry.question);
    const p = patch ? deepClone(patch) : {};
    patchedQuestion = {
      ...base,
      ...p,
      kind: 'I',
      questionVersionId: newVersionId,
      questionId: entry.questionId,
    } as WebQuestion;
  } else if (entry.question.kind === 'II') {
    const base = deepClone(entry.question);
    const p = patch ? deepClone(patch) : {};
    patchedQuestion = {
      ...base,
      ...p,
      kind: 'II',
      questionVersionId: newVersionId,
      questionId: entry.questionId,
    } as WebQuestion;
  } else {
    const base = deepClone(entry.question);
    const p = patch ? deepClone(patch) : {};
    patchedQuestion = {
      ...base,
      ...p,
      kind: 'III',
      questionVersionId: newVersionId,
      questionId: entry.questionId,
    } as WebQuestion;
  }

  const candidate: BankEntry = {
    questionId: entry.questionId,
    questionVersionId: newVersionId,
    revision: 0,
    taxonomy: deepClone(entry.taxonomy),
    question: patchedQuestion,
  };

  return validateBankEntry(candidate);
}

export async function deleteBankEntry(
  questionVersionId: string,
  expectedRevision: number,
  storage: StoragePort,
): Promise<Result<void>> {
  if (!questionVersionId || typeof questionVersionId !== 'string' || questionVersionId.trim() === '') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'questionVersionId', message: 'questionVersionId không được rỗng', recoverable: true },
    };
  }
  if (!storage || typeof storage.deleteObject !== 'function') {
    return {
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE', path: 'storage', message: 'StoragePort không khả dụng', recoverable: false },
    };
  }
  return storage.deleteObject('bank', questionVersionId, expectedRevision);
}

export async function loadBankEntry(
  questionVersionId: string,
  storage: StoragePort,
): Promise<Result<BankEntry | null>> {
  if (!questionVersionId || typeof questionVersionId !== 'string' || questionVersionId.trim() === '') {
    return {
      ok: false,
      error: { code: 'BANK_ENTRY_INVALID', path: 'questionVersionId', message: 'questionVersionId không được rỗng', recoverable: true },
    };
  }
  if (!storage || typeof storage.getObject !== 'function') {
    return {
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE', path: 'storage', message: 'StoragePort không khả dụng', recoverable: false },
    };
  }
  const res = await storage.getObject('bank', questionVersionId);
  if (!res.ok) return res;
  if (res.value === null) return { ok: true, value: null };
  const validated = validateBankEntry(res.value);
  if (!validated.ok) return validated;
  return { ok: true, value: Object.freeze(validated.value) };
}
