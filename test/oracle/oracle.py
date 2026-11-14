#!/usr/bin/env python3
"""Independent custom-v1 scoring fixtures; Python standard library only.

Business source: Shared Product Contract v2.0 section 2.
Wire format/input policy: docs/contracts/M1-scoring-contract.md sections 3/4/6.
Never imports, executes, or reads src/. This is verification tooling, not runtime code.
"""

import argparse
from collections import Counter
from copy import deepcopy
from decimal import Decimal
from fractions import Fraction
from itertools import product
import json
from math import gcd
from pathlib import Path
from random import Random
import sys
from time import perf_counter
import unittest


SEED = 20261114
RANDOM_CASES = 128
FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
PART_II = (Fraction(0), Fraction(1, 10), Fraction(1, 4), Fraction(1, 2), Fraction(1))
# Literal golden anchors: counts, max I, max II, point III, max III, max total.
GOLDEN = (
    ((20, 0, 0), "5", "0", "0", "0", "5"),
    ((0, 4, 0), "0", "4", "0", "0", "4"),
    ((20, 10, 0), "5", "10", "0", "0", "15"),
    ((20, 10, 4), "5", "10", "1/4", "1", "16"),
    ((12, 4, 6), "3", "4", "1/2", "3", "10"),
    ((0, 0, 3), "0", "0", "10/3", "10", "10"),
    ((0, 0, 7), "0", "0", "10/7", "10", "10"),
    ((39, 0, 3), "39/4", "0", "1/12", "1/4", "10"),
    ((40, 0, 3), "10", "0", "1/4", "3/4", "43/4"),
    ((41, 0, 3), "41/4", "0", "1/4", "3/4", "11"),
)


def exam_max(n1, n2, n3):
    """Direct rational transcription of the custom-exam formula."""
    if any(type(n) is not int or n < 0 for n in (n1, n2, n3)) or n1 + n2 + n3 == 0:
        raise ValueError("counts must be nonnegative integers and exam nonempty")
    max_i, max_ii = Fraction(n1, 4), Fraction(n2)
    base = max_i + max_ii
    weight = Fraction(0) if n3 == 0 else ((10 - base) / n3 if base < 10 else Fraction(1, 4))
    max_iii = n3 * weight
    return max_i, max_ii, weight, max_iii, base + max_iii


def score_fraction(exam, attempt):
    """Score well-typed fixture data by IDs; preserve raw short-answer strings."""
    counts = Counter(q["kind"] for q in exam["questions"])
    mi, mii, weight, miii, maximum = exam_max(*(counts[k] for k in ("I", "II", "III")))
    responses = {r["questionVersionId"]: r for r in attempt["responses"]}
    scores = {k: Fraction(0) for k in ("I", "II", "III")}
    for q in exam["questions"]:
        r = responses.get(q["questionVersionId"])
        if r is None:
            continue
        if q["kind"] == "I":
            if r["selectedOptionId"] == q["correctOptionId"]:
                scores["I"] += Fraction(1, 4)
        elif q["kind"] == "II":
            correct = 0
            for s in q["statements"]:
                matches = [a["value"] for a in r["answers"] if a["statementId"] == s["statementId"]]
                # Null/absent is never false; duplicate statement IDs cannot earn credit.
                if len(matches) == 1 and type(matches[0]) is bool and matches[0] == s["answer"]:
                    correct += 1
            scores["II"] += PART_II[correct]
        elif r["raw"] == q["answerKey"]:
            # Keys are valid 1..4 ASCII code points. Invalid raw strings cannot equal one.
            scores["III"] += weight
    return {
        "sections": {k: {"score": str(scores[k]), "max": str(m)}
                     for k, m in zip(("I", "II", "III"), (mi, mii, miii))},
        "total": str(sum(scores.values(), Fraction(0))),
        "maxTotal": str(maximum),
    }


