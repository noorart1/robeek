# CLAUDE.md

Guidance for Claude Code (and new developers) working in this repository.

## What this is

An Arabic-language administration system for **Robeek (روبيك للتعليم المبكر)**,
an early-learning centre in Kufa/Najaf, Iraq: children, parents, sections
(morning/evening shifts × sections A–F), fees and payments in Iraqi dinars,
and school-bus lines. Single admin-facing dashboard, no public-facing pages
beyond login.

**Stack:** Next.js 15 (App Router) · React 19 · Prisma 6 · MySQL · bcryptjs.
Custom `server.js` entry point, not `next start`.

## Language

Two different languages are in play — do not mix them up:

- **The application UI is Arabic**, rendered `dir="rtl"`. All labels, buttons,
  and error messages in components are Arabic.
- **The repository owner communicates in Persian (Farsi)**, with English
  technical terms mixed in.

Code, comments, and commit messages are English.

## Critical: `node_modules` is a tracked symlink

`node_modules` is committed to git as a **symlink** (mode `120000`) pointing at
the production host's Node environment directory. The real dependencies live
there, installed by the host's Node version manager.

On Windows that symlink cannot be materialised, so `git status` permanently
reports `deleted: node_modules`. **This is not a real change.**

> Never run `git add -A` or `git commit -a` in this repo. Stage files by name.

Committing that deletion and pulling it on the server would remove the symlink
and leave production with no dependencies.

A proper fix, if ever wanted: `git rm --cached node_modules`, add it to
`.gitignore`, and leave the symlink untracked on the server.

### Setting up a fresh clone on Windows

Git on Windows defaults to `core.symlinks=false`, so cloning writes
`node_modules` as a small **text file** containing the symlink target rather
than a directory. `npm install` then fails or behaves strangely. Delete it
first:

```
rm -f node_modules && npm install
```

`.env` is gitignored, so a fresh clone has no database configuration — copy it
across separately.

## Deployment

Production is **cPanel / CloudLinux shared hosting**, not a plain VPS. Three
things that trip people up:

1. Node is not the system Node. Activate the host's Node environment
   (`source <nodevenv>/bin/activate`) before any `npm` command.
2. The app runs under Passenger (`lsnode`). Restart it by touching
   `tmp/restart.txt` — **not** `pm2`, **not** `systemctl`.
3. Runtime errors go to `stderr.log` in the app root.

The same cPanel account also serves a WordPress site and a Laravel app. Only
touch this app's own directory.

Deploy sequence:

```
cp -a .next .next.rollback     # next build overwrites .next in place, on a live site
git pull --ff-only origin main
source <nodevenv>/bin/activate && npm run build
touch tmp/restart.txt
```

Verify before walking away: curl the routes, confirm `stderr.log` did not grow,
and check that `.next/BUILD_ID` actually changed. Remove `.next.rollback` once
satisfied.

### Schema changes

The project does not use `prisma migrate`. Schema changes are hand-written
SQL in `prisma/manual-migrations/` (tracked despite the `*.sql` ignore rule),
applied once per database after a backup, with `schema.prisma` edited to
match. **`npm run build` does not run `prisma generate`** — after pulling a
schema change, run it explicitly, or the server keeps the old client and
every new field fails at runtime:

```
mysqldump <db> > ~/backups/before-<migration>.sql
mysql <db> < prisma/manual-migrations/<file>.sql
npx prisma generate
npm run build
```

To confirm `schema.prisma` matches a database, diff it against
`npx prisma db pull --print` (ignore table-name case on Windows).

### Importing the Robeek workbook

