# SnapDialer Core Architectural Memory & System Specification

> **Version**: 2.4.0 • **Target OS**: iOS, Android, Mobile Web (PWA) • **Hosting**: Surge.sh (`https://valuteachers-dialer.surge.sh`)  
> **Repository Remote**: GitHub (`origin/main`, `origin/master`) • **Database**: SQLite (Native) / Dexie & IndexedDB (Web)

---

## 1. System Topology & Navigation Hierarchy

### 1.1 Navigation Tree
SnapDialer uses a nested React Navigation architecture composed of a root **Native Stack Navigator** and an inner **Bottom Tab Navigator** (`MainTabs`):

```
Root StackNavigator (AppNavigator.tsx)
 ├── MainTabs (createBottomTabNavigator)
 │    ├── Lists ("Educators" / Pipeline Dashboard)
 │    ├── Queue (Dialer HUD / Active Dialing Session)
 │    ├── PlanningHeatmap ("Schedule" / Bell Schedules & Prime Calling Windows)
 │    ├── Analytics (Production Ledger, KPIs & Ratios)
 │    └── Settings (PIN Lock, Voice Speed, AI Prompt Tuning, Backups)
 ├── LeadDetailScreen ("LeadDetail" - Full Educator Dossier, Notes & Portfolio)
 ├── DialerHudScreen ("DialerHUD" - Single/Batch Power Calling Cockpit)
 ├── ScanSheetScreen ("ScanSheet" - AI OCR Gemini Camera Scanner)
 └── CadenceSettingsScreen ("CadenceSettings" - Multi-Touch Cadence Rules)
```

### 1.2 Stack-to-Tab Navigation Resolution Rule
- **CRITICAL**: Stack screens (such as `DialerHudScreen` and `LeadDetailScreen`) CANNOT directly call `navigation.navigate('Lists')`. In React Navigation, attempting to navigate to a nested child route of a sibling without specifying the parent route name will fail silently or drop the action with:
  `The action 'NAVIGATE' with payload {"name":"Lists"} was not handled by any navigator.`
- **Standard Resolution Pattern**:
  ```typescript
  const handleBackToDashboard = () => {
    cancelAutoAdvanceTimer();
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    if (navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
    } else if (navigation && typeof navigation.navigate === 'function') {
      (navigation as any).navigate('MainTabs', { screen: 'Lists' });
    }
  };
  ```

---

## 2. Lead Card Interaction Model (`ListsScreen.tsx`)

Each educator card in the pipeline dashboard (`ListsScreen.tsx`) provides distinct touch targets:
1. **Card Body Tap**: Navigates to `LeadDetailScreen` with `{ leadId: item.id }` to inspect notes, history, and client portfolio.
2. **"AI Text" Button**: Navigates to `LeadDetailScreen` with `{ leadId: item.id, autoOpenSms: true }` to automatically launch the SMS composer modal pre-loaded with personalized FRS copy.
3. **"Call ({item.phone})" Button**: Invokes `handleDirectCall`, which triggers `TelephonyService.makeCall(item.phone)` via the OS dialer and immediately transitions to `LeadDetailScreen` for post-call note logging.
4. **"Record Dispo" Button** (shown when `isDispoNeeded(item)` is true): Directly opens `LeadDetailScreen` to wrap up completed sit-downs.

---

## 3. Zero-Cost Telephony & Mobile Web Protocol Engine

### 3.1 URL Schemes
- **Voice Calls**: `tel:${cleanDigits}`
- **SMS / iMessage**:
  - iOS (Safari / PWA / Native): `sms:${cleanDigits}&body=${encodedBody}`
  - Android & Desktop: `sms:${cleanDigits}?body=${encodedBody}`

### 3.2 Mobile Touch Gesture Preservation (iOS WebKit Rule)
Modern mobile web browsers (especially iOS Mobile Safari) enforce strict transient user activation policies. If deep-link URLs (`sms:` or `tel:`) are delayed by awaiting microtasks or asynchronous promises, the gesture token expires and the device silently blocks opening native Messages or Phone.
- **Rule**: Invoke `TelephonyService.sendSMS(...)` or `TelephonyService.makeCall(...)` **synchronously** in the UI click event handler before any asynchronous database saves.
- **Web DOM Dispatch**:
  ```typescript
  const link = document.createElement('a');
  link.href = url;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    try { document.body.removeChild(link); } catch {}
  }, 150);
  ```

---

## 4. Cadence Engine & No-Answer SMS Follow-Up

