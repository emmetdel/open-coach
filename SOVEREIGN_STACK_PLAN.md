# OpenCoach Sovereign Stack Plan

## Overview

This document outlines the complete plan to achieve 100% data sovereignty for OpenCoach by eliminating all external dependencies (Garmin Cloud, OpenRouter, Web Push services).

**Goal**: Run data never leaves your infrastructure. Complete privacy and control.

---

## Architecture Overview

```
┌────────────────────────────────────────────────┐
│  HARDWARE: Suunto Run ($249)                   │
│  • GPS + HR + 4GB music storage                │
│  • USB mass storage (no proprietary software)  │
│  • Bluetooth headphones                        │
│  • Never connects to Suunto cloud              │
└────────────────────────────────────────────────┘
                    │
                    │ USB Cable
                    ↓
┌────────────────────────────────────────────────┐
│  YOUR SERVER (Bun + Docker)                    │
│                                                 │
│  ┌──────────────────────────────────────────┐ │
│  │ OpenCoach (SvelteKit)                    │ │
│  │ • FIT file importer (drag-drop web UI)   │ │
│  │ • Music manager (upload MP3s)            │ │
│  │ • Training plan + analytics              │ │
│  │ • SQLite database (all your data)        │ │
│  └──────────────────────────────────────────┘ │
│                                                 │
│  ┌──────────────────────────────────────────┐ │
│  │ Ollama (Llama 3.3 8B)                    │ │
│  │ • Local AI coaching (no API calls)       │ │
│  │ • 2-5s response time on CPU              │ │
│  │ • <1s on GPU if available                │ │
│  └──────────────────────────────────────────┘ │
│                                                 │
│  ┌──────────────────────────────────────────┐ │
│  │ ntfy (self-hosted)                       │ │
│  │ • Push notifications                     │ │
│  │ • No Google/Apple servers                │ │
│  │ • Mobile app + web push                  │ │
│  └──────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

---

## Daily Workflow (After Implementation)

### After Your Run:

1. Plug Suunto Run into computer via USB
2. Watch mounts as `/Volumes/SUUNTO` (macOS) or `/media/SUUNTO` (Linux)
3. OpenCoach auto-detects watch, imports new `.FIT` files
4. Ollama analyzes run, generates local AI feedback
5. Data stored in your SQLite database
6. Unplug watch

**Time: 10 seconds**

### Loading Music:

1. Plug watch into computer
2. Drag MP3s to `/Volumes/SUUNTO/Music/` or use OpenCoach web UI
3. Unplug
4. Music plays via Bluetooth headphones

**Time: 30 seconds**

---

## Implementation Phases

### Phase 1: Add FIT File Import (No Breaking Changes)

**Goal**: Support both Garmin AND Suunto Run via file upload

#### 1.1 New API Endpoint: `/api/import-fit`

```typescript
POST /api/import-fit
Content-Type: multipart/form-data

Accepts: .FIT, .GPX files
Returns: { imported: number, skipped: number }
```

**Implementation:**
- Install `fit-file-parser` package
- Parse uploaded FIT files
- Extract: distance, duration, date, heart rate, GPS polyline
- Convert to same format as Garmin sync
- Insert into `runs` table (reuse existing DB schema)
- Trigger AI feedback generation (reuse existing `analyzeRun`)

#### 1.2 New UI Component: File Upload Widget

**Location**: Dashboard (`src/routes/+page.svelte`)

```
┌─────────────────────────────────────┐
│  📁 Import from Suunto Run          │
│                                     │
│  [Drag .FIT files here or click]   │
│                                     │
│  Imported: 5 runs • Skipped: 2     │
└─────────────────────────────────────┘
```

**Features:**
- Drag-drop multiple files
- Auto-detect duplicates (skip if already imported)
- Show import progress
- Works alongside existing Garmin sync

**Why this approach:**
- No breaking changes to existing Garmin users
- Test FIT import thoroughly before removing Garmin
- Can transition gradually

#### 1.3 Testing Checklist

- [ ] Upload single FIT file → verify appears in dashboard
- [ ] Upload duplicate → verify skipped
- [ ] Upload 10 files at once → verify all import
- [ ] Check AI feedback generates correctly
- [ ] Verify GPS polyline renders on map

**Estimated Time**: 4-6 hours

---

### Phase 2: Replace OpenRouter with Ollama

**Goal**: All AI runs locally, zero external API calls

#### 2.1 Add Ollama Service to Docker Compose

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    volumes:
      - ./data/ollama:/root/.ollama
    ports:
      - "11434:11434"
    # Optional: GPU support
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]
```