The school keeps its enrollment list in Excel (`*.xlsx`, gitignored — it holds
children's personal data). Two steps, both re-runnable:

```
python scripts/robeek-xlsx-to-json.py robeek_students_data.xlsx /tmp/robeek.json
node scripts/import-robeek.js /tmp/robeek.json            # dry run: report only
node scripts/import-robeek.js /tmp/robeek.json --replace  # wipes and imports
```

`--replace` deletes every student, parent, enrollment, payment, class,
academic year and transport line first, and refuses to run while any student
has a photo. The importer never silently corrects data: incomplete phones,
possible duplicates and missing fees go into `Student.reviewNote`, shown in
the table as ⚠ with a "needs review" filter. Delete the JSON afterwards.

Host address, SSH user, and concrete paths live in **`CLAUDE.local.md`**, which
is gitignored. Credentials — the SSH key and the database password — live in
neither file: use a password manager, and keep `.env` gitignored.

## Gotchas

- **`stderr.log` is append-only and never rotated.** Errors in it are often
  stale. Always compare its mtime against `.next/BUILD_ID` before concluding
  something is broken in the current build.
- **Building on Windows emits a Prisma engine error** for `/dashboard`
  (`binaryTargets` is `debian-openssl-3.0.x`). Harmless locally — that route is
  dynamic and the server build is unaffected. Do not "fix" it by editing
  `binaryTargets` unless local DB access is genuinely needed.
- `.env` is gitignored and has never been committed. Keep it that way.
- Several `*.backup.js` files and `*.before-*-fix.js` files sit beside their
  originals as manual snapshots. They are untracked scratch, not live code.
- **`updatedAt` has no `@updatedAt` in the schema** (it was introspected with
  `prisma db pull`), so Prisma never fills it in. Every `create` and every
  `update` of a model with that column must set `updatedAt: new Date()`
  explicitly — omitting it on create throws, and omitting it on update
  silently breaks the 409 conflict check.
- **Student photos are files in `uploads/students/`**, not database rows. The
  directory is gitignored, sits outside `public/`, and is served only through
  the authenticated `/api/students/[id]/photo` route; the `photo` column holds
  just the file name. Back it up together with the database — a DB dump alone
  loses every photo — and never move it under `public/`.

## Table UI conventions (`components/`)

The students table is dense by design — an operator scans many rows at once.
Two rules follow from that, both learned by fixing the opposite:

- **One student = one row.** Cells must not render multi-line blocks by
  default. `ParentLinkCell` shows a one-line name/phone summary and reveals its
  editable fields only when expanded.
- **Cells cap their width and ellipsize.** `address` and `notes` accept up to
  500 characters; without a cap a single long value stretches its column past
  the viewport. Full text goes in a `title` tooltip and remains editable on
  click. Widths live in `EditableCell.js`.

Editing is inline and optimistic-free: each cell PATCHes a single field and
sends the row's `updatedAt` for conflict detection (HTTP 409 →
`EDIT_CONFLICT`). The table polls every 10s but pauses while any cell is being
edited — preserve that behaviour when touching `StudentsTable.js`.

- **Enter saves, Escape cancels** in every editor; Shift+Enter is a new line
  in `address`/`notes`.
- The first two columns (row number, and photo + name) are pinned with
  `position: sticky`; their widths are constants in `StudentsTable.js`, and
  the second column's `right` offset depends on the first.
- Names are edited in `StudentDialog` (click the name), which edits every
  field at once by PATCHing `{ fields: {...}, updatedAt }`. The server
  validates each field with the same `validateField` as single-cell edits and
  saves all of them in one conditional update.
- Names are Iraqi triple names: `firstName` + `fatherName` +
  `grandfatherName`, with `lastName` (laqab) optional. Always display them
  with `fullName()` from `lib/labels.js`. Parent names are optional too
  (mothers are often known by phone only) — use `parentName()`.
- Money columns (fee, paid, remaining, curriculum) are read-only in the table
  and come from `formatStudent` in `lib/student-data.js`: `totalPaid` counts
  TUITION payments only, CURRICULUM payments are reported separately.
  Section, fee and attendance type are edited in the dialog, which saves them
  through `PUT /api/students/[id]/enrollment`.
- **Attendance** (`/dashboard/attendance`, `components/AttendanceBoard.js`)
  stores one `Attendance` row per child per day: PRESENT / ABSENT / LATE /
  EXCUSED, or no row for "not recorded". Days are `YYYY-MM-DD` strings from
  `lib/dates.js`; "today" is always `iraqToday()` (Asia/Baghdad), never the
  server clock, and the school week is Sunday–Thursday.
- Search goes through `matchesSearch` in `lib/arabic.js`, which folds
  أ/إ/آ→ا, ة→ه, ى/ی→ي, tashkeel, and Arabic-Indic digits. Use it for any new
  search box.
