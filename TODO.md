# Grade this.: roadmap and to-do list

**The plan:** stop adding features. Launch, measure, learn. Watch the first 500 to 1,000 grades by strangers before making big product decisions, then put effort into the grading itself, not the interface.

**[You]** = needs manual effort from the owner; everything else Claude builds.
Guiding rule: keep the app very simple and easy to understand. Prefer one obvious button over a new screen or setting.
Status: `[ ]` to do, `[~]` in progress, `[x]` done, `[-]` dropped or deferred.

Milestones, in order: **rebrand → measure → safeguards → launch → observe 500 to 1,000 grades → improve grading → SEO from real use → monetize if costs and usage justify it.**

## 1. Finish the rebrand (now)

| # | Status | Item | Who | Notes |
|---|---|---|---|---|
| 1.1 | [x] | Rename to **Grade this.** | Claude | Done: wordmark, tab title, page credit ("Graded at gradethis.app"), README and screenshots. GradeThis.ai (an AI grading tool for teachers) exists; owner judged it acceptable. |
| 1.2 | [ ] | Point gradethis.app at Vercel | **[You]** | Vercel → project → Domains → add gradethis.app, set the DNS records it shows. Optional: rename the GitHub repo and Vercel project (auto-deploys keep working). |
| 1.3 | [ ] | Send the old address to the new one | Claude (after 1.2) | Redirect papergrader-alpha.vercel.app → gradethis.app so every link and share lands on one address. |
| 1.4 | [ ] | Link previews and search basics | Claude | Social preview image (a graded page) + Open Graph/X tags, so a pasted gradethis.app link shows a picture; canonical URL, favicon, robots.txt, sitemap.xml, a proper title and description. Cheap, and needed before anyone shares the link. |
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

## 6. SEO from real use (later)

| # | Status | Item | Who | Notes |
|---|---|---|---|---|
| 6.1 | [ ] | Search Console | **[You]** verify the domain, Claude adds the sitemap | After 1.2. |
| 6.2 | [ ] | A few landing pages | Claude | Only for what people actually upload (e.g. /resume-grader, /essay-grader, /college-essay-grader, /blog-post-grader). No AI-generated blog. |

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
