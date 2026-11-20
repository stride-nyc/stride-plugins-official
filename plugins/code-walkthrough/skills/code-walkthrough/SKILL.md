---
name: code-walkthrough
description: Walk through one journey in real code so the user can explain and extend it. Each stop shows the actual lines and why, every reason quoted from its source or marked not recorded. One page in your walkthroughs folder plus a short note. When the user plans to change or add to existing code ("let's plan X", picking up a ticket), use it at the start, alongside brainstorming or plan mode; it points to a walkthrough or offers one, and builds only on a yes. Also use whenever the user says "code walkthrough of X", "deep walkthrough of X", "I need to be able to explain X", "help me understand X well enough to extend it", "how was X built, so we can extend it", or "prep me to explain X in refinement" with a feature or code named. Not for "prep me for refinement" with nothing named. An unrecorded reason said as fact is worse than none.
---

# Code walkthrough

A walkthrough follows one journey through real code, start to finish, following the data: each stop shows the actual lines, what they do, data in and out, and why, and the walkthrough names where the code would be extended. It ends as three files in the walkthroughs folder (step 1 of A run), written by the build: a page, its data file and a short note. The page is for the user's own reading; the note is a short index the planning look-up reads.

- Output goes only to the walkthroughs folder: never into a code repo or onto an outside service, even when the user mentions a handy place such as a folder in the repo. Asked outright for another place, say once, in the cost message, that the page holds code and local paths, then build to the walkthroughs folder. A copy elsewhere is the user's to make.
- Read only on code repos: every git command runs as `GIT_OPTIONAL_LOCKS=0 git …`. No checkout, no stash, no `git worktree add`. `gh` and Jira are read only.
- In a walkthrough, chalk-talk only draws the map, and the build runs it. Do not follow chalk-talk's own skill, never write a `chalk-talks/` folder, and never edit chalk-talk or copy it into this plugin.
- The commands are `node "<this skill's folder>/scripts/walkthrough-build.mjs"` and `node "<this skill's folder>/scripts/walkthrough-look.mjs"`.

What was asked decides where to start:
- To understand, explain or extend a feature or a path through code, in any of the description's phrases: A run, which starts with the cost question.
- Planning a change to a code repo: Planning: the offer, ahead of the planning skill's own steps.
- A single "why" about one choice in the code (one value, one rule, one call): answer it in chat by the rule in Reasons, from the places it lists. No run, no file.

## Planning: the offer

When the user starts planning a change to a code repo (brainstorming a feature, plan mode, "let's plan X", picking up a ticket), add one step before any plan is written. It replaces and reorders nothing in brainstorming, writing plans or any planning skill.

Skip the step, and say nothing about walkthroughs, for:
- an area the user declined in this conversation (the area is the change being planned and every follow-up to it);
- a walkthrough run under way.

A walkthrough the user asks for outright is a run all the same.

Otherwise look first, whatever the size of the change, once per repo the change touches, with the parent folder found as in step 1 of A run. The look-up only reads: it makes nothing, and with no parent folder yet it prints `none`.

```
node "<this skill's folder>/scripts/walkthrough-look.mjs" --vault "<parent>" --folder pages --repo "<repo folder name>" --repo-path "<repo top folder>" [--file <path from the repo top>]...
```

