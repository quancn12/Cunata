/**
 * Heuristic semantic segmentation for DOCX exams.
 * Recognizes Section I (4-choice), Section II (True/False 4 statements), Section III (Short Answer),
 * options, answer keys, explanations, and provenance.
 * Conforms to docs/contracts/WEB-contract.md §4, §8:
 * "Recognize parts/questions/options/keys/explanations heuristically with flags and provenance, null confidence if not measured, missing keys unresolved."
 */
/**
 * Splits a text line that contains multiple inline options (e.g. "A. 1   B. 2   C. 3   D. 4").
 */
function extractInlineOptions(text) {
    const inlineRegex = /(?:^|[\s\t]+)([A-D])[\s.:)–-]\s*(.*?)(?=(?:[\s\t]+[A-D][\s.:)–-])|$)/g;
    const results = [];
    let match;
    while ((match = inlineRegex.exec(text)) !== null) {
        const label = match[1];
        const optText = match[2]?.trim() || "";
        results.push({ label, text: optText });
    }
    // Only return if we found at least 2 distinct option letters in strict ascending alphabetical order
    if (results.length >= 2) {
        for (let k = 1; k < results.length; k++) {
            if (results[k].label.charCodeAt(0) <= results[k - 1].label.charCodeAt(0)) {
                return [];
            }
        }
        return results;
    }
    return [];
}
/**
 * Splits a text line that contains multiple inline statements (e.g. "a) Đúng   b) Sai...").
 */
function extractInlineStatements(text) {
    const inlineRegex = /(?:^|[\s\t]+)([a-d])[\s.:)–-]\s*(.*?)(?=(?:[\s\t]+[a-d][\s.:)–-])|$)/gi;
    const results = [];
    let match;
    while ((match = inlineRegex.exec(text)) !== null) {
        const label = match[1].toLowerCase();
        let stmtText = match[2]?.trim() || "";
        let answer;
        // Detect explicit (Đ) / (S) or [Đúng] / [Sai] in statement text
        if (/\((?:Đ|Đúng)\)|\[(?:Đ|Đúng)\]/i.test(stmtText)) {
            answer = true;
            stmtText = stmtText.replace(/\((?:Đ|Đúng)\)|\[(?:Đ|Đúng)\]/gi, "").trim();
        }
        else if (/\((?:S|Sai)\)|\[(?:S|Sai)\]/i.test(stmtText)) {
            answer = false;
            stmtText = stmtText.replace(/\((?:S|Sai)\)|\[(?:S|Sai)\]/gi, "").trim();
        }
        results.push({ label, text: stmtText, answer });
    }
    // Only return if we found at least 2 distinct statements in strict ascending alphabetical order
    if (results.length >= 2) {
        for (let k = 1; k < results.length; k++) {
            if (results[k].label.charCodeAt(0) <= results[k - 1].label.charCodeAt(0)) {
                return [];
            }
        }
        return results;
    }
    return [];
}
/**
 * Analyzes parsed paragraphs and tables to extract structured ImportDrafts.
 */
