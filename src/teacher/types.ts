import type {
  WebExam,
  WebQuestion,
  WebOption,
  WebStatement,
  ExamSettings,
  Section,
  ReleasePolicy,
  Taxonomy,
  Block,
  Cell,
  Asset,
  Provenance,
  QuestionContent,
  WebError,
  Result,
  AttemptKey,
  AttemptRecord,
  OutboxRecord,
} from "../schema/types.ts";
import type { StoragePort } from "../storage/types.ts";

export type {
  WebExam,
  WebQuestion,
  WebOption,
  WebStatement,
  ExamSettings,
  Section,
  ReleasePolicy,
  Taxonomy,
  Block,
  Cell,
  Asset,
  Provenance,
  QuestionContent,
  WebError,
  Result,
  StoragePort,
  AttemptKey,
  AttemptRecord,
  OutboxRecord,
};

export interface ExamDraft {
  readonly draftId: string;
  readonly revision: number;
  readonly exam: WebExam;
}

export type DraftAction =
  | { readonly action: "set_title"; readonly title: string }
  | { readonly action: "set_subject"; readonly subject: string }
  | { readonly action: "set_grade"; readonly grade: 10 | 11 | 12 }
  | { readonly action: "set_settings"; readonly settings: Partial<ExamSettings> }
  | { readonly action: "toggle_section"; readonly section: Section; readonly enabled: boolean }
  | { readonly action: "add_question"; readonly question: WebQuestion }
  | { readonly action: "remove_question"; readonly questionVersionId: string }
  | { readonly action: "update_question"; readonly questionVersionId: string; readonly patch: Partial<WebQuestion> }
  | { readonly action: "reorder_questions"; readonly fromIndex: number; readonly toIndex: number }
  | { readonly action: "reorder_questions_by_id"; readonly order: readonly string[] }
  | { readonly action: "duplicate_question"; readonly questionVersionId: string; readonly idGenerator?: () => string };

export type DraftPatch =
  | DraftAction
  | {
      readonly title?: string;
      readonly subject?: string;
      readonly grade?: 10 | 11 | 12;
      readonly settings?: Partial<ExamSettings>;
      readonly questions?: readonly WebQuestion[];
      readonly assets?: readonly Asset[];
    };
