# Design system

This document is the reference for every visual decision in the product. If a
value is not here, it does not belong in a component.

## 1. What this product is

A webmail client for a mailbox you host yourself. The people using it are
technically literate, privacy-conscious (they chose self-hosting), and they keep
it open all day. They are not browsing — they are working through volume.

That makes this a **dense professional tool**, closer to a terminal or an issue
tracker than to a marketing site. Every decision below follows from that.

| Question              | Answer                                                              |
| --------------------- | ------------------------------------------------------------------- |
| Primary job           | Triage a lot of mail quickly, read it comfortably, reply accurately |
| Core screens          | Message list (most of the session), conversation, compose           |
| Everything else       | Settings, contacts, diagnostics — occasional, should not compete    |
| Failure mode to avoid | A pretty interface that shows 8 messages per screen                 |

## 2. Design personality

**Quiet, dense, precise, native-feeling, text-first, unfussy.**

The interface should read as furniture: you stop noticing it and see your mail.

## 3. Typography

System font stack, no web font. A mail client should feel native to the OS it
runs on, and dropping the font download removes a render-blocking request and
the layout shift that comes with it.

Seven roles, each with exactly one job. Adding an eighth requires deleting one.

| Token          | Size | Used for                                               |
| -------------- | ---- | ------------------------------------------------------ |
| `text-meta`    | 11px | Counts, keyboard hints, badges, section eyebrows       |
| `text-caption` | 12px | Timestamps, helper text, secondary metadata            |
| `text-ui`      | 13px | **Default.** List rows, buttons, labels, menus, inputs |
| `text-body`    | 14px | Prose inside the UI (descriptions, empty states)       |
| `text-read`    | 15px | Email content, compose editor                          |
| `text-title`   | 16px | Section and page-area titles                           |
| `text-display` | 20px | Conversation subject, sign-in heading                  |

Rules: weight carries hierarchy before size does; `600` is the heaviest weight
in the product; uppercase is used only for 11px section eyebrows; numerals are
tabular wherever they form a column (dates, counts, sizes).

## 4. Colour

One neutral ramp on a single cool hue, plus **one** accent. Colour means
something here — if everything is coloured, nothing is.

The accent (`--accent`) is reserved for four things and nothing else:
primary action, current location, focus ring, unread marker. Star is the one
earned exception, because "starred" is a user-assigned state that must survive
next to "unread".

| Role         | Token                                                            | Notes                                                   |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------- |
| App chrome   | `--canvas`                                                       | Sidebar, toolbars, top bar                              |
| Content      | `--surface`                                                      | Where mail lives — always one step brighter than chrome |
| Raised/inset | `--surface-sunken`, `--surface-hover`, `--surface-active`        |                                                         |
| Text         | `--text`, `--text-secondary`, `--text-muted`                     | Three levels, no more                                   |
| Hairlines    | `--line`, `--line-strong`                                        | `line` separates, `line-strong` encloses                |
| Accent       | `--accent`, `--accent-hover`, `--accent-text`, `--accent-subtle` |                                                         |
| Status       | `--success`, `--warning`, `--danger`, `--info` (+ `-subtle`)     | State only                                              |

**Surface rule:** content is always brighter than chrome. In light mode that is
white content on light-grey chrome; in dark mode it is a lighter grey content on
near-black chrome. Elevation is expressed by lightness, not by shadow.

Status is never carried by colour alone: it always has a word or an icon too.

## 5. Spacing and layout

4px base scale, used through Tailwind. Structural values are tokens so density
is a real setting rather than a hundred hand-tuned numbers:

