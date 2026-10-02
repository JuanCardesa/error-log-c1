<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/wordmark-dark.png">
    <img src="docs/media/wordmark-light.png" alt="Error Log C1" width="440">
  </picture>
</p>

<h3 align="center">Turn your mistakes into your next study step.</h3>

<p align="center">
  A study log for Cambridge C1 Advanced that runs on your own computer.<br>
  Record what you got wrong and why, see where your mistakes cluster,
  and get one clear priority for the week.
</p>

<p align="center">
  <a href="https://github.com/JuanCardesa/error-log-c1/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/JuanCardesa/error-log-c1/ci.yml?branch=main&amp;label=CI" alt="CI status"></a>
  <a href="https://github.com/JuanCardesa/error-log-c1/releases/latest"><img src="https://img.shields.io/github/v/release/JuanCardesa/error-log-c1?label=release&amp;color=304F46" alt="Latest release"></a>
  <a href=".nvmrc"><img src="https://img.shields.io/badge/node-22-304F46" alt="Node.js 22"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-304F46" alt="MIT license"></a>
</p>

<p align="center">
  <a href="https://github.com/user-attachments/assets/b191da2c-9ab6-449a-b76e-7a7fbf8353ad"><img src="docs/media/demo-thumbnail.webp" alt="Demo video. The frame shows a pasted batch under review: the answer 'made' is corrected to 'carried out', with its category, cause, confidence and rule." width="880"></a>
</p>

<p align="center">
  <a href="https://github.com/user-attachments/assets/b191da2c-9ab6-449a-b76e-7a7fbf8353ad"><b>Watch the demo</b></a> (1:51, English captions)
  &nbsp;·&nbsp;
  <a href="https://github.com/user-attachments/assets/21fa4430-f354-4717-bb94-1bca991c61b5">Spanish captions</a>
  <br>
  <sub>No voice-over. All data is invented. The interface is in Spanish.</sub>
</p>

## Why

Most practice ends the same way: you check the answers, count the mistakes and move on.
Two weeks later the same mistake is back, and its correction is lost somewhere in a workbook.

A score tells you *that* you got something wrong. It doesn't tell you:

- what you keep getting wrong;
- whether you didn't know it, mixed it up or simply didn't check;
- whether it's a pattern or a one-off;
- what deserves your time this week.

Error Log C1 keeps the answers. Every mistake is saved with its context and its cause.
Every session counts towards the totals, even one without mistakes, so the rates stay honest.
Over a few weeks, that history turns into one concrete next step.

**The cause changes the fix.** Not knowing a collocation and not rereading your answer look
the same on a marked page. The first one you study; the second one you solve with better
exam technique.

## How it works

1. **Practise.** Do a C1 task as usual: a Reading and Use of English part, a Listening part,
   a Writing task or a coursebook exercise.
2. **Log the session.** Note how many items you attempted and got right, then paste the
   corrected mistakes in one go or type them in.
3. **Classify each mistake.** Keep your answer, the correction and the rule in your own
   words, plus a category, a cause and how sure you were.
4. **Read the patterns.** See which categories you miss most per 100 items, which causes
   dominate, and how your Reading and Use of English accuracy moves by part and week.
5. **Get one priority.** Seven rules choose a single action for the week and show the
   numbers behind it. Rules based on percentages wait until there are at least 15 mistakes.
6. **Close the loop.** Turn the mistakes you can fix by studying into Anki cards, link them
   to your notes, and go back to practice.

## What you can do

### Log a session without retyping it

Paste a whole session with up to 300 mistakes as JSON, or copy rows straight from a
spreadsheet. A review screen walks you through every mistake before anything is saved. The
batch is written in a single transaction, and saving it twice doesn't duplicate it. You can
also log mistakes one at a time from the keyboard.

Corrections on paper or in screenshots? **Prepare corrections with AI**
(*Preparar correcciones con IA*) copies a ready-made prompt for the AI tool of your choice.
You paste its JSON back and review it like any other batch. Error Log C1 itself never
contacts an AI service.

### See why, not just what

