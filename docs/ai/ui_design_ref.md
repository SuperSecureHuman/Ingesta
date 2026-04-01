# UI Design Reference — HLS POC Frontend

Everything needed to implement new UI in this project correctly.

---

## Stack

| Layer | Tool | Version |
|---|---|---|
| Framework | Next.js (App Router) | 15 |
| Components | shadcn/ui (Base UI primitives) | v4 |
| Styling | Tailwind CSS | v4 |
| Icons | Lucide React | latest |
| Toasts | Sonner | latest |

---

## Tailwind v4 — Critical Differences

Tailwind v4 is a **breaking change** from v3. Do NOT use v3 patterns.

```css
/* globals.css — correct imports */
@import "tailwindcss";
@import "shadcn/tailwind.css";   /* shadcn CSS variables + base styles */
```

- No `tailwind.config.js` `theme.extend.colors` needed — use CSS variables instead
- No `bg-opacity-*` utility — use `/` slash syntax: `bg-black/50`
- No `theme()` in CSS — use `var(--token)` directly
- Arbitrary values work normally: `bg-[#1a1a1a]`, `w-[calc(100%-2rem)]`

---

## Color System — OKLCH CSS Variables

Colors are defined as **complete OKLCH values**, not HSL parts.

```css
/* In shadcn/tailwind.css — what the variables look like */
:root {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --card: oklch(0.205 0 0);
  --border: oklch(1 0 0 / 10%);
  --muted-foreground: oklch(0.708 0 0);
  /* ... */
}
```

### CRITICAL: Do NOT wrap with hsl()

```css
/* WRONG — silently produces white/broken output */
body { background-color: hsl(var(--background)); }

/* CORRECT — use the variable directly */
body { background-color: var(--background); }
```

### Using colors in Tailwind classes

shadcn maps CSS variables to Tailwind tokens automatically:

| CSS variable | Tailwind class |
|---|---|
| `--background` | `bg-background` |
| `--foreground` | `text-foreground` |
| `--primary` | `bg-primary`, `text-primary` |
| `--card` | `bg-card` |
| `--border` | `border-border` |
| `--muted-foreground` | `text-muted-foreground` |
| `--accent` | `bg-accent` |
| `--destructive` | `bg-destructive`, `text-destructive` |
| `--ring` | `ring-ring` |

For opacity variants: `text-primary/50`, `bg-primary/20`, etc.

### Zinc scale (direct use for dark surfaces)

When you need more control than CSS variables:

```
bg-zinc-950   — deepest background (dropdowns, overlays)
bg-zinc-900   — card surfaces, thumbnails
bg-zinc-800   — hover states on zinc-900
bg-zinc-700   — borders, dividers
text-zinc-400 — secondary/muted text
text-zinc-300 — primary text on dark bg
text-zinc-100 — high-emphasis text
```

---

## Dropdown / Popover — Must Be Opaque

All dropdowns use `bg-zinc-950` with an explicit border. Never use `bg-popover` (it can be semi-transparent).

```tsx
/* SelectContent, DropdownMenuContent */
className="bg-zinc-950 border border-zinc-800 shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
```

This is already baked into:
- `components/ui/select.tsx` — `SelectContent`
- `components/ui/dropdown-menu.tsx` — `DropdownMenuContent`

---

## Shadcn v4 + Base UI — Key Patterns

shadcn v4 wraps **Base UI** primitives, not Radix. The APIs differ significantly.

### Select

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

<Select value={value} onValueChange={(v) => setState(v ?? 'fallback')}>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
  </SelectContent>
</Select>
```

**Gotchas:**
- `onValueChange` receives `string | null` — always handle null: `(v) => setState(v ?? '')`
- `alignItemWithTrigger` prop on `SelectContent` controls width matching

### Slider

```tsx
import { Slider } from '@/components/ui/slider';

// Single number — NOT an array like Radix
<Slider value={0.75} onValueChange={(v) => setVal(v as number)} min={0} max={1} step={0.01} />
```

### DropdownMenu

```tsx
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

