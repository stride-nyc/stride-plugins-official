# Publishing a spec

The spec lives in Notion. There are two ways to get it there, and the choice is made by what is
available in the current session, not by asking the user to set anything up first.

## Decide which path

Check the tools available in this session for a Notion connector. In Claude.ai its tools appear with
a `Notion:` prefix (for example a search tool, a fetch tool, and a create-pages tool); in Claude Code
it is an MCP server named notion. If any Notion write tool is present, use the connector path. If
not, use the Markdown path.

Do not stop to ask the user to connect Notion before delivering. Deliver the Markdown, then mention
once that connecting Notion lets future specs be created directly in the workspace.

## Connector path

1. **Find where it should live.** If the user named a parent page or database, search for it with the
   Notion search tool and confirm you have the right one (title and a snippet of its content). If they
   did not, ask one question: "Which page or database should this go under?" A reasonable default,
   if the workspace has one, is a page or database named Specs, Engineering, RFCs, or Tech Specs;
   search for those and offer what you find.

2. **Check the target's shape.** If the target is a database, fetch it first to read its schema. The
   connector distinguishes a plain page parent from a database data source, and a database may have
   properties worth filling (Status, Owner, Team, Last edited). Fill the ones that exist with the
   header-block values from the spec; do not invent properties.

3. **Write the page.** Use the connector's create-pages tool. The page title goes in the title
   property, not at the top of the content. The content is Notion-flavored Markdown. If the connector
   exposes a Markdown spec resource (it is commonly published at `notion://docs/enhanced-markdown-spec`),
   read it before writing rather than guessing syntax. Map the spec's Markdown like this:

   | In the spec | In Notion-flavored Markdown |
   |---|---|
   | `## 01 Purpose` | Heading 2 |
   | `**AUTH-1** The ...` | A paragraph starting with bold text |
   | Rationale blockquote with bold lead | A callout block if the syntax is available, otherwise a quote block |
   | Pipe tables | Tables (keep them at four columns or fewer) |
   | Fenced code blocks | Code blocks with the language tag |
   | Header block (Status, Owner, ...) | Database properties when the parent is a database; otherwise a short table at the top |
   | Contents list | Omit, and add a table-of-contents block if the syntax supports it |

4. **Verify.** Fetch the page back once and skim for lost structure: tables that flattened, code
   blocks that became paragraphs, requirement IDs that lost their bold. Fix with the update tool.
   Then give the user the page link and a two-line summary of what was published (title, section
   count, requirement count, open decisions count).

5. **Large specs.** If the create call has a content size limit, create the page with the first half
   and append the rest with the update tool. Keep the section order intact across the split.

## Markdown path

1. Write one file named after the spec, kebab-case, `.md` extension: `auth0-organizations-rbac-sso.md`.
2. Use only the Markdown subset in `style-guide.md` (headings to three levels, bold, code, bullets,
   numbered lists, pipe tables, fenced code, blockquotes). No HTML, no nested tables.
3. Put the header block as a small table under the title so it survives the paste:

   ```
   | Status | Owner | Reviewers | Last updated |
   |---|---|---|---|
   | Draft | <name> | <names> | 2026-09-04 |
   ```

4. Run `scripts/lint_spec.py` on the file. Fix errors.
5. Deliver the file with the file-presentation tool if one is available, and give the import steps
   in one short paragraph:

   > To move it into Notion, either open a new page and paste the file's contents (Notion converts
   > headings, tables, and code blocks on paste), or in Notion choose Import, then Text & Markdown,
   > and pick the file. Connecting the Notion connector to Claude lets future specs be created in
   > place.

6. If the user asked for something other than Notion (a Confluence page, a Google Doc, a repo file),
   the same Markdown works for a repo. For Google Docs, a .docx is a better carrier; use the docx
   skill if available.

## Offering the connector

In Claude.ai, if a connector-suggestion tool is available in the session, use it to offer Notion once
after delivering the Markdown. Otherwise say, in one sentence, that Notion can be added under
Settings, Connectors. In Claude Code, the equivalent is adding the Notion MCP server. Do not repeat
the offer in the same conversation if the user does not take it.

## What never goes in the published page

- Rubric scores or review commentary. Those go in chat.
- Linter output.
- Author's notes to self. Anything worth keeping is either a rationale note or an open decision.
- Secrets, tokens, or environment-specific IDs (role IDs, client IDs). Reference the config location
  instead, as RBAC-4 in the calibration spec does.
