# Grade this.: roadmap and to-do list

**The plan:** stop adding features. Launch, measure, learn. Watch the first 500 to 1,000 grades by strangers before making big product decisions, then put effort into the grading itself, not the interface.

**[You]** = needs manual effort from the owner; everything else Claude builds.
Guiding rule: keep the app very simple and easy to understand. Prefer one obvious button over a new screen or setting.
Status: `[ ]` to do, `[~]` in progress, `[x]` done, `[-]` dropped or deferred.

Milestones, in order: **rebrand → measure → safeguards → launch (with search basics) → observe 500 to 1,000 grades → improve grading → landing pages from real use → monetize if costs and usage justify it.**

## 1. Finish the rebrand (now)

| # | Status | Item | Who | Notes |
|---|---|---|---|---|
| 1.1 | [x] | Rename to **Grade this.** | Claude | Done: wordmark, tab title, page credit ("Graded at gradethis.app"), README and screenshots. GradeThis.ai (an AI grading tool for teachers) exists; owner judged it acceptable. |
| 1.2 | [x] | Point gradethis.app at Vercel | **[You]** | Done: **www.gradethis.app is the main address**; gradethis.app 308-redirects to it (Vercel). Optional: rename the GitHub repo and Vercel project. |
| 1.3 | [x] | Send the old address to the new one | Claude | Done: papergrader-alpha.vercel.app permanently redirects to www.gradethis.app (`vercel.json`). The passcode has to be typed once on the new address. |
| 1.4 | [x] | Link previews and search basics | Claude | Done: title "Grade this. – Free AI Essay & Writing Grader, in Red Pen", description, canonical (www), robots meta, Open Graph/X tags with a 1200×630 preview image (`og-image.png`), WebApplication structured data (free, true today; change `offers` when pricing exists), `robots.txt` (blocks only /api/), `sitemap.xml`. |
| 1.5 | [~] | Test on iPhone Safari with real phone photos | **[You]** test, Claude fixes | Photo of a printed page (HEIC), a skewed shot, a multi-page PDF, paste, Word, and the Share button (card-free: it should send every page). |

## 2. Measure (before sending any traffic)

The number that matters is **papers graded per visitor**, plus **% who grade a second paper** and **% who share or download**.

| # | Status | Item | Who | Notes |
|---|---|---|---|---|
| 2.1 | [x] | Product analytics with PostHog | Claude | Done: `analytics.js`, cookieless (memory only), anonymous, no autocapture or recording, US host (switch `HOST` if the project is EU). Events: `$pageview`, `document_added`, `grading_started`, `grading_completed`, `grading_failed` (with stage), `download_clicked`, `share_clicked` (shared/cancelled/failed), `copy_clicked`, `grade_another_clicked`. Properties: input type, page count, processing time, grade, kind of writing, estimated cost, comments placed/dropped, papers this visit; PostHog adds device and referrer. Never document text. Privacy note updated. Replaced the `share-event` log lines. Caveat: no storage means a returning visitor counts as new, so retention across days isn't measured. |
| 2.2 | [ ] | One dashboard | **[You]** in PostHog (Claude can list the exact insights) | Visitors → documents added → grades completed → second grade → share/download; plus papers per visitor, completion rate, average pages, latency, cost per grade. Built in PostHog instead of a custom admin page. |
| 2.3 | [x] | Fuller cost line per grade | Claude | Done: the grader now also returns the kind of writing (`docType`); `grade-cost` logs input type, kind, grade, tokens, US$, time; the estimate is sent with `grading_completed`. Failures are counted by stage in analytics. |
| 2.4 | [-] | Vercel Speed Insights | | Skip for now: the page is static and light. Revisit if analytics show slow loads or drop-offs. |

## 3. Safeguards (before removing the passcode)

The passcode is today's protection. These are what replace it.

| # | Status | Item | Who | Notes |
|---|---|---|---|---|
| 3.1 | [ ] | Per-visitor rate limit | Claude + **[You]** add a free Redis store (Upstash via Vercel) | For example, 10 grades per hour per IP, with a friendly message. Needs a small store because Vercel functions don't remember anything between calls. |
| 3.2 | [ ] | Daily spend ceiling | Claude | Stop grading for the day past a set dollar amount, using the same store and the per-grade cost. The Anthropic monthly limit (done) stays as the backstop. Protects against one viral post burning the month in a day. |
| 3.3 | [x] | Size limits | | Done: 8 pages, 50,000 characters, server-side. |
| 3.4 | [ ] | Timeouts and errors | Claude | Check what people see when Claude is slow, overloaded (529) or times out; clear message and a Try again button, no stuck waiting screen. |
| 3.5 | [ ] | **Launch decision: remove the passcode** | **[You]** decide | Only after 2.1, 3.1 and 3.2. Then post it (Reddit, X, friends) and watch the dashboard. |

## 4. Sharing (revisit with data)

| # | Status | Item | Who | Notes |
|---|---|---|---|---|
| 4.1 | [~] | Share a crop instead of whole pages? | Claude, after launch data | The roadmap recommends a share image (a crop of the red ink, giant grade, one comment, the name and domain) so people can share **without exposing the whole document**. We tried a card and dropped it as duplicate and ad-like, but the privacy point is real: a shared resume sends its phone number and address. Decide once analytics show how often Share is used and what kinds of documents people upload; the old card is in git history. |
| 4.2 | [ ] | Example gallery | Claude, later | Graded public-domain pieces (famous speeches, historical letters, corporate-speak, deliberately terrible writing). Never user documents. Each is shareable content and a landing page. |

## 5. Improve the grading, not the interface (after 500 to 1,000 grades)

The UI is frozen. Effort goes into how good the marked-up page is.

