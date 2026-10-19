# Readable export (`moodbow-journal-YYYY-MM-DD.txt`)

`export_my_data()` returns JSON (`format: moodbow-export`, `format_version: 1`). Me → Export gives the user that JSON **and** this readable text, rendered on the device/browser from the same JSON. App and web must produce **byte-identical** text: both test that rendering `export_fixture.json` gives `export_fixture.txt` exactly.

## Files (decision 107)
- `moodbow-journal-YYYY-MM-DD.txt` (this text) and `moodbow-export-YYYY-MM-DD.json` (the JSON as returned).
- `YYYY-MM-DD` = `exported_at` as a date in the **profile's time zone** (`profile.time_zone` in the JSON; UTC if it's missing or unknown). It's the user's local day, so an export at 06:30 in Bangkok is named for that day, not the UTC day before.
- Only the filenames use the local date. The `Exported:` header line inside the file stays **UTC** (below).
- The app shares both files in one share sheet and deletes the temp files when the sheet closes; the web offers two download links.

## Encoding
- UTF-8, no BOM, `\n` line endings, and exactly one `\n` at the end of the file.
- In bodies (entries, reflections), `\r\n` and `\r` become `\n`. Then trailing **blank lines** are removed; a blank line is one that is empty or holds only spaces and tabs. **Leading** blank lines are kept, as are spaces at the end of a non-blank line. Nothing else changes (no wrapping, no trimming inside).
- Numbers always use ASCII digits and `.` as the decimal separator, whatever the language (`7.5`, never `7,5`). A whole number has no `.0`.

## Versions
Render only `format: "moodbow-export"` with `format_version: 1`. For anything else, a renderer refuses: no partial text. The client then offers the JSON alone.

## Order and sections
Render in the JSON's array order (the server already sorts it: check-ins by date, entries by date then created_at, reflections and memories by created_at). Never re-sort.

1. The header (always).
2. **Check-ins** (`check_ins`).
3. **Entries** (`entries`).
4. **AI reflections** (`ai_reflections`).
5. **What the AI remembers** (`ai_memories`).

A section with no items is left out entirely, heading included. There's exactly one blank line between blocks (header → section, section → section), and none at the very end.

`ai_reports` aren't in the text in format 1: their `body` is structured and M9 defines how to read it. They stay in the JSON. Profile, settings, consents, usage and credits are also JSON only.

## Header
```
{exportTitle}
{exportExported(when)}
{exportAccount(email)}
{exportPrivateNote}
```
`when` = `exported_at` **converted to UTC** (whatever offset it carries), as `YYYY-MM-DD HH:MM UTC`: 24 h, zero-padded, seconds and fractions **truncated, not rounded** (`20:15:59.9` → `20:15`).

## Check-ins
The heading `{exportCheckins}`, then one line per check-in:
`{local_date}` then each present field, joined by ` · ` (space, U+00B7, space), in this order:
- always: `{exportField(label: exportMood, value: exportMoodValue(label: mood<n>, value: n))}` → `Mood: Good (4/5)`
- if `sleep_hours`: `{exportField(exportSleep, …)}`, where the value is `sleepHours(h)` (`7`, `7.5`: no trailing `.0`). If there's also `sleep_quality`: `{exportSleepValue(hours: sleepHours(h), quality: sleepPoor|sleepOkay|sleepGood)}` → `Sleep: 7.5 h, Good`
- if only `sleep_quality` (no hours): `Sleep: Good`
- if `exercise_minutes` is not null (0 counts): `Exercise: ` + `exerciseNone` (0) | `exercise90` (90) | `exerciseMinutes(n)`
- if `stress`: `Stress: ` + `exportOfFive(n)` → `Stress: 2/5`

## Entries
The heading `{exportEntries}`, then one block per entry, with a blank line between blocks:
```
{entry_date}[ · ★ {momentBadge}]
{body}
```

## AI reflections
The heading `{exportReflections}`, then one block per reflection, with a blank line between blocks:
```
{exportReflectionOn(date)}
{body}
```
`date` = the `entry_date` of the entry whose `id` = `entry_id`. If that entry is no longer in the export: `created_at`'s UTC date.

## What the AI remembers
The heading `{exportMemories}`, then one line per memory: `- {fact}`.

## Keys (en; approved by UX & PM 2026-10-19)
| Key | en |
|---|---|
| exportTitle | Moodbow: your journal |
| exportExported | Exported: {when} |
| exportAccount | Account: {email} |
| exportPrivateNote | This file holds your private journal. Keep it somewhere safe. |
| exportCheckins | Check-ins |
| exportEntries | Entries |
| exportReflections | AI reflections |
| exportMemories | What the AI remembers |
| exportField | {label}: {value} |
| exportMood | Mood |
| exportMoodValue | {label} ({value}/5) |
| exportSleep | Sleep |
| exportSleepValue | {hours}, {quality} |
| exportExercise | Exercise |
| exportStress | Stress |
| exportOfFive | {value}/5 |
| exportReflectionOn | On your entry of {date} |

These reuse the existing keys mood1–mood5, sleepHours, sleepPoor/Okay/Good, exerciseNone, exercise90, exerciseMinutes and momentBadge. The dates are ISO `YYYY-MM-DD` in every language: unambiguous, and identical on both clients.
