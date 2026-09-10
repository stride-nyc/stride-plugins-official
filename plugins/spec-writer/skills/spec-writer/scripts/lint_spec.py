#!/usr/bin/env python3
"""
lint_spec.py: mechanical checks for a spec written in the org standard (Markdown).

Usage:
    python3 lint_spec.py path/to/spec.md [--strict] [--keyword-exempt CON,SEC] [--no-style]

What it checks
    ERROR   duplicate requirement IDs
            references to IDs that are not defined (only for prefixes the spec uses)
            TBD / TODO / TBC / FIXME / "???" outside the Open decisions section
            leftover skeleton placeholders like [[Owner]]
            missing required sections: Purpose, Goals and non-goals (with a non-goals list), Open decisions
            an Open decisions section with no rows and no explicit "None"
    WARN    a requirement without MUST / MUST NOT / SHOULD / SHOULD NOT / MAY (exempt prefixes aside)
            lowercase must / should inside a requirement
            requirement numbers that are not sequential within a prefix
            vague or hedging words (see style-guide.md)
            "the system" / "the app" / "the platform" as a subject in a requirement
            a requirement longer than 60 words
            a defined term never used outside the Definitions table
            a reference to a common prefix (OBS-4, SEC-2) that this spec never defines
    NOTE    a normative sentence (MUST / SHOULD / MAY) that has no requirement ID
            em or en dashes (style preference only, never fails a build)

Exit status: 0 when there are no errors; 1 when there are errors, or warnings under --strict.
No third-party packages required. Python 3.8+.
"""

import argparse
import re
import sys
from collections import OrderedDict, defaultdict

ID_RE = re.compile(r"\b([A-Z]{2,6})-(\d{1,3})\b")
DEF_LINE_RE = re.compile(r"^(?:[-*]\s+|>\s+|\|\s*|#{1,6}\s+)*\**([A-Z]{2,6})-(\d{1,3})\**[\s:.|]")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
KEYWORD_RE = re.compile(r"\b(MUST NOT|MUST|SHOULD NOT|SHOULD|MAY)\b")
LOWER_KEYWORD_RE = re.compile(r"\b(must|should)\b")
PLACEHOLDER_RE = re.compile(r"\[\[[^\]]*\]\]")
TBD_RE = re.compile(r"\b(TBD|TODO|TBC|FIXME)\b|\?\?\?")
DASH_RE = re.compile("[\u2014\u2013]")
TABLE_SEP_RE = re.compile(r"^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$")

# Words that mean nothing to an implementer. Checked everywhere.
VAGUE_ANYWHERE = [
    r"appropriately", r"\bproperly\b", r"\bas needed\b", r"\bas appropriate\b", r"\bif necessary\b",
    r"\bwhere applicable\b", r"\betc\.", r"\band so on\b", r"\band the like\b", r"\brobust\b",
    r"\bscalable\b", r"\bperformant\b", r"\bseamless(?:ly)?\b", r"\buser-friendly\b", r"\bintuitive\b",
    r"\bshould probably\b", r"\bmay or may not\b", r"\bif possible\b", r"\bideally\b",
    r"\ba number of\b", r"\bvarious\b", r"\bin a timely manner\b", r"\breasonable\b",
]
# Words that hide behavior. Checked only inside requirement lines, where precision matters most.
VAGUE_IN_REQ = [
    r"\bhandle[sd]?\b", r"\bdeal with\b", r"\bwill\b", r"\bshall\b", r"\bneeds? to\b",
    r"\bis expected to\b", r"\bhas to\b", r"\bfast\b", r"\bquickly\b", r"\bsoon\b",
    r"\bcurrently\b", r"\bfor now\b", r"\bsome\b", r"\bseveral\b", r"\bsupport[s]?\b",
]
WEAK_SUBJECT = re.compile(r"\bthe (system|app|application|platform)\b", re.IGNORECASE)