<DropdownMenu>
  <DropdownMenuTrigger>Open</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onSelect={() => doSomething()}>Item</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**Nested button hydration error:** If the trigger wraps another `<button>`, use both props together:

```tsx
<DropdownMenuTrigger render={<div />} nativeButton={false}>
  <SomeButtonComponent />
</DropdownMenuTrigger>
```

`render={<div />}` changes the DOM element; `nativeButton={false}` tells Base UI the element is intentionally non-native. Both are required together.

### Button

```tsx
import { Button } from '@/components/ui/button';

<Button variant="default">Primary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Delete</Button>
<Button size="sm">Small</Button>
<Button size="icon" className="h-7 w-7">
  <SomeIcon className="h-3.5 w-3.5" />
</Button>
```

### Badge

```tsx
import { Badge } from '@/components/ui/badge';

<Badge variant="outline" className="text-[10px] px-1.5 py-0">label</Badge>
```

---

## Layout Structure

```
app/layout.tsx (server, exports metadata)
  └─ AppContextProvider (client)
       └─ ConditionalLayout (client — reads currentUser from context)
            ├─ if not logged in: renders children bare (login page)
            └─ if logged in: AuthenticatedLayout (server)
                  ├─ SidebarProvider
                  ├─ AppSidebar (left sidebar)
                  └─ SidebarInset
                       ├─ sticky header (SidebarTrigger + AppBreadcrumb)
                       └─ <main> — page content goes here
```

**Rule:** Never put sidebar-related JSX in `app/layout.tsx` — it must stay a server component (exports `metadata`). All conditional client logic lives in `ConditionalLayout`.

---

## Card Pattern

All cards share this base:

```tsx
<div className="group relative overflow-hidden cursor-pointer rounded-lg border border-border bg-card
  transition-[transform,box-shadow,border-color] duration-200 ease-out will-change-transform
  hover:-translate-y-0.5 hover:scale-[1.012] hover:border-primary/40
  hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.3),0_8px_24px_rgba(0,0,0,0.4)]
  active:translate-y-0 active:scale-[0.99] active:duration-75">
```

### Thumbnail area with icon (Library/Project/Folder cards)

```tsx
{/* Amber accent bar — fades in on hover */}
<div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/0 via-amber-500/70 to-amber-500/0
  opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />

{/* Gradient bg + subtle icon glow */}
<div className="aspect-video flex items-center justify-center rounded-t-lg overflow-hidden
  bg-[radial-gradient(ellipse_at_60%_40%,#292524,#09090b)]">
  <div className="relative flex items-center justify-center">
    <div className="absolute h-14 w-14 rounded-full bg-amber-500/[0.06] blur-md" />
    <SomeIcon className="relative h-10 w-10 text-amber-500/35 drop-shadow-[0_0_6px_rgba(245,158,11,0.25)]" />
  </div>
</div>
```

### Thumbnail area with image (video files)

```tsx
<div className="aspect-video rounded-t-lg overflow-hidden bg-zinc-900 relative">
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img
    src={`/api/thumb?path=${encodeURIComponent(path)}&w=200`}
    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
    alt={name}
    onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_SVG; }}
  />
  {/* Play overlay on hover */}
  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent
    opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
    <div className="rounded-full bg-black/50 backdrop-blur-sm p-2.5">
      <Play className="h-5 w-5 text-white fill-white" />
    </div>
  </div>
</div>
```

**Note on `<img>`:** Thumbnails come from `/api/thumb` (dynamic FastAPI endpoint), so `next/image` optimization can't be used. Always add `{/* eslint-disable-next-line @next/next/no-img-element */}` above each.

### Card footer (info area)

```tsx
<div className="px-3 py-2">
  <div className="font-medium text-sm truncate">{name}</div>
  <div className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</div>
</div>
```

### Hover action buttons (top-right corner)

