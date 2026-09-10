# Writing requirements

A requirement is a sentence that a test can fail. If no test could fail it, it is not a requirement
yet; it is a wish, a rationale, or a decision, and it belongs somewhere else in the spec.

## Anatomy

```
**PREFIX-n** <Subject> <KEYWORD> <observable behavior> [<condition or scope>].
```

- **Subject** is a specific component: "the gateway", "the Post-Login Action", "services", "the SPA".
  Not "the system" and not "we". A named subject tells the reader who owns the work.
- **KEYWORD** is one of MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, in capitals.
- **Observable behavior** is something a test can watch: a status code, a claim in a token, a record in
  an audit log, a rejection with a specific message, a time bound.
- **Condition** narrows when it applies: "when event.organization is undefined", "on every route
  including root, excepting only health checks".

Examples that meet the bar:

> **ORG-1** Any authenticated request whose token lacks a non-empty org claim MUST receive 404, never
> 403 or 401.

> **MEM-4** Removing or demoting the last remaining admin in an org MUST be rejected with a clear
> message.

> **AUTH-4** The Action MUST complete in under 100 ms, and MUST be version-controlled and deployed
> through tooling rather than edited in the dashboard.

## Keywords and what they promise

| Keyword | Meaning to the implementer | Meaning to the reviewer |
|---|---|---|
| MUST / MUST NOT | Not negotiable. A test asserts it. | Missing it is a defect. |
| SHOULD / SHOULD NOT | The default. Deviating needs a written reason in the PR or the spec. | Ask why if it is not done. |
| MAY | Allowed, not required. Usually documents a permission so nobody blocks it later. | Do not ask for it. |

Words that look like keywords but promise nothing: will, shall, needs to, is expected to, is required
to, has to, always, never (in lowercase prose). Rewrite them. "The gateway will validate the JWT"
reads as a prediction; "The gateway MUST validate the JWT" reads as a contract.

Two prefixes are exempt from the keyword rule: constraints (CON) state a condition imposed on us, and
security invariants (SEC) state a property that holds. Either may still carry a MUST when we owe an
action in response ("The tier ceiling MUST be confirmed before launch"). The linter exempts CON and
SEC by default.

Use MUST NOT deliberately for boundaries. Security and isolation properties are almost always
negative requirements: "No endpoint MAY accept an org identifier from request body, path, or query."

Not every numbered line needs a keyword. Constraints (CON-n) state what a vendor or a law imposes,
security invariants (SEC-n) state a property, and a statement of fact states how something already
behaves. Forcing MUST onto any of the three misdescribes it: "The Management API MUST be rate-limited
per tenant" reads as though we are the ones imposing the limit. The linter exempts CON and SEC by
default; see review-rubric.md for when a keyword-less requirement is legitimate and when it is an open
decision in disguise.

## IDs

- Prefix: two to five capital letters derived from the section name (CON, RBAC, AUTH, ORG, PROV, MEM,
  INV, SSO, UI, OBS, SEC). Choose prefixes a reader can expand without a key. Keep a prefix unique
  within the spec.
- Number sequentially from 1 within each prefix, in document order.
- Once the spec is in review, IDs are frozen. They are cited from code comments, tests, gateway config,
  and PR descriptions. Never renumber. If a requirement is dropped, keep the line and mark it
  "Withdrawn" with a one-line reason; if one is added later, it takes the next number even if it sits
  out of order in the text.
- Cross-reference by ID in prose: "per CON-4", "see OBS-4", "as required by MEM-1". The linter checks
  that every referenced ID exists.

## One requirement, one behavior

A sentence with two behaviors joined by "and" is two requirements unless they are inseparable. Split
them so each can pass or fail alone and be cited alone.

> Before: **INV-3** Resend MUST issue a fresh ticket and revoke the prior one and log the resend.

> After: **INV-3** Resend MUST issue a fresh ticket and revoke the prior one. Tickets are single-use;
> leaving both live is a defect.
> **INV-4** Every resend MUST be audit-logged with actor and timestamp.