export function segmentDocument(parsedDoc, sourceId) {
    const rawQuestions = [];
    let currentSection = "I";
    let inAnswerKeySection = false;
    let currentQ = null;
    // Answer key registry parsed from document bottom table/list
    const registeredPartIKeys = new Map();
    const registeredPartIIKeys = new Map();
    const registeredPartIIIKeys = new Map();
    const paragraphs = parsedDoc.paragraphs;
    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const text = p.text;
        if (!text) {
            if (p.blocks.length > 0 && currentQ) {
                currentQ.promptParagraphs.push(p);
            }
            continue;
        }
        // 1. Check for Answer Key Section Header (must be a standalone heading, e.g. "BẢNG ĐÁP ÁN" or "ĐÁP ÁN:")
        if (/^\s*(?:BẢNG\s*ĐÁP\s*ÁN|ĐÁP\s*ÁN\s*CHI\s*TIẾT|HƯỚNG\s*DẪN\s*CHẤM|PHẦN\s*ĐÁP\s*ÁN|\bĐÁP\s*ÁN)\s*[:–-]?\s*$/i.test(text)) {
            if (currentQ) {
                rawQuestions.push(currentQ);
                currentQ = null;
            }
            inAnswerKeySection = true;
            continue;
        }
        // 2. Check for Section Headers (must be standalone heading or start of section)
        if (/^\s*(?:PHẦN|PHAN)\s*(?:I\b|THỨ\s*NHẤT|1\b)(?:[\s.:–-].*)?$/i.test(text)) {
            if (currentQ) {
                rawQuestions.push(currentQ);
                currentQ = null;
            }
            currentSection = "I";
            inAnswerKeySection = false;
            continue;
        }
        else if (/^\s*(?:PHẦN|PHAN)\s*(?:II\b|THỨ\s*HAI|2\b)(?:[\s.:–-].*)?$/i.test(text)) {
            if (currentQ) {
                rawQuestions.push(currentQ);
                currentQ = null;
            }
            currentSection = "II";
            inAnswerKeySection = false;
            continue;
        }
        else if (/^\s*(?:PHẦN|PHAN)\s*(?:III\b|THỨ\s*BA|3\b)(?:[\s.:–-].*)?$/i.test(text)) {
            if (currentQ) {
                rawQuestions.push(currentQ);
                currentQ = null;
            }
            currentSection = "III";
            inAnswerKeySection = false;
            continue;
        }
        // If we are in the answer key section, collect answer keys
        if (inAnswerKeySection) {
            parseAnswerKeyLine(text, registeredPartIKeys, registeredPartIIKeys, registeredPartIIIKeys);
            continue;
        }
        // 3. Check for Question Start ("Câu 1:", "Câu 1.", "Câu 1", "Bài 1:", etc.)
        const qMatch = /^(?:Câu|Bài|Question)\s*(\d+)[\s.:–-]\s*(.*)/i.exec(text);
        if (qMatch) {
            if (currentQ) {
                rawQuestions.push(currentQ);
            }
            const qNum = parseInt(qMatch[1], 10);
            currentQ = {
                section: currentSection,
                questionNumber: qNum,
                title: `Câu ${qNum}`,
                promptParagraphs: [p],
                options: [],
                statements: [],
                flags: ["HEURISTIC_PARSED"],
            };
            continue;
        }
        // If no active question, skip preamble text
        if (!currentQ) {
            continue;
        }
        // 4. Check for Explanation Start ("Lời giải:", "Hướng dẫn giải:", etc.)
        const expMatch = /^(?:Lời\s*giải|Hướng\s*dẫn\s*giải|Giải\s*thích|HDG)[\s.:–-]\s*(.*)/i.exec(text);
        if (expMatch) {
            currentQ.explanation = text;
            continue;
        }
        // If explanation was already started, append additional text
        if (currentQ.explanation !== undefined) {
            currentQ.explanation += `\n${text}`;
            continue;
        }
        // 5. Parse Section-specific structures
        if (currentQ.section === "I") {
            // Check for inline choices in this paragraph first: A. ... B. ...
            const inlineOpts = extractInlineOptions(text);
            if (inlineOpts.length > 0) {
                for (const opt of inlineOpts) {
                    const optId = `opt-${currentQ.questionNumber}-${opt.label}`;
                    currentQ.options.push({
                        optionId: optId,
                        label: opt.label,
                        text: opt.text,
                    });
                }
                continue;
            }
            // Check for single choice paragraph: "A. ..."
            const singleOptMatch = /^([A-D])[\s.:)–-]\s*(.*)/.exec(text);
            if (singleOptMatch) {
                const label = singleOptMatch[1];
                const optText = singleOptMatch[2] || "";
                const optId = `opt-${currentQ.questionNumber}-${label}`;
                // Check if run for this option was bolded or styled
                let isMarkedCorrect = false;
                if (p.runs.length > 0 && p.runs[0]?.bold) {
                    isMarkedCorrect = true;
                }
                currentQ.options.push({
                    optionId: optId,
                    label,
                    text: optText,
                });
                if (isMarkedCorrect) {
                    currentQ.correctOptionLetter = label;
                }
                continue;
            }
            // Check for inline answer key right after options: "Đáp án: A", "Đáp án đúng là A", "Chọn: A", etc.
            const ansMatch = /^(?:Đáp\s*án(?:\s*đúng(?:\s*là)?)?|Chọn|ĐA)[\s.:–-]\s*([A-D])\b/i.exec(text);
            if (ansMatch) {
                currentQ.correctOptionLetter = ansMatch[1].toUpperCase();
                continue;
            }
        }
        else if (currentQ.section === "II") {
            // Check for inline statements in this paragraph first: a) ... b) ...
            const inlineStmts = extractInlineStatements(text);
            if (inlineStmts.length > 0) {
                for (const stmt of inlineStmts) {
                    const stmtId = `stmt-${currentQ.questionNumber}-${stmt.label}`;
                    currentQ.statements.push({
                        statementId: stmtId,
                        label: stmt.label,
                        text: stmt.text,
                        answer: stmt.answer,
                    });
                }
                continue;
            }
            // Check for single statement paragraph: "a) ..."
            const singleStmtMatch = /^([a-d])[\s.:)–-]\s*(.*)/i.exec(text);
            if (singleStmtMatch) {
                const label = singleStmtMatch[1].toLowerCase();
                let stmtText = singleStmtMatch[2] || "";
                let answer;
                if (/\((?:Đ|Đúng)\)|\[(?:Đ|Đúng)\]/i.test(stmtText)) {
                    answer = true;
                    stmtText = stmtText.replace(/\((?:Đ|Đúng)\)|\[(?:Đ|Đúng)\]/gi, "").trim();
                }
                else if (/\((?:S|Sai)\)|\[(?:S|Sai)\]/i.test(stmtText)) {
                    answer = false;
                    stmtText = stmtText.replace(/\((?:S|Sai)\)|\[(?:S|Sai)\]/gi, "").trim();
                }
                const stmtId = `stmt-${currentQ.questionNumber}-${label}`;
                currentQ.statements.push({
                    statementId: stmtId,
                    label,
                    text: stmtText,
                    answer,
                });
                continue;
            }
            // Check for inline answer key: "Đáp án: a-Đ, b-S, c-Đ, d-S"
            const ansMatchII = /^(?:Đáp\s*án(?:\s*đúng)?|ĐA)[\s.:–-]\s*(.*)/i.exec(text);
            if (ansMatchII) {
                const stmtRegex = /([a-d])[\s.:–-]+(Đ|Đúng|S|Sai)/gi;
                let sm;
                while ((sm = stmtRegex.exec(ansMatchII[1])) !== null) {
                    const sLabel = sm[1].toLowerCase();
                    const sVal = /^(?:Đ|Đúng)$/i.test(sm[2]);
                    const st = currentQ.statements.find((s) => s.label === sLabel);
                    if (st) {
                        st.answer = sVal;
                    }
                }
                continue;
            }
        }
        else if (currentQ.section === "III") {
            // Check for short answer in prompt
            const saMatch = /(?:Đáp\s*án|Kết\s*quả)[\s.:–-]\s*([^\s\n]+)/i.exec(text);
            if (saMatch) {
                currentQ.shortAnswerKey = saMatch[1].trim();
                continue;
            }
        }
        // If not an option, statement, or explanation, treat as part of the question prompt
        currentQ.promptParagraphs.push(p);
    }
    // Push final active question
    if (currentQ) {
        rawQuestions.push(currentQ);
    }
    // 6. Build final ImportDrafts and correlate with registered answer keys
    const drafts = [];
    for (let idx = 0; idx < rawQuestions.length; idx++) {
        const q = rawQuestions[idx];
        const qNum = q.questionNumber;
        const flags = [...q.flags];
        // Combine prompt blocks
        const promptBlocks = [];
        let promptContentText = "";
        for (const p of q.promptParagraphs) {
            if (p.text) {
                promptContentText += (promptContentText ? "\n" : "") + p.text;
            }
            for (const b of p.blocks) {
                promptBlocks.push(b);
            }
        }
        // Build question partial object
        let questionPartial;
        if (q.section === "I") {
            // Resolve correctOptionId
            let correctLetter = q.correctOptionLetter;
            if (!correctLetter && registeredPartIKeys.has(qNum)) {
                correctLetter = registeredPartIKeys.get(qNum);
            }
            let correctOptionId;
            if (correctLetter) {
                const found = q.options.find((o) => o.label?.toUpperCase() === correctLetter?.toUpperCase());
                if (found) {
                    correctOptionId = found.optionId;
                }
            }
            if (!correctOptionId) {
                flags.push("KEY_MISSING");
            }
            questionPartial = {
                kind: "I",
                questionVersionId: `qv-${qNum}`,
                title: q.title,
                content: promptContentText,
                blocks: promptBlocks,
                options: q.options,
                correctOptionId: correctOptionId,
                explanation: q.explanation,
            };
        }
        else if (q.section === "II") {
            // Resolve statement answers
            const registeredStmts = registeredPartIIKeys.get(qNum);
            const statements = [];
            let allAnswered = true;
            for (const stmt of q.statements) {
                let ans = stmt.answer;
                if (ans === undefined && registeredStmts && stmt.label) {
                    ans = registeredStmts.get(stmt.label.toLowerCase());
                }
                if (ans === undefined) {
                    allAnswered = false;
                }
                const stmtItem = {
                    statementId: stmt.statementId,
                    label: stmt.label,
                    text: stmt.text,
                };
                if (typeof ans === "boolean") {
                    stmtItem.answer = ans;
                }
                statements.push(stmtItem);
            }
            if (!allAnswered || statements.length < 4) {
                flags.push("KEY_MISSING");
            }
            questionPartial = {
                kind: "II",
                questionVersionId: `qv-${qNum}`,
                title: q.title,
                content: promptContentText,
                blocks: promptBlocks,
                statements,
                explanation: q.explanation,
            };
        }
        else {
            // Section III
            let key = q.shortAnswerKey;
            if (!key && registeredPartIIIKeys.has(qNum)) {
                key = registeredPartIIIKeys.get(qNum);
            }
            if (!key) {
                flags.push("KEY_MISSING");
            }
            else if (key.length > 4) {
                flags.push("KEY_LENGTH_EXCEEDED");
            }
            questionPartial = {
                kind: "III",
                questionVersionId: `qv-${qNum}`,
                title: q.title,
                content: promptContentText,
                blocks: promptBlocks,
                answerKey: key,
                explanation: q.explanation,
            };
        }
        const provenance = {
            sourceId,
            location: `part:${q.section},question:${qNum}`,
            confidence: null, // Confidence is null when not measured mathematically
            flags,
        };
        drafts.push({
            draftId: `draft-${idx + 1}`,
            question: questionPartial,
            provenance,
            confirmed: false, // Bắt buộc giáo viên xác nhận ở preview!
        });
    }
    return drafts;
}
/**
 * Parses lines in the answer key section to register answer keys for questions.
 */
