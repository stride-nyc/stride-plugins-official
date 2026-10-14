# Spec template: sections, contents, and when to include them

Sections are numbered `01`, `02`, ... in the document so people can say "see section 08" in review.
Requirement prefixes are chosen per section (see `writing-requirements.md`). The order below is the
standard order; keep it, and skip sections that do not apply rather than reordering.

Legend: **Core** means every spec has it. **When relevant** means include it when the work touches
that area, and consider a one-line "Not applicable because ..." when it does not, so reviewers know
it was considered.

---

## Header block (Core)

Sits above the contents list. A spec is an agreement, so it records who agreed and when.

```
Status: Draft | In review | Agreed | Superseded
Owner: <name>
Reviewers: <names or team>
Last updated: <date>
Supersedes / related: <links, optional>
```

Status moves to Agreed when the named reviewers approve. After that, changes go through the Revision
history section at the bottom, not silent edits. This is what lets the team treat the spec as the
scope of work rather than a living wiki page.

## Contents (Core)

A numbered list of section titles. Notion can generate one from headings, so in the Markdown fallback
this is optional; in Notion use a table-of-contents block.

---

## 01 Purpose (Core)

Two to five sentences. What is being built, where it is enforced, and the one-line model of how it
works. Close with the sentence that tells readers how to use the document:

> Requirements are numbered so implementations, tests, and config can cite them directly.

Do not put background history, alternatives, or justification here. Purpose answers "what and where";
Architecture answers "how"; notes answer "why".

Example (from the calibration spec): "Implement single sign-on and organization management on Auth0,
enforced through the Kong API gateway. Every customer is an Auth0 Organization, and a user must belong
to one to reach the app at all. Access inside an org is governed by three roles; enterprise customers
authenticate through their own identity provider."

## 02 Goals and non-goals (Core)

Two bullet lists. Goals are outcomes a reviewer can check at the end. Non-goals are things a reader
might reasonably assume are included and are not. Non-goals are where scope arguments are prevented;
spend real effort on them.

A good non-goal names the thing and, when it helps, why it is out: "Self-serve org signup. All orgs
are provisioned by staff." A bad non-goal is a category: "Other features."

## 03 Definitions (Core when the spec introduces terms)

