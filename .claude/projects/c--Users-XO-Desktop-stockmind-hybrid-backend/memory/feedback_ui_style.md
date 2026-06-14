---
name: feedback-ui-style
description: UI style preferences for StockMind — compact mobile-first, small text, no verbose hero sections
metadata:
  type: feedback
---

Keep all UI compact and mobile-first. User explicitly asked for smaller text, smaller buttons, and no verbose hero/description paragraphs on any page.

**Why:** The app is used on small Android screens; large text and long descriptions cause horizontal overflow and bad UX.

**How to apply:**
- Metric cards: `grid-cols-2` on mobile (never single column)
- Hero sections: max one short title + one subtitle line, no multi-sentence paragraphs
- Nav labels: short (≤8 chars), use `short` aliases on mobile
- Scan page form labels: `text-[10px]` not `text-xs`/`text-sm`
- Always add `shrink-0` to logo/icon areas in flex containers to prevent clipping
- `overflow-x-hidden` on body to prevent horizontal scroll