function parseAnswerKeyLine(text, partIKeys, partIIKeys, partIIIKeys) {
    // Pattern: "1. A", "1-A", "1.A", "Câu 1: A"
    const singleKeyRegex = /(?:Câu\s*)?(\d+)[\s.:–-]+([A-D])\b/g;
    let match;
    while ((match = singleKeyRegex.exec(text)) !== null) {
        const qNum = parseInt(match[1], 10);
        const letter = match[2].toUpperCase();
        partIKeys.set(qNum, letter);
    }
    // Pattern for Part II: "Câu 1: a-Đ, b-S, c-Đ, d-S"
    const partIIRegex = /(?:Câu\s*)?(\d+)[\s.:–-]+([a-d])[\s.:–-]+(Đ|Đúng|S|Sai)/gi;
    while ((match = partIIRegex.exec(text)) !== null) {
        const qNum = parseInt(match[1], 10);
        const stmtLabel = match[2].toLowerCase();
        const isTrue = /^(?:Đ|Đúng)$/i.test(match[3]);
        if (!partIIKeys.has(qNum)) {
            partIIKeys.set(qNum, new Map());
        }
        partIIKeys.get(qNum).set(stmtLabel, isTrue);
    }
    // Pattern for Part III: "Câu 1: 1,5" or "1. 1,5" or "1. -0,5"
    const partIIIRegex = /(?:Câu\s*)?(\d+)[\s.:–-]+([0-9,.\-]+)/g;
    while ((match = partIIIRegex.exec(text)) !== null) {
        const qNum = parseInt(match[1], 10);
        const key = match[2].trim();
        // Only register if not already registered as a Part I letter
        if (!partIKeys.has(qNum)) {
            partIIIKeys.set(qNum, key);
        }
    }
}
