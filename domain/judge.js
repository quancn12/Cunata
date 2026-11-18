export function judgeI(q, r) {
    if (r === undefined || r.selectedOptionId === null || r.selectedOptionId === undefined) {
        return "unanswered";
    }
    const isOptionValid = q.options.some((opt) => opt.optionId === r.selectedOptionId);
    if (!isOptionValid) {
        return "invalid";
    }
    return r.selectedOptionId === q.correctOptionId ? "correct" : "wrong";
}
export function judgeII(q, r) {
    const validStatementIdSet = new Set(q.statements.map((s) => s.statementId));
    if (r === undefined || r.answers === undefined) {
        return {
            correctCount: 0,
            perStatement: q.statements.map((s) => ({
                statementId: s.statementId,
                state: "unanswered",
            })),
            unknownStatementIds: [],
        };
    }
    const statementMatches = new Map();
    const unknownIds = [];
    for (const a of r.answers) {
        if (validStatementIdSet.has(a.statementId)) {
            const existing = statementMatches.get(a.statementId);
            if (existing !== undefined) {
                existing.push(a.value);
            }
            else {
                statementMatches.set(a.statementId, [a.value]);
            }
        }
        else {
            if (!unknownIds.includes(a.statementId)) {
                unknownIds.push(a.statementId);
            }
        }
    }
    let correctCount = 0;
    const perStatement = q.statements.map((s) => {
        const matches = statementMatches.get(s.statementId);
        let state;
        if (matches === undefined || matches.length === 0) {
            state = "unanswered";
        }
        else if (matches.length > 1) {
            state = "invalid";
        }
        else {
            const val = matches[0];
            if (val === null || val === undefined) {
                state = "unanswered";
            }
            else if (val === s.answer) {
                state = "correct";
            }
            else {
                state = "wrong";
            }
        }
        if (state === "correct") {
            correctCount++;
        }
        return {
            statementId: s.statementId,
            state,
        };
    });
    return {
        correctCount: correctCount,
        perStatement,
        unknownStatementIds: unknownIds,
    };
}
export function judgeIII(q, r) {
    if (r === undefined || r.raw === null || r.raw === undefined || r.raw === "") {
        return "unanswered";
    }
    return r.raw === q.answerKey ? "correct" : "wrong";
}
