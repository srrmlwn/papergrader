# Paper Grader: to-do list

Ordered by priority. **[You]** = needs manual effort from the owner; everything else Claude builds.
Guiding rule: keep the app very simple and easy to understand. Prefer one obvious button over a new screen or setting.
Status: `[ ]` to do, `[~]` in progress, `[x]` done, `[-]` dropped or deferred.

| # | Status | Item | Who | Notes |
|---|---|---|---|---|
| 1 | [x] | Set a monthly spend limit on the Anthropic workspace | **[You]** | Done (owner set a monthly limit). |
| 2 | [x] | Copy comments button | Claude | Done (simplified): one Copy comments button next to the downloads. No list on the page. |
| 3 | [-] | Rewrite and regrade loop | Claude | Removed: people fix their writing in their own editor; "Grade another paper" covers resubmitting. |
| 4 | [~] | Test on iPhone Safari with real phone photos | **[You]** test, Claude fixes | Photo of a printed page (HEIC), a skewed shot, a multi-page PDF, paste, Word. Report anything odd. |
| 5 | [x] | Cost monitoring | Claude + **[You]** check | Done, no database: Anthropic Console → Cost/Usage (this app has its own key) is the record; each grade also logs a `grade-cost` line (tokens, US$, time) in Vercel logs (kept 1 hour on Hobby, 1 day on Pro). Ask Claude to total recent grades. Long-term history per grade would need a small database (revisit before a public launch). |
| 6 | [x] | Grade by the right standard for the kind of writing | Claude | Done (simplified): no question on screen; the grader works out whether it is an essay, work writing or a resume and uses that standard. |
| 7 | [x] | Privacy note | Claude | Done: "Your document isn't stored" in the footer (opens the full note). Server no longer logs any document text. **Update this note if #5 stores anything.** |
| 8 | [ ] | Pick the final name and domain | **[You]** decide/buy, Claude updates the app | Candidate: "Handed Back". Check domain + USPTO. Rename repo/Vercel project if wanted. |
| 9 | [x] | Branded share image + link back | Claude | Done: Share makes a 1080×1350 image (grade stamp, the strip of the paper with the most red ink, the verdict, the sharpest criticism as a pull quote, the site address). Phones open the share sheet; desktops save the PNG. Name is in `share.js`, swap it with #8. |
| 10 | [ ] | Web links as input | Claude | Server fetch + Readability, typeset like pasted text; block private addresses. |
| 11 | [x] | Better waiting screen | Claude | Done: rotating teacher lines while the grader works (no fake progress bar), then "Writing in the margins". |
| 12 | [ ] | End comment on multi-page papers | Claude | Short end note on page 1 too, or a cover note; today it's only on the last page. |

## Later (not now: no premature optimization)
- **Cost: fewer, shorter comments.** Cap at 3 to 5 per page, shorter notes, shorter bracket anchors. Est. 20 to 35% cheaper.
- **Cost: try Haiku 4.5.** Half the price of Sonnet 5.5; set `GRADER_MODEL` in Vercel. Compare on ~5 real papers first (risk: more invented or nitpicky errors).
- **Cost: lower the page cap** from 8 to 5 to bound the worst case.
- Skipped: prompt caching (saves a fraction of a cent), Batch API (too slow), caching repeat documents (needs a database).

## Done
- Red-pen markup engine with in-page note placement
- PDF, image (OCR), Word (.docx), plain text and pasted text inputs
- Passcode gate
- Simplified: one Download button (image for one page, PDF for several); one grader voice (no Strict / Fair / Kind)
- Deployed on Vercel from this repo (auto-deploys on push to `main`)
- Clear "usage limit reached" message when the monthly spend limit is hit
- Plain paper: no ruled lines (they drifted out of alignment on real devices), no margin line, title set straight; waiting screen shows the file name and the current step only
- One input box: paste text, or Choose a file / drop one (the file shows as a removable chip in the same box); no separate headings
- Result screen: title and big handwritten grade first, then the paper; Download / Share / Copy comments / Grade another in one bar pinned to the bottom of the screen
- Red only for the teacher (marks, grade, handwriting) and the Turn it in button; everything structural is black and gray
- Footer always at the bottom of the page: "Your document isn't stored" (opens the full privacy note) and "Grades are written by Claude and can be wrong"; smaller input box
- Native file input fully hidden (no "No file chosen" tooltip); a chosen file shows its name, type and size with a Replace link
- Result header reads "Your paper is back." with the grade; page-limit and left-off notes in small gray type
- Tap a page to view all pages full size on the same tab (scroll through; tap outside, × or Esc to close)