REQUIRED_SECTIONS = OrderedDict([
    ("Purpose", re.compile(r"\bpurpose\b", re.IGNORECASE)),
    ("Goals and non-goals", re.compile(r"\bgoals?\b", re.IGNORECASE)),
    ("Open decisions", re.compile(r"\bopen (decisions?|questions?)\b", re.IGNORECASE)),
])
DEFINITIONS_RE = re.compile(r"\b(definitions?|glossary|terminology|terms)\b", re.IGNORECASE)
# Prefixes that specs in the org commonly use. A reference to one of these when the spec defines
# none of them is almost always a stale cross-reference rather than a product name like SHA-256.
COMMON_PREFIXES = {
    "CON", "ARCH", "TOK", "RBAC", "AUTH", "ORG", "PROV", "MEM", "INV", "SSO", "UI", "OBS", "ERR",
    "SEC", "API", "DATA", "PERF", "MIG", "ROLL", "TEST", "UX", "LOG", "REQ", "FR", "NFR", "OPS",
}
OPEN_DECISIONS_RE = REQUIRED_SECTIONS["Open decisions"]


class Finding:
    ORDER = {"ERROR": 0, "WARN": 1, "NOTE": 2}

    def __init__(self, level, line, message):
        self.level = level
        self.line = line
        self.message = message

    def key(self):
        return (self.ORDER[self.level], self.line if self.line is not None else 0)


def clean_heading(text):
    text = re.sub(r"^\d+[.)]?\s+", "", text)  # strip "01 " / "1." numbering
    return text.strip()


def clean_cell(text):
    return re.sub(r"[`*]", "", text).strip()


def split_sections(lines):
    """Return a list of (heading_text, level, start_line, end_line) with 1-based inclusive lines."""
    sections = []
    current = None
    in_code = False
    for i, raw in enumerate(lines, start=1):
        if raw.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        m = HEADING_RE.match(raw)
        if m:
            if current:
                current[3] = i - 1
                sections.append(tuple(current))
            current = [clean_heading(m.group(2)), len(m.group(1)), i, len(lines)]
    if current:
        sections.append(tuple(current))
    return sections


def section_for_line(sections, line_no):
    best = None
    for title, level, start, end in sections:
        if start <= line_no <= end:
            if best is None or start >= best[2]:
                best = (title, level, start, end)
    return best