`--repo` is the repo's folder name, exactly as on disk. `--repo-path` is its top folder (`git rev-parse --show-toplevel`). It prints `none`, or one line per walkthrough of that repo, newest first. Each line starts with `[[<note name>]]`: the note is `<parent>/pages/<note name>.md`, and its page is the `.html` file the note links to, in the same folder. Name a walkthrough to the user by its page's full path, never in the `[[…]]` form. Give one `--file` per file the change will touch, when you know them: it then prints only the walkthroughs that cite one of them. Without `--file`, for each line, open the data file beside the note (its page's name with `.html` swapped for `.walkthrough.json`): the walkthrough covers the change when its `cited_files` include files the change will touch.

- **One covers it.** Say so in one line: the page's path, its commit, its date, and how its look line ends. Read the note's outline and the stops that matter in the data file. Say which stops and extend points the change touches ("stop 4", "`src/billing/Invoice.java:40-58`"), and cite them in the plan.
- **It covers it, but its line ends otherwise** (`N of M cited files changed since`, `its commit is no longer in the repo`, `its commit was not recorded`, `its cited files could not be checked`): do all of the above, then say what the line said and offer a rebuild with the time: "Rebuild it first? About <2 × its stops> minutes." Yes: A rebuild (end of A run); the yes answers the cost question. No: plan with it as it is. A rebuild is never offered as a new walkthrough.
- **None covers it, and the change is brand-new code with nothing existing to walk through, or adds no behaviour** (a reworded comment, a renamed variable, new wording for a label). A new rule, check or branch adds behaviour, however few lines it takes, because it has to fit the code around it. In these two cases make no offer and say nothing about walkthroughs, not even why there is none; go straight to planning.
- **None covers it, for any other change.** Offer one in a single line with the time, then wait for the answer before any plan: "No walkthrough covers the booking save path yet. Want one before we plan? About <2 × N stops> minutes."
  - Yes: A run, the journey being the path the change will touch. The yes answers the cost question, so step 4 only confirms the journey. Then planning resumes with the walkthrough to hand.
  - No: plan on, with no further offer or mention of one for that area in this conversation.

The time is about 2 minutes a stop, from a rough count of the stops. Never start a run without a yes.

## A run

1. **Walkthroughs folder.** The parent folder is `${CODE_WALKTHROUGH_HOME:-~/code-walkthroughs}` and the walkthroughs go in its subfolder `pages`. There is no config file and nothing to ask. Find the parent once, in the shell, and use the printed path as it is (a quoted `~` is not expanded, so the command uses `$HOME`):

   ```
   echo "${CODE_WALKTHROUGH_HOME:-$HOME/code-walkthroughs}"
   ```

   Then, before anything else, make sure the parent is not inside a git repo. It may not exist yet, so check its nearest folder that does exist:

   ```
   d="<parent>"; while [ ! -d "$d" ]; do d="$(dirname "$d")"; done; GIT_OPTIONAL_LOCKS=0 git -C "$d" rev-parse --show-toplevel
   ```

   It prints a folder and exits 0: refuse. Say the walkthroughs folder `<parent>` is inside a git repo, `<the folder it printed>`, so the page would land in a code repo, and that setting `CODE_WALKTHROUGH_HOME` to a folder outside any repo fixes it. Then stop: no trace, no cost question. It fails ("not a git repository"): carry on. Make nothing now; the parent is made only after the yes, in Build and check.
2. **chalk-talk.** Look for `~/.claude/skills/chalk-talk/scripts/build.mjs`, then for `.claude/skills/chalk-talk/scripts/build.mjs` in the current project. Pass the folder that holds `scripts/`, such as `~/.claude/skills/chalk-talk`, as `--chalk`. Found in neither place: `--chalk none`.
3. **Pin the journey.** Find the repo or repos and the entry point, name the start and the end result, and sketch the stops. Read only enough to sketch. One journey per walkthrough: one start, one end result, about 8–14 stops. A request that names several journeys (creating, editing and deleting an order), or a sketch over 14 stops: pick the first for this run and list the rest as next. Note each repo's commit (`GIT_OPTIONAL_LOCKS=0 git -C <repo> rev-parse --short=7 HEAD`) and which files on the journey have uncommitted changes or are ignored (`GIT_OPTIONAL_LOCKS=0 git -C <repo> status --porcelain --ignored`). Never ask the user to commit or revert first, and never stop over uncommitted changes.
4. **State the cost and ask once**, in one message. Leave out the lines that do not apply:

   ```
   Walkthrough of <journey>: from <start> to <end result>.
   <repo> at commit <abc1234>.
   About <N> stops, about <2 × N> minutes. Map: <yes, drawn with chalk-talk | no, chalk-talk is not installed>.
   Uncommitted changes in `<path from the repo root>`: the walkthrough covers it as it is on disk now.
   It goes to the walkthroughs folder, `<parent>/pages`, not `<the place asked for>`: the page holds code and local paths.
   This run covers <the first journey>. Next, one walkthrough each: <the others>.
   Go ahead?
   ```

   Give the commit line once per repo. Nothing is written before the yes: no walkthroughs folder, no working folder, no data file.
5. **Trace, following the data.** For each stop: the code blocks exactly as on disk, its key lines, what it does, data in and out, and short notes on syntax a reader may not know. Then where the code would be extended: for each place a likely change would go, the file and lines, what to add there, and its stop.
6. **Find the reasons**, by Reasons.
7. **Write the data file**, with its stops and its extend points. Read `references/data-file.md` first. Its `client` is the first repo's folder name in slug form: lower case, and every character that is not `a`–`z` or `0`–`9` becomes `-` (`Demo Shop` gives `demo-shop`). Only `client` is slugged: `repos[].name` stays the folder name exactly as on disk. Find the working folder once, in the shell: `echo "${TMPDIR:-/tmp}/code-walkthrough/<slug>"` (`<slug>`: the short name in lower case, words joined by `-`). Use the printed path as it is for the data file (`<working folder>/<slug>.walkthrough.json`), for `--out`, and for any helper script you write; outside the walkthroughs folder, a run makes nothing anywhere else. The build refuses a working folder under a repo or the walkthroughs folder.
8. **Build, check and write**, by Build and check.
9. **Reply**, by Reply.

**A rebuild** of a walkthrough already in the walkthroughs folder runs the same steps from a copy. Copy its `.walkthrough.json` into the working folder. Keep its `short_name` and `journey`: the build finds the earlier note by that name and links it. Set each `repos[].path` to the repo's top folder, then re-trace the stops whose files changed, with their reasons and extend points. A yes to a rebuild offer answers the cost question.

## Reasons

Code holds no "why". The rule is firm, and it is the user's:
- A recorded reason quotes its source word for word, names included, and says which source.
- When no source states the reason, the entry is "not recorded" and holds only the question: "Why are logs kept 14 days?"
- A plausible guess goes only in the stop's `guesses`, shown apart and marked Guess, never in the Why list.

Every choice at a stop that a teammate could ask about (a limit, a timeout, a rule, the order of calls) gets a Why entry, recorded or not recorded. A source counts only when it is about this code (this repo, its tickets, this feature) and says why the code is the way it is. A line that says what the code does is not a reason, whatever kind of source it is in.

Look in these places, in this order, and cite every one that states a reason, in this order:
1. **Design docs in the repo:** specs, plans, ADRs and README sections.
2. **Commits, pull requests, and the Jira tickets they name:** `git log`, `git blame`, `gh pr view`. Jira is read only. The build reads a ticket only from its saved copy in the data file's `sources`, so keep one for every ticket you cite.
3. **Comments in the code.**
4. **Build notes** left by AI coding sessions in the repo or its worktrees, such as `.superpowers/sdd/<plan>/task-N-report.md`, cited by file.

Outside docs, such as a framework's documentation, may back a fact in "What it does" by name; they are never a reason. The search per stop may go to cheaper subagents (`haiku`); they return quotes with their sources, never reasons in their own words.

## Build and check

The yes has been given by now, so first make the parent folder; the build makes `pages`:

```
mkdir -p "<parent>"
node "<this skill's folder>/scripts/walkthrough-build.mjs" "<working folder>/<slug>.walkthrough.json" --out "<working folder>" --vault "<parent>" --folder pages --chalk <chalk-talk folder | none> --write
```

The build's own messages call the walkthroughs parent folder "the vault"; in what you tell the user, call it the walkthroughs folder.

Nothing reaches the walkthroughs folder unless every check passes, so build with `--write` from the first round. Exit codes:
- **0**: every check passed. It printed the reply lines (`Code:`, `Reasons:`, `Map:`, a second `Map:` line when Chrome is missing, and the numbered not-recorded questions), then one `WROTE <path>` per file.
- **1**: a check or a shape rule failed. Each `FAIL <where>: <why>` line says where (a stop, a reason, the map, the walkthrough) and what is wrong. Nothing reached the walkthroughs folder; after a check failure, the data file holds the build's own fields. Shape failures print alone, before any other check: fix them all, and count that as a round.
- **2**: the message says what: a bad argument, a refused place, or a data file the build cannot use (such as one with no `client`). Fix that; it is not a check round.
- **3**: `SAME DAY <names>`: this journey was already built today. Ask "Replace today's walkthrough, or keep both?" and rerun with `--same-day replace` or `--same-day keep`.

The build writes what it learns back into the data file (`built`, the commits, the uncommitted files, `cited_files`, `checks`, `map_tool`, `earlier`). Never write those by hand.

**Fix the data, never the check.** This holds for any walkthrough build that fails, whoever started it and whatever its command: fix the data file it names, and never drop a check by changing a flag such as `--chalk`. Fixing a data file that already exists needs no cost question.
- Code differs from the file: re-read the lines and copy them again. Lines dropped from `text` are declared in `left_out`.
- Quote not found: copy it again from the source, or make the entry not recorded, with its question.
- Broken map arrow: cite the right lines, or mark the arrow `inferred` with the reason.
- `FAIL map layout: …`: move a block to a free cell or shorten a label, as the line says. Never drop the map with `--chalk none`.

At most three rounds. Still failing: stop, deliver nothing, and say in plain words what still fails.

## Reply

Short, and never a retelling of the walkthrough. Leave out the lines that do not apply:

```
<the page's full path>: <N> stops, <R> reasons recorded, <Q> not recorded.
<the build's Code: line, as printed>
<the build's Reasons: line, as printed>
<the build's Map: line or lines, as printed>
Built from commit <abc1234>, with `<uncommitted path>` as it is on disk.
Next journey: <the next one step 3 listed>. Want it? About <2 × its stops> minutes.
Not recorded, questions for the team:
<the build's numbered questions, as printed>
```

The first line starts with the page's full path: the `WROTE` line that ends in `.html`, as printed. Nothing comes before it, not even a note on what a check round fixed. The `Next journey:` line goes in only when step 3 split the request; otherwise offer no other walkthrough. When chalk-talk was not found, the build's `Map:` line says the map was not built and that chalk-talk is at github.com/oztrkemree/chalk-talk; give it as printed. `<R>` and `<Q>` are the note's `reasons_recorded` and `reasons_not_recorded`, and the list holds every not-recorded question, in stop order. The uncommitted paths in the `Built from commit` line are the data file's `repos[].uncommitted` after the build. The build's three files are the run's only writes outside the working folder: no other file, no other note.

## Common mistakes

| Shortcut | Why it fails |
|---|---|
| "I skipped the animated chalk-talk page because you asked for something in `docs/`. I can build it from the same trace if you want it." | A folder the user mentions is not where a walkthrough goes: the page holds code and local paths. The build writes the page, its data file and the note to the walkthroughs folder |
| Starting the trace before asking "Go ahead?" | The user has not agreed to the time it takes. Ask "Go ahead?" first; the yes starts the trace |
| Loosening a check, editing a script, or shortening code without declaring `left_out` | The page then shows code that is not the file, or a reason nobody recorded. Fix the data |
| A guess in the Why list | The user repeats it in refinement as fact. It goes in `guesses`, marked Guess |
| A second planning offer after a no | One offer per area per conversation. After a no, plan, and mention no walkthrough unless the user asks for one |
