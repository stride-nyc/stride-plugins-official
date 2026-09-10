# spec-writer

Writes engineering specs in Stride's spec-driven-development format — numbered sections, citable
requirement IDs (`AUTH-1`, `MEM-4`), RFC 2119 keywords, constraints, contracts, error semantics,
security invariants, and an open-decisions register.

Also reviews/grades an existing spec against the standard, and turns notes, a Slack thread, or a
meeting transcript into a spec.

## Install

```sh
/plugin install spec-writer
```

## Use

Ask for a spec in plain language ("spec out the file-scan flow", "review this design doc"), or invoke
the skill directly with `/spec-writer`.

Publishes to Notion when the Notion connector is available; otherwise writes a Markdown file that
pastes cleanly into Notion. `scripts/lint_spec.py` (Python 3.8+, no dependencies) checks a spec
against the format.