def score_integer(exam, attempt):
    """Second implementation: integer centipoints and one common denominator.

    Does not call exam_max, score_fraction, Fraction, or PART_II. Correctness is
    recounted with bit masks and UTF-8 byte equality instead of oracle helpers.
    B = 25*N1+100*N2, D = N3 or 1; III pool U is 1000-B below 10,
    otherwise 25*N3. Total numerator = (25*C1+II_cents)*D + C3*U,
    denominator = 100*D. Reduction happens only when serializing the result.
    """
    sizes = {k: 0 for k in ("I", "II", "III")}
    c1 = c3 = ii_cents = 0
    for q in exam["questions"]:
        kind = q["kind"]
        sizes[kind] += 1
        response = next((r for r in attempt["responses"]
                         if r["questionVersionId"] == q["questionVersionId"]), None)
        if response is None:
            continue
        if kind == "I":
            c1 += int(response["selectedOptionId"] == q["correctOptionId"])
        elif kind == "II":
            mask = 0
            for i, statement in enumerate(q["statements"]):
                matching = [a for a in response["answers"] if a["statementId"] == statement["statementId"]]
                if len(matching) == 1 and matching[0]["value"] is statement["answer"]:
                    mask |= 1 << i
            ii_cents += (0, 10, 25, 50, 100)[mask.bit_count()]
        else:
            raw = response["raw"]
            c3 += int(isinstance(raw, str) and raw.encode("utf-8") == q["answerKey"].encode("utf-8"))
    b = 25 * sizes["I"] + 100 * sizes["II"]
    d = sizes["III"] or 1
    u = 0 if sizes["III"] == 0 else (1000 - b if b < 1000 else 25 * sizes["III"])

    def reduced(num, den):
        factor = gcd(num, den)
        num, den = num // factor, den // factor
        return str(num) if den == 1 else f"{num}/{den}"

    return {
        "sections": {
            "I": {"score": reduced(25 * c1, 100), "max": reduced(25 * sizes["I"], 100)},
            "II": {"score": reduced(ii_cents, 100), "max": str(sizes["II"])},
            "III": {"score": reduced(c3 * u, 100 * d), "max": reduced(sizes["III"] * u, 100 * d)},
        },
        "total": reduced((25 * c1 + ii_cents) * d + c3 * u, 100 * d),
        "maxTotal": reduced(b * d + sizes["III"] * u, 100 * d),
    }


def make_exam(counts, name):
    questions = []
    for kind, count in zip(("I", "II", "III"), counts):
        for i in range(count):
            qid = f"{name}:{kind}:{i}"
            q = {"kind": kind, "questionVersionId": qid}
            if kind == "I":
                q["options"] = [{"optionId": f"{qid}:option:{j}"} for j in range(4)]
                q["correctOptionId"] = q["options"][i % 4]["optionId"]
            elif kind == "II":
                q["statements"] = [{"statementId": f"{qid}:statement:{j}", "answer": j % 2 == 0}
                                   for j in range(4)]
            else:
                q["answerKey"] = ("1,5", "-0,5", "0", "1,50")[i % 4]
            questions.append(q)
    return {"examId": f"exam:{name}", "examVersionId": f"version:{name}",
            "ruleSetId": "custom-v1", "inputPolicyId": "sa-charset-v1", "questions": questions}


def make_response(q, correct=True):
    r = {"kind": q["kind"], "questionVersionId": q["questionVersionId"]}
    if q["kind"] == "I":
        r["selectedOptionId"] = q["correctOptionId"] if correct else next(
            o["optionId"] for o in q["options"] if o["optionId"] != q["correctOptionId"])
    elif q["kind"] == "II":
        r["answers"] = [{"statementId": s["statementId"], "value": s["answer"] if correct else not s["answer"]}
                        for s in q["statements"]]
    else:
        r["raw"] = q["answerKey"] if correct else "9"
    return r


def make_case(name, exam, responses):
    attempt = {"attemptId": f"attempt:{name}", "examVersionId": exam["examVersionId"], "responses": responses}
    return {"id": name, "exam": deepcopy(exam), "attempt": deepcopy(attempt),
            "expected": score_fraction(exam, attempt)}