Each mistake gets one of [six causes](#a-mistake-as-data), one of 14 categories
(collocation, phrasal verb, word formation, dependent preposition…) and a confidence level:
sure, unsure or guessed. Mistakes you were *sure* about get their own list,
**false certainties**: beliefs to correct rather than gaps to fill.

### One priority, not a dashboard

**Progress** opens with a single recommendation for the week and the figures that
triggered it. The seven rules run in a fixed order of priority, so two conflicting actions
are never active at the same time. Underneath you'll find mistakes per 100 items by
category, causes split into studying and exam technique, and a part-by-week accuracy grid
for Reading and Use of English, over the last 30 or 60 days. Writing tasks keep their four
assessment bands, and the app checks how many mistakes come back in the rewrite.

### Notes next to your mistakes

**Notebook** keeps your study notes in Markdown, organised in folders and tags, with a
contents list for each note and full-text search with snippets. Link a mistake to a note,
or to one section of it, and the note lists every mistake connected to it. On a computer,
select text to highlight it or mark it in one of four ink colours; the marks are stored
separately from the Markdown. Notes save automatically, unsaved drafts can be recovered,
and notes can be imported and exported as `.md` files, or the whole notebook as a ZIP.

### Spaced review with Anki

Mistakes you can fix by studying become Anki cards in one click through AnkiConnect, with
the question, your answer and the rule. A mistake only counts as converted once its card
has been verified in Anki. Syncing brings your review history back, with failed reviews
grouped by category. If Anki is closed, everything else keeps working.

### Find anything, keep everything

**Errors** searches every answer, prompt and rule, and <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>
finds mistakes, sessions and notes from any page. Export tables as CSV, all your data as
JSON and the notebook as a ZIP, or take a verified SQLite backup from the command line.

## Product tour

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/informe.png" alt="Progress screen: the main recommendation for the week, mistakes by category per 100 items and a bar chart of causes">
      <br><b>Progress</b> · one priority for the week, with the numbers behind it
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/errores.png" alt="Errors screen: a searchable table with each correction, its context, its session and its Anki status">
      <br><b>Errors</b> · every mistake with its context, ready to search
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/notebook-lector.png" alt="Notebook reader: a grammar note with folders on the left, a table of contents on the right and related mistakes below">
      <br><b>Notebook</b> · a note with the mistakes linked to it
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/anki.png" alt="Anki screen: the queue of pending mistakes and a card preview with the answer, the correction and the rule">
      <br><b>Anki</b> · pending cards, each with the rule on its back
    </td>
  </tr>
</table>

<sub>Screens from the demo, with invented data. Step by step: [the five-step walkthrough](docs/DEMO.md).</sub>

## A mistake, as data

Every mistake belongs to a session, and the session holds the denominator: how many items
you attempted and how many you got right. This is the batch format the app imports, shown
with a single mistake:

```json
{
  "session": {
    "date": "2026-10-01", "kind": "DRILL", "paper": "RUOE", "part": 1,
    "source": "ONLINE", "sourceRef": "Urban gardens · collocations",
    "itemsTotal": 8, "itemsCorrect": 5, "timed": false
  },
  "errors": [{
    "itemRef": "1",
    "prompt": "The students ___ research into urban gardens. (A made / B carried out / C held / D raised)",
    "myAnswer": "made", "correctAnswer": "carried out",
    "category": "COLOCACION", "cause": "CONFUSION", "confidence": "SEGURO",
    "ruleNote": "Research goes with do, conduct or carry out. 'Make research' isn't natural."
  }]
}
```

The values use the interface's Spanish names. `COLOCACION` is a collocation, `CONFUSION`
means you knew both options but picked the wrong one, and `SEGURO` means you were sure,
which makes this mistake a false certainty. The cause decides what to do about it:

| Cause | What happened | How to fix it | Anki card |
| --- | --- | --- | --- |
| `DESCONOCIMIENTO` | You didn't know it | Study it | Yes |
| `CONFUSION` | You knew it, but picked the wrong one of two | Study it with a contrast card | Yes |
| `ORTOGRAFIA` | You knew the word, but misspelled it | Study it with a spelling card | Yes |
| `DESPISTE` | You knew it, but didn't read or check | Change how you review your answers | No |
| `FORMATO` | You broke a rule of the task | Reread the task instructions | No |
| `TIEMPO` | You ran out of time or rushed | Work on time management | No |

The full data model, the 14 categories and every threshold are in the
[specification](docs/SPEC.md).

## Quick start

You need **Node.js 22** and **pnpm 10**. The repository pins pnpm 10.33.2, and on Node 22
`corepack enable` sets it up for you.

```bash
git clone https://github.com/JuanCardesa/error-log-c1.git
cd error-log-c1
pnpm install --frozen-lockfile
pnpm demo
```

Open **http://127.0.0.1:3001**. The demo starts a fresh database with invented data every
time, separate from your own. Stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd>.

To use it with your own data:

```bash
pnpm db:migrate
pnpm dev
```

Open **http://127.0.0.1:3000**. Everything is stored in `data/errorlog.db`, which Git
ignores. For a production build, run `pnpm build` and then `pnpm start`.

No environment variables are required. Anki is optional: install the AnkiConnect add-on and
keep Anki open while you sync ([setup and settings](docs/ANKI.md)).

<details>
<summary><b>Back up and restore</b></summary>
<br>

```bash
pnpm db:backup                                           # verified copy in data/backups/
pnpm db:restore data/backups/<copy>.db data/restored.db # with the app stopped
```

Backups use SQLite's backup API, so they are safe to take while the app is running, and they
never overwrite an existing file. `pnpm db:migrate` takes one before changing anything and
stops if it fails. Restoring always writes to a new file; the
[user guide](docs/GUIDE.md#copias-y-recuperación) explains how to point the app at it.

</details>

## Built with

| Layer | Tools |
| --- | --- |
| App | Next.js 16 (App Router, Server Actions), React 19, TypeScript in strict mode |
| Data | SQLite through better-sqlite3, Drizzle ORM with versioned migrations, Zod |
| Search | SQLite FTS5 trigram indexes for sessions, mistakes and notes |
| Interface | CSS Modules without a component library, self-hosted IBM Plex and Source Serif 4 |
| Notebook | react-markdown with remark-gfm |
| Tests | Vitest with v8 coverage, Playwright on Chromium |
| Integration | AnkiConnect over local HTTP |
| Tooling | pnpm, ESLint, GitHub Actions |

## Engineering

- **A pure core.** The seven queries and the rule engine are pure functions over rows, with
  the clock passed in. SQLite access is kept in `src/lib/db/`.
- **The product is a contract.** Taxonomies and thresholds are closed sets in
  `src/lib/domain/`, written down in the [specification](docs/SPEC.md). A threshold doesn't
  change unless the specification changes first.
- **Validated twice.** Zod checks every input, and CHECK constraints and foreign keys in
  SQLite protect what is stored.
- **Nothing lost by accident.** Batches are saved in one transaction, migrations back up
  existing data first and stop if the backup fails, and deletions ask for confirmation.
- **Honest numbers.** Rates are normalised by items attempted, a week without practice is
  never shown as 0 %, and percentage rules stay silent until the sample is large enough.
- **Tested.** More than 850 Vitest tests, with a 90 % coverage threshold on `src/lib` for
  lines, branches, functions and statements, and more than 140 Playwright end-to-end tests.
  CI runs type checking, linting, coverage, the build and the end-to-end suite on every push
  and pull request to `main` and `develop`.
- **Strict TypeScript.** `any` and `@ts-ignore` are lint errors.

<details>
<summary><b>Development commands</b></summary>
<br>

```bash
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm exec playwright install chromium
ERRORLOG_E2E=1 pnpm test:e2e   # builds into .next-e2e first, as CI does
```

Branches, commits and releases are described in [CONTRIBUTING.md](CONTRIBUTING.md).

</details>

## Privacy

Error Log C1 is local-first.

- Your data is a single SQLite file on your computer. There's no account and no cloud sync.
- The server only listens on `127.0.0.1`. There's no login either, so it isn't meant to be
  exposed to the internet.
- The app doesn't call external services. Its only outgoing connection is to AnkiConnect,
  and it rejects any AnkiConnect address that isn't on your own machine.
- There's no AI built in. If you use the AI prompt, you choose the tool and what you send to
  it, and you review the result before it's saved.
- Notes never load remote images or render embedded HTML, and the fonts ship with the app.
- Unsaved drafts, such as a batch under review or a note being edited, are kept in your
  browser's local storage.
- Next.js collects anonymous usage data from its own command-line tool. You can opt out with
  `pnpm exec next telemetry --disable`.

## Status and scope

Error Log C1 is a personal project under active development. It was built for real C1
preparation, and that's what it's used for.

**What it covers today**

- Sessions record the Cambridge C1 Advanced paper (Reading and Use of English, Listening,
  Writing or Speaking), the part, the type of practice (drill, partial or full mock exam,
  class) and the source. Coursebook exercises that don't follow a Cambridge task can be
  logged without an exam format.
- Reading and Use of English and Writing have their own views. Listening and Speaking
  sessions count in the general reports and rules but don't have a dedicated view.
- Accuracy reflects the answers you record. It isn't an official Cambridge score or a
  prediction of your result.
- The interface is in Spanish. It's a single-user app, designed for a computer and usable
  on a phone.

**Current limits**

- Notes don't support images, attachments or version history, and `.md` files are imported
  one at a time.
- Backups are restored from the command line, not from the interface.

## Documentation

The detailed documents are in Spanish, like the interface.

| Document | What's in it |
| --- | --- |
| [User guide](docs/GUIDE.md) | Everyday use, the notebook in detail, backups and recovery |
| [Specification](docs/SPEC.md) | Data model, taxonomies, queries and decision rules |
| [Anki](docs/ANKI.md) | AnkiConnect setup, settings and limits |
| [Demo](docs/DEMO.md) | Five-step walkthrough, and how the screenshots and videos are made |
| [Contributing](CONTRIBUTING.md) | Branches, commits, checks and releases |
| [Changelog](CHANGELOG.md) | What changed in each version |

## License

[MIT](LICENSE).

Error Log C1 is an independent personal project. It isn't affiliated with, sponsored by or
endorsed by Cambridge University Press & Assessment or any publisher. "Cambridge" and
"C1 Advanced" are trademarks of their respective owners and are used only to name the exam
the tool is designed for. The repository contains no third-party exercises: the demo, the
screenshots and the tests use invented content.