### 4.1 Attempt #1 "Speed-to-Lead" Logic
- When an educator does not answer on Attempt #1, SnapDialer prompts the advisor with a tailored follow-up text modal ("No Answer - Just Called Follow-up").
- The advisor has two options:
  1. **"Send SMS & Advance 💬"**: Launches native messaging app synchronously, appends `"Follow-up SMS sent."` to lead notes, and logs `smsSent: true` in `CallLogsRepository`.
  2. **"Skip SMS ⏭️"**: Advances immediately, appends `"Call attempt #1: No Answer / Voicemail."` without falsely claiming an SMS was sent, and logs `smsSent: false`.

### 4.2 Consent & TCPA Compliance
- If `lead.text_ok === false` or `0`, the SMS modal is suppressed or requires explicit confirmation via `window.confirm` (on Web) or `Alert.alert` (on native).
- On Web (`react-native-web`), `Alert.alert` does not support interactive callback buttons. Always use `window.confirm` for web confirmation dialogs.

---

## 5. Database & Local Storage Architecture

### 5.1 Dual-Engine Architecture
- **Web / PWA**: Dexie.js (`IndexedDB`) with local fallback storage.
- **Native iOS / Android**: `expo-sqlite` with automated table migrations.

### 5.2 Local Data Preservation Rule
- **CRITICAL**: Never drop, delete, or reset existing local educator leads, call logs, notes, or campaign tables in IndexedDB or Dexie.
- All schema additions (`is_client`, `annualized_premium`, `transfer_assets_volume`, `drip_track`, `drip_step`, `appointment_outcome`, `appointment_scheduled_at`) use non-destructive column checks (`PRAGMA table_info`) and defensive hydration fallbacks (`hydrateLead`).

---

## 6. Mandatory Quality & Deployment Workflow

Whenever the codebase is modified:
1. **TypeScript Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
2. **Automated Unit Tests**:
   ```bash
   node --test tests/*.test.mjs
   ```
3. **Web Production Bundle Export**:
   ```bash
   npx expo export -p web
   ```
4. **Live Deployment to Surge**:
   ```bash
   node deploy-surge.js
   ```
5. **Git Synchronization**:
   ```bash
   git add .
   git commit -m "..."
   git push origin main master
   ```

---

## 7. KaTeX Formatting Standard
- **NEVER** place dollar signs (`$` or `\$`) inside LaTeX delimiters `\( ... \)` or `\[ ... \]`.
- Outside LaTeX blocks, currency values must be escaped as `\$500`, `\$25`, or written as `USD 500`.

---

## 8. Multi-Specialist Codebase Audit & Architectural Resolutions (v2.5.0)

### 8.1 Database, Storage & Deduplication Engine (`src/db/`)
- **Dexie Photo & Call Log Cascading**: Synchronized `dexieDb.lead_photos.delete` on lead and list deletion. Reparented `call_logs` during deduplication (`dexieDb.call_logs.where('lead_id').equals(oldLeadId).modify({ lead_id: masterLeadId })`).
- **Client Status Master Ranking**: Enhanced `deduplicateLeads` to prioritize master records by converted client status, highest annualized premium (`annualized_premium`), and transfer assets volume (`transfer_assets_volume`).
- **Defensive Detail Updates**: In `LeadsRepository.updateLeadDetails`, added defensive `current?.field` fallbacks to prevent partial background updates (such as drip dispatch or quick notes) from erasing room number, planning period, email, or salary.
- **Auto-Healing Ingestion**: In `IndexedDbStorage.normalizeState` and `hydrateLead`, automatically heals legacy records where `is_client === true` but `appointment_outcome === null` to `'converted'`, preventing completed sit-downs from lingering in pending appointment queues.

### 8.2 Dialer HUD & Active Telephony Cockpit (`src/screens/DialerHudScreen.tsx`)
- **Active Call Auto-Advance Lock**: Added `cancelAutoAdvanceTimer()` on `handleDial` to ensure active calls are never interrupted by countdown timers.
- **Fixed Thumb-Zone Dock**: Extracted Call Duration meter, Main Dial action, and Disposition buttons out of `ScrollView` into an anchored sticky bottom dock, leaving full swipe gestures intact on the educator dossier card.
- **Double-Tap Guards**: Wrapped `handleScheduleFollowUp`, `handleSaveNote`, and `handleDisposition` in `isProcessingDispoRef` locks.
- **Standalone SMS Disposition**: In `handleSendCustomSms`, correctly persists `disposition: 'sms_sent'` to `LeadsRepository` and call logs to preserve accurate dial-to-connect metrics.
- **Modal Back-Button Safety**: Added explicit `onRequestClose` handlers to all HUD modals (`noteModalVisible`, `objectionsModalVisible`, `followUpModalVisible`, `notesModalVisible`, `editLeadModalVisible`).