#### 2.2 Update AI Coach Service

**File**: `src/lib/server/coach.ts`

**Before:**
```typescript
fetch('https://openrouter.ai/api/v1/chat/completions', {
  headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}` }
})
```

**After:**
```typescript
fetch('http://ollama:11434/v1/chat/completions', {
  // No auth needed - local service
})
```

**Changes needed:**
- Make OpenRouter API key optional in settings
- Add "AI Provider" dropdown: `OpenRouter` or `Local (Ollama)`
- Update prompts to work with Llama 3.3 (slightly different than Claude)
- Add model selection for Ollama models

#### 2.3 Setup Script

```bash
# One-time setup
docker compose exec ollama ollama pull llama3.3:8b
```

**Why this approach:**
- Can switch between OpenRouter/Ollama in settings
- Test AI quality before committing
- No data leaves your server when using Ollama

#### 2.4 Testing Checklist

- [ ] Install Ollama, pull llama3.3:8b
- [ ] Generate feedback for test run
- [ ] Compare quality vs OpenRouter
- [ ] Measure response time
- [ ] Test with no internet connection

**Estimated Time**: 2-3 hours

---

### Phase 3: Replace Web Push with ntfy

**Goal**: Notifications without Google/Apple/Mozilla servers

#### 3.1 Add ntfy Service

```yaml
services:
  ntfy:
    image: binwiederhier/ntfy
    command: serve
    volumes:
      - ./data/ntfy:/var/cache/ntfy
    ports:
      - "8080:80"
```

#### 3.2 Update Notification Service

**File**: `src/lib/server/notifications.ts`

**Before:**
```typescript
// Uses Web Push API → Google FCM / Apple Push / Mozilla
webpush.sendNotification(subscription, payload)
```

**After:**
```typescript
// Direct HTTP call to your ntfy server
fetch('http://ntfy:80/opencoach', {
  method: 'POST',
  body: JSON.stringify({
    topic: 'opencoach',
    title: 'Run synced!',
    message: '3.2 miles in 25:30'
  })
})
```

#### 3.3 Mobile App Setup (User Side)

1. Install ntfy app (iOS/Android - open source)
2. Subscribe to topic: `http://your-server.com:8080/opencoach`
3. Receive notifications directly from your server

**Why this approach:**
- No third-party push services
- Works on all platforms
- ntfy app is fully open source
- Can even use email/SMS fallback

#### 3.4 Testing Checklist

- [ ] Send test notification via ntfy
- [ ] Subscribe on phone, verify receives
- [ ] Test reminder notifications
- [ ] Test run sync notifications

**Estimated Time**: 2-3 hours

---

### Phase 4: Add Music Management UI

**Goal**: Web interface to manage watch music

#### 4.1 Music Library Page

**File**: `src/routes/music/+page.svelte`

```
┌─────────────────────────────────────────┐
│  🎵 Music Library                       │
│                                         │
│  [Upload MP3s]  [Sync to Watch]        │
│                                         │
│  📁 Running Playlist (1.2 GB / 4 GB)   │
│  • Song 1.mp3              [Remove]     │
│  • Song 2.mp3              [Remove]     │
│  • Song 3.mp3              [Remove]     │
│                                         │
│  Watch Status: Connected ✓              │
│  Free Space: 2.8 GB                     │
└─────────────────────────────────────────┘
```

