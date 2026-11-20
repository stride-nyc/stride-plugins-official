# The data file

One JSON file holds the whole walkthrough: `<working folder>/<slug>.walkthrough.json`, where `<working folder>` is the path `echo "${TMPDIR:-/tmp}/code-walkthrough/<slug>"` prints in the shell, used as printed. The build checks it, adds what it learns, and copies it into the walkthroughs folder (`<parent>/pages`) beside the page and the note.

A complete example: one repo, two stops, a ticket read from a saved copy. In stop 2, lines 6–15 of `src/store.js` (a helper and the blank lines around it) are left out of `text` and declared in `left_out`.

```json
{
  "format": 1,
  "journey": "Posting an invoice, from the API call to the saved row",
  "short_name": "posting an invoice",
  "summary": "An invoice comes in through the API, is checked, totalled and saved.",
  "client": "ledger-api",
  "jira": ["LED-42"],
  "repos": [{ "name": "ledger-api", "path": "~/Code/acme/ledger-api" }],
  "stops": [
    {
      "id": "s1",
      "name": "The API takes the invoice",
      "summary": "Refuses an invoice with too many lines, then hands it on.",
      "code": [{
        "file": "src/routes/invoices.js", "lines": [3, 13], "function": "postInvoice",
        "text": "// Amounts arrive in cents, so rounding happens once, at the till.\nconst MAX_LINES = 500;\n\nexport async function postInvoice(req, res) {\n  const invoice = req.body;\n  if (invoice.lines.length > MAX_LINES) {\n    return res.status(400).send('Too many lines');\n  }\n  const saved = await saveInvoice(invoice);\n  res.status(201).json(saved);\n}",
        "key_lines": [8], "left_out": []
      }],
      "what": "The route reads the invoice, refuses one with more than 500 lines, and passes the rest to the store.",
      "data": { "in": "The invoice in the request body.", "out": "The saved invoice, or a 400 for too many lines." },
      "notes": ["`await` waits for the save before the reply is sent."],
      "reasons": [
        { "text": "Amounts come in as cents, so they are rounded only once.",
          "quote": "Amounts arrive in cents, so rounding happens once, at the till.",
          "source": { "kind": "code-comment", "ref": { "file": "src/routes/invoices.js", "line": 3 } } },
        { "text": "Why is an invoice limited to 500 lines?", "source": { "kind": "not-recorded" } }
      ],
      "guesses": ["The limit may keep one request under the server's size cap."],
      "map_step": { "flow": ["send"], "focus": ["api"] }
    },
    {
      "id": "s2",
      "name": "The store totals and saves it",
      "summary": "Adds up the lines in cents and inserts the row.",
      "code": [{
        "file": "src/store.js", "lines": [3, 20], "function": "saveInvoice",
        "text": "function totalOf(lines) {\n  return lines.reduce((sum, l) => sum + l.cents * l.qty, 0);\n}\nexport async function saveInvoice(invoice) {\n  const total = totalOf(invoice.lines);\n  audit(invoice);\n  return db.insert('invoices', { ...invoice, total });\n}",
        "key_lines": [19], "left_out": [[6, 15]]
      }],
      "what": "The store adds up the lines, writes an audit entry, and inserts the invoice with its total.",
      "data": { "in": "The invoice.", "out": "A new row in the invoices table." },
      "notes": [],
      "reasons": [
        { "text": "Totals are kept in cents, so two systems never round differently.",
          "quote": "Totals are stored in cents, never as decimals, so two systems never round the same amount differently.",
          "source": { "kind": "design-doc", "ref": { "path": "design/0002-store-cents.md" } } },
        { "text": "The ticket asks for the total to be saved with the invoice.",
          "quote": "The total must be saved with the invoice",
          "source": { "kind": "ticket", "ref": "LED-42" } }
      ],
      "guesses": [],
      "map_step": { "flow": ["insert"], "focus": ["db"], "recap": true }
    }
  ],
  "map": {
    "style": "studio",
    "nodes": [
      { "id": "client", "kind": "actor", "label": "Billing app", "at": [0, 0] },
      { "id": "api", "kind": "box", "label": "Invoice API", "sub": "src/routes/invoices.js", "at": [1, 0], "code": "src/routes/invoices.js:6-13" },
      { "id": "db", "kind": "db", "label": "Invoices table", "sub": "invoices", "at": [2, 0] }
    ],
    "edges": [
      { "id": "send", "from": "client", "to": "api", "label": "POST /invoices", "inferred": "an HTTP call from outside this repo" },
      { "id": "insert", "from": "api", "to": "db", "label": "insert row", "code": "src/store.js:16-20", "calls": "db.insert(" }
    ],
    "groups": []
  },
  "extend": [{ "stop": "s2", "file": "src/store.js", "lines": [16, 20], "text": "Add a new field to the saved row here; the invoices table needs a column for it too." }],
  "sources": [{ "kind": "ticket", "ref": "LED-42", "fetched": "2026-11-13", "text": "Post an invoice. The total must be saved with the invoice, in cents." }]
}
```

## Top level

