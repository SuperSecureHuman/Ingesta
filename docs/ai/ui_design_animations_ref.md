# UI Design & Animation Reference

Everything a developer needs to implement new UI in this codebase consistently.
Covers the design tokens, Tailwind extensions, Framer Motion patterns, card/grid/player conventions, and timing decisions.

---

## Table of Contents

1. [Design Tokens](#1-design-tokens)
2. [Tailwind Extensions](#2-tailwind-extensions)
3. [CSS Utilities in globals.css](#3-css-utilities-in-globalscss)
4. [Framer Motion — How It's Used](#4-framer-motion--how-its-used)
5. [Card Pattern](#5-card-pattern)
6. [Grid Stagger Pattern](#6-grid-stagger-pattern)
7. [Page Transitions](#7-page-transitions)
8. [Panels (Sheets)](#8-panels-sheets)
9. [Player — Expand/Collapse from Card](#9-player--expandcollapse-from-card)
10. [Scroll Lock](#10-scroll-lock)
11. [Animation Timing Reference](#11-animation-timing-reference)
12. [Do's and Don'ts](#12-dos-and-donts)

---

## 1. Design Tokens

Defined in `frontend/app/globals.css` under `@layer base` (shadcn tokens) and `@theme inline` (Tailwind custom colors).

### shadcn / CSS variables

```css
--background:   oklch(0.145 0 0)   /* zinc-950  #09090b */
--foreground:   oklch(0.985 0 0)   /* zinc-50   #fafafa */
--card:         oklch(0.21 0 0)    /* zinc-900  #18181b */
--primary:      oklch(0.75 0.17 70) /* gold     #e5a00d */
--secondary:    oklch(0.26 0 0)    /* zinc-800  #27272a */
--muted:        oklch(0.26 0 0)
--muted-foreground: oklch(0.65 0 0) /* zinc-400 #a1a1aa */
--accent:       oklch(0.75 0.17 70)
--destructive:  oklch(0.63 0.24 27) /* red-500 */
--border:       oklch(0.26 0 0)
--ring:         oklch(0.75 0.17 70)
--radius:       0.5rem
```

### Tailwind color tokens (`var(--color-*)`)

| Token | Value | Use |
|-------|-------|-----|
| `--color-accent` | `#e5a00d` | Gold — primary interactive color |
| `--color-gold` | `#e5a00d` | Alias |
| `--color-danger` | `#ef4444` | Destructive actions |
| `--color-bg-primary` | `#09090b` | App background |
| `--color-surface` | `#18181b` | Card/panel background |
| `--color-surface-2` | `#27272a` | Elevated surface |
| `--color-glass` | `rgba(9,9,11,0.85)` | Overlay / backdrop |
| `--color-border` | `#27272a` | Default border |
| `--color-border-bright` | `#3f3f46` | Hover/focus border |
| `--color-text` | `#fafafa` | Primary text |
| `--color-muted` | `#a1a1aa` | Secondary text |

Use these via Tailwind: `bg-[var(--color-surface)]`, or directly in inline styles.

---

## 2. Tailwind Extensions

`frontend/tailwind.config.ts`:

```ts
theme: {
  extend: {
    transitionTimingFunction: {
      'spring':     'cubic-bezier(0.25, 0.1, 0.25, 1)',
      'bounce-out': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
    keyframes: {
      'fade-up': {
        '0%':   { opacity: '0', transform: 'translateY(12px)' },
        '100%': { opacity: '1', transform: 'translateY(0)' },
      },
      'fade-in': {
        '0%':   { opacity: '0' },
        '100%': { opacity: '1' },
      },
    },
    animation: {
      'fade-up':  'fade-up 0.22s ease-out forwards',
      'fade-in':  'fade-in 0.18s ease-out forwards',
    },
  },
},
```

**Usage:**
```tsx
// Simple entrance for toasts, tooltips, dropdowns
<div className="animate-fade-up">...</div>
<div className="animate-fade-in">...</div>

// Use spring easing in transitions
<div className="transition-transform duration-200 ease-spring hover:scale-105">...</div>
```

---

## 3. CSS Utilities in globals.css

### `.grid-cards`

```css
.grid-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
@media (max-width: 768px) {
  .grid-cards { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}
```

Always wrap file/library/project card grids in this class. Pass it to `motion.div` when adding stagger.

### `.card-image-skeleton`

```css
.card-image-skeleton {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg,
    var(--color-surface) 25%,
    var(--color-surface-2) 50%,
    var(--color-surface) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease infinite;
}
```

Place as a sibling above `<img>` when loading thumbnails. Hide once `onLoad` fires.
Pattern in `FileCard.tsx`:
```tsx
const [imgLoaded, setImgLoaded] = useState(false);

<div className="aspect-video ... relative">
  {!imgLoaded && <div className="card-image-skeleton" />}
  <img
    className={`... transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
    onLoad={() => setImgLoaded(true)}
    onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_SVG; setImgLoaded(true); }}
  />
</div>
```

### `.btn`

```css
.btn { transition: transform 120ms ease, background-color 150ms ease, opacity 150ms ease; }
.btn:hover  { transform: scale(1.03); }
.btn:active { transform: scale(0.97); transition-duration: 60ms; }
```

Apply to primary CTA buttons (New Library, Add Files, Save). Do **not** apply to small icon buttons — too small for scale feedback.

### `.breadcrumb-link`

```css
.breadcrumb-link { transition: color 150ms ease; }
.breadcrumb-link:hover { color: var(--color-text); }
```

---

## 4. Framer Motion — How It's Used

**Version:** `framer-motion@12.38.0`

Three distinct usage patterns exist in this codebase:

### Pattern A — `motion.div` with `variants` (grids)

For stagger entrances. The parent container propagates animation state to children.
See [Grid Stagger Pattern](#6-grid-stagger-pattern).

### Pattern B — `motion.div` with direct `initial/animate` (page transitions)

For simple one-shot animations. No `useAnimation`, no programmatic control.
See [Page Transitions](#7-page-transitions).

### Pattern C — `useAnimation()` controls (player overlay)

For animations that need async control — waiting for exit to complete before calling teardown.
See [Player](#9-player--expandcollapse-from-card).

### Import

```ts
import { motion, useAnimation, AnimatePresence } from 'framer-motion';
```

`AnimatePresence` is **not currently used** for page transitions (removed — caused exit flash). Only use it for conditional mount/unmount where you need an exit animation and the component truly unmounts.

---

## 5. Card Pattern

All three card types (FileCard, LibraryCard, ProjectCard) share an identical hover/active system.

### Hover + Active Classes

```tsx
className="group relative overflow-hidden cursor-pointer rounded-lg border border-border bg-card
  transition-[transform,box-shadow,border-color] duration-200 ease-out will-change-transform
  hover:-translate-y-0.5 hover:scale-[1.012] hover:border-primary/40
  hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.3),0_8px_24px_rgba(0,0,0,0.4)]
  active:translate-y-0 active:scale-[0.99] active:duration-75"
```

| State | Transform | Duration |
|-------|-----------|----------|
| Default | none | — |
| Hover | `-translate-y-0.5 scale-[1.012]` | 200ms ease-out |
| Active | `translate-y-0 scale-[0.99]` | 75ms |

The `active` state is important — gives immediate tactile "press" feedback before the player opens.

### Accent Bar (top glow line)

```tsx
<div className="absolute top-0 left-0 right-0 h-[2px]
  bg-gradient-to-r from-amber-500/0 via-amber-500/70 to-amber-500/0
  opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />
```

All cards have this. It's the first child inside the card div.

### Icon Container (for non-video cards)

```tsx
<div className="aspect-video flex items-center justify-center rounded-t-lg overflow-hidden
  bg-[radial-gradient(ellipse_at_60%_40%,#292524,#09090b)]">
  <div className="relative flex items-center justify-center">
    <div className="absolute h-14 w-14 rounded-full bg-amber-500/[0.06] blur-md" />
    <Icon className="relative h-10 w-10 text-amber-500/35 drop-shadow-[0_0_6px_rgba(245,158,11,0.25)]" />
  </div>
</div>
```

- LibraryCard: `ellipse_at_60%_40%,#292524,#09090b`
- ProjectCard: `ellipse_at_40%_60%,#1c1917,#09090b`
- FolderCard (inside FileCard): `ellipse_at_50%_50%,#1c1917,#09090b`

The glow backdrop circle (`bg-amber-500/[0.06] blur-md`) and drop-shadow on the icon are required.

### Thumbnail (video cards)

```tsx
<div className="aspect-video rounded-t-lg overflow-hidden bg-zinc-900 relative">
  {!imgLoaded && <div className="card-image-skeleton" />}
  <img
    src={`/api/thumb?path=${encodeURIComponent(entry.path)}&w=200`}
    className={`w-full h-full object-cover transition-[transform,opacity] duration-300
      group-hover:scale-[1.04] ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
    onLoad={() => setImgLoaded(true)}
    onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_SVG; setImgLoaded(true); }}
  />
  {/* Play icon overlay on hover */}
  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent
    opacity-0 group-hover:opacity-100 transition-opacity duration-200
    flex items-center justify-center">
    <div className="rounded-full bg-black/50 backdrop-blur-sm p-2.5">
      <Play className="h-5 w-5 text-white fill-white" />
    </div>
  </div>
</div>
```

The image zooms to `scale-[1.04]` on card hover (200ms, separate from card scale via `transition-[transform,opacity]`).

---

## 6. Grid Stagger Pattern

Used in HomeView, LibraryView, ProjectView. Defined inline per view (not a shared utility).

### Variant objects

```ts
const gridContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const gridItem = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};
```

### JSX

```tsx
<motion.div
  key={`grid-${items.length}`}  // re-triggers stagger when data loads
  className="grid-cards"
  variants={gridContainer}
  initial="hidden"
  animate="show"
>
  {items.filter(isRenderable).map((item) => (
    <motion.div key={item.id} variants={gridItem}>
      <Card {...item} />
    </motion.div>
  ))}
</motion.div>
```

**Critical:** Add a `key` to the `motion.div` container that changes when data loads (e.g., `items.length`). Without this, the stagger animation fires when the grid is empty (on mount) and won't re-fire when data arrives.

**Also critical:** Filter items before wrapping in `motion.div`. If a card component returns `null` for certain entries (e.g., `FileCard` returns `null` for non-video/non-folder items), the `motion.div` wrapper still creates a grid cell. Always filter first:

```tsx
{entries.filter((e) => e.is_dir || e.is_video).map((entry) => (
  <motion.div key={entry.path} variants={gridItem}>
    <FileCard ... />
  </motion.div>
))}
```

---

## 7. Page Transitions

`frontend/components/layout/PageTransition.tsx` wraps `ConditionalLayout`'s children in `layout.tsx`.

```tsx
'use client';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
```

**Why no `AnimatePresence`:** Using `AnimatePresence mode="wait"` caused the old page to fade out (180ms blank screen) before the new page loaded, creating a double-flash. The current approach only fades *in* — no exit animation. Fast (150ms), subtle (6px drift).

---

## 8. Panels (Sheets)

`frontend/components/panels/PanelShell.tsx` uses shadcn's `<Sheet>` component, which already handles slide-in from the right with its own animation. **Do not replace with Framer Motion** — the Sheet animation is fine and removing it would require significant refactoring.

```tsx
<Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
  <SheetContent side="right" className="w-96 flex flex-col gap-0 p-0">
    <SheetHeader className="px-4 py-4 border-b border-white/[0.06] shrink-0">
      <SheetTitle>{title}</SheetTitle>
    </SheetHeader>
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {children}
    </div>
    {footer && (
      <div className="px-4 py-4 border-t border-white/[0.06] shrink-0">
        {footer}
      </div>
    )}
  </SheetContent>
</Sheet>
```

- Width: `w-96` (384px)
- Dividers: `border-white/[0.06]` — 6% white opacity, very subtle
- `shrink-0` on header/footer prevents flex compression

---

## 9. Player — Expand/Collapse from Card

`frontend/components/player/PlayerContainer.tsx`

The player is a `fixed inset-0` overlay that is **always mounted** (never unmounted — the HLS engine and `<video>` element must stay in the DOM). Visibility is controlled through opacity + pointer-events, not `display`.

### Key principle: never use `display: none` with `useAnimation`

If you toggle `display: none` on a Framer Motion element and then call `controls.set(...)`, the set won't take effect before the browser paints the newly-visible element. This causes the element to flash at its previous animation state before the animation starts. Always use `opacity: 0` + `pointer-events: none` instead.

### Capturing the source rect

When a card is clicked, capture its bounding rect and pass it to `startPlayback`:

```tsx
// FileCard.tsx
const handleCardClick = (e: React.MouseEvent) => {
  if (entry.is_video) onPlay(entry.path, (e.currentTarget as HTMLElement).getBoundingClientRect());
};

// LibraryView / ProjectView
const handleFilePlay = (path: string, rect?: DOMRect) => {
  startPlayback(path, 0, undefined, rect);
};
```

`sourceRect` is stored in `PlayerContext` and cleared on `stopPlayback`.

### Transform math

To make a `fixed inset-0` overlay look like a smaller element at position `rect`:

```ts
const getCardTransform = (rect: DOMRect) => ({
  scaleX: rect.width / window.innerWidth,
  scaleY: rect.height / window.innerHeight,
  x: rect.left + rect.width / 2 - window.innerWidth / 2,
  y: rect.top + rect.height / 2 - window.innerHeight / 2,
  borderRadius: 8,
  opacity: 0,
});
```

The `x/y` translates the center of the overlay to the card's center. `scaleX/scaleY` shrinks it to the card's dimensions.

### Open animation

```ts
useEffect(() => {
  if (!isVisible) return;
  if (sourceRect) {
    controls.set(getCardTransform(sourceRect));     // jump to card position instantly
    controls.start({                                 // spring to fullscreen
      scaleX: 1, scaleY: 1, x: 0, y: 0, borderRadius: 0, opacity: 1,
      transition: { type: 'spring', damping: 35, stiffness: 350, mass: 0.7 },
    });
  } else {
    controls.set({ scaleX: 1, scaleY: 1, x: 0, y: 0, borderRadius: 0, opacity: 0 });
    controls.start({ opacity: 1, transition: { duration: 0.18 } });
  }
}, [isVisible]);
```

### Close animation

```ts
const handleClose = useCallback(async () => {
  if (sourceRect) {
    await controls.start({
      ...getCardTransform(sourceRect),
      transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },  // fast-in ease
    });
  } else {
    await controls.start({ opacity: 0, transition: { duration: 0.15 } });
  }
  stopPlayback();  // HLS teardown happens AFTER animation completes
}, [sourceRect, controls, getCardTransform, stopPlayback]);
```

The close is `async/await` — this ensures `stopPlayback()` (which clears state and destroys HLS) only runs after the animation finishes.

### The motion.div

```tsx
<motion.div
  id="playerContainer"
  className="fixed inset-0 z-[9999] flex flex-col bg-black"
  initial={{ opacity: 0 }}           // invisible on first mount
  animate={controls}
  style={{ pointerEvents: isVisible ? 'auto' : 'none', willChange: 'transform, opacity' }}
>
```

### Keyboard close

The Escape key handler uses a ref to always have the latest `handleClose`:

```ts
const handleCloseRef = useRef<() => void>(() => {});
useEffect(() => { handleCloseRef.current = handleClose; }, [handleClose]);

// In keyboard useEffect:
case 'escape': handleCloseRef.current(); break;
```

---

## 10. Scroll Lock

Applied in `PlayerContainer` whenever the player is visible:

```ts
useEffect(() => {
  if (isVisible) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
  return () => { document.body.style.overflow = ''; };
}, [isVisible]);
```

Use this pattern for any fullscreen overlay that should prevent background scroll.

---

## 11. Animation Timing Reference

| Element | Duration | Easing / Type |
|---------|----------|---------------|
| Page fade-in | 150ms | `ease-out` |
| Card hover | 200ms | `ease-out` |
| Card active (press) | 75ms | default |
| Button hover | 120ms | `ease` |
| Button active | 60ms | `ease` |
| Accent bar fade | 300ms | default |
| Skeleton shimmer | 1400ms ∞ | `ease` |
| Image fade-in on load | 300ms | default |
| Grid item stagger | 220ms | `cubic-bezier(0.25, 0.1, 0.25, 1)` |
| Stagger delay per item | 40ms | — |
| Player open (spring) | physics | damping 35, stiffness 350, mass 0.7 |
| Player open (no rect) | 180ms | — |
| Player close (to rect) | 220ms | `cubic-bezier(0.4, 0, 1, 1)` |
| Player close (fade) | 150ms | — |
| Controls auto-hide | 300ms | default |
| Seekbar height expand | 150ms | `ease-out` |
| Volume slider expand | 200ms | `ease-out` |
| Thumbnail scale on hover | 300ms | default |

---

## 12. Do's and Don'ts

### Do

- **Always filter `null`-returning cards** before wrapping in `motion.div` grid items — empty wrappers create blank grid cells
- **Key grids on data length** (`key={items.length}`) so stagger re-fires after async data loads
- **Use `opacity` + `pointer-events: none`** for hidden-but-mounted elements, never `display: none` when using `useAnimation`
- **Use `will-change-transform`** on animated cards and overlays — keeps them on the GPU compositing layer
- **Transition only `transform` and `opacity`** — animating `width`, `height`, `right`, `top` etc. causes layout repaints (jank)
- **Separate scroll container from clip container** for dropdowns: outer `overflow-hidden rounded-lg`, inner `overflow-y-auto max-h-*`. Combining both on one element breaks border-radius clipping during spring/elastic scroll
- **Use `handleCloseRef` pattern** when keyboard handlers need to call an async close function
- **Await close animation** before calling teardown (HLS destroy, state clear, etc.)
- **Match spring physics** to the size of the element — larger elements need more damping/mass

### Don't

- Don't use `AnimatePresence` for page-level transitions — causes the old page to fade out (blank screen) before the new page renders
- Don't use `right: -400px → 0` CSS transitions — use `transform: translateX` instead (GPU composited)
- Don't animate `border-radius` alone to round corners during transitions — pair it with `transform` or it repaints
- Don't add framer-motion to `PanelShell` — the shadcn Sheet component already handles slide animation
- Don't put `overflow-y-auto` and `overflow-hidden` on the same element if you care about border-radius clip
- Don't use fat native scrollbars in dropdowns — use custom webkit scrollbar: `[&::-webkit-scrollbar]:w-[3px]`
- Don't apply `.btn` scale to small icon buttons — the target is too small for scale feedback to feel good
- Don't stagger more than ~15 items (0.04 × 15 = 600ms total wait) — increase the stagger threshold or cap it