**Features:**
- Upload MP3s to server library
- Auto-detect when Suunto Run is plugged in (USB detection)
- One-click sync to watch
- Manage playlists
- Show watch storage capacity

#### 4.2 USB Watch Detection

**Options:**
1. **Manual mode**: User clicks "Import" after plugging in
2. **Auto-detect** (macOS/Linux): Monitor `/Volumes/` or `/media/` for SUUNTO mount
3. **Web USB API** (experimental): Direct browser access to USB device

**Recommendation**: Start with manual, add auto-detect later

#### 4.3 Testing Checklist

- [ ] Upload MP3 to web interface
- [ ] Detect Suunto Run when plugged in
- [ ] Copy files to watch via script
- [ ] Verify music plays on watch

**Estimated Time**: 6-8 hours

---

### Phase 5: Remove Garmin Dependencies

**Goal**: Complete independence from Garmin ecosystem

#### 5.1 What Gets Removed

- `src/lib/server/garmin.ts` - entire file
- `garmin-connect` npm package
- `/api/garmin/*` - all auth endpoints
- Garmin setup wizard steps
- Garmin OAuth token storage
- Cron job for token refresh

#### 5.2 What Gets Updated

- Setup wizard → just OpenRouter key (or skip if using Ollama)
- Settings page → remove Garmin credentials section
- Dashboard → "Sync" button becomes "Import Files"
- Cron sync job → removed or repurposed

#### 5.3 Database Cleanup

- Rename `garmin_activity_id` → `activity_id` (more generic)
- Remove Garmin token entries from `user_settings`
- Migrations to handle existing data

**Why last:**
- Risky - can't go back
- Only do after everything else works
- Users can choose to keep Garmin or migrate

#### 5.4 Testing Checklist

- [ ] Remove Garmin code
- [ ] Run full app without Garmin
- [ ] Verify no broken dependencies
- [ ] Check cron jobs work

**Estimated Time**: 2-3 hours

---

### Phase 6: New Features (Sovereign-Specific)

#### 6.1 Voice Check-Ins (Using Local Whisper)

**Future addition:**
- Install whisper.cpp or faster-whisper
- Web interface: record 30s voice note after run
- Transcribe locally (no OpenAI API)
- Feed into AI analysis
- Store in new `voice_logs` table

#### 6.2 Adaptive Daily Planning

**As discussed:**
- Replace weekly plan with daily suggestions
- "Today's run: Easy 20 min based on last 3 hard efforts"
- Injury risk dashboard
- Recovery tracking

#### 6.3 Offline-First Architecture

**Progressive Web App:**
- Cache all pages for offline use
- Queue run imports when offline
- Sync when connection returns
- Works even if server is down

---

## File Structure Changes

### New Files to Create

```
src/routes/api/import-fit/+server.ts       # FIT file upload handler
src/routes/music/+page.svelte              # Music management UI
src/routes/music/+server.ts                # Music upload API
src/lib/parsers/fit.ts                     # FIT file parsing logic
src/lib/parsers/gpx.ts                     # GPX file parsing logic
src/lib/server/ollama.ts                   # Ollama client wrapper
src/lib/server/ntfy.ts                     # ntfy notification client
src/lib/components/FileUpload.svelte       # Drag-drop component
docker-compose.sovereign.yml               # Full sovereign stack
```

### Files to Modify

```
src/lib/server/coach.ts                    # Add Ollama support
src/lib/server/db.ts                       # Generic activity IDs
src/routes/+page.svelte                    # Add file upload widget
src/routes/settings/+page.svelte           # AI provider selection
docker-compose.yml                         # Add ollama + ntfy
package.json                               # Add fit-file-parser
```

### Files to Remove (Phase 5 only)

```
src/lib/server/garmin.ts
src/routes/api/garmin/*
src/routes/setup/+page.svelte              # Simplify
```

---

## Migration Paths for Existing Users

### Option A: Keep Both

- Garmin sync for auto-sync
- FIT upload for Suunto runs
- Gradual transition

### Option B: Full Migration