### 8.3 Educator Dossier & Post-Appointment Wrap-Up (`src/screens/LeadDetailScreen.tsx`)
- **Universal Calendar Sync**: Targets confirmed appointment date/time (`lead.appointment_scheduled_at ? new Date(lead.appointment_scheduled_at) : CalendarService.calculateNextPlanningDate(...)`) instead of current timestamp for 1-tap Apple, Google, and Outlook calendar export.
- **Non-Destructive DNC Logging**: Preserves existing educator notes via `NotesService.addNote(lead.notes, ...)` when toggling Do Not Call.
- **Bi-Directional Client Portfolio Sync**: Fully syncs `is_client`, product checkboxes, Annualized Premium (`$ AP`), Assets Volume (`$ Assets`), effective date, and review due date with `updateLeadDetails` and `convertLeadToClient`.

### 8.4 Pipeline Dashboard & Automated Drips (`src/screens/ListsScreen.tsx` & `src/services/dripDispatcherService.ts`)
- **Clean Telephony Attribution**: Automated and batch drips log `disposition: 'drip_sent'` with `smsSent: true`, preventing automated texts from falsely inflating voice dial analytics.
- **Template Hygiene**: Cleaned `src/data/dripTemplates.ts` to eliminate redundant "Room" tokens (preventing "Room Room 204" output).
- **KPI Parity & Filtering**: Aligned status bar strip counts ("Unanswered", "Callable", "Appts Set") with filter bottom sheet multi-select filters and active list views.

### 8.5 Analytics, Florida Compliance & Bell Schedules (`src/screens/AnalyticsScreen.tsx` & `src/data/bellSchedules.ts`)
- **Florida Telemarketing Hours**: Restricted hourly response bins to 8:00 AM – 7:00 PM Eastern (`8 <= h <= 19`) using `America/New_York` timezone parsing with 24-hour cycle (`hourCycle: 'h23'`).
- **Peak Hour Tie-Breaker**: Added dial volume weighting to peak hour calculation when contact rates are identical.
- **Planning Now Live Badge**: In `PlanningHeatmapScreen.tsx`, added `⚡ PLANNING NOW` badge for schools with active planning periods, matching against natural expressions (`plan(ning)?`, `block`) across Florida school schedules.

### 8.6 AI Scanner, Cloud Delta Sync & Security (`src/services/`)
- **Resilient AI Vision Parsing**: Added bracket/brace boundary extraction (`indexOf('[')` / `lastIndexOf(']')`) in `visionService.ts` to cleanly extract JSON even if LLM outputs preface text or markdown wrappers.
- **Cloud Delta Sync Preservation**: In `supabaseSyncService.ts`, cloud-newer updates now defensively preserve local proof card image URIs (`source_image_uri`), FRS interests, text consent, and client portfolio fields.
- **Persistent PIN Lockout**: In `securityService.ts` and `PinLockModal.tsx`, persisted 30-second lockout timestamp across page reloads in `localStorage` (`snap_pin_lockout_until`).
- **Immediate Background Lock**: In `App.tsx`, app state changes to `background`/`inactive` or document visibility to `hidden` immediately trigger `SecurityService.lockSession()`.

### 8.7 Today's Advisor Playbook & Appointment Scheduling Hygiene (`src/components/TodayCockpitCard.tsx`, `src/services/pipelineStateService.ts`, `src/screens/DialerHudScreen.tsx`)
- **Color Contrast & Dark Surface Legibility**:
  - In `TodayCockpitCard.tsx`, replaced dark navy text tokens (`Colors.textPrimary` `#0F172A`) with high-contrast `#FFFFFF` (pure white for lead name and triad labels), `#CBD5E1` (school name, preview subtext), and `#38BDF8` (planning period/time chip) on the dark `#0F172A`/`#1E293B` background.
- **Strict Calendar Date Parity for Today's Playbook**:
  - Added `PipelineStateService.isAppointmentToday` and `isUpcomingAppointmentToday` using calendar date parity (`en-CA` formatting in `America/New_York` timezone).
  - In `TodayCockpitCard.tsx`, restricted the "Sit-Downs Today" metric and the preview chips strictly to appointments scheduled for the current calendar date (`todaySitDowns`).
  - Retained total weekly upcoming appointments in the Metric 3 subtext ("X this week") and in the `Appts Set` pipeline tab (`onFilterAppts`).
