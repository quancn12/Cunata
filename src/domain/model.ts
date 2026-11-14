export type Id = string; // ổn định, không rỗng

export interface ChoiceOption { readonly optionId: Id }
export interface QuestionI {
  readonly kind: "I"; readonly questionVersionId: Id;
  readonly options: readonly ChoiceOption[];        // đúng 4, optionId không trùng
  readonly correctOptionId: Id;                     // phải thuộc options
}
export interface StatementII { readonly statementId: Id; readonly answer: boolean }
export interface QuestionII {
  readonly kind: "II"; readonly questionVersionId: Id;
  readonly statements: readonly StatementII[];      // đúng 4, statementId không trùng
}
export interface QuestionIII {
  readonly kind: "III"; readonly questionVersionId: Id;
  readonly answerKey: string;                       // 1..4 ký tự, chỉ gồm 0-9, '-', ','
}
export type Question = QuestionI | QuestionII | QuestionIII;

export interface ExamVersion {
  readonly examId: Id; readonly examVersionId: Id;
  readonly ruleSetId: "custom-v1";
  readonly inputPolicyId: "sa-charset-v1";
  readonly questions: readonly Question[];          // thứ tự gốc; phần suy ra từ kind
}

export interface ResponseI { readonly kind: "I"; readonly questionVersionId: Id; readonly selectedOptionId: Id | null }
export interface StatementAnswer { readonly statementId: Id; readonly value: boolean | null }
export interface ResponseII { readonly kind: "II"; readonly questionVersionId: Id; readonly answers: readonly StatementAnswer[] }
export interface ResponseIII { readonly kind: "III"; readonly questionVersionId: Id; readonly raw: string | null }
export type Response = ResponseI | ResponseII | ResponseIII;

export interface AttemptResponses {
  readonly attemptId: Id; readonly examVersionId: Id;
  readonly responses: readonly Response[];          // câu không có response = chưa làm
}

export interface ValidationIssue { readonly code: string; readonly path: string; readonly message: string }
