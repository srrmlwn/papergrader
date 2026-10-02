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
| 7 | [x] | Privacy note | Claude | Done: "What happens to your writing" in the footer. Server no longer logs any document text. **Update this note if #5 stores anything.** |
| 8 | [ ] | Pick the final name and domain | **[You]** decide/buy, Claude updates the app | Candidate: "Handed Back". Check domain + USPTO. Rename repo/Vercel project if wanted. |
| 9 | [ ] | Branded share image + link back | Claude | Small "graded by [name]" mark on downloads/shares. After #8. |
| 10 | [ ] | Web links as input | Claude | Server fetch + Readability, typeset like pasted text; block private addresses. |
| 11 | [ ] | Better waiting screen | Claude | Real progress steps during the 20 to 60 s grade. |
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
- Tap a page to view all pages full size on the same tab (scroll through; tap outside, × or Esc to close)
