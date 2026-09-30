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

## `node_modules` on the server is an untracked symlink

On the server, `node_modules` is a **symlink** to the host's Node environment
(`<nodevenv>/lib/node_modules`), where the host's Node version manager installs
the real dependencies. It used to be tracked in git (mode `120000`); since
2026-09-26 it is untracked and ignored (`node_modules` in `.gitignore`, no
trailing slash — `node_modules/` does not match a symlink).

If the symlink ever disappears on the server, the app has no dependencies.
Recreate it with `ln -s <nodevenv>/lib/node_modules node_modules`.

Locally, run `npm install` as usual. `.env` is gitignored, so a fresh clone has no database configuration — copy it
across separately.

## Local testing first

**Every change is tested on a local copy before it is deployed**, and
deployed only when the owner says so. The local copy runs offline against
a portable MariaDB 10.11 (the production version) in `../mariadb`, with
the newest production data:

From the VS Code terminal (PowerShell):

```
scripts\db.cmd                                    # terminal 1: MariaDB
npm.cmd run dev                                   # terminal 2: localhost:3000
npm.cmd test
& "C:\Program Files\Git\bin\bash.exe" scripts/local.sh sync <user>@<host>   # refresh data (online)
```

PowerShell has no `bash` on its PATH, and blocks `npm` (the `npm.ps1`
shim) under the default execution policy; `npm.cmd` avoids that, as does
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. In Git Bash:
`bash scripts/local.sh db`, `npm run dev`.

`.env` on a dev machine points at `school_dev` on `127.0.0.1`; `sync`
refuses to run otherwise. Synced backups sit in `../local-backups`, outside
the repo — they hold children's personal data. Accounts and passwords are
production's, since the data is. A fresh machine needs the MariaDB zip
unpacked to `../mariadb`, `mariadb-install-db.exe --datadir=…/data`, a
`data/my.ini` with `bind-address=127.0.0.1`, and the `.env` database and
user created in it.

## Deployment

Production is **cPanel / CloudLinux shared hosting** behind **LiteSpeed**, not
a plain VPS. Things that trip people up (all learned on the 2026-09-25 deploy):

1. Node is not the system Node. Activate the host's Node environment
   (`source <nodevenv>/bin/activate`) before any `npm` command.
2. The app runs under the CloudLinux Node.js Selector (Passenger). Restart
   with `cloudlinux-selector restart --json --interpreter nodejs --app-root
   school-app`. **Touching `tmp/restart.txt` did not restart it** — the old
   build kept serving. Not `pm2`, not `systemctl`.
3. **The server cannot `git pull`:** the GitHub repo is private and the host
   has no credentials. Ship commits as a git bundle (below), or add a
   read-only GitHub deploy key to the host.
4. LiteSpeed caches responses that allow it. `next.config.js` opts the app
   out (`X-LiteSpeed-Cache-Control: no-cache`); without that, prerendered
   pages (`/`, `/login`) served the previous build after a deploy. Check with
   `curl -sD- -o/dev/null https://…/login | grep -i x-litespeed`.
5. Runtime errors go to `stderr.log` in the app root. The server clock is
   Iraq time (+03), so cron times are Iraq times.
6. Chain remote steps with `set -eo pipefail` — a `git pull | tail` once
   hid a failed pull and the build carried on with the old code. `set -e`
   does not stop at a failed `cmd && echo done` either: write one command
   per line.
7. **`cloudlinux-selector restart` leaves the old `lsnode` process
   running** beside the new one (2026-09-28: five had piled up, some two
   days old, ~60 threads each). CloudLinux counts threads against the
   account's process limit, so `next build` then failed with
   `spawn … node EAGAIN`. After every restart, `ps -u $USER -o
   pid,etime,args | grep lsnode` and kill all but the newest.
8. There is no `~/.my.cnf`: `mysql` needs the credentials from `.env`.
   Pass them in a temporary 0600 `--defaults-extra-file`, never with `-p`
   on the command line (other users on the host can see it in `ps`).

The same cPanel account also serves a WordPress site and a Laravel app (their
cron jobs share the crontab). Only touch this app's own directory, and never
wipe `~/lscache` — it is shared with WordPress.