- **HUD Appointment Day Selection Chips**:
  - In `DialerHudScreen.tsx`, added dynamic day selection pills (`[Today]`, `[Tomorrow]`, `[Wed]`, `[Thu]`, `[Fri]`, `[Next Mon]`) in the Appointment Set disposition modal.
  - Passes confirmed appointment date override (`selectedApptDate`) into `handleDisposition` to ensure appointments booked for later in the week are saved with their precise target date.

### 8.8 Inline Editable Drip Composer, Audit Log Parity & Sit-Down Timezone Resolution
- **Inline Editable Drip Dispatcher (`src/components/BatchDripDispatchModal.tsx`)**:
  - Replaced static `<Text>` element with an always-editable `<TextInput>` pre-populated with `currentItem.formattedMessage`.
  - Added Gemini AI Re-Draft button with `Sparkles` icon and 4 quick focus chips (`[📝 Address Note]`, `[🏫 Planning]`, `[🎯 Meeting]`, `[💰 5% DROP]`).
  - Added live character counter and `[Reset]` button to revert edits to standard template.
  - Implemented synchronous `TelephonyService.sendSMS(phone, bodyToSend)` dispatch before any async calls to preserve iOS Safari / WebKit user touch gesture token.
  - Passes `bodyToSend` into `recordDripDispatched(currentItem.lead, currentItem.template, bodyToSend)`.
- **Drip Audit Log Accuracy (`src/services/dripDispatcherService.ts`)**:
  - Updated `recordDripDispatched(lead, template, customBody?: string)` to accept `customBody`.
  - Computes `finalSmsBody = customBody?.trim() || TelephonyService.interpolateTemplate(template, lead)`.
  - Logs exact dispatched text as `smsBody: finalSmsBody` in `CallLogsRepository.logCall` rather than the raw template string.
- **Sit-Down Timezone & "Due Now" Resolution (`src/services/pipelineStateService.ts`)**:
  - Fixed UTC midnight date-only parsing in `getAppointmentWindow`: parses year, month, and day in local time and aligns with bell schedule start time.
  - Explicitly locked `end.setFullYear(start.getFullYear(), start.getMonth(), start.getDate())` so bell schedule end times cannot shift backward across calendar days.
  - Missing timestamp fallback: if booked within the last 24h, anchors forward from `now` rather than an expired hour earlier today.
- **Dialer HUD & Lead Detail Queue Sync (`src/screens/DialerHudScreen.tsx` & `src/screens/LeadDetailScreen.tsx`)**:
  - In `handleSaveNote`, if `selectedApptDate` is null, automatically resolves to first available school day (`availableDays[0]?.date`).
  - In `handleDisposition`, updates `currentLead.appointment_scheduled_at = scheduledISO` and updates in-memory React queue state so the scheduled timestamp persists in memory.
### 8.9 Interactive Appointment Scheduler, Auto-Healing Dispo State & Responsive Landscape Ergonomics (`AppointmentSchedulerModal.tsx`, `pipelineStateService.ts`, `TodayCockpitCard.tsx`, `ListsScreen.tsx`)
- **World-Class Interactive Appointment Scheduler (`src/components/AppointmentSchedulerModal.tsx`)**:
  - Pure React Native component with zero native binary dependencies (runs identically on iOS, Android, and Mobile Web PWA).
  - 10-day quick school-day strip (auto-skips weekends) with 1-tap day pills (`[Today]`, `[Tomorrow]`, `[Wed 9/9]`, `[Thu 9/10]`, etc.).
  - Expandable full-month calendar grid with month navigation allowing selection of any date in the future.
  - Volusia County Bell Schedule Period Matching: Automatically looks up school schedules and highlights the educator's free period with a `★ BEST TIME (Planning)` badge and instructional vs planning designations.
  - Precision Time Stepper: Hours (1–12), 15-minute minute increments (:00, :15, :30, :45), AM/PM toggles, and duration selectors (15m, 25m, 30m, 45m).
  - Location Selector: Pre-fills room number from dossier with options for Lounge, Phone, or Virtual.
  - 1-Tap Calendar Export Links: Direct Apple `.ics` download, Google Calendar link, and Outlook link.
  - Unified across all appointment touchpoints:
    1. `DialerHudScreen.tsx`: `🎯 Appt Set` opens interactive calendar before logging disposition.
    2. `LeadDetailScreen.tsx`: `🎯 Appt Set` triggers interactive calendar; added `✏️ Reschedule / Change Sit-Down Time` button directly into Confirmed Sit-Down card.
    3. `PostApptWrapUpCard.tsx`: `📅 Reschedule Sit-Down` opens interactive calendar to select exact date/time.
