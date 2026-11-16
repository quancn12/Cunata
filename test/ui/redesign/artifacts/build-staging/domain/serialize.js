import { ZERO, ONE, add, compare, equals, toFractionString, parseFractionString, } from "./rational.js";
import { POINT_I, PART2_POINTS, computeExamMax } from "./examMax.js";
function parseFrac(val, fieldName) {
    if (typeof val === "number") {
        throw new SyntaxError(`${fieldName} must be a fraction string, not a JSON number`);
    }
    if (typeof val !== "string") {
        throw new SyntaxError(`${fieldName} must be a fraction string, got ${typeof val}`);
    }
    return parseFractionString(val);
}
export function scoreResultToDTO(r) {
    if (r === null || typeof r !== "object") {
        throw new TypeError("scoreResultToDTO expects a ScoreResult object");
    }
    return {
        attemptId: r.attemptId,
        examVersionId: r.examVersionId,
        ruleSetId: r.ruleSetId,
        inputPolicyId: r.inputPolicyId,
        engineVersion: r.engineVersion,
        sections: {
            I: {
                questionCount: r.sections.I.questionCount,
                score: toFractionString(r.sections.I.score),
                max: toFractionString(r.sections.I.max),
            },
            II: {
                questionCount: r.sections.II.questionCount,
                score: toFractionString(r.sections.II.score),
                max: toFractionString(r.sections.II.max),
            },
            III: {
                questionCount: r.sections.III.questionCount,
                score: toFractionString(r.sections.III.score),
                max: toFractionString(r.sections.III.max),
            },
        },
        total: toFractionString(r.total),
        maxTotal: toFractionString(r.maxTotal),
        questions: r.questions.map((q) => {
            const qDto = {
                questionVersionId: q.questionVersionId,
                kind: q.kind,
                status: q.status,
                points: toFractionString(q.points),
                maxPoints: toFractionString(q.maxPoints),
            };
            if (q.correctCount !== undefined) {
                qDto.correctCount = q.correctCount;
            }
            if (q.inputIssues !== undefined) {
                qDto.inputIssues = [...q.inputIssues];
            }
            return qDto;
        }),
    };
}
const VALID_STATUSES = new Set(["full", "partial", "wrong", "unanswered", "invalid"]);
const VALID_SHORT_ANSWER_ISSUES = new Set(["empty", "too_long", "bad_char"]);
export function scoreResultFromDTO(dto) {
    try {
        if (dto === null || typeof dto !== "object" || Array.isArray(dto)) {
            throw new SyntaxError("ScoreResult DTO must be an object");
        }
        const rec = dto;
        if (typeof rec.attemptId !== "string" || rec.attemptId === "") {
            throw new SyntaxError("attemptId must be a non-empty string");
        }
        if (typeof rec.examVersionId !== "string" || rec.examVersionId === "") {
            throw new SyntaxError("examVersionId must be a non-empty string");
        }
        if (rec.ruleSetId !== "custom-v1") {
            throw new SyntaxError('ruleSetId must be "custom-v1"');
        }
        if (rec.inputPolicyId !== "sa-charset-v1") {
            throw new SyntaxError('inputPolicyId must be "sa-charset-v1"');
        }
        if (typeof rec.engineVersion !== "string" || rec.engineVersion === "") {
            throw new SyntaxError("engineVersion must be a non-empty string");
        }
        const total = parseFrac(rec.total, "total");
        const maxTotal = parseFrac(rec.maxTotal, "maxTotal");
        if (rec.sections === null || typeof rec.sections !== "object" || Array.isArray(rec.sections)) {
            throw new SyntaxError("sections must be an object");
        }
        const secRec = rec.sections;
        const parseSection = (key) => {
            const s = secRec[key];
            if (s === null || typeof s !== "object" || Array.isArray(s)) {
                throw new SyntaxError(`sections.${key} must be an object`);
            }
            const sObj = s;
            if (typeof sObj.questionCount !== "number" ||
                !Number.isSafeInteger(sObj.questionCount) ||
                sObj.questionCount < 0) {
                throw new SyntaxError(`sections.${key}.questionCount must be a safe integer >= 0`);
            }
            const score = parseFrac(sObj.score, `sections.${key}.score`);
            const max = parseFrac(sObj.max, `sections.${key}.max`);
            return Object.freeze({
                questionCount: sObj.questionCount,
                score,
                max,
            });
        };
        const sectionI = parseSection("I");
        const sectionII = parseSection("II");
        const sectionIII = parseSection("III");
        // Verify total and maxTotal consistency with section sums
        const sumSectionScores = add(add(sectionI.score, sectionII.score), sectionIII.score);
        if (!equals(total, sumSectionScores)) {
            throw new SyntaxError("total does not match sum of section scores");
        }
        const sumSectionMaxes = add(add(sectionI.max, sectionII.max), sectionIII.max);
        if (!equals(maxTotal, sumSectionMaxes)) {
            throw new SyntaxError("maxTotal does not match sum of section maximums");
        }
        if (!Array.isArray(rec.questions)) {
            throw new SyntaxError("questions must be an array");
        }
        const seenQuestionIds = new Set();
        let sumPointsI = ZERO;
        let sumPointsII = ZERO;
        let sumPointsIII = ZERO;
        let sumMaxI = ZERO;
        let sumMaxII = ZERO;
        let sumMaxIII = ZERO;
        let countI = 0;
        let countII = 0;
        let countIII = 0;
        let expectedPointIII = null;
        const questions = rec.questions.map((q, idx) => {
            if (q === null || typeof q !== "object" || Array.isArray(q)) {
                throw new SyntaxError(`questions[${idx}] must be an object`);
            }
            const qObj = q;
            if (typeof qObj.questionVersionId !== "string" || qObj.questionVersionId === "") {
                throw new SyntaxError(`questions[${idx}].questionVersionId must be a non-empty string`);
            }
            if (seenQuestionIds.has(qObj.questionVersionId)) {
                throw new SyntaxError(`questions[${idx}].questionVersionId "${qObj.questionVersionId}" is duplicated`);
            }
            seenQuestionIds.add(qObj.questionVersionId);
            if (qObj.kind !== "I" && qObj.kind !== "II" && qObj.kind !== "III") {
                throw new SyntaxError(`questions[${idx}].kind must be "I", "II", or "III"`);
            }
            if (typeof qObj.status !== "string" || !VALID_STATUSES.has(qObj.status)) {
                throw new SyntaxError(`questions[${idx}].status is invalid`);
            }
            const points = parseFrac(qObj.points, `questions[${idx}].points`);
            const maxPoints = parseFrac(qObj.maxPoints, `questions[${idx}].maxPoints`);
            if (compare(points, ZERO) < 0) {
                throw new SyntaxError(`questions[${idx}].points must be non-negative`);
            }
            if (compare(points, maxPoints) > 0) {
                throw new SyntaxError(`questions[${idx}].points exceeds maxPoints`);
            }
            // Status and points general consistency
            if (qObj.status === "full" && !equals(points, maxPoints)) {
                throw new SyntaxError(`questions[${idx}] has status "full" but points (${toFractionString(points)}) does not match maxPoints (${toFractionString(maxPoints)})`);
            }
            if ((qObj.status === "wrong" || qObj.status === "unanswered" || qObj.status === "invalid") &&
                !equals(points, ZERO)) {
                throw new SyntaxError(`questions[${idx}] has status "${qObj.status}" but points (${toFractionString(points)}) is not 0`);
            }
            if (qObj.status === "partial" &&
                (compare(points, ZERO) <= 0 || compare(points, maxPoints) >= 0)) {
                throw new SyntaxError(`questions[${idx}] has status "partial" but points (${toFractionString(points)}) is not strictly between 0 and maxPoints (${toFractionString(maxPoints)})`);
            }
            const result = {
                questionVersionId: qObj.questionVersionId,
                kind: qObj.kind,
                status: qObj.status,
                points,
                maxPoints,
            };
            if (qObj.kind === "I") {
                countI++;
                sumPointsI = add(sumPointsI, points);
                sumMaxI = add(sumMaxI, maxPoints);
                if (qObj.status === "partial") {
                    throw new SyntaxError(`questions[${idx}] Part I cannot have status "partial"`);
                }
                if (qObj.status !== "full" && qObj.status !== "wrong" && qObj.status !== "unanswered" && qObj.status !== "invalid") {
                    throw new SyntaxError(`questions[${idx}] Part I has invalid status "${qObj.status}"`);
                }
                if (!equals(maxPoints, POINT_I)) {
                    throw new SyntaxError(`questions[${idx}].maxPoints must be 1/4 for Part I`);
                }
                if (qObj.status === "full" && !equals(points, POINT_I)) {
                    throw new SyntaxError(`questions[${idx}] Part I with status "full" must have points 1/4`);
                }
                if (qObj.status !== "full" && !equals(points, ZERO)) {
                    throw new SyntaxError(`questions[${idx}] Part I with status "${qObj.status}" must have points 0`);
                }
                if (qObj.correctCount !== undefined) {
                    throw new SyntaxError(`questions[${idx}].correctCount is not allowed for Part I`);
                }
                if (qObj.inputIssues !== undefined) {
                    throw new SyntaxError(`questions[${idx}].inputIssues is not allowed for Part I`);
                }
            }
            else if (qObj.kind === "II") {
                countII++;
                sumPointsII = add(sumPointsII, points);
                sumMaxII = add(sumMaxII, maxPoints);
                if (qObj.status === "invalid") {
                    throw new SyntaxError(`questions[${idx}] Part II cannot have status "invalid"`);
                }
                if (!equals(maxPoints, ONE)) {
                    throw new SyntaxError(`questions[${idx}].maxPoints must be 1 for Part II`);
                }
                if (typeof qObj.correctCount !== "number" ||
                    !Number.isInteger(qObj.correctCount) ||
                    qObj.correctCount < 0 ||
                    qObj.correctCount > 4) {
                    throw new SyntaxError(`questions[${idx}].correctCount must be an integer between 0 and 4`);
                }
                const expectedPoints = PART2_POINTS[qObj.correctCount] ?? ZERO;
                if (!equals(points, expectedPoints)) {
                    throw new SyntaxError(`questions[${idx}].points does not match correctCount ${qObj.correctCount}`);
                }
                if (qObj.correctCount === 4) {
                    if (qObj.status !== "full") {
                        throw new SyntaxError(`questions[${idx}] has correctCount 4 but status is "${qObj.status}" instead of "full"`);
                    }
                }
                else if (qObj.correctCount >= 1 && qObj.correctCount <= 3) {
                    if (qObj.status !== "partial") {
                        throw new SyntaxError(`questions[${idx}] has correctCount ${qObj.correctCount} but status is "${qObj.status}" instead of "partial"`);
                    }
                }
                else {
                    // correctCount === 0
                    if (qObj.status !== "wrong" && qObj.status !== "unanswered") {
                        throw new SyntaxError(`questions[${idx}] has correctCount 0 but status is "${qObj.status}" instead of "wrong" or "unanswered"`);
                    }
                }
                result.correctCount = qObj.correctCount;
                if (qObj.inputIssues !== undefined) {
                    throw new SyntaxError(`questions[${idx}].inputIssues is not allowed for Part II`);
                }
            }
            else {
                // Kind === "III"
                countIII++;
                sumPointsIII = add(sumPointsIII, points);
                sumMaxIII = add(sumMaxIII, maxPoints);
                if (qObj.status === "partial") {
                    throw new SyntaxError(`questions[${idx}] Part III cannot have status "partial"`);
                }
                if (qObj.status !== "full" && qObj.status !== "wrong" && qObj.status !== "unanswered" && qObj.status !== "invalid") {
                    throw new SyntaxError(`questions[${idx}] Part III has invalid status "${qObj.status}"`);
                }
                if (expectedPointIII === null) {
                    expectedPointIII = maxPoints;
                }
                else if (!equals(maxPoints, expectedPointIII)) {
                    throw new SyntaxError(`questions[${idx}].maxPoints is inconsistent across Part III questions`);
                }
                if (qObj.status === "full" && !equals(points, maxPoints)) {
                    throw new SyntaxError(`questions[${idx}] Part III with status "full" must have points (${toFractionString(points)}) equal to maxPoints (${toFractionString(maxPoints)})`);
                }
                if (qObj.status !== "full" && !equals(points, ZERO)) {
                    throw new SyntaxError(`questions[${idx}] Part III with status "${qObj.status}" must have points 0`);
                }
                if (qObj.correctCount !== undefined) {
                    throw new SyntaxError(`questions[${idx}].correctCount is not allowed for Part III`);
                }
                if (qObj.status === "invalid") {
                    if (!Array.isArray(qObj.inputIssues) || qObj.inputIssues.length === 0) {
                        throw new SyntaxError(`questions[${idx}].inputIssues must be a non-empty array when status is "invalid"`);
                    }
                    for (const issue of qObj.inputIssues) {
                        if (typeof issue !== "string" || !VALID_SHORT_ANSWER_ISSUES.has(issue)) {
                            throw new SyntaxError(`questions[${idx}].inputIssues contains invalid issue "${String(issue)}"`);
                        }
                    }
                    result.inputIssues = Object.freeze([
                        ...qObj.inputIssues,
                    ]);
                }
                else {
                    if (qObj.inputIssues !== undefined) {
                        throw new SyntaxError(`questions[${idx}].inputIssues is not allowed when status is "${qObj.status}"`);
                    }
                }
            }
            return Object.freeze(result);
        });
        // Verify section counts and sums match questions
        if (sectionI.questionCount !== countI) {
            throw new SyntaxError(`section I questionCount (${sectionI.questionCount}) does not match questions count (${countI})`);
        }
        if (!equals(sectionI.score, sumPointsI)) {
            throw new SyntaxError("section I score does not match sum of question points");
        }
        if (!equals(sectionI.max, sumMaxI)) {
            throw new SyntaxError("section I max does not match sum of question maxPoints");
        }
        if (sectionII.questionCount !== countII) {
            throw new SyntaxError(`section II questionCount (${sectionII.questionCount}) does not match questions count (${countII})`);
        }
        if (!equals(sectionII.score, sumPointsII)) {
            throw new SyntaxError("section II score does not match sum of question points");
        }
        if (!equals(sectionII.max, sumMaxII)) {
            throw new SyntaxError("section II max does not match sum of question maxPoints");
        }
        if (sectionIII.questionCount !== countIII) {
            throw new SyntaxError(`section III questionCount (${sectionIII.questionCount}) does not match questions count (${countIII})`);
        }
        if (!equals(sectionIII.score, sumPointsIII)) {
            throw new SyntaxError("section III score does not match sum of question points");
        }
        if (!equals(sectionIII.max, sumMaxIII)) {
            throw new SyntaxError("section III max does not match sum of question maxPoints");
        }
        if (countI + countII + countIII === 0) {
            throw new SyntaxError("Exam must have at least one question");
        }
        // Verify custom-v1 formula maxima for sections and exam
        const expectedExamMax = computeExamMax({
            n1: countI,
            n2: countII,
            n3: countIII,
        });
        if (!equals(sectionI.max, expectedExamMax.maxI)) {
            throw new SyntaxError(`sections.I.max (${toFractionString(sectionI.max)}) does not match expected formula max (${toFractionString(expectedExamMax.maxI)})`);
        }
        if (!equals(sectionII.max, expectedExamMax.maxII)) {
            throw new SyntaxError(`sections.II.max (${toFractionString(sectionII.max)}) does not match expected formula max (${toFractionString(expectedExamMax.maxII)})`);
        }
        if (!equals(sectionIII.max, expectedExamMax.maxIII)) {
            throw new SyntaxError(`sections.III.max (${toFractionString(sectionIII.max)}) does not match expected formula max (${toFractionString(expectedExamMax.maxIII)})`);
        }
        if (!equals(maxTotal, expectedExamMax.maxTotal)) {
            throw new SyntaxError(`maxTotal (${toFractionString(maxTotal)}) does not match expected formula max (${toFractionString(expectedExamMax.maxTotal)})`);
        }
        if (countIII > 0 && expectedPointIII !== null && !equals(expectedPointIII, expectedExamMax.pointIII)) {
            throw new SyntaxError(`Part III questions maxPoints (${toFractionString(expectedPointIII)}) does not match expected formula pointIII (${toFractionString(expectedExamMax.pointIII)})`);
        }
        return Object.freeze({
            attemptId: rec.attemptId,
            examVersionId: rec.examVersionId,
            ruleSetId: "custom-v1",
            inputPolicyId: "sa-charset-v1",
            engineVersion: rec.engineVersion,
            sections: Object.freeze({
                I: sectionI,
                II: sectionII,
                III: sectionIII,
            }),
            total,
            maxTotal,
            questions: Object.freeze(questions),
        });
    }
    catch (err) {
        if (err instanceof SyntaxError)
            throw err;
        throw new SyntaxError("Malformed ScoreResult DTO");
    }
}