def build_fixtures():
    files = {}
    cases = []
    for counts, *_ in GOLDEN:
        name = "golden-" + "-".join(map(str, counts))
        exam = make_exam(counts, name)
        cases.append(make_case(name + "-full", exam, [make_response(q) for q in exam["questions"]]))
        cases.append(make_case(name + "-blank", exam, []))
        if counts[2]:
            first_iii = next(q for q in exam["questions"] if q["kind"] == "III")
            cases.append(make_case(name + "-one-III", exam, [make_response(first_iii)]))
    exam = make_exam((20, 10, 4), "report-11-of-16")
    responses = []
    for kind in ("I", "II", "III"):
        for i, q in enumerate(q for q in exam["questions"] if q["kind"] == kind):
            r = make_response(q, correct=(i < {"I": 12, "II": 5, "III": 2}[kind]))
            if kind == "II" and i >= 5:
                for j, s in enumerate(q["statements"]):
                    r["answers"][j]["value"] = s["answer"] if j < 3 else not s["answer"]
            responses.append(r)
    cases.append(make_case("report-11-of-16", exam, responses))
    exam = make_exam((20, 10, 0), "report-12-of-15")
    responses = [make_response(q, correct=q["kind"] == "II" or i < 8)
                 for i, q in enumerate(exam["questions"])]
    cases.append(make_case("report-12-of-15", exam, responses))
    files["golden.json"] = cases

    cases = []
    exam = make_exam((4, 0, 0), "part-I")
    for c in (0, 1, 4):
        cases.append(make_case(f"I-correct-{c}", exam,
                               [make_response(q, i < c) for i, q in enumerate(exam["questions"])]))
    r = make_response(exam["questions"][0])
    r["selectedOptionId"] = None
    cases.append(make_case("I-null", exam, [r]))
    r["selectedOptionId"] = "unknown-option"
    cases.append(make_case("I-unknown-option", exam, [r]))
    r["selectedOptionId"] = exam["questions"][1]["options"][0]["optionId"]
    cases.append(make_case("I-other-question-option", exam, [r]))
    exam = make_exam((0, 1, 0), "part-II")
    q = exam["questions"][0]
    for k in range(5):
        r = make_response(q, False)
        for i in range(k):
            r["answers"][i]["value"] = q["statements"][i]["answer"]
        cases.append(make_case(f"II-k-{k}", exam, [r]))
    for s in q["statements"]:
        s["answer"] = False
    for name, answers in (
        ("II-false-key-all-null", [{"statementId": s["statementId"], "value": None} for s in q["statements"]]),
        ("II-false-key-all-missing", []),
        ("II-false-key-one-false", [{"statementId": q["statements"][0]["statementId"], "value": False}]),
        ("II-unknown-statement-ignored", [{"statementId": "unknown-statement", "value": False}]),
    ):
        r = {"kind": "II", "questionVersionId": q["questionVersionId"], "answers": answers}
        cases.append(make_case(name, exam, [r]))
    files["sections-I-II.json"] = cases

    cases = []
    exam = make_exam((0, 1, 0), "exhaustive-II")
    q = exam["questions"][0]
    for key_index, key in enumerate(product((False, True), repeat=4)):
        for s, value in zip(q["statements"], key):
            s["answer"] = value
        for answer_index, values in enumerate(product((None, False, True), repeat=4)):
            r = {"kind": "II", "questionVersionId": q["questionVersionId"], "answers": [
                {"statementId": s["statementId"], "value": value}
                for s, value in zip(q["statements"], values)]}
            cases.append(make_case(f"II-key-{key_index:02d}-vector-{answer_index:02d}", exam, [r]))
    files["exhaustive-II.json"] = cases

    cases = []
    raw_cases = (
        ("exact", "1,5", "1,5"), ("trailing-zero", "1,5", "1,50"),
        ("reverse-trailing-zero", "1,50", "1,5"), ("decimal-dot", "1,5", "1.5"),
        ("negative-four", "-0,5", "-0,5"), ("negative-wrong", "-0,5", "0,5"),
        ("integer", "0", "0"), ("four-digits", "1234", "1234"),
        ("too-long", "1234", "12345"), ("too-long-prefix", "1,5", "1,500"),
        ("empty", "1,5", ""), ("null", "1,5", None),
        ("space-before", "1,5", " 1,5"), ("space-after", "1,5", "1,5 "),
        ("space-only", "1,5", " "), ("newline", "1,5", "1,5\n"),
        ("crlf", "1,5", "1,5\r\n"), ("tab", "1,5", "\t1,5"),
        ("nbsp", "1,5", "1,5\u00a0"), ("zero-width", "1,5", "1,5\u200b"),
        ("bom", "1,5", "\ufeff1,5"), ("unicode-minus", "-0,5", "\u22120,5"),
        ("fullwidth-digit", "1,5", "\uff11,5"), ("arabic-digit", "1,5", "\u0661,5"),
        ("fullwidth-comma", "1,5", "1\uff0c5"), ("emoji", "1,5", "\U0001f600"),
        ("nul", "1,5", "1\x005"), ("plus", "1", "+1"),
        ("four-codepoints", "1234", "123\U0001f600"),
        # Charset-only policy probes: these do not decide the pending detailed grammar.
        ("leading-zero", "01", "01"), ("negative-zero", "-0", "-0"),
        ("leading-comma", ",5", ",5"), ("trailing-comma", "1,", "1,"),
        ("double-minus", "--1", "--1"), ("double-comma", "1,,", "1,,"),
    )
    for name, key, raw in raw_cases:
        exam = make_exam((0, 0, 1), f"III-{name}")
        q = exam["questions"][0]
        q["answerKey"] = key
        r = {"kind": "III", "questionVersionId": q["questionVersionId"], "raw": raw}
        cases.append(make_case(f"III-{name}", exam, [r]))
    exam = make_exam((0, 0, 1), "III-missing")
    cases.append(make_case("III-missing", exam, []))
    files["short-answers.json"] = cases

    rng = Random(SEED)
    cases = []
    for i in range(RANDOM_CASES):
        counts = (rng.randrange(45), rng.randrange(13), rng.randrange(10))
        if sum(counts) == 0:
            counts = (1, 0, 0)
        name = f"random-seed-{SEED}-{i:03d}"
        exam = make_exam(counts, name)
        responses = []
        for q in exam["questions"]:
            if rng.randrange(6) == 0:
                continue
            r = make_response(q)
            if q["kind"] == "I":
                r["selectedOptionId"] = rng.choice([None, "unknown-option"] + [o["optionId"] for o in q["options"]])
            elif q["kind"] == "II":
                r["answers"] = [{"statementId": s["statementId"], "value": rng.choice([None, False, True])}
                                for s in q["statements"] if rng.randrange(5) != 0]
                rng.shuffle(r["answers"])
            else:
                r["raw"] = rng.choice([q["answerKey"], None, "", "1,50", "1.5", "-0,5", " 0", "12345"])
            responses.append(r)
        rng.shuffle(responses)
        cases.append(make_case(name, exam, responses))
        # Independent option permutations per question plus response/statement order.
        for q in exam["questions"]:
            if q["kind"] == "I":
                rng.shuffle(q["options"])
        for kind in ("I", "II", "III"):
            group = [q for q in exam["questions"] if q["kind"] == kind]
            rng.shuffle(group)
            exam["questions"] = [q for q in exam["questions"] if q["kind"] != kind] + group
        rng.shuffle(responses)
        for r in responses:
            if r["kind"] == "II":
                rng.shuffle(r["answers"])
        cases.append(make_case(name + "-permuted", exam, responses))
    files["random-seed-20261114.json"] = cases
    return {name: {"schema": "m1-fixture-v1", "cases": cases} for name, cases in files.items()}