- **Auto-Healing Pipeline State & Elimination of Premature "Dispo Due" Alerts**:
  - **Absolute Future Sanity Guard**: In `PipelineStateService.isDispoNeeded()`, if `window.startDate > now || window.endDate > now`, returns `false` unconditionally.
  - **Notes Date Extraction Fallback**: In `PipelineStateService.extractAppointmentDateFromLead()`, regex parses ISO strings, written dates ("Sep 9", "Thursday Sep 10"), and weekday names directly from call notes if `appointment_scheduled_at` was missing.
  - **In-Memory & Storage Auto-Healing**: Added migration rules in `IndexedDbStorage.normalizeState()` and `LeadsRepository.hydrateLead()` so legacy `appointment_set` records missing `appointment_scheduled_at` are immediately normalized.
  - **SQL Pattern Matcher Alignment**: Updated `WebDatabase.runAsync` in `database.ts` to support both `appointment_scheduled_at = ?` and `follow_up_at = ?`.
- **Responsive Landscape Ergonomics & Full-Range Scrolling (`src/screens/ListsScreen.tsx` & `src/components/TodayCockpitCard.tsx`)**:
  - **Embedded `ListHeaderComponent`**: Moved `TodayCockpitCard`, KPI stats strip, duplicate banner, search bar, and filter tabs inside `FlatList`'s `ListHeaderComponent`. The entire dashboard scrolls natively from top to bottom as a single document in both portrait and landscape.
  - **Collapsible Today's Advisor Playbook**: Senses orientation via `useWindowDimensions()`. In landscape, defaults to a compact 1-line horizontal strip showing `Calls Due • Drips • Sit-Downs Today` with direct tap actions, while retaining an explicit `[Show] / [Hide]` toggle button.
  - **Consistent Grid Margins**: Aligned all header items and lead cards to the standard 16px horizontal gutter.
- **Automated Verification & Live Deploy**:
  - TypeScript compilation: 0 errors (`npx tsc --noEmit`).
  - Unit tests: 72/72 passing across 10 suites (`node --test tests/*.test.mjs`).
  - Web export & live deploy: Deployed to `valuteachers-dialer.surge.sh`.
  - Version control: Committed and pushed to GitHub `main` and `master` branches.

### 8.10 Client Appointment Scheduling Parity & Today's Playbook Visibility (`pipelineStateService.ts`, `leadsRepository.ts`, `indexedDbStorage.ts`, `TodayCockpitCard.tsx`)
- **Universal Appointment Eligibility for Existing Clients**:
  - Previously, `PipelineStateService.isAppointmentCompleted` blindly checked `if (Boolean(lead.is_client)) return true;`. This falsely treated any new sit-down booked with an existing client (e.g. annual reviews, annuity checkups) as already completed, completely suppressing them from `TodayCockpitCard.tsx` ("TODAY'S ADVISOR PLAYBOOK" and Metric 3 "Sit-Downs Today"), as well as the `Appts Set` pipeline tab.
  - Refactored `PipelineStateService.isAppointmentCompleted`: if `last_disposition === 'appointment_set'` and no explicit `appointment_outcome` or `appointment_completed_at` is set, the appointment is strictly recognized as active and un-completed, regardless of client status.
  - Updated `getEffectiveAppointmentOutcome` to only default to `'converted'` when a client is NOT currently in an active `appointment_set` disposition.
- **Hydration & Storage Protection for Client Appointments**:
  - In `LeadsRepository.hydrateLead` and `IndexedDbStorage.normalizeState`, restricted legacy auto-healing of `last_disposition = 'connected'` and `appointment_outcome = 'converted'` to only apply when `!raw.appointment_scheduled_at`. Active appointments scheduled for clients are now defensively preserved with `last_disposition = 'appointment_set'` and `appointment_outcome = null`.
  - In `LeadsRepository.updateLeadDisposition`, preserved `follow_up_at` when `disposition === 'appointment_set'`.
  - In `ClientPortfolioCard.tsx` and `LeadDetailScreen.tsx`, guarded portfolio saves to ensure existing active appointments (`hasActiveAppointment`) are not reverted to `connected` or marked `converted` when editing client policy values.
- **Full Lifecycle Flow for Client Appointments**:
  - Any appointment scheduled via the dialer HUD or dossier with an existing client now immediately appears in Today's Advisor Playbook for the scheduled day.
  - Once the appointment window elapses, it routes cleanly into the "⚠️ Sit-Downs Need Dispo" alert queue for review and wrap-up logging.