```tsx
<div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
  <Button variant="ghost" size="icon"
    className="h-7 w-7 bg-zinc-950/60 backdrop-blur-sm hover:bg-zinc-950/80">
    <SomeIcon className="h-3.5 w-3.5" />
  </Button>
</div>
```

---

## Panels (Side Drawer)

All panels use `PanelShell` as a wrapper:

```tsx
import PanelShell from '@/components/panels/PanelShell';

<PanelShell
  isOpen={isOpen}
  title="Panel Title"
  onClose={onClose}
  error={errorString}   // optional — shows red error banner
  footer={               // optional — sticky footer with action buttons
    <div className="flex gap-3">
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button className="flex-1" onClick={handleSave}>Save</Button>
    </div>
  }
>
  {/* panel body content */}
</PanelShell>
```

---

## Toast Notifications

Uses Sonner. The `<Toaster />` is mounted in `app/layout.tsx`.

```tsx
import { toast } from 'sonner';

toast.success('Saved!');
toast.error('Something went wrong');
toast('Neutral message');
```

---

## Player

The player is a **fixed full-viewport overlay** (`fixed inset-0 z-[9999]`). It is rendered by `PlayerContainer` and controlled via `PlayerContext`.

```tsx
import { usePlayerContext } from '@/context/PlayerContext';

const { startPlayback, stopPlayback, isVisible } = usePlayerContext();

// Start playing a file
startPlayback(filePath);
```

`PlayerContainer` must be mounted inside a `PlayerContextProvider`. It handles its own visibility — only renders when `isVisible` is true.

---

## LUT Context

For LUT (color grading) state across the player:

```tsx
import { useLutContext } from '@/context/LutContext';

const { availableLuts, activeLutId, applyLut, clearLut } = useLutContext();
```

---

## useEffect Dependency Warnings

Several init-only `useEffect` calls intentionally omit functions from the dep array to avoid infinite loops (functions are defined after the effect or would cause re-runs on every render). Suppress these with:

```tsx
useEffect(() => {
  loadData();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

The comment must be on the line **immediately before** the closing `}, [dep])` line — not before `useEffect(`.

---

## Global CSS (globals.css)

Keep this file minimal. Current structure:

```css
@import "tailwindcss";
@import "shadcn/tailwind.css";

@layer base {
  body {
    background-color: var(--background);   /* NOT hsl(var(--background)) */
    color: var(--foreground);
  }
}

@keyframes fadeOut { ... }   /* used by player flash animation */
.grid-cards { ... }          /* responsive card grid layout */
```

Do not add legacy class-based styles (`.btn`, `.card`, `.panel`, etc.). Use Tailwind utilities and shadcn components instead.

---

## Accent Color

The project accent color is **amber** (`amber-500` / `#f59e0b`). Used for:
- Seekbar progress fill
- LUT indicator dot
- Card icon glow tint
- Top accent bar on cards
- Spinner/loading ring border

---

## File Structure (Frontend)

```
frontend/
  app/
    layout.tsx                    — root layout (server, exports metadata)
    globals.css                   — minimal global styles
    page.tsx                      — home (redirects based on auth)
    library/[slug]/[[...path]]/   — library browse page
    project/[projectId]/          — project detail page
    share/[shareId]/              — share viewer (public)
    settings/                     — settings page
  components/
    cards/                        — LibraryCard, ProjectCard, FileCard
    custom/                       — ConfirmOverlay, SelectionToolbar, Spinner, FsBrowserModal
    layout/                       — AppSidebar, AppBreadcrumb, ConditionalLayout, AuthenticatedLayout
    panels/                       — PanelShell + all side panels
    player/                       — PlayerContainer
    ui/                           — shadcn primitives (button, select, slider, etc.)
    views/                        — HomeView, LibraryView, ProjectView
  context/                        — AppContext, PlayerContext, LutContext, PanelContext
  hooks/                          — useAuth, usePanels, useSelection
  lib/                            — api.ts, types.ts, utils.ts
```
