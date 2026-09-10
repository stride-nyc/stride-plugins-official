---
name: spec-writer
description: >-
  Write engineering specifications in the org's standard spec-driven-development format, with numbered
  sections, citable requirement IDs (AUTH-1, MEM-4), RFC 2119 keywords, constraints, contracts, error
  semantics, security invariants, and an open-decisions register. Use this whenever someone asks for a
  spec, technical specification, design doc, RFC, requirements doc, or engineering handoff, or wants to
  "spec out", "write up", "scope", or "formalize" a feature, integration, migration, or system so the
  team can agree on scope and build against it. Also use it to review, grade, or tighten an existing
  spec against the standard, and to turn notes, a Slack thread, a meeting transcript, or a rough
  proposal into a spec. Publishes to Notion when the Notion connector is available; otherwise produces
  a Markdown file that pastes cleanly into Notion.
compatibility: >-
  Works in Claude.ai, Claude Code, and Cowork. Notion publishing needs the Notion connector (optional).
  scripts/lint_spec.py needs Python 3.8+ and no extra packages.
---

# Spec Writer

A spec is the team's written agreement about what will be built and how anyone can tell it was built
correctly. Three audiences read it: engineers who implement it, reviewers who approve it, and the
tests and config that cite it by requirement ID. Write for the engineer who joins the team next month
and has to build against it without a walkthrough. Plain words, one meaning per sentence, every
unknown named.

Specs are graded on four things, in this order: clarity, absence of ambiguity, simplicity of terms,
and completeness. A short spec that a new hire understands beats a long one that only the author does.

## Workflow

### 1. Gather what is known

Read everything the user provided: notes, a thread, a transcript, an existing doc, code, a link. Pull
out facts, decisions already made, constraints, and names of systems and people. Sort what you find
into four buckets, because each lands in a different part of the spec:

| Bucket | What it is | Where it goes |
|---|---|---|
| Requirement | Something the system must do or must not do | A numbered requirement |
| Constraint | A condition imposed from outside (vendor limit, plan tier, law, existing system) | Constraints section, CON-n |
| Decision | A choice the team made, or still has to make | Architecture (made) or Open decisions (not made) |
| Rationale | Why a requirement or decision is the way it is | A note after the requirement block |

If the shape of the spec depends on something you cannot infer (which system, greenfield or existing,
who the actors are, what the boundary is), ask a small number of pointed questions up front. Do not
interview the user about every detail. Draft from what is known, state assumptions plainly, and turn
every remaining unknown into an Open decision with its consequence. A spec that names its unknowns is
more useful than a delayed one.

### 2. Right-size the spec

Not every change needs eighteen sections. Read `references/template.md` and pick sections by what the
work touches. Every spec has: Purpose, Goals and non-goals, Definitions (when it introduces terms), at
least one block of numbered requirements, and Open decisions. Add Constraints, Architecture, Contracts,
API surface, Error semantics, Security invariants, Observability, and Rollout when the work touches
them. If in doubt, include the section with an explicit "None" or "Not applicable because ...", so a
reviewer knows it was considered rather than forgotten.

### 3. Draft

Before your first draft in a session, read `references/example-spec.md` to calibrate density and tone.
Pay attention to how it separates requirements from rationale, how it presents options with costs and a
recommendation, and how it treats open decisions as blockers rather than footnotes. It is an auth and
tenancy spec; borrow its structure, density, and tone, not its content, when the work is a data
pipeline, a UI feature, or a migration.

Then draft using `assets/skeleton.md` as the starting file, and follow:

- `references/writing-requirements.md` for how to write each requirement (ID, keyword, one behavior,
  testable, cross-referenced) and for the constraint / requirement / decision / invariant taxonomy.
- `references/style-guide.md` for the language rules that keep specs readable across the org.

The things that make a spec "the standard", and why each exists:

- **Every requirement carries an ID** (`AUTH-3`, `MEM-4`) and is one sentence. Code comments, tests,
  gateway config, and review threads cite the ID. Never renumber after review starts; withdraw instead.