def validate_fixture(case):
    """Check our emitted section-3/6 wire shape, not the product validation API."""
    def require(condition, message):
        if not condition:
            raise ValueError(f"{case.get('id', '<missing>')}: {message}")

    def ident(value):
        return type(value) is str and len(value) > 0

    def fields(obj, keys):
        require(type(obj) is dict and set(obj) == set(keys.split()), f"fields: {keys}")

    fields(case, "id exam attempt expected")
    require(ident(case["id"]), "case id")
    exam, attempt = case["exam"], case["attempt"]
    fields(exam, "examId examVersionId ruleSetId inputPolicyId questions")
    require(ident(exam["examId"]) and ident(exam["examVersionId"]), "exam IDs")
    require(exam["ruleSetId"] == "custom-v1" and exam["inputPolicyId"] == "sa-charset-v1", "policies")
    require(type(exam["questions"]) is list and 1 <= len(exam["questions"]) <= 1000, "questions")
    questions = {}
    for q in exam["questions"]:
        kind = q["kind"]
        require(kind in ("I", "II", "III"), "question kind")
        fields(q, "kind questionVersionId " + {"I": "options correctOptionId", "II": "statements", "III": "answerKey"}[kind])
        qid = q["questionVersionId"]
        require(ident(qid) and qid not in questions, "question IDs")
        questions[qid] = q
        if kind in ("I", "II"):
            items = q["options" if kind == "I" else "statements"]
            require(type(items) is list and len(items) == 4, "four options/statements")
            ids = []
            for item in items:
                fields(item, "optionId" if kind == "I" else "statementId answer")
                item_id = item["optionId" if kind == "I" else "statementId"]
                require(ident(item_id), "option/statement ID")
                ids.append(item_id)
                if kind == "II":
                    require(type(item["answer"]) is bool, "boolean key")
            require(len(set(ids)) == 4, "unique option/statement IDs")
            if kind == "I":
                require(q["correctOptionId"] in ids, "choice key membership")
        else:
            key = q["answerKey"]
            require(type(key) is str and 1 <= len(key) <= 4 and all(c in "0123456789-," for c in key), "short key policy")
    fields(attempt, "attemptId examVersionId responses")
    require(ident(attempt["attemptId"]) and attempt["examVersionId"] == exam["examVersionId"], "attempt IDs")
    require(type(attempt["responses"]) is list, "response array")
    seen = set()
    for r in attempt["responses"]:
        kind, qid = r["kind"], r["questionVersionId"]
        require(qid in questions and qid not in seen and kind == questions[qid]["kind"], "response reference")
        seen.add(qid)
        fields(r, "kind questionVersionId " + {"I": "selectedOptionId", "II": "answers", "III": "raw"}[kind])
        if kind == "I":
            require(r["selectedOptionId"] is None or ident(r["selectedOptionId"]), "choice type")
        elif kind == "II":
            require(type(r["answers"]) is list, "statement answers array")
            for answer in r["answers"]:
                fields(answer, "statementId value")
                require(ident(answer["statementId"]) and (answer["value"] is None or type(answer["value"]) is bool), "statement type")
        else:
            require(r["raw"] is None or type(r["raw"]) is str, "raw string/null")
    expected = case["expected"]
    fields(expected, "sections total maxTotal")
    fields(expected["sections"], "I II III")
    values = [expected["total"], expected["maxTotal"]]
    for section in expected["sections"].values():
        fields(section, "score max")
        values.extend(section.values())
    for value in values:
        require(type(value) is str and str(Fraction(value)) == value, "canonical fraction string")