def lint(text, keyword_exempt, check_style):
    findings = []
    lines = text.splitlines()
    sections = split_sections(lines)
    section_titles = [s[0] for s in sections]

    # Track code blocks so routes and permission lists are not linted as prose.
    in_code = [False] * (len(lines) + 1)
    flag = False
    for i, raw in enumerate(lines, start=1):
        if raw.strip().startswith("```"):
            flag = not flag
            in_code[i] = True
            continue
        in_code[i] = flag

    open_decision_ranges = [(s[2], s[3]) for s in sections if OPEN_DECISIONS_RE.search(s[0])]
    definition_ranges = [(s[2], s[3]) for s in sections if DEFINITIONS_RE.search(s[0])]

    def in_ranges(line_no, ranges):
        return any(a <= line_no <= b for a, b in ranges)

    # Pass 1: collect requirement definitions.
    defined = OrderedDict()          # "AUTH-1" -> first line
    by_prefix = defaultdict(list)    # "AUTH" -> [(num, line)]
    req_lines = {}                   # line -> (id, text)
    duplicate_lines = set()
    for i, raw in enumerate(lines, start=1):
        if in_code[i]:
            continue
        m = DEF_LINE_RE.match(raw)
        if not m:
            continue
        prefix, num = m.group(1), int(m.group(2))
        rid = "%s-%d" % (prefix, num)
        if rid in defined:
            findings.append(Finding("ERROR", i, "Duplicate ID %s (first defined at line %d)" % (rid, defined[rid])))
            duplicate_lines.add(i)
            continue
        defined[rid] = i
        by_prefix[prefix].append((num, i))
        req_lines[i] = (rid, raw)

    # Pass 2: per-requirement checks.
    for i, (rid, raw) in req_lines.items():
        prefix = rid.split("-")[0]
        body = re.sub(r"^(?:[-*]\s+|>\s+|\|\s*|#{1,6}\s+)*\**[A-Z]{2,6}-\d{1,3}\**[\s:.|]*", "", raw).strip()
        if prefix not in keyword_exempt:
            if not KEYWORD_RE.search(body):
                findings.append(Finding("WARN", i, "%s has no MUST / MUST NOT / SHOULD / SHOULD NOT / MAY" % rid))
            for lm in LOWER_KEYWORD_RE.finditer(body):
                findings.append(Finding("WARN", i, "%s uses lowercase '%s'; keywords are uppercase or the word is not a keyword" % (rid, lm.group(1))))
        words = len(body.split())
        if words > 60:
            findings.append(Finding("WARN", i, "%s is %d words; split it or move reasoning to a note" % (rid, words)))
        if WEAK_SUBJECT.search(body):
            findings.append(Finding("WARN", i, "%s names '%s' as the subject; name the component that owns the behavior" % (rid, WEAK_SUBJECT.search(body).group(0))))
        for pat in VAGUE_IN_REQ:
            for vm in re.finditer(pat, body, re.IGNORECASE):
                findings.append(Finding("WARN", i, "%s contains '%s'; say what actually happens" % (rid, vm.group(0))))

    # Pass 3: sequence check per prefix.
    for prefix, items in by_prefix.items():
        nums = [n for n, _ in items]
        expected = list(range(1, len(nums) + 1))
        if nums != expected:
            first_line = items[0][1]
            findings.append(Finding("WARN", first_line, "%s numbering is %s; expected %s in document order (fine if IDs are frozen and some were withdrawn)" % (prefix, nums, expected)))

    # Pass 4: whole-document line checks.
    used_prefixes = set(by_prefix.keys())
    for i, raw in enumerate(lines, start=1):
        if in_code[i]:
            continue
        # Dangling references, only for prefixes this spec actually uses.
        for m in ID_RE.finditer(raw):
            prefix, num = m.group(1), int(m.group(2))
            rid = "%s-%d" % (prefix, num)
            if prefix in used_prefixes and rid not in defined:
                known = sorted(n for n, _ in by_prefix[prefix])
                findings.append(Finding("ERROR", i, "Reference to %s but %s defines only %s" % (rid, prefix, known)))
            elif prefix in COMMON_PREFIXES and prefix not in used_prefixes:
                findings.append(Finding("WARN", i, "Reference to %s but this spec defines no %s requirements" % (rid, prefix)))
        # Open questions hiding in the body.
        if TBD_RE.search(raw) and not in_ranges(i, open_decision_ranges):
            findings.append(Finding("ERROR", i, "'%s' outside Open decisions; move it there with its consequence" % TBD_RE.search(raw).group(0)))
        # Skeleton placeholders.
        for pm in PLACEHOLDER_RE.finditer(raw):
            findings.append(Finding("ERROR", i, "Placeholder left in: %s" % pm.group(0)))
        # Vague words anywhere.
        for pat in VAGUE_ANYWHERE:
            for vm in re.finditer(pat, raw, re.IGNORECASE):
                findings.append(Finding("WARN", i, "Vague word '%s'; replace with the observable behavior or a number" % vm.group(0)))
        # Normative sentence without an ID.
        if i not in req_lines and i not in duplicate_lines and KEYWORD_RE.search(raw) and not HEADING_RE.match(raw):
            # "Recommendation: ... This SHOULD be confirmed rather than assumed" is the template's own pattern.
            if not TABLE_SEP_RE.match(raw) and not raw.lstrip().lower().startswith("recommendation:"):
                findings.append(Finding("NOTE", i, "Normative sentence without an ID; give it one if code or tests should cite it"))
        # Style. A NOTE rather than a WARN: dashes are a house preference, not an
        # ambiguity, and the org's existing specs use them freely. Failing a build over
        # punctuation would teach people to pass --no-style and lose the real checks too.
        if check_style and DASH_RE.search(raw):
            findings.append(Finding("NOTE", i, "Em or en dash; a comma, colon, period, or parentheses reads better, but this is style only"))

    # Pass 5: required sections.
    for name, pat in REQUIRED_SECTIONS.items():
        if not any(pat.search(t) for t in section_titles):
            findings.append(Finding("ERROR", None, "Missing required section: %s" % name))

    if not re.search(r"non-?goals?", text, re.IGNORECASE):
        findings.append(Finding("ERROR", None, "No non-goals found; add a Non-goals list under Goals (what a reader might assume is included and is not)"))

    # Pass 6: Open decisions has content.
    for a, b in open_decision_ranges:
        body_lines = [ln for ln in lines[a:b] if ln.strip() and not TABLE_SEP_RE.match(ln)]
        rows = [ln for ln in body_lines if ln.strip().startswith("|")]
        data_rows = rows[1:] if rows else []
        says_none = any(re.search(r"\bnone\b", ln, re.IGNORECASE) for ln in body_lines)
        bullets = [ln for ln in body_lines if re.match(r"^\s*[-*]\s+", ln)]
        if not data_rows and not bullets and not says_none:
            findings.append(Finding("ERROR", a, "Open decisions section has no entries; add rows or write 'None at time of writing'"))

    # Pass 7: defined terms that are never used.
    for a, b in definition_ranges:
        terms = []
        for ln_no in range(a + 1, b + 1):
            ln = lines[ln_no - 1]
            if not ln.strip().startswith("|") or TABLE_SEP_RE.match(ln):
                continue
            cells = [c for c in ln.strip().strip("|").split("|")]
            if not cells:
                continue
            term = clean_cell(cells[0])
            if not term or term.lower() in ("term", "name", "word"):
                continue
            terms.append((term, ln_no))
        rest = "\n".join(lines[:a - 1] + lines[b:]).lower()
        for term, ln_no in terms:
            needle = term.lower()
            if needle not in rest:
                findings.append(Finding("WARN", ln_no, "Defined term '%s' is never used outside Definitions; remove it or use it" % term))

    return findings, defined, by_prefix


