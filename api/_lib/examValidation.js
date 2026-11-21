export function validatePublishedExam(exam) {
    const errors = [];
    const nonempty = (v) => typeof v === 'string' && v.trim().length > 0;
    if (!exam || typeof exam !== 'object' || Array.isArray(exam)) {
        return ['Thiếu dữ liệu đề thi'];
    }
    const e = exam;
    if (e.schemaVersion !== 'web-exam-v1') {
        errors.push('schemaVersion phải là web-exam-v1');
    }
    if (!nonempty(e.examId)) {
        errors.push('Thiếu mã đề thi (examId)');
    }
    if (!nonempty(e.title)) {
        errors.push('Thiếu tiêu đề đề thi');
    }
    if (!Array.isArray(e.questions) || e.questions.length === 0) {
        errors.push('Đề thi không có câu hỏi nào');
        return errors;
    }
    if (e.questions.length > 1000) {
        errors.push('Đề thi có quá 1000 câu');
    }
    const questionIds = new Set();
    e.questions.forEach((q, index) => {
        const label = `Câu ${index + 1}: `;
        if (!q || typeof q !== 'object' || Array.isArray(q)) {
            errors.push(label + 'dữ liệu không hợp lệ');
            return;
        }
        const qObj = q;
        if (!nonempty(qObj.questionVersionId) || questionIds.has(qObj.questionVersionId)) {
            errors.push(label + 'questionVersionId thiếu hoặc trùng');
        }
        else {
            questionIds.add(qObj.questionVersionId);
        }
        if (qObj.kind === 'I') {
            if (!Array.isArray(qObj.options) || qObj.options.length !== 4) {
                errors.push(label + 'Phần I phải có đúng 4 phương án');
                return;
            }
            const optionIds = new Set();
            qObj.options.forEach((opt) => {
                if (!opt || typeof opt !== 'object' || Array.isArray(opt)) {
                    errors.push(label + 'phương án không hợp lệ');
                    return;
                }
                const optId = opt.optionId;
                if (!nonempty(optId) || optionIds.has(optId)) {
                    errors.push(label + 'optionId thiếu hoặc trùng');
                }
                else {
                    optionIds.add(optId);
                }
            });
            if (!nonempty(qObj.correctOptionId) || !optionIds.has(qObj.correctOptionId)) {
                errors.push(label + 'correctOptionId không thuộc phương án');
            }
        }
        else if (qObj.kind === 'II') {
            if (!Array.isArray(qObj.statements) || qObj.statements.length !== 4) {
                errors.push(label + 'Phần II phải có đúng 4 ý');
                return;
            }
            const statementIds = new Set();
            qObj.statements.forEach((st) => {
                if (!st || typeof st !== 'object' || Array.isArray(st)) {
                    errors.push(label + 'ý không hợp lệ');
                    return;
                }
                const stObj = st;
                if (!nonempty(stObj.statementId) || statementIds.has(stObj.statementId)) {
                    errors.push(label + 'statementId thiếu hoặc trùng');
                }
                else {
                    statementIds.add(stObj.statementId);
                }
                if (typeof stObj.answer !== 'boolean') {
                    errors.push(label + 'ý thiếu đáp án boolean');
                }
            });
        }
        else if (qObj.kind === 'III') {
            if (typeof qObj.answerKey !== 'string' || qObj.answerKey.length < 1 || qObj.answerKey.length > 4 || /[^0-9,-]/.test(qObj.answerKey)) {
                errors.push(label + 'answerKey phải là chuỗi 1–4 ký tự 0-9,-');
            }
        }
        else {
            errors.push(label + 'phần phải là I, II hoặc III');
        }
    });
    return errors;
}
