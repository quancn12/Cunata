import { ZERO, ONE, add } from "./rational.js";
import { checkShortAnswer } from "./shortAnswer.js";
import { validateExamVersion, validateAttemptResponses } from "./validate.js";
import { judgeI, judgeII, judgeIII } from "./judge.js";
import { POINT_I, PART2_POINTS, computeExamMax } from "./examMax.js";
export const ENGINE_VERSION = "m1-1.0.0";
export class ScoringInputError extends Error {
    issues;
    constructor(issues) {
        super(`Scoring validation failed with ${issues.length} issue(s)`);
        this.name = "ScoringInputError";
        this.issues = Object.freeze([...issues]);
    }
}
export function scoreAttempt(exam, attempt) {
    const examValidation = validateExamVersion(exam);
    if (!examValidation.ok) {
        throw new ScoringInputError(examValidation.issues);
    }
    const examVersion = examValidation.value;
    const attemptValidation = validateAttemptResponses(examVersion, attempt);
    if (!attemptValidation.ok) {
        throw new ScoringInputError(attemptValidation.issues);
    }
    const attemptResponses = attemptValidation.value;
    let n1 = 0;
    let n2 = 0;
    let n3 = 0;
    for (const q of examVersion.questions) {
        if (q.kind === "I")
            n1++;
        else if (q.kind === "II")
            n2++;
        else if (q.kind === "III")
            n3++;
    }
    const examMax = computeExamMax({ n1, n2, n3 });
    const responseMap = new Map();
    for (const r of attemptResponses.responses) {
        responseMap.set(r.questionVersionId, r);
    }
    const questionResults = [];
    let scoreI = ZERO;
    let scoreII = ZERO;
    let scoreIII = ZERO;
    for (const q of examVersion.questions) {
        const resp = responseMap.get(q.questionVersionId);
        if (q.kind === "I") {
            const r = resp;
            const j = judgeI(q, r);
            let status;
            let points;
            if (j === "correct") {
                status = "full";
                points = POINT_I;
            }
            else if (j === "wrong") {
                status = "wrong";
                points = ZERO;
            }
            else if (j === "unanswered") {
                status = "unanswered";
                points = ZERO;
            }
            else {
                status = "invalid";
                points = ZERO;
            }
            scoreI = add(scoreI, points);
            questionResults.push(Object.freeze({
                questionVersionId: q.questionVersionId,
                kind: "I",
                status,
                points,
                maxPoints: POINT_I,
            }));
        }
        else if (q.kind === "II") {
            const r = resp;
            const j = judgeII(q, r);
            const k = j.correctCount;
            const points = PART2_POINTS[k] ?? ZERO;
            let status;
            if (k === 4) {
                status = "full";
            }
            else if (k >= 1 && k <= 3) {
                status = "partial";
            }
            else {
                const anyAnswered = j.perStatement.some((s) => s.state !== "unanswered");
                status = anyAnswered ? "wrong" : "unanswered";
            }
            scoreII = add(scoreII, points);
            questionResults.push(Object.freeze({
                questionVersionId: q.questionVersionId,
                kind: "II",
                status,
                points,
                maxPoints: ONE,
                correctCount: k,
            }));
        }
        else {
            const r = resp;
            let status;
            let points;
            let inputIssues = undefined;
            if (r === undefined || r.raw === null || r.raw === "") {
                status = "unanswered";
                points = ZERO;
            }
            else {
                const issues = checkShortAnswer(r.raw);
                if (issues.length > 0) {
                    status = "invalid";
                    points = ZERO;
                    inputIssues = Object.freeze([...issues]);
                }
                else {
                    const j = judgeIII(q, r);
                    if (j === "correct") {
                        status = "full";
                        points = examMax.pointIII;
                    }
                    else {
                        status = "wrong";
                        points = ZERO;
                    }
                }
            }
            scoreIII = add(scoreIII, points);
            const qRes = {
                questionVersionId: q.questionVersionId,
                kind: "III",
                status,
                points,
                maxPoints: examMax.pointIII,
                ...(inputIssues !== undefined ? { inputIssues } : {}),
            };
            questionResults.push(Object.freeze(qRes));
        }
    }
    const sectionI = Object.freeze({
        questionCount: n1,
        score: scoreI,
        max: examMax.maxI,
    });
    const sectionII = Object.freeze({
        questionCount: n2,
        score: scoreII,
        max: examMax.maxII,
    });
    const sectionIII = Object.freeze({
        questionCount: n3,
        score: scoreIII,
        max: examMax.maxIII,
    });
    const total = add(add(scoreI, scoreII), scoreIII);
    return Object.freeze({
        attemptId: attemptResponses.attemptId,
        examVersionId: examVersion.examVersionId,
        ruleSetId: "custom-v1",
        inputPolicyId: "sa-charset-v1",
        engineVersion: ENGINE_VERSION,
        sections: Object.freeze({
            I: sectionI,
            II: sectionII,
            III: sectionIII,
        }),
        total,
        maxTotal: examMax.maxTotal,
        questions: Object.freeze(questionResults),
    });
}