A two-column table, Term and Meaning. Define every noun that a requirement depends on, every internal
nickname ("the gate"), and any word that has a narrower meaning here than in general use ("Member: a
user holding an Auth0 membership in a given Organization"). One term per concept; the spec then uses
that exact word and no synonyms.

If a term appears in a requirement and not in this table, a reader is allowed to interpret it however
they like. That is the failure mode this section exists to prevent.

## 04 Constraints (When relevant, prefix CON)

Conditions imposed from outside that shape the design: vendor limits, plan tiers, rate limits,
retention windows, regulatory rules, properties of an existing system we cannot change. Introduce them
with a sentence like: "These are not requirements on us; they are conditions we build within."

Each constraint is numbered `CON-n`, states the condition in plain terms, and says what it implies for
the design or the commercial plan. A constraint may contain a MUST when we have to do something in
response to it ("The tier ceiling MUST be confirmed before launch"), but the constraint itself is the
external fact.

Keeping constraints separate from requirements stops reviewers from debating things nobody in the room
can change, and makes the commercial dependencies (tier limits, per-connection pricing) visible to
non-engineers.

## 05 Architecture (When relevant)

How the system is shaped. Components, layers, data flow, and the design decisions that everything else
depends on. This section is prose and diagrams, not numbered requirements; requirements that fall out
of the architecture go in their own sections.

Two patterns from the calibration spec to reuse:

**Options with costs and a recommendation.** When there is a real design choice, present it as
labelled options (A, B, ...), give each one a short "Cost:" line, then a "Recommendation:" with the
reason. End with "This SHOULD be confirmed rather than assumed" and a pointer to Open decisions. The
reader sees what was considered and what it would cost to choose differently.

**Layered enforcement.** When correctness depends on several checks in sequence, list them in order
and state what getting past each one would require and expose. Then state whether each layer must be
correct on its own. This turns "defense in depth" from a slogan into a testable claim.

## 06 Contracts (When relevant)

The exact shapes that cross a boundary: token claims, API request and response fields, event schemas,
headers, config keys. Use a table with Name, Type, Notes. Names are a hard contract across every
component that reads them, so say that: "Renaming one breaks all consumers at once and MUST be treated
as a coordinated change."

State which side is the source of truth. If headers are forwarded for logging but must not be used for
authorization, say so here and again in Security invariants.

## 07 to N: Capability sections (Core, one or more)

One section per capability or actor journey, each with its own prefix: roles and permissions (RBAC),
authentication (AUTH), provisioning (PROV), membership (MEM), invitations (INV), SSO (SSO), frontend
(UI), and so on. Choose prefixes that a reader can expand without a key.

Each capability section has the same shape:

1. A one- or two-sentence intro stating who acts and why this section matters ("Org administrators
   manage their own members. This is the tenant isolation boundary and the highest-risk surface in
   the system.").
2. Numbered requirements, one per paragraph, ID in bold, one sentence each.
3. Zero or more rationale notes after the block, as a blockquote with a bold lead phrase ("**Why 404
   and not 403.** A 403 confirms the resource exists.").

Where a table communicates better than sentences (role composition, who holds which permissions), use
the table and then add the requirements that govern it.

## Observability and rate limiting (When relevant, prefix OBS)

Audit events and what each entry captures (actor, target, action, timestamp, result, correlation ID),
log streaming, alerts and what fires them, rate-limit keys and headers. Name the alert conditions that
are outages rather than degradations, because they need their own alert.

## API surface (When relevant)

A code block per audience group (platform admin, org admin, public), each route on one line with
method, path, and a short description, with the permission required stated above the block. Keep this
a listing; behavior belongs in the capability sections, and payload shapes belong in Contracts.

## Error semantics (When relevant, required for any API)

A table with Condition, Status, Response. Follow it with the negative rules: what responses MUST NOT
reveal ("403 responses MUST NOT name the missing permission"). Errors are where systems leak
information, so the negative rules are the important half.

## Security invariants (When relevant, prefix SEC)

Introduce them as "properties whose violation constitutes a security incident rather than a bug."
Each invariant has a short bold title, the property, and why it matters in one or two sentences.

Then a **Required adversarial tests** list: the tests that MUST pass before release, phrased as attacks
("A forged X-Org-Id header does not reach an upstream service"). If the work touches auth, tenancy,
personal data, money, or untrusted input, this section is required, not optional.

## Rollout and migration (When relevant)

Phases, feature flags, data migration steps, backfill, cutover, and rollback. Each phase states its
entry condition and exit condition. If the change is not reversible, say so and say what the
mitigation is.

## Testing strategy (When relevant)

Only when the test approach is itself a decision (contract tests across teams, load test targets,
compliance evidence). Otherwise the adversarial tests and the testable requirements are enough; do not
repeat every requirement as a test.

## Open decisions (Core)

A table with two columns, Decision and Consequence. Introduce it with: "These are unresolved and block
the work they affect." The Consequence column says what changes depending on the answer and what is
blocked until it is made. Cross-reference the section that depends on it.

If nothing is open, write "None at time of writing" so a reviewer knows the section was not skipped.
Do not hide open questions as "TBD" inside other sections; the linter flags that.

## Revision history (Core once Status is Agreed)

Date, author, one-line summary of what changed and why. Requirements that were withdrawn stay in the
document marked "Withdrawn" with their ID, so that references in code and tests still resolve.

---

## Sizing guide

| Work | Typical sections |
|---|---|
| Small change inside one service, no new surface | Header, Purpose, Goals and non-goals, one capability section, Open decisions |
| New endpoint or feature with an API | Add Definitions, Contracts, API surface, Error semantics |
| Anything touching auth, tenancy, PII, money, or external input | Add Constraints, Architecture, Security invariants, Observability |
| Cross-team or vendor integration | Add Rollout, and expect Constraints and Open decisions to be long |

Length is not a quality signal. The calibration spec is long because it covers a whole platform
boundary. A four-section spec that is fully unambiguous is a finished spec.
