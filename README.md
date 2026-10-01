# Paper Grader

Upload a PDF, Word file or image, or paste your text, and get it back marked up in red pen: circles, strikethroughs,
notes written into the page's own white space, and a grade.

## How it works
- The browser reads the input: PDF.js for PDFs (exact word positions), Tesseract.js OCR for images and scans,
  and mammoth.js for Word files. Word files and pasted text are typeset onto clean pages (`typeset.js`).
- Only the page text goes to `/api/grade`, which checks the passcode and asks Claude (Sonnet 5.5,
  structured JSON output) for the critique: anchors, marks, notes, grade.
- `ink.js` draws the marks, then places each note in the nearest free space on the page,
  routing arrows around text and dropping minor notes instead of shrinking them.

## Deploy (Vercel)
1. `npx vercel` in this folder (no build step; static files + two Node functions).
2. Set environment variables in the Vercel project:
   - `APP_PASSCODE`: the passcode people type to use the app
   - `ANTHROPIC_API_KEY`: your Anthropic API key (server-side only)
   - optional `ANTHROPIC_WORKSPACE_ID`: only if your API key isn't scoped to a workspace
   - optional `GRADER_MODEL` (default `claude-sonnet-5-5`)
3. Redeploy so the variables take effect.