- `format`: always `1`.
- `journey`: the plain title: what happens, from the start to the end result.
- `short_name`: a few lower-case words. The files are named from it: `Walkthrough - posting an invoice.md`, `posting-an-invoice.html`.
- `summary`: one sentence, the note's first line.
- `client`: the first repo's folder name in slug form: lower case, and every character that is not `a`–`z` or `0`–`9` becomes `-` (`Demo Shop` gives `demo-shop`). The note writes it unquoted, and the slug form keeps an odd folder name from breaking the note.
- `jira` (optional): the tickets the walkthrough serves.
- `repos`: `{ name, path }` per repo. `name` is the repo's folder name, exactly as on disk, not slugged: the planning look-up matches on it; `path` is its top folder, absolute (a leading `~` is allowed).
- `stops`: in journey order (below).
- `map`: `{ style: "studio", nodes, edges, groups }` (below).
- `extend`: where new behaviour would attach, one entry per place a likely change would go, on every walkthrough: `{ stop, file, lines: [a, b], text }`, with `stop` a stop's `id` and `text` what to add there and what else it would touch.
- `sources` (optional): saved copies of a ticket or a pull request: `{ kind, ref, fetched: "YYYY-MM-DD", text }`, with `ref` in the same form as the reason's and `text` as fetched.

The build fills `built`, `repos[].commit`, `repos[].uncommitted`, `cited_files`, `checks`, `map_tool` and `earlier`. Never write them by hand.

With several repos, every code block, every extend point, and every `design-doc`, `commit`, `pull-request` and `code-comment` ref carries `repo`, a `name` from `repos`. With one repo, leave `repo` out.

## A stop

- `id`: `s1`, `s2`, …, each used once.
- `name`: a short plain title, such as "The store totals and saves it".
- `summary`: one sentence for the outline.
- `code`: one or more code blocks (below).
- `what`: what the code does, in plain words.
- `data`: `{ in, out }`: what goes in and what comes out.
- `notes`: short notes on syntax a reader may not know; may be empty.
- `reasons`: the Why list, at least one entry (below).
- `guesses`: plain sentences no source states; may be empty. Never in `reasons`.
- `map_step`: this stop's step on the map (below).

## Code blocks

- `file`: the path exactly as git names it: from the repo root, exact letter case, no `./`, no doubled `/`. The planning look-up matches on these names.
- `lines`: `[a, b]`, counted from 1, with `a` no more than `b`.
- `text`: lines `a` to `b` exactly as on disk, tabs and trailing spaces kept, joined by `\n`, minus the `left_out` lines. Copy them from the file with a command, such as `sed -n '3,20p' src/store.js`, never retyped.
- `left_out`: `[[x, y], …]`, inside `a`–`b`: lines dropped from `text`. The page shows "lines x–y left out". Nothing is dropped without being declared here.
- `key_lines`: line numbers inside `a`–`b` to highlight.
- `function`: the function or method the block sits in.

## Reasons

- Recorded: `{ text, quote, source: { kind, ref } }`. `text` gives the reason in plain words; `quote` is the source's own words saying why, which the build looks for; words that only say what the code does are no reason.
- Not recorded: `{ text: "Why …?", source: { kind: "not-recorded" } }`. The text is the question alone and ends with `?`: the build fails one whose text ends with anything else, such as a remark after the question. No quote.
- A quote is word for word, and starts and ends on whole words: a quote cut mid-word fails. The only differences allowed are runs of spaces and line breaks, curly versus straight quote marks, backticks, and `…` to join pieces that appear in that order.

| `kind` | `ref` | The build reads |
|---|---|---|
| `design-doc` | `{ "repo"?, "path" }`, the path from the repo root | the file on disk |
| `commit` | `{ "repo"?, "hash" }`, a real hex hash | the commit message |
| `pull-request` | `{ "repo"?, "number" }`, a whole number, not a string | `gh pr view`, else the saved copy in `sources` |
| `ticket` | `"LED-42"` | the saved copy in `sources`; with no saved copy, the reason fails |
| `code-comment` | `{ "repo"?, "file", "line" }`, `line` a whole number | that one line on disk. For a comment over several lines, quote one line and cite that line |
| `build-note` | an absolute path, with no `~` | the file |
| `not-recorded` | none | nothing |

## Map

`map.nodes`, `map.edges` and `map.groups` are in chalk-talk's own scene format: read the Nodes, Edges, Code, Proof, Groups, Steps, "Layout rules the engine applies" and "Report messages and how to fix them" sections of `<the chalk-talk folder>/references/scene-spec.md`. The build copies them into the map unchanged, and turns each layout error into a `FAIL map layout: …` line: fix it by moving blocks or shortening labels.

- A block: `{ id, kind, label, sub, at: [col, row], code: "file:a-b" }`. About 12 blocks at most.
- An arrow: `{ id, from, to, label, code: "file:a-b", calls: "text found in those lines" }`, or `inferred: "why no line can be cited"` in place of `code` and `calls`. An arrow with neither fails the build.
- `code` paths are from the repo root. With several repos, `code` is `{ repo, file, lines: [a, b] }`; the plain `"file:a-b"` form is refused.
- `map_step`: one chalk-talk step per stop, and no extra steps. Use `focus`, `flow`, `show`, `active` and `notes`. Its title is the stop's name unless it sets `title`. The build blanks `say`, because the stop card carries the words. Only the last stop, the end result, sets `recap: true`.