| # | Status | Item | Who | Notes |
|---|---|---|---|---|
| 5.1 | [ ] | Quiet "Was this useful? 👍 👎" | Claude | At the very bottom of the result, not prominent. Sent as an analytics event with the grade and kind of writing. |
| 5.2 | [ ] | Annotation quality | Claude | Better note placement and fewer collisions, smarter choice of what to mark, more natural handwriting variation, better arrows/brackets/circles, earned check marks, consistent scoring, sharper overall comments. Driven by real papers and the 👍/👎 data. |

## 6. Search

Order: get indexed now (it takes days to weeks anyway) → a little crawlable text on the homepage → one example page → landing pages only for what people actually upload. No mass blog posts, backlink schemes, directories or SEO tools.

**Reality check:** "AI essay grader" and "grade my essay" are crowded with established teacher tools (EssayGrader, CoGrader, GradeWithAI and others) on older domains, so a new site won't rank for those for months, if ever. Realistic early wins: our own name, and longer searches that match what's different ("essay marked up in red pen", "grade my essay like a teacher"). Sharing stays the faster channel.

**Timing with the passcode:** anyone arriving from Google today hits the passcode screen and leaves. Indexing is slow, so start now, but the homepage text (6.4) and landing pages (6.6) should go live with the passcode removal (3.5), not before.

| # | Status | Item | Who | Notes |
|---|---|---|---|---|
| 6.1 | [ ] | Google Search Console | **[You]** | Add a **Domain** property for gradethis.app (DNS TXT record at your registrar), submit `https://www.gradethis.app/sitemap.xml`, then URL Inspection → Test live URL → Request indexing on the homepage. Data can take about a week to appear. |
| 6.2 | [x] | Nothing blocks Google | Claude | Done: robots.txt allows crawling, robots meta is index/follow, no noindex headers, one canonical (www) with apex and old address redirecting. Confirm with 6.1's live test. |
| 6.3 | [x] | Title, description, structured data | Claude | Done in 1.4. Brand first on the page; the tab title says what it is for Google. |
| 6.4 | [ ] | Short crawlable text below the tool | Claude | About 200 to 400 words under the upload box, small and gray, hidden on the result screen: one line on what it is, How it works (3 steps), What it can grade (essays, college essays, resumes, cover letters, blog posts, reports, memos), Private by design (links the existing note). Must be in the HTML even behind the passcode, so Google sees it. The hero stays as is. Ship with 3.5. |
| 6.5 | [ ] | One example graded paper | Claude | A **public-domain or made-up** essay (not someone else's copyrighted essay) shown before and after grading, as a real image with alt text. Goes on the homepage section and later on /essay-grader. It's the clearest proof we're not another chat-box grader. |
| 6.6 | [ ] | Landing pages from data | Claude | Only after PostHog shows what people grade (`doc_type`). Likely first: /essay-grader; then /college-essay-grader, /resume-grader, /writing-grader. Each: what it checks, the example, short FAQ, supported formats, privacy, and the same upload box. Plain static pages (no build step), added to the sitemap. |
| 6.7 | [ ] | Watch Search Console | **[You]** + Claude | After a few weeks: which searches show us and what gets clicked. That, not guesses, picks the next page. |

## 7. Cost and money (only once usage justifies it)

| # | Status | Item | Who | Notes |
|---|---|---|---|---|
| 7.1 | [ ] | Work out average Claude cost per successful paper | Claude | From 2.3 after real traffic. |
| 7.2 | [ ] | Free allowance, then cheap credit packs | **[You]** decide, Claude builds | Roughly 3 to 5 free papers, then credit packs. No subscriptions, tiers or accounts until usage shows people want them. |
| 7.3 | [ ] | Cost levers if needed | Claude | Fewer, shorter comments (est. 20 to 35% cheaper); try Haiku 4.5 via `GRADER_MODEL` after comparing ~5 real papers (risk: more invented or nitpicky errors); lower the page cap from 8 to 5. Skipped: prompt caching, Batch API, caching repeat documents. |

## Not on the roadmap
Native apps, accounts, saved history, chat with the grader, grading personalities, teacher dashboards, rubric builders, Google Docs integration, a revision editor, a browser extension, subscriptions, onboarding flows. All plausible later; none makes the core trick better.

Also parked: **web links as input** (server fetch + Readability, typeset like pasted text, block private addresses). Build it if analytics show people pasting links.

## Done
- Red-pen markup engine with in-page note placement; notes dropped rather than shrunk
- PDF, image (OCR), Word (.docx), plain text and pasted text inputs; up to 8 pages
- Grades by the right standard for the kind of writing (essay, work writing, resume), worked out automatically
- One grader voice (no Strict / Fair / Kind); rewrite-and-regrade dropped
- Grade stamp, verdict and overall comment together at the top of page 1 (works on multi-page papers)
- Result: "Your paper is back.", the pages, and Download / Share / Copy comments / Grade another in a bar pinned to the bottom; tap a page to view all pages full size
- Share sends every page as an image, page 1 first (shown only where the browser can share images); every page carries "Graded at gradethis.app"
- Download: an image for one page, a PDF for several
- Waiting screen: "Grading <file>" with rotating teacher lines; "This usually takes 20 to 60 seconds"
- One input box: paste text, or choose/drop a file (shows name, type, size and Replace)
- Plain paper (no ruled lines or margin line); red only for the teacher and the Turn it in button
- Footer always at the bottom: "We don't keep a copy of your writing" (opens the privacy note) and "Grades are written by Claude and can be wrong"
- Passcode gate; monthly Anthropic spend limit with a clear "usage limit reached" message
- Cost monitoring: Anthropic Console plus a `grade-cost` log line per grade (counts only)
- PostHog analytics funnel (cookieless, nothing from the document)
- Deployed on Vercel from this repo (auto-deploys on push to `main`)
