# Design Guidelines: Web-Based Android Emulator Platform

## Design Approach

**Selected System:** Material Design 3  
**Justification:** Material Design aligns perfectly with Android emulation context, provides robust patterns for technical interfaces, and offers excellent component libraries for complex interactions.

**Core Principles:**
- Functionality-first with clear information hierarchy
- Familiar Android design language for user comfort
- Efficient workflows with minimal friction
- Professional technical aesthetic

## Typography

**Font Family:** Roboto (via Google Fonts CDN)

**Hierarchy:**
- Page Titles: Roboto Medium, 2rem (text-2xl)
- Section Headers: Roboto Medium, 1.5rem (text-xl)
- Card Titles: Roboto Medium, 1.125rem (text-lg)
- Body Text: Roboto Regular, 1rem (text-base)
- Captions/Labels: Roboto Regular, 0.875rem (text-sm)
- Device Info/Specs: Roboto Mono, 0.813rem (text-xs) for technical data

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, and 8 (p-2, m-4, gap-6, h-8, etc.)

**Grid Structure:**
- Main container: max-w-7xl with px-4
- Two-column layout: Left sidebar (device selection/file manager) at w-80, main emulator viewer fills remaining space
- Responsive: Stack to single column on mobile (below md breakpoint)

## Component Library

### APK Upload Zone
- Large drag-drop area with dashed border (border-2 border-dashed)
- Center-aligned icon (cloud upload from Material Icons, size 48px)
- Primary text: "Drag APK file here or click to browse"
- Secondary text: "Supports .apk files up to 200MB"
- Min height: h-48
- Padding: p-8

### Device Selection Panel
- Vertical list of device cards in sidebar
- Each card: p-4, rounded-lg border
- Device thumbnail icon on left (h-12 w-12)
- Device name and specs in text hierarchy
- Radio button selection indicator
- Hover state with subtle elevation change

### Emulator Viewer
- Centered device frame visualization with aspect ratio container
- Phone bezel/frame graphic around iframe embed
- Loading skeleton with spinner during initialization
- Control bar below: Full-screen, Rotate, Screenshot, Close session buttons
- Session timer display in top-right of control bar

### File Manager Section
- Accordion-style collapsible panel
- Grid view of uploaded APKs: 2-column on desktop, 1-column mobile
- Each APK card shows: App icon placeholder, filename, size, upload date
- Action buttons: Run, Delete (icon buttons, size 8)
- Empty state with illustration and "No APKs uploaded" message

### Session Controls
- Floating action button cluster (bottom-right on mobile, integrated on desktop)
- Primary: "Run APK" button (elevated, large)
- Secondary: Device rotation, volume, home/back navigation buttons
- Compact icon-only buttons with tooltips

### Navigation Header
- Fixed top bar, h-16
- Logo/title on left
- Account/settings dropdown on right
- Optional: Session status indicator in center

### Loading States
- Linear progress bar at top of viewport during APK upload
- Circular spinner with percentage for emulator initialization
- Skeleton screens for device list while loading

### Status Indicators
- Chip components for session state: "Running", "Idle", "Installing"
- Small badge on device cards showing availability
- Toast notifications (bottom-left) for actions: "APK uploaded", "Session started"

## Icons
**Library:** Material Icons via CDN  
**Key icons needed:** cloud_upload, phone_android, play_arrow, stop, screenshot, rotate_right, fullscreen, folder, delete, settings, account_circle

## Animations
Use sparingly:
- Smooth 200ms transitions on button hovers and card selections
- 300ms ease-in-out for panel expansions/collapses
- Subtle scale transform on drag-drop zone when file hovers (scale-105)
- No complex scroll animations or excessive motion

## Images
**Device Frame Images:**
- High-quality PNG device bezels (Galaxy S21, Pixel 6, etc.) to frame emulator viewport
- Transparent backgrounds, positioned absolutely around iframe
- Fallback: Simple rounded rectangle if device images unavailable

**Empty States:**
- Simple line illustration for "No APKs" state in file manager
- Upload cloud icon illustration in drag-drop zone

**No hero image needed** - this is a utility application, not a marketing page.

## Critical Layout Notes
- Emulator viewer must maintain 16:9 or device-specific aspect ratio
- Sidebar should be scrollable independently from main content
- Controls must remain accessible (sticky or floating) when emulator is fullscreen
- Mobile: Stack all panels vertically with emulator viewer taking priority position