The first sentence stays together because issuing and revoking are one atomic operation; logging is a
separate check.

## Rationale goes in notes, not in the requirement

The requirement is the contract. The note is the reasoning. Mixing them makes the contract longer and
the reasoning harder to challenge. Put notes after the requirement block as a blockquote with a bold
lead phrase that names the question it answers:

> **Why 404 and not 403.** A 403 confirms the resource exists. Timing is part of the response, so the
> two paths need comparable cost.

> **Offboarding latency.** MEM-7 means a removed user keeps access until their token expires. If that
> window is unacceptable, a revocation mechanism needs specifying; see Open decisions.

A note may also carry a caution ("SSO bypasses invitations entirely...") or a platform fact that
explains a requirement. Notes never introduce new obligations; if a note contains a MUST, promote that
sentence to a numbered requirement.

## Taxonomy: where does this sentence go?

| The sentence says ... | It is a ... | Put it in ... |
|---|---|---|
| The system does or refuses something observable | Requirement | A capability section, with an ID |
| A vendor, plan, law, or existing system limits us | Constraint | Constraints, CON-n |
| We chose X over Y, and why | Decision (made) | Architecture, as options with costs and a recommendation |
| We have not chosen yet, and it matters | Decision (open) | Open decisions, with its consequence |
| Breaking this is a security incident | Invariant | Security invariants, SEC-n, plus an adversarial test |
| This is how it already behaves, and nobody is being asked to change it | Statement of fact | A capability section, with an ID but no keyword, and an Open decisions row if the fact is unresolved |
| This is why the requirement is shaped this way | Rationale | A note after the requirement block |
| Here is what a word means here | Definition | Definitions table |
| This is out of scope and someone might assume otherwise | Non-goal | Goals and non-goals |

## Before and after

The most common fixes, so the pattern is recognizable.

| Before | Problem | After |
|---|---|---|
| The system should handle invalid tokens appropriately. | No subject, no keyword, "appropriately" is undefined, no observable outcome | **AUTH-7** The gateway MUST reject expired, malformed, or unsigned tokens with 401 before the request reaches any upstream service. |
| Rate limiting will be implemented. | "Will" is a prediction; nothing to test | **OBS-1** Rate limits MUST be keyed on org ID rather than applied globally, so one tenant cannot degrade service for others. |
| Admins can manage members. | One sentence hiding six behaviors | Split into MEM-1 (org from token only), MEM-2 (no cross-org access), MEM-3 (assignable roles), MEM-4 (last admin), MEM-5 (self-demotion), MEM-6 (audit) |
| Invitations expire after a reasonable time. | "Reasonable" is a judgement call | **INV-2** Ticket TTL MUST be set to 7 days. |
| Errors should be user-friendly. | Not observable | **INV-6** Expired and revoked tickets MUST produce a message that names the cause rather than a generic error. |
| We need to make sure org A can't see org B, etc. | "Make sure", "etc.", conversational | **MEM-2** An admin in Org A MUST NOT be able to read or mutate Org B's members under any request shaping, including forged gateway headers. |
| The Action needs to be fast. | Unmeasurable | **AUTH-4** The Action MUST complete in under 100 ms. |
| Support SSO for enterprise customers (TBD which providers). | Open question hidden in a requirement | **SSO-6** At least two identity provider types MUST be validated end to end. Plus an Open decisions row naming the provider choice and its consequence. |

## Quantities

Numbers carry units and a bound: "under 100 ms", "7 days", "maximum of 30". Avoid "fast",
"quickly", "soon", "large", "small", "a few". If the real number is unknown, write the requirement
around a placeholder that is clearly flagged in Open decisions rather than inventing one, and say what
the number depends on.

## Adversarial tests

For every MUST NOT that guards a boundary, write the test that would catch a violation, phrased as
the attack: "A forged X-Org-Id header does not reach an upstream service." Collect these under
Security invariants. A boundary without a named test is a boundary nobody will check.
