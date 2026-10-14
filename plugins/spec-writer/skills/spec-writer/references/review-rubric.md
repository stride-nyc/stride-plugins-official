# Review rubric

Use this for the self-review pass before delivering, and for grading a spec someone else wrote. Score
each dimension 1 to 4. Report the score, one sentence of reasoning, and the single most important
concrete fix, as a before/after where possible. Do not put scores inside the spec document.

The dimensions are in priority order. A spec that scores 4 on completeness and 2 on clarity is a
worse spec than the reverse; people can add a missing section, but they cannot build against a
sentence that reads two ways.

## 1. Clarity

Can a competent engineer who was not in the room read it once and know what to build?

| Score | Description |
|---|---|
| 4 | Every requirement has a named subject, a keyword, and an observable outcome. Sections are in the standard order. A new hire could start work from it. |
| 3 | A few requirements need a second read, or one section's purpose is unclear from its intro. |
| 2 | Several requirements are prose paragraphs rather than single sentences, or the architecture is described only by implication. |
| 1 | The reader has to ask the author what most of it means. |

Fast check: read each requirement aloud. If you paused to reinterpret it, it needs a rewrite.

## 2. Absence of ambiguity

Does each sentence have exactly one interpretation?

| Score | Description |
|---|---|
| 4 | No vague words (see style-guide.md). Every quantity has a number and a unit. Every list is closed. Every term used is defined and used consistently. |
| 3 | One or two vague words remain in non-normative prose only. |
| 2 | Vague words inside requirements, or a term used with two meanings, or an open list ("etc.") in a contract. |
| 1 | Requirements depend on judgement calls ("reasonable", "appropriate", "as needed"). |

Fast check: run `scripts/lint_spec.py`, then search for "should" in lowercase, "will", and "the
system".

## 3. Simplicity

Are the terms and concepts the simplest ones that are still exact, so people outside the immediate team
follow it?

| Score | Description |
|---|---|
| 4 | Jargon is limited to names of real things and each is defined. Sentences are short. Analogies and asides are absent. A product manager could read Purpose, Goals, Constraints, and Open decisions and understand the commercial implications. |
| 3 | A few undefined acronyms, or one over-long section. |
| 2 | Concepts are introduced by implication; readers need to know the codebase to follow. |
| 1 | Reads as notes to self. |

Fast check: pick the three most technical sentences. Could each be understood with the Definitions
table alone?

## 4. Completeness

Are the things that cause surprises during implementation written down?

| Score | Description |
|---|---|
| 4 | Goals and non-goals, definitions, constraints, contracts, error semantics, security, observability, and open decisions are each present or explicitly marked not applicable with a reason. Nothing important is only in the author's head. |
| 3 | One relevant section is missing or thin (usually non-goals, error semantics, or observability). |
| 2 | Open decisions are missing or empty while unknowns are visible in the text. Security is not addressed for work that touches a boundary. |
| 1 | Only the happy path is described. |

Fast check: for each section in `template.md`, ask "does this work touch it?" and confirm it is either
present or marked not applicable.

## 5. Testability

Could a test be written for each MUST, and are the boundary tests named?

| Score | Description |
|---|---|
| 4 | Every MUST and MUST NOT is checkable. Security boundaries have adversarial tests listed. Performance requirements have numbers. |
| 3 | A few requirements are checkable only manually, and say so. |
| 2 | Several requirements have no observable outcome. |
| 1 | Requirements are aspirations. |

Fast check: for five random requirements, write the one-line test that would fail if it were violated.
If you cannot, mark it.

## 6. Consistency

Does the document agree with itself?

| Score | Description |
|---|---|
| 4 | IDs are unique and sequential. Every cross-reference resolves. Contract names are identical everywhere they appear. Definitions match usage. The API surface, error semantics, and capability sections describe the same behavior. |
| 3 | One dangling reference or one naming drift. |
| 2 | Requirements in two sections contradict each other, or a table disagrees with the prose. |
| 1 | The document was clearly assembled from pieces without a final read. |

Fast check: the linter covers IDs and references. For naming drift, search for each defined term's
likely synonyms.

## 7. Decision hygiene

Are choices visible, costed, and owned?

| Score | Description |
|---|---|
| 4 | Every real design choice shows the options, the cost of each, a recommendation, and a pointer to Open decisions where confirmation is needed. Open decisions each carry a consequence. Assumptions are stated as assumptions. |
| 3 | Recommendations are present but costs of alternatives are not stated. |
| 2 | Choices are made silently; the reader cannot tell what was considered. |
| 1 | "TBD" appears in the body, or open questions are absent while the design clearly depends on unknowns. |

Fast check: for each recommendation, can you find what it was chosen over?

## Blockers

Any of these fails review regardless of score. Fix before the spec moves to In review.

- A requirement without an ID, or an ID used twice.
- A requirement without MUST, MUST NOT, SHOULD, SHOULD NOT, or MAY, unless it is a constraint
  (CON-n), a security invariant (SEC-n), or a statement of fact (see below). Those three state
  conditions and properties rather than obligations, and a keyword would misdescribe them.
- A term used in a requirement that is not defined and is not a common word.
- "TBD", "TODO", or an unanswered question in any section other than Open decisions.
- No non-goals section, or a non-goals section that lists only vague categories.
- Work that touches auth, tenancy, personal data, money, or untrusted input with no Security
  invariants section.
- A cross-reference to an ID that does not exist.
- An Open decisions section that is missing (an explicit "None at time of writing" is fine).

## Statements of fact

Some correct requirements carry no keyword because they describe how something already behaves rather
than obliging anyone to build it. `MEM-7` in the calibration spec is the pattern: "Role changes take
effect on the member's next token refresh. Immediate revocation is not currently specified."

These are legitimate when both halves hold:

- The sentence is checkable, so a reader can tell whether it is still true.
- Anything unresolved in it has a matching row in Open decisions carrying the consequence. MEM-7 has
  one; that is what stops it being a TBD in disguise.

A statement of fact that fails the second test is an open decision hiding in the body, and that is a
blocker. Time-relative words ("currently", "for now") are ordinarily banned, and are the right choice
here precisely because the fact is expected to change, so the linter's warning on them can be left
with a note saying why.

## Reporting format

When reviewing someone else's spec, report in this order, because it is the order the author needs:

1. Blockers, each with the line or ID it refers to.
2. Scores, one line each: dimension, score, reason, the one fix that would raise it.
3. Top rewrites as before/after pairs (three to eight of them).
4. Smaller notes, grouped by section.
5. An offer to produce the rewritten spec in the standard format.
