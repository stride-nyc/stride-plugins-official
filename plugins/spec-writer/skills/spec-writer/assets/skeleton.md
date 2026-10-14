# [[Title of the work]]

Technical specification

| Status | Owner | Reviewers | Last updated |
|---|---|---|---|
| Draft | [[Owner]] | [[Reviewers]] | [[YYYY-MM-DD]] |

## Contents

1. Purpose
2. Goals and non-goals
3. Definitions
4. Constraints
5. Architecture
6. Contracts
7. [[Capability section]]
8. Observability
9. API surface
10. Error semantics
11. Security invariants
12. Open decisions

## 01 Purpose

[[Two to five sentences: what is being built, where it is enforced, the one-line model of how it works.]]

Requirements are numbered so implementations, tests, and config can cite them directly.

## 02 Goals and non-goals

Goals

- [[An outcome a reviewer can check at the end.]]
- [[Another.]]

Non-goals

- [[Something a reader might assume is included, and is not. Say why if it helps.]]
- [[Another.]]

## 03 Definitions

| Term | Meaning |
|---|---|
| [[Term]] | [[One-sentence meaning as used in this spec.]] |
| [[Term]] | [[Meaning.]] |

## 04 Constraints

These are not requirements on us; they are conditions we build within.

**CON-1** [[The external condition, in plain terms, and what it implies for the design.]]

**CON-2** [[Another.]]

## 05 Architecture

[[How the system is shaped: components, layers, data flow.]]

[[Where there is a real design choice:]]

A. [[Option name]]. [[One or two sentences.]] Cost: [[what it costs.]]

B. [[Option name]]. [[One or two sentences.]] Cost: [[what it costs.]]

Recommendation: [[A or B, and the reason.]] This SHOULD be confirmed rather than assumed; see Open decisions.

## 06 Contracts

| Name | Type | Notes |
|---|---|---|
| [[field or claim]] | [[type]] | [[constraint, source, consumers]] |

[[Which side is the source of truth, and what happens if a name changes.]]

## 07 [[Capability]]

[[One or two sentences: who acts, and why this section matters.]]

**[[PREFIX]]-1** [[Subject]] MUST [[observable behavior]] [[condition]].

**[[PREFIX]]-2** [[Subject]] MUST NOT [[observable behavior]].

**[[PREFIX]]-3** [[Subject]] SHOULD [[behavior]].

> **[[Why this is shaped this way.]]** [[Two to four sentences of rationale. No new obligations here.]]

## 08 Observability

**OBS-1** [[Audit events, what each entry captures, alerts, rate-limit keys.]]

## 09 API surface

All routes sit behind [[the gate or auth layer]]. [[What context is derived from where.]]

Requires `[[permission]]`.

```
[[METHOD]] /[[path]]   [[description]]
```

## 10 Error semantics

| Condition | Status | Response |
|---|---|---|
| [[condition]] | [[code]] | [[body or reference to canonical response]] |

[[What responses MUST NOT reveal.]]

## 11 Security invariants

These are the properties whose violation constitutes a security incident rather than a bug.

**SEC-1** [[Short title]]. [[The property, and why it matters, in one or two sentences.]]

Required adversarial tests

- [[A test phrased as the attack it defends against.]]

## 12 Open decisions

These are unresolved and block the work they affect.

| Decision | Consequence |
|---|---|
| [[The question, as a question]] | [[What changes depending on the answer, and what is blocked until it is made]] |

## Revision history

| Date | Author | Change |
|---|---|---|
| [[YYYY-MM-DD]] | [[name]] | Initial draft |
