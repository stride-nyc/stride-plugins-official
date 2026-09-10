# Style guide for specs

The standard the org grades on is: can an engineer who was not in the room read this once and build
the right thing? Every rule below serves that.

## Language

**Plain words.** Prefer the common word to the technical one when both are exact: "reject" over
"invalidate", "remove" over "deprovision", "check" over "validate" where checking is what happens.
Keep a technical term only when it is the name of a real thing (JWT, JWKS, SAML) and define it in
Definitions if a reader outside the team might not know it.

**One name per thing.** Pick one word for each concept and use it every time: not "org" in one
sentence and "tenant" in the next, not "user" when you mean "member". Put the chosen word in
Definitions. Synonyms feel like good writing and read as two different things.

**Short sentences, one idea each.** A requirement is one sentence. A rationale note is two to four. If
a sentence needs a semicolon, it is probably two sentences.

**Active voice with a named subject.** "The gateway strips the header" rather than "the header is
stripped". Passive voice hides who does the work, and specs are about who does the work.

**Concrete over abstract.** "Returns 404 with the canonical body" rather than "responds
appropriately". "Under 100 ms" rather than "performant". "Okta SAML and Entra ID OIDC" rather than
"major identity providers".

**Name the actor's role, not "the user".** "Org administrator", "Hume staff", "a member of Org A".
"The user" is whoever the reader imagines.

**Say what is not there.** "Immediate revocation is not currently specified." "There is no self-serve
path." Explicit absences stop readers from assuming presence.

## Words to remove

These words appear in first drafts and mean nothing to an implementer. The linter warns on them.

| Word or phrase | Why it fails | Replace with |
|---|---|---|
| appropriately, properly, correctly | The whole question is what "proper" means | The observable behavior |
| as needed, as appropriate, if necessary, where applicable | Delegates the decision to the reader | The condition, spelled out |
| etc., and so on, and the like | The list is the contract; an open list is no contract | The full list, or "including but not limited to" only in non-normative prose |
| robust, scalable, performant, fast, efficient, seamless, user-friendly, intuitive | Not measurable | A number with a unit, or a specific behavior |
| should probably, may or may not, if possible, ideally | Hedges that leave the requirement optional by accident | MUST, SHOULD, or MAY, chosen deliberately |
| will, shall, needs to, is expected to, has to | Look like requirements, promise nothing | MUST / SHOULD / MAY |
| handle, deal with, manage, support, address | Hide the actual behavior | What happens: reject, retry, log, return, store |
| the system, the app, the platform | Not a component anyone owns | The specific component |
| various, some, several, a number of | Unspecified quantity | The count or the list |
| TBD, TODO, TBC, ??? | An open decision hiding in the body | A row in Open decisions |
| currently, at the moment, for now | Time-relative; wrong the day after | State the fact; if it may change, say when and why |

"Handle" is allowed when the sentence goes on to say exactly what handling means ("MUST handle partial
failure without discarding successful invitations"). The linter still warns; leave it when the sentence
is specific.

## Punctuation

- Prefer a comma, a colon, a period, or parentheses to an em or en dash. Dashes invite asides, and
  asides are where unclear requirements hide. This is a preference, not a rule: existing specs in the
  org use dashes freely and are not wrong for it, so the linter reports them as a NOTE and they never
  fail a review. Hyphens inside words (org-scoped, single-use) are fine.
- No exclamation marks.
- Quotation marks only for literal strings a reader would type or see ("Require Organization",
  `display_name`). Use code formatting for identifiers, claim names, header names, and paths.
- Numbers as digits with units: 7 days, 100 ms, 50M requests. Spell out "one" and "two" only in
  ordinary prose ("one reserved org").

## Tone

Direct and unhurried. No marketing ("powerful", "best-in-class"), no apology, no hedging, no jokes.
Confidence comes from precision, not from adjectives. The calibration spec's tone is the target:
"Getting past this puts unvalidated requests in front of services."

Write from the position of the team, not the author: "we build within", "our services". Use "I"
never.

## Structure

- Sections numbered `01`, `02`, ... in the document, in the standard order from `template.md`.
- Every requirement starts a new paragraph with its bold ID: `**AUTH-1** The application MUST ...`
- Rationale notes follow a requirement block as blockquotes with a bold lead phrase ending in a period:
  `> **Why 404 and not 403.** A 403 confirms ...`
- Options in Architecture are labelled `A`, `B`, ... with a `Cost:` line each and a `Recommendation:`
  line after.
- Tables for: Definitions (Term, Meaning), Contracts (Name, Type, Notes), role composition (Role, Who,
  Permissions), Error semantics (Condition, Status, Response), Open decisions (Decision, Consequence).
- Code blocks for: API route listings, permission and scope lists, config snippets, exact header sets.
- Bullet lists for Goals, Non-goals, adversarial tests, and nothing else that could be a numbered
  requirement.

## Markdown that survives the move to Notion

Notion's paste and "Text & Markdown" import handle a specific subset well. Stay inside it.

Use:

- `#` for the title, `##` for numbered sections, `###` for sub-sections
- `**bold**`, `*italic*`, `` `code` ``
- `-` bullet lists and `1.` numbered lists, up to two levels deep
- Pipe tables with a header row (`| A | B |` then `|---|---|`)
- Fenced code blocks with a language tag where there is one
- `>` blockquotes (become Notion quote blocks; in Notion-flavored Markdown through the connector these
  can be callouts instead)
- `---` horizontal rules between major parts, sparingly

Avoid:

- HTML tags of any kind
- Nested tables, merged cells, or tables wider than four columns
- Footnotes, definition lists, task-list checkboxes for requirements
- Images that live on a local disk (link to a hosted diagram, or describe the flow in a list)
- Heading levels deeper than `###`
- Line breaks inside table cells (use a short phrase; move detail to a note below the table)

## Length

As short as it can be with every requirement still testable. Cut background, cut restatement, cut
anything the reader can infer from the definitions. Do not cut non-goals, constraints, or open
decisions; those are the parts people skip in first drafts and then argue about later.