1. Export all runs from Garmin Connect as FIT files
2. Import to OpenCoach via new endpoint
3. Delete Garmin account (optional)
4. Switch to Suunto Run

### Option C: Hybrid Forever

- Keep using Garmin for now
- But use Ollama for AI (sovereign)
- And ntfy for notifications (sovereign)
- 90% sovereign, still convenient

---

## Resource Requirements

### Server/Computer

- **Minimum**: 8GB RAM, 4 cores (for Ollama CPU mode)
- **Recommended**: 16GB RAM, 8 cores
- **Optimal**: 32GB RAM + GPU (RTX 3060 or better)

### Storage

- **OpenCoach DB**: ~100 MB (for 1000 runs)
- **Ollama models**: ~5 GB (llama3.3:8b)
- **Music library**: ~4 GB (to match watch capacity)
- **Total**: ~10 GB minimum

### Hardware Purchase

- **Suunto Run**: $249
- **USB-C cable**: Included
- **Bluetooth headphones**: $30-200 (if you don't have)
- **Total**: ~$279-450

---

## Timeline Estimate

| Phase | Description | Time |
|-------|-------------|------|
| Phase 1 | FIT Import | 4-6 hours |
| Phase 2 | Ollama | 2-3 hours |
| Phase 3 | ntfy | 2-3 hours |
| Phase 4 | Music UI | 6-8 hours |
| Phase 5 | Remove Garmin | 2-3 hours |
| Testing | All phases | 4-6 hours |
| **Total** | | **20-29 hours** |

**Calendar time**: 2-3 weeks if working part-time

---

## Risks & Mitigations

### Risk 1: Suunto Run FIT Format Incompatibility
**Mitigation**: Test with sample files first, GPX fallback

### Risk 2: Ollama Quality Not Good Enough
**Mitigation**: Keep OpenRouter as fallback option in settings

### Risk 3: ntfy Notifications Don't Work Reliably
**Mitigation**: Keep Web Push as alternative, make it configurable

### Risk 4: Music Sync is Clunky
**Mitigation**: Start with manual drag-drop, iterate on UX

### Risk 5: Performance Issues with Local AI
**Mitigation**: Make async, show "Generating feedback..." spinner

---

## Decision Points

### Before Starting:

1. **Buy Suunto Run now or wait?** (Can test with FIT files from other sources first)
2. **Keep Garmin as fallback?** (Yes, build alongside, remove later)
3. **GPU for Ollama?** (Optional, CPU works fine for coaching)

### During Build:

1. **Ollama vs OpenRouter default?** (Ollama for sovereignty, OpenRouter for speed)
2. **Auto-detect watch or manual?** (Manual is simpler)
3. **Remove Garmin entirely?** (Make it optional, user choice)

---

## What This Achieves

✅ **100% Data Sovereignty**: All data on your server
✅ **No Cloud Dependencies**: Works offline
✅ **Open Standards**: FIT/GPX files
✅ **Self-Hosted AI**: Ollama runs locally
✅ **Self-Hosted Notifications**: ntfy on your server
✅ **Music Freedom**: Any MP3, no DRM
✅ **Privacy**: Zero tracking, zero analytics
✅ **Portability**: Standard file formats, can migrate anytime

---

## References

- [Suunto Run In-Depth Review](https://www.dcrainmaker.com/2025/05/suunto-run-in-depth-review.html)
- [Suunto Watch Comparison](https://us.suunto.com/pages/compare-watches)
- [Suunto 9 Peak Pro Review](https://www.dcrainmaker.com/2022/11/suunto9-depth-review.html)
- [Movesense Products](https://www.movesense.com/products/)
- [Ollama Documentation](https://ollama.ai/)
- [ntfy Documentation](https://ntfy.sh/)

---

## Next Steps

1. Review this plan and decide on phase priority
2. Order Suunto Run ($249) or test with existing FIT files
3. Start with Phase 1 (FIT import) to validate approach
4. Iterate based on real-world testing

---

**Last Updated**: 2026-01-11
**Status**: Planning
**Target**: Complete data sovereignty