| Token       | Value               | Meaning                                                                                                             |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--gutter`  | 12 / 16 / 20px      | Horizontal page padding, responsive                                                                                 |
| `--rail-w`  | 232px               | Sidebar; the top-bar brand block matches it exactly, so search begins on the same vertical axis as the message list |
| `--row-h`   | 44px (34px compact) | List row and collapsed message row                                                                                  |
| `--measure` | 68ch                | Reading width for plain-text mail                                                                                   |

**Alignment:** the conversation view shares the list's left axis, so opening and
closing a message does not move the reading position. Message headers, bodies,
attachments and reply actions all sit on that same axis.

Whitespace groups before borders do. A border is used only when it separates
things that would otherwise be confused.

## 6. Radius, elevation, motion

Three radii, two shadows, one animation.

| Token             | Value | Used for                                        |
| ----------------- | ----- | ----------------------------------------------- |
| `rounded-control` | 6px   | Anything you click: buttons, inputs, menu items |
| `rounded-surface` | 10px  | Anything that floats: dialogs, menus, compose   |
| `rounded-pill`    | full  | Only true pills: recipient chips, count badges  |

`--shadow-overlay` is the only shadow in the interface, and only on things that
actually float above the page: dialogs, menus, popovers, compose. **Nothing else
has a shadow** — a list row that lifts on hover is a toy, not a tool.

Motion: 100ms for colour/background feedback, 160ms for overlay entrance. That
is the entire motion vocabulary. `prefers-reduced-motion` disables it.

## 7. Component philosophy

Components are a family, not a collection. Same role ⇒ same treatment.

- **Buttons.** One family. `variant` says intent, `size` says density. Exactly
  one `primary` button is visible in any view.
- **Icon-only controls** go through `IconButton`, which makes `label` mandatory —
  it becomes both the accessible name and the tooltip. An icon never ships
  without a text equivalent.
- **Forms** go through `Field`, which wires label, help and error to the control
  with `aria-describedby`. Placeholders are hints, never labels.
- **Empty and error states** are plain: a statement, a sentence, at most one
  action. No illustration, no framed icon tile.
- **Cards are rare.** See below.

## 8. The anti-card rule

The single biggest change from the previous interface.

Before using a border, a shadow or a coloured container, ask: _does this box
communicate a real relationship?_ Usually spacing, alignment and typography have
already done the job.

Applied:

- The **message list** is a list — flush rows, hairline separators, one
  continuous surface. Not a stack of tiles.
- A **conversation** is a document — messages separated by hairlines on a shared
  axis. Not a deck of floating cards.
- **Settings** are headings and hairlines. Not eight identical rounded panels.
- **Diagnostics** is an aligned definition list. Not a 2×2 grid of cards.

Cards survive only where containment is genuinely meaningful: overlays (dialogs,
menus, compose) and the light sheet that holds a sender-designed email.

## 9. Message rendering

The hardest problem in a webmail, and the reason for a dedicated pipeline.

Email carries its own colours. Inverting them produces half-broken output; not
handling them produces black-on-black. So the server classifies each message
(`lib/mime/html-analysis.js`) and the viewer renders it one of two ways:

| Mode     | When                                                                                               | How it renders                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`    | Plain correspondence with no design of its own                                                     | The reader's theme. Author colours are neutralised with `color: inherit !important`, so a hardcoded `color:#000` can never become invisible in dark mode. |
| `sender` | Newsletters and templates (declares `bgcolor`, a background colour, or a fixed-width layout table) | Its own colours on a light sheet, centred and framed, **even in dark mode**. Link colours are left alone so call-to-action buttons keep their contrast.   |

Also part of the pipeline:

- **Quoted history is split off** and hidden behind a `•••` toggle, so a reply
  shows the new sentence first instead of the whole chain.
- **Remote images are blocked** by default and collapse to an 18px marker rather
  than reserving the sender's declared dimensions — a 600×400 tracking pixel
  should not punch a hole through the message.
- The frame is a **scriptless sandbox**: `allow-same-origin` (for `cid:` images
  and height measurement) but never `allow-scripts`, plus its own CSP.

## 10. Density

Density is a first-class setting, not a cosmetic one. `--row-h` drives list rows
and collapsed message rows together, so Compact genuinely fits about a third
more mail on screen rather than just shaving a few pixels.

Reading surfaces do not follow list density: email body text stays at 15px/1.6
with a 68ch measure regardless, because comprehension beats scanning there.

## 11. Responsive

Not a shrunk desktop. At <768px the layout is reconsidered:

- Sidebar becomes a drawer; Compose closes it on open.
- List rows become two-line: sender + date, subject + indicators, preview.
- Compose is full screen with no window chrome.
- Toolbars drop secondary actions rather than wrapping or scrolling.

## 12. Accessibility

Targets WCAG 2.2 AA.

- Semantic landmarks, a skip link, and heading order per screen.
- Every icon-only control has an accessible name; labels are specific
  ("Archive conversation from John Smith", not "Archive").
- Visible focus everywhere: 2px accent ring, inset inside dense lists so
  neighbouring rows cannot clip it.
- Errors render next to their source and are linked with `aria-describedby`.
- Live regions announce selection counts and connection state.
- Status is never colour-only.
- `prefers-reduced-motion` removes all animation.

## 13. What was deliberately removed

Patterns present in the previous interface, and why they are gone:

| Removed                                      | Reason                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Gradient background on sign-in               | Decoration with no informational job                                          |
| Cards around every message, setting and stat | Containment without a relationship; flattens hierarchy                        |
| Hover shadow / lift on list rows             | Makes a 100k-row list feel like a toy                                         |
| Per-sender avatar colour hashing             | Confetti that competes with the accent, which here means unread/current/focus |
| Inverted dark bar on the compose window      | A treatment used nowhere else in the product                                  |
| Six radii, four shadows                      | Reduced to three and two                                                      |
| Permanent green "connected" indicator        | Silence is the signal; only degraded states surface                           |
| Large framed icon tiles in empty states      | An empty inbox is good news, not an event                                     |