- **Every requirement uses MUST, MUST NOT, SHOULD, SHOULD NOT, or MAY**, in capitals. The keyword tells
  the implementer what is negotiable. "Will", "shall", "needs to", and "is expected to" do not.
- **Constraints are not requirements.** A vendor rate limit is a condition we build within, not a thing
  we build. Mixing them makes reviewers argue about things nobody can change.
- **Rationale lives in notes after a requirement block, never inside the requirement.** The requirement
  stays testable; the note carries the reasoning ("Why 404 and not 403.").
- **Options get a cost and a recommendation.** When the design has a real choice, show the options,
  what each costs, which you recommend, and say "confirm rather than assume" with a pointer to Open
  decisions. Silent choices become surprise disagreements at implementation time.
- **Open decisions are a table of Decision and Consequence,** introduced as "unresolved and block the
  work they affect." A decision without a stated consequence gets ignored.
- **Security invariants are labelled as incident-grade.** If a property's violation is a security
  incident rather than a bug, say so and list the adversarial tests that prove it holds.
- **One name per thing.** Define it once in Definitions and use that exact word everywhere. Two names
  for one concept is the most common source of ambiguity in specs.

### 4. Self-review and lint

Save the draft as Markdown and run the linter:

```bash
python3 scripts/lint_spec.py path/to/spec.md
```

It catches mechanical problems: duplicate or dangling requirement IDs, requirements without a keyword,
vague words ("appropriately", "etc.", "as needed"), TBDs outside Open decisions, leftover skeleton
placeholders, missing required sections, and defined terms that are never used. Fix errors; use judgement on warnings and
say why when you leave one. Notes are informational and never block.

Then read the draft once more against `references/review-rubric.md`. Rewrite anything a new engineer
could read two ways. Do not include the rubric scores in the spec itself; if the user asked for a
review, report them in chat.

### 5. Publish

Follow `references/publishing.md`. In short:

- If a Notion connector is available in this session, create the spec as a Notion page (ask where it
  should live if the user did not say) and return the link.
- If it is not available, deliver a single `.md` file written in plain GitHub-flavored Markdown. That
  format pastes into Notion and imports through Notion's "Text & Markdown" import with headings,
  tables, and code blocks intact. Mention once that connecting Notion lets future specs be created in
  place, and do not hold the spec back on that.

## Reviewing or grading an existing spec

When asked to review, grade, or tighten a spec rather than write one:

1. Run `scripts/lint_spec.py` on it (convert to Markdown first if needed).
2. Score it against `references/review-rubric.md`, one line per dimension with the single most
   important example of what to fix.
3. List blockers first (anything the rubric marks as a fail), then the top rewrites as before/after
   pairs, then smaller notes. Before/after pairs are what authors act on; abstract advice is not.
4. Offer to produce the rewritten spec in the standard format.

## Formatting the document

Use the Markdown conventions in `references/style-guide.md`. The ones that matter most for reading in
Notion: requirements as paragraphs beginning with the bold ID (`**AUTH-1** The application MUST ...`),
tables for definitions, contracts, error semantics, role composition, and open decisions, code blocks
for API routes and permission lists, and blockquotes with a bold lead phrase for rationale notes. No
HTML, no nested tables, no footnotes.

## Reference files

- `references/template.md` - every section, what belongs in it, when to include it
- `references/writing-requirements.md` - anatomy of a requirement, keywords, ID rules, before/after
  rewrites, taxonomy of constraint vs requirement vs decision vs invariant
- `references/style-guide.md` - language and formatting rules, banned vagueness, Notion-safe Markdown
- `references/review-rubric.md` - the org grading rubric and blocker list
- `references/publishing.md` - Notion connector path, Markdown fallback, import steps
- `references/example-spec.md` - a complete spec in the standard, used as the calibration example
- `assets/skeleton.md` - blank skeleton to copy and fill
- `scripts/lint_spec.py` - mechanical checks; run before delivering