class OracleTests(unittest.TestCase):
    fixtures = None

    def all_cases(self):
        for fixture in self.fixtures.values():
            yield from fixture["cases"]

    def test_schema_and_unique_case_ids(self):
        ids = set()
        for fixture in self.fixtures.values():
            self.assertEqual(set(fixture), {"schema", "cases"})
            self.assertEqual(fixture["schema"], "m1-fixture-v1")
            for case in fixture["cases"]:
                with self.subTest(id=case["id"]):
                    validate_fixture(case)
                    self.assertNotIn(case["id"], ids)
                    ids.add(case["id"])

    def test_every_fixture_with_independent_integer_method(self):
        for case in self.all_cases():
            with self.subTest(id=case["id"]):
                before = deepcopy((case["exam"], case["attempt"]))
                self.assertEqual(score_integer(case["exam"], case["attempt"]), case["expected"])
                self.assertEqual(score_fraction(case["exam"], case["attempt"]), case["expected"])
                self.assertEqual((case["exam"], case["attempt"]), before)

    def test_literal_golden_maxima_and_weights(self):
        for row in GOLDEN:
            counts, *expected = row
            self.assertEqual(tuple(map(str, exam_max(*counts))), tuple(expected), counts)
        for counts in product(range(45), range(13), range(10)):
            if counts == (0, 0, 0):
                continue
            n1, n2, n3 = counts
            b = 25 * n1 + 100 * n2
            expected_cents = b if n3 == 0 else (1000 if b < 1000 else b + 25 * n3)
            self.assertEqual(exam_max(*counts)[4], Fraction(expected_cents, 100), counts)

    def test_literal_report_examples(self):
        by_id = {c["id"]: c for c in self.all_cases()}
        self.assertEqual(by_id["report-11-of-16"]["expected"], {
            "sections": {"I": {"score": "3", "max": "5"}, "II": {"score": "15/2", "max": "10"},
                         "III": {"score": "1/2", "max": "1"}}, "total": "11", "maxTotal": "16"})
        self.assertEqual(by_id["report-12-of-15"]["expected"]["total"], "12")
        self.assertEqual(by_id["report-12-of-15"]["expected"]["maxTotal"], "15")

    def test_literal_section_scores(self):
        by_id = {c["id"]: c for c in self.all_cases()}
        anchors = {"I-correct-0": "0", "I-correct-1": "1/4", "I-correct-4": "1",
                   "I-null": "0", "I-unknown-option": "0", "I-other-question-option": "0",
                   "II-false-key-all-null": "0", "II-false-key-all-missing": "0",
                   "II-false-key-one-false": "1/10", "II-unknown-statement-ignored": "0"}
        anchors.update({f"II-k-{k}": value for k, value in enumerate(("0", "1/10", "1/4", "1/2", "1"))})
        for name, expected in anchors.items():
            self.assertEqual(by_id[name]["expected"]["total"], expected, name)

    def test_exhaustive_II_distribution(self):
        cases = self.fixtures["exhaustive-II.json"]["cases"]
        self.assertEqual(len(cases), 16 * 81)
        # For any key there are C(4,k)*2**(4-k) vectors with k correct answers.
        self.assertEqual(Counter(c["expected"]["total"] for c in cases),
                         {"0": 256, "1/10": 512, "1/4": 384, "1/2": 128, "1": 16})

    def test_short_answer_literal_outcomes(self):
        full = {"exact", "negative-four", "integer", "four-digits", "leading-zero", "negative-zero",
                "leading-comma", "trailing-comma", "double-minus", "double-comma"}
        for case in self.fixtures["short-answers.json"]["cases"]:
            self.assertEqual(case["expected"]["total"], "10" if case["id"][4:] in full else "0", case["id"])
        self.assertEqual(len("-0,5"), 4)
        self.assertEqual(len("123\U0001f600"), 4)

    def test_bounds_and_section_sums(self):
        for case in self.all_cases():
            expected = case["expected"]
            for section in expected["sections"].values():
                self.assertLessEqual(Fraction(0), Fraction(section["score"]), case["id"])
                self.assertLessEqual(Fraction(section["score"]), Fraction(section["max"]), case["id"])
            for field, total_field in (("score", "total"), ("max", "maxTotal")):
                self.assertEqual(sum((Fraction(s[field]) for s in expected["sections"].values()), Fraction(0)),
                                 Fraction(expected[total_field]), case["id"])

    def test_random_full_blank_and_permutations(self):
        cases = self.fixtures["random-seed-20261114.json"]["cases"]
        self.assertEqual(len(cases), RANDOM_CASES * 2)
        for original, permuted in zip(cases[::2], cases[1::2]):
            self.assertEqual(original["expected"], permuted["expected"], original["id"])
            exam = original["exam"]
            for full in (False, True):
                attempt = deepcopy(original["attempt"])
                attempt["responses"] = [make_response(q) for q in exam["questions"]] if full else []
                result = score_fraction(exam, attempt)
                self.assertEqual(result["total"], result["maxTotal"] if full else "0", original["id"])
                self.assertEqual(result, score_integer(exam, attempt))

    def test_invalid_count_inputs(self):
        for counts in ((0, 0, 0), (-1, 0, 0), (True, 0, 1), (1.5, 0, 0), ("1", 0, 0),
                       (float("nan"), 0, 0), (float("inf"), 0, 0), (None, 0, 1)):
            with self.assertRaises(ValueError):
                exam_max(*counts)

    def test_negative_controls(self):
        by_id = {c["id"]: c for c in self.all_cases()}
        # Execute nine intentionally wrong policies, not merely alternative literals.
        case = by_id["II-k-1"]
        q, r = case["exam"]["questions"][0], case["attempt"]["responses"][0]
        mutant = Fraction(sum(a["value"] == s["answer"] for a, s in zip(r["answers"], q["statements"])), 4)
        self.assertNotEqual(str(mutant), case["expected"]["total"], "linear k/4")

        case = by_id["II-false-key-all-null"]
        q, r = case["exam"]["questions"][0], case["attempt"]["responses"][0]
        mutant_k = sum((a["value"] or False) == s["answer"] for a, s in zip(r["answers"], q["statements"]))
        self.assertNotEqual(str(PART_II[mutant_k]), case["expected"]["total"], "null becomes false")

        for name, transform in (
            ("III-trailing-zero", lambda s: Decimal(s.replace(",", "."))),
            ("III-space-after", lambda s: s.strip()),
            ("III-too-long", lambda s: s[:4]),
        ):
            case = by_id[name]
            key = case["exam"]["questions"][0]["answerKey"]
            raw = case["attempt"]["responses"][0]["raw"]
            mutant_score = "10" if transform(key) == transform(raw) else "0"
            self.assertNotEqual(mutant_score, case["expected"]["total"], name)

        case = by_id["report-12-of-15"]
        self.assertNotEqual(str(min(Fraction(10), Fraction(case["expected"]["maxTotal"]))),
                            case["expected"]["maxTotal"], "cap maximum at ten")
        case = by_id["golden-0-0-3-full"]
        weight = exam_max(0, 0, 3)[2]
        mutant = Fraction(round(weight * 100), 100) * 3
        self.assertNotEqual(str(mutant), case["expected"]["total"], "round each item before adding")

        case = by_id["I-other-question-option"]
        key = case["exam"]["questions"][0]["correctOptionId"]
        selected = case["attempt"]["responses"][0]["selectedOptionId"]
        mutant = "1/4" if key.rsplit(":", 1)[1] == selected.rsplit(":", 1)[1] else "0"
        self.assertNotEqual(mutant, case["expected"]["total"], "match option index across question IDs")
        case = by_id["golden-40-0-3-full"]
        base, n3 = Fraction(40, 4), 3
        mutant_weight = (10 - base) / n3 if base <= 10 else Fraction(1, 4)
        self.assertNotEqual(str(base + n3 * mutant_weight), case["expected"]["maxTotal"], "wrong <= threshold")


