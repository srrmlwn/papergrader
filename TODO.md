# Paper Grader: to-do list

Ordered by priority. **[You]** = needs manual effort from the owner; everything else Claude builds.
Status: `[ ]` to do, `[~]` in progress, `[x]` done.

| # | Status | Item | Who | Notes |
|---|---|---|---|---|
| 1 | [ ] | Set a monthly spend limit on the Anthropic workspace | **[You]** | Console → workspace → Limits. Caps the worst case if the passcode leaks. 2 min. |
| 2 | [x] | Comments as a text list under each page | Claude | Done: list below the pages, linked from the top; fixes shown with arrows; notes that didn't fit or couldn't be matched are labeled; Copy all comments. |
| 3 | [x] | Rewrite and regrade loop | Claude | Done: "Turn in a rewrite" opens an editor (original text, or PDF/photo text rebuilt into paragraphs) with the comments below; regrade is independent of the old grade; result shows "C → B+" and how many marked problems are gone. Repeatable. |
| 4 | [ ] | Test on iPhone Safari with real phone photos | **[You]** test, Claude fixes | Photo of a printed page (HEIC), a skewed shot, a multi-page PDF, paste, Word. Report anything odd. |
| 5 | [ ] | Usage, cost and quality logging + "flag this comment" | **[You]** add storage, Claude builds | You add an Upstash Redis (or Vercel KV) integration in Vercel; Claude logs grades, cost, dropped/unmatched notes, flags. |
| 6 | [x] | "What is it?" document type | Claude | Done: Essay / Work writing / Resume / Not sure on the upload screen; each sends its own grading standard; kept on rewrites. |
| 7 | [ ] | Privacy note | Claude | Text goes to Anthropic for grading; nothing is stored (update if #5 stores anything). |
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