`scripts/deploy.sh user@host https://public-url` runs the sequence below,
checks the result, and restores the previous build if `next build` fails.
It refuses (before touching the server) when the range adds a migration or
changes `package.json`/`package-lock.json`; deploy those by hand. Run
`npm test` first.

Dependencies are installed on the host, not by deploys. `package-lock.json`
records exactly what is installed there: it was generated on 2026-09-26
from the host's installed tree with the host's plain npm
(`/opt/alt/alt-nodejs24/root/usr/bin/npm i --package-lock-only`; the
activated nodevenv's npm silently wrote nothing). Keep it in step with the
host, and run `npm audit` against it.

Deploy sequence by hand:

```
# local
git bundle create robeek.bundle <server-HEAD>..main
scp robeek.bundle <host>:~/

# server
set -eo pipefail
cd ~/school-app && source <nodevenv>/bin/activate
node scripts/backup.js                 # fresh DB + photo backup first
cp -a .next .next.rollback             # next build overwrites .next in place
git pull --ff-only ~/robeek.bundle main && rm ~/robeek.bundle
# new files in prisma/manual-migrations/? apply them, then:
npx prisma generate
npm run build
cloudlinux-selector restart --json --interpreter nodejs --app-root school-app
```

Verify before walking away: `/login` must be the new build (e.g. `lang="ar"`
and a `content-security-policy` header, no `x-powered-by`), `stderr.log` must
not grow, and `.next/BUILD_ID` must have changed. Remove `.next.rollback` once
satisfied. To roll back: restore `.next.rollback`, `git reset --hard` to the
previous commit, and restore the DB dump if a migration ran.

### Backups

`scripts/backup.js` (logic in `lib/backup.js`) writes `db-<date>.sql.gz`
(mysqldump) and `photos-<date>.tar.gz` (`uploads/students/`) to
`~/backups/school-app/`, outside the app and `public_html` (the files hold
children's personal data), and deletes backups older than 30 days. It is
meant to run nightly from a cPanel cron job; the exact line is in the
script's header. The DB password reaches mysqldump through a temporary 0600
option file, never argv.

Check it occasionally: `tail ~/backups/school-app/backup.log` must show a
`database →` line for every night, and never `BACKUP FAILED`.

Admins can do the same from «النسخ الاحتياطي» (`/dashboard/backups`): make
a backup now, download any backup, upload one (e.g. after losing the
server) and restore it. Every restore first saves the current state as a
`-pre-restore` backup. Uploads are named by content, never by the
uploader's file name; photo archives may only hold `students/<photo>.jpg`
entries; SQL is piped into `mysql --sandbox`, which refuses `\!` and other
client commands. Restoring the database also restores its `Session` and
`Sequence` tables: users may be signed out, and receipt numbers issued
after the backup will be issued again.

Restore by hand (take a fresh backup of the current state first):

```
gunzip -c ~/backups/school-app/db-<date>.sql.gz | mysql <db>
tar -xzf ~/backups/school-app/photos-<date>.tar.gz -C ~/school-app/uploads/
```

Test it by restoring into a scratch database and comparing row counts —
verified that way on 2026-09-25, including Arabic text and payment totals.

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

### Importing the accounts workbook

`RubikAccountsFile.xlsx` (the summer 2026 accounts, gitignored) goes into
the `Expense` ledger, `Staff` and `Salary`. Run it once per database, after
the `staff` and `expenses` migrations:

```
python scripts/accounts-xlsx-to-sql.py RubikAccountsFile.xlsx /tmp/accounts.sql
mysql --default-character-set=utf8mb4 <db> < /tmp/accounts.sql && rm /tmp/accounts.sql
```

It inserts nothing while `Expense` or `Salary` has rows (`--replace`
empties both first, manual entries included). Excel stored many dates
with day and month swapped; the script resolves them from neighbouring
rows and marks every guess with ⚠ in the row's notes and in its report.

Host address, SSH user, and concrete paths live in **`CLAUDE.local.md`**, which
is gitignored. Credentials — the SSH key and the database password — live in
neither file: use a password manager, and keep `.env` gitignored.

## Gotchas

- **`stderr.log` is append-only and never rotated.** Errors in it are often
  stale. Always compare its mtime against `.next/BUILD_ID` before concluding
  something is broken in the current build.
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

## Roles

Two roles can sign in (`ROLE_HOME` in `lib/auth.js`):

- **ADMIN** — everything.
- **TEACHER** (مرشدة) — only `/dashboard/attendance` and «حسابي», and only
  for the sections whose `Class.teacherUserId` is her account. Names only:
  attendance responses carry no photo for her.

Server pages call `requirePageUser([...roles])`, which redirects other
roles to their own start page. Every API route checks the role itself;
`/api/attendance` and `/api/options` additionally scope a teacher to her
sections. When adding a route, decide its roles explicitly — the default
in this codebase is ADMIN only. Accounts are managed at
`/dashboard/users`; guards there keep at least one active admin and stop
an admin from deactivating or demoting themselves.

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
- Money columns (fee, paid, remaining, overdue, curriculum) are read-only in
  the table and come from `formatStudent` in `lib/student-data.js`:
  `totalPaid` counts TUITION payments only, CURRICULUM payments are reported
  separately, and **voided payments never count**.
- **Payments are never deleted, only voided** (`PATCH /api/payments/[id]
  { void: true }`): a printed receipt keeps its number and stays listed.
  Receipt numbers (`2526-0001`) come from the `Sequence` table, not
  `MAX(receiptNo)`, so a number is never reused. Imported payments have no
  number. Receipts print from `/dashboard/receipts/[id]` (amount in words:
  `lib/tafqeet.js`).
- **Salaries follow the same rules.** `Salary` is what a person is due for
  a month; `SalaryPayment` rows are what was paid against it (several per
  month allowed, never more than the rest), numbered `S-0001` from
  `Sequence` `salary-receipt`, voided and never deleted. Receipts print
  from `/dashboard/receipts/salary/[id]`, a person's statement from
  `/dashboard/receipts/staff/[id]`. «الراتب الاسمي» in الكادر and the
  newest month's salary are kept in step, and every change of it goes into
  `StaffPayChange`.
- **Overdue** (`lib/dues.js`) follows the school's rules: MONTHLY = the fee
  in equal parts from the start date to May (8 months morning, 7 evening),
  YEARLY = two halves 4½ months apart, no plan = assumed monthly. The
  «المتأخرون» page (`/dashboard/finance/overdue`) builds WhatsApp reminder
  links (`wa.me/9647…`); nothing is sent automatically.
  Section, fee and attendance type are edited in the dialog, which saves them
  through `PUT /api/students/[id]/enrollment`.
- **الدورة الصيفية** (May–August) is an `AcademicYear` of `kind` SUMMER
  named «صيف 2026», active beside the REGULAR year (one active of each).
  Started from the dashboard between 1 April and 31 August: it copies the
  school year's sections, enrolls nobody. A child's summer enrollment is
  `formatStudent(...).summer` (`{ enrollment, financial }`); the students
  table's `?term=summer` view swaps it in, and the school-year view hides
  summer-only children. Monthly instalments run to August, YEARLY is the
  whole fee at the start (`lib/dues.js`); receipts are `SU26-0001`. The
  finance page counts a summer under the school year it ends. Always use
  `activeAcademicYear(client, kind)` — never `findFirst({ isActive })`.
- **Attendance** (`/dashboard/attendance`, `components/AttendanceBoard.js`)
  stores one `Attendance` row per child per day: PRESENT / ABSENT / LATE /
  EXCUSED, or no row for "not recorded". Days are `YYYY-MM-DD` strings from
  `lib/dates.js`; "today" is always `iraqToday()` (Asia/Baghdad), never the
  server clock, and the school week is Sunday–Thursday.
- Search goes through `matchesSearch` in `lib/arabic.js`, which folds
  أ/إ/آ→ا, ة→ه, ى/ی→ي, tashkeel, and Arabic-Indic digits. Use it for any new
  search box.
