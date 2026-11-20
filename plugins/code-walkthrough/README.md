# code-walkthrough

Walks through one journey in real code, start to finish, stop by stop. Each stop shows the actual
lines, what they do, the data in and out, and why. It also names where the code would be extended.

Every reason is quoted from its source (a design doc, a commit, a pull request, a ticket, a code
comment) or marked "not recorded", with the question to ask the team. A guess is never shown as a
reason.

## Install

```sh
/plugin install code-walkthrough
```

## Needs

- Node (tested on 24) and git.
- Optional: `gh`, to read pull requests for reasons.
- Optional: [chalk-talk](https://github.com/oztrkemree/chalk-talk) (MIT) to draw a map of the
  journey. Place it in `~/.claude/skills/chalk-talk` or in a project's `.claude/skills/chalk-talk`.
  Without it, the page builds with no map.

Tested on macOS and Linux. Not tested on Windows.

## Use

Ask in plain language: "code walkthrough of the checkout flow", "I need to be able to explain the
booking save path". When you start planning a change to existing code, the skill looks for a
walkthrough that covers it, or offers one.

Before it builds, it asks one question: the journey, the number of stops and the time (about 2
minutes a stop). It builds only on a yes. It only reads your repos: no checkout, no stash, no
commits.

## Output

Three files in `~/code-walkthroughs/pages`: a page, its data file and a short note. Read the HTML
page. The note is a short index the skill's lookup step reads, so it uses `[[name]]` link marks.

Set `CODE_WALKTHROUGH_HOME` to move the parent folder. It must not sit inside a git repo; the skill
refuses to build there. The build's own messages call this parent folder "the vault".

**Share with care.** The page holds your code and local file paths.
