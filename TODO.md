# Paper Grader: to-do list

Ordered by priority. **[You]** = needs manual effort from the owner; everything else Claude builds.
Guiding rule: keep the app very simple and easy to understand. Prefer one obvious button over a new screen or setting.
Status: `[ ]` to do, `[~]` in progress, `[x]` done.

| # | Status | Item | Who | Notes |
|---|---|---|---|---|
| 1 | [ ] | Set a monthly spend limit on the Anthropic workspace | **[You]** | Console → workspace → Limits. Caps the worst case if the passcode leaks. 2 min. |
| 2 | [x] | Copy comments button | Claude | Done (simplified): one Copy comments button next to the downloads. No list on the page. |
| 3 | [x] | Rewrite and regrade loop | Claude | Done: "Turn in a rewrite" opens an editor (original text, or PDF/photo text rebuilt into paragraphs) with the graded pages below; regrade is independent of the old grade; result shows "C → B+" and how many marked problems are gone. Repeatable. |
| 4 | [~] | Test on iPhone Safari with real phone photos | **[You]** test, Claude fixes | Photo of a printed page (HEIC), a skewed shot, a multi-page PDF, paste, Word. Report anything odd. |
| 5 | [ ] | Usage, cost and quality logging + "flag this comment" | **[You]** add storage, Claude builds | You add an Upstash Redis (or Vercel KV) integration in Vercel; Claude logs grades, cost, dropped/unmatched notes, flags. |
| 6 | [x] | Grade by the right standard for the kind of writing | Claude | Done (simplified): no question on screen; the grader works out whether it is an essay, work writing or a resume and uses that standard. |
| 7 | [x] | Privacy note | Claude | Done: "What happens to your writing" in the footer. Server no longer logs any document text. **Update this note if #5 stores anything.** |
| 8 | [ ] | Pick the final name and domain | **[You]** decide/buy, Claude updates the app | Candidate: "Handed Back". Check domain + USPTO. Rename repo/Vercel project if wanted. |
| 9 | [ ] | Branded share image + link back | Claude | Small "graded by [name]" mark on downloads/shares. After #8. |
| 10 | [ ] | Web links as input | Claude | Server fetch + Readability, typeset like pasted text; block private addresses. |
| 11 | [ ] | Better waiting screen | Claude | Real progress steps during the 20 to 60 s grade. |
| 12 | [ ] | End comment on multi-page papers | Claude | Short end note on page 1 too, or a cover note; today it's only on the last page. |

## Done
- Red-pen markup engine with in-page note placement
- PDF, image (OCR), Word (.docx), plain text and pasted text inputs
- Passcode gate, Strict / Fair / Kind tone, PDF and PNG downloads
- Deployed on Vercel from this repo (auto-deploys on push to `main`)
