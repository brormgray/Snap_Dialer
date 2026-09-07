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