def main():
    ap = argparse.ArgumentParser(description="Lint a spec written in the org standard.")
    ap.add_argument("path")
    ap.add_argument("--strict", action="store_true", help="exit 1 on warnings too")
    ap.add_argument("--keyword-exempt", default="CON,SEC",
                    help="prefixes that state conditions or properties rather than obligations (default CON,SEC)")
    ap.add_argument("--no-style", action="store_true", help="skip style checks such as em dashes")
    args = ap.parse_args()

    try:
        with open(args.path, encoding="utf-8") as fh:
            text = fh.read()
    except OSError as exc:
        print("Cannot read %s: %s" % (args.path, exc))
        return 2

    exempt = {p.strip().upper() for p in args.keyword_exempt.split(",") if p.strip()}
    findings, defined, by_prefix = lint(text, exempt, not args.no_style)
    findings.sort(key=lambda f: f.key())

    counts = {"ERROR": 0, "WARN": 0, "NOTE": 0}
    for f in findings:
        counts[f.level] += 1

    print("%s: %d errors, %d warnings, %d notes" % (args.path, counts["ERROR"], counts["WARN"], counts["NOTE"]))
    print()
    for f in findings:
        loc = ("L%d" % f.line) if f.line else "-"
        print("%-5s %-6s %s" % (f.level, loc, f.message))
    if findings:
        print()
    summary = "  ".join("%s(%d)" % (p, len(v)) for p, v in by_prefix.items())
    print("Requirements: %d   Prefixes: %s" % (len(defined), summary or "none"))

    if counts["ERROR"] or (args.strict and counts["WARN"]):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