def encoded(fixture):
    return json.dumps(fixture, ensure_ascii=False, indent=2) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="self-test then regenerate committed fixtures")
    mode.add_argument("--check", action="store_true", help="self-test and verify files (default; no writes)")
    args = parser.parse_args()
    started = perf_counter()
    fixtures = build_fixtures()
    OracleTests.fixtures = fixtures
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(OracleTests))
    if not result.wasSuccessful():
        return 1
    if args.write:
        FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
        for name, fixture in fixtures.items():
            (FIXTURE_DIR / name).write_text(encoded(fixture), encoding="utf-8", newline="\n")
    else:
        actual_names = {p.name for p in FIXTURE_DIR.glob("*.json")}
        if actual_names != set(fixtures):
            raise ValueError(f"fixture filenames differ: actual={sorted(actual_names)}, expected={sorted(fixtures)}")
        for name, fixture in fixtures.items():
            path = FIXTURE_DIR / name
            # Byte-for-byte regeneration check catches stale expected values AND raw input changes.
            if path.read_bytes() != encoded(fixture).encode("utf-8"):
                raise ValueError(f"{path}: stale fixture; inspect changes then regenerate with --write")
            for case in json.loads(path.read_text(encoding="utf-8"))["cases"]:
                validate_fixture(case)
                if score_integer(case["exam"], case["attempt"]) != case["expected"]:
                    raise ValueError(f"{path}: integer mismatch: {case['id']}")
    print(json.dumps({"scope": "independent_oracle_only_not_product_tests", "mode": "write" if args.write else "check",
                      "python": sys.version.split()[0], "seed": SEED, "tests": result.testsRun,
                      "pass": result.testsRun - len(result.failures) - len(result.errors),
                      "fail": len(result.failures) + len(result.errors), "skipped": len(result.skipped),
                      "fixture_cases": {name: len(fixture["cases"]) for name, fixture in fixtures.items()},
                      "case_count": sum(len(f["cases"]) for f in fixtures.values()),
                      "maxima_sweep_configurations": 5849, "negative_controls": 9,
                      "duration_s": round(perf_counter() - started, 4)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
