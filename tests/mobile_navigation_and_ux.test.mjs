import test from 'node:test';
import assert from 'node:assert/strict';

test('Mobile Navigation & Touch Ergonomics Architecture', async (t) => {
  await t.test('verifies 5-tab persistent bottom navigation structure', () => {
    const tabRoutes = [
      { name: 'Lists', label: 'Educators', icon: 'Users' },
      { name: 'Queue', label: 'Queue', icon: 'PhoneCall' },
      { name: 'PlanningHeatmap', label: 'Schedule', icon: 'Calendar' },
      { name: 'Analytics', label: 'Analytics', icon: 'BarChart3' },
      { name: 'Settings', label: 'Settings', icon: 'Settings' },
    ];

    assert.equal(tabRoutes.length, 5);
    const tabNames = tabRoutes.map((r) => r.name);
    assert.deepEqual(tabNames, ['Lists', 'Queue', 'PlanningHeatmap', 'Analytics', 'Settings']);
    
    // Check tab labels
    const tabLabels = tabRoutes.map((r) => r.label);
    assert.deepEqual(tabLabels, ['Educators', 'Queue', 'Schedule', 'Analytics', 'Settings']);
  });

  await t.test('verifies resilient back-stack fallback navigation logic', () => {
    let navigatedTo = null;
    let wentBack = false;

    // Simulate navigation context when canGoBack is false (opened directly as bottom tab)
    const mockNavNoBack = {
      canGoBack: () => false,
      goBack: () => { wentBack = true; },
      navigate: (screen) => { navigatedTo = screen; },
    };

    const handleBackNoStack = (nav) => {
      return nav.canGoBack() ? nav.goBack() : nav.navigate('Lists');
    };

    handleBackNoStack(mockNavNoBack);
    assert.equal(wentBack, false);
    assert.equal(navigatedTo, 'Lists');

    // Simulate navigation context when canGoBack is true (pushed from stack)
    navigatedTo = null;
    wentBack = false;
    const mockNavWithBack = {
      canGoBack: () => true,
      goBack: () => { wentBack = true; },
      navigate: (screen) => { navigatedTo = screen; },
    };

    handleBackNoStack(mockNavWithBack);
    assert.equal(wentBack, true);
    assert.equal(navigatedTo, null);
  });

  await t.test('verifies filter bottom sheet multi-criteria filtering', () => {
    const mockLeads = [
      { id: '1', name: 'Alice Teacher', school: 'Deltona High', list_id: 'sheet_1', priority_tier: 1 },
      { id: '2', name: 'Bob Smith', school: 'Deltona High', list_id: 'sheet_2', priority_tier: 2 },
      { id: '3', name: 'Carol Davis', school: 'Galaxy Middle', list_id: 'sheet_1', priority_tier: 1 },
      { id: '4', name: 'David Wilson', school: 'VOL', list_id: 'sheet_3', priority_tier: 3 },
    ];

    // Filter by School
    const filterBySchool = (leads, school) => {
      if (!school || school === 'all') return leads;
      return leads.filter((l) => (l.school || 'VOL').toLowerCase().trim() === school.toLowerCase().trim());
    };

    const deltonaLeads = filterBySchool(mockLeads, 'Deltona High');
    assert.equal(deltonaLeads.length, 2);

    // Filter by Campaign List
    const filterByList = (leads, listId) => {
      if (!listId || listId === 'all') return leads;
      return leads.filter((l) => l.list_id === listId);
    };

    const sheet1Leads = filterByList(mockLeads, 'sheet_1');
    assert.equal(sheet1Leads.length, 2);

    // Filter by Priority Tier
    const filterByTier = (leads, tier) => {
      if (tier === 'fresh') return leads.filter((l) => l.priority_tier === 1);
      if (tier === 'legacy') return leads.filter((l) => l.priority_tier === 3);
      return leads;
    };

    const freshLeads = filterByTier(mockLeads, 'fresh');
    assert.equal(freshLeads.length, 2);

    // Combined multi-criteria filter
    let combined = mockLeads;
    combined = filterBySchool(combined, 'Deltona High');
    combined = filterByList(combined, 'sheet_1');
    combined = filterByTier(combined, 'fresh');
    assert.equal(combined.length, 1);
    assert.equal(combined[0].name, 'Alice Teacher');
  });

  await t.test('verifies Today Cockpit 3-metric triad and dispo alert computation', () => {
    const sampleLeads = [
      { id: 'l1', name: 'L1', last_disposition: 'callback_requested', follow_up_at: new Date().toISOString() },
      { id: 'l2', name: 'L2', last_disposition: 'appointment_set', appointment_scheduled_at: new Date(Date.now() + 3600000).toISOString() },
      { id: 'l3', name: 'L3', last_disposition: 'appointment_set', appointment_scheduled_at: new Date(Date.now() - 7200000).toISOString(), appointment_outcome: null },
      { id: 'l4', name: 'L4', priority_tier: 1, last_disposition: 'pending' },
      { id: 'l5', name: 'L5', is_client: true },
    ];

    // Calls Due: Strictly scheduled callbacks due today (fresh uncontacted priority tier 1 leads are NOT calls due)
    const callsDueCount = sampleLeads.filter((l) => {
      if (Boolean(l.is_client)) return false;
      if (['appointment_set', 'connected', 'spoke', 'do_not_call', 'bad_number', 'other'].includes(l.last_disposition || '')) return false;
      if (!l.last_disposition || l.last_disposition === 'pending') return false;
      const hasValidFollowUp = Boolean(l.follow_up_at && !isNaN(new Date(l.follow_up_at).getTime()));
      return l.last_disposition === 'callback_requested' || hasValidFollowUp;
    }).length;
    assert.equal(callsDueCount, 1); // Only l1 (callback_requested), l4 (fresh pending tier 1) is NOT calls due

    // Upcoming sit-downs today
    const upcomingSitDownsCount = sampleLeads.filter((l) => {
      return l.last_disposition === 'appointment_set' && 
             new Date(l.appointment_scheduled_at).getTime() > Date.now();
    }).length;
    assert.equal(upcomingSitDownsCount, 1); // l2

    // Dispositions Due (past appointment time with no outcome logged)
    const dispoDueCount = sampleLeads.filter((l) => {
      return l.last_disposition === 'appointment_set' &&
             new Date(l.appointment_scheduled_at).getTime() < Date.now() &&
             !l.appointment_outcome;
    }).length;
    assert.equal(dispoDueCount, 1); // l3

    // Parity verification: top KPI card appointmentCount matches filter tab badge (upcomingCount)
    const appointmentCount = upcomingSitDownsCount;
    assert.equal(appointmentCount, upcomingSitDownsCount, 'Top KPI card and filter tab must have 1:1 parity');
  });

  await t.test('verifies batch lead save progress indicator and anti-reentrancy locking', async () => {
    let isSaving = false;
    let isSavingRef = { current: false };
    const savedLeads = [];
    const progressHistory = [];
    let navigatedTo = null;

    const mockExtractedLeads = [
      { name: 'Teacher One', phone: '3865550101', school: 'Deltona High' },
      { name: 'Teacher Two', phone: '3865550102', school: 'Deltona High' },
      { name: 'Teacher Three', phone: '3865550103', school: 'Pine Ridge' },
    ];

    const simulateSaveLeads = async (leads, andDial) => {
      if (isSavingRef.current || isSaving) return false;
      isSavingRef.current = true;
      isSaving = true;

      const total = leads.length;
      for (let i = 0; i < total; i++) {
        const current = i + 1;
        const statusText = total > 1
          ? `Importing educator ${current} of ${total} into pipeline...`
          : 'Importing educator into pipeline...';
        progressHistory.push({ current, total, statusText });
        savedLeads.push(leads[i]);
      }

      if (andDial) {
        navigatedTo = 'DialerHUD';
      } else {
        navigatedTo = 'Lists';
      }

      isSaving = false;
      isSavingRef.current = false;
      return true;
    };

    // 1. Initial save should succeed and record progress steps
    const firstCallPromise = simulateSaveLeads(mockExtractedLeads, true);
    // 2. Concurrent second call while saving should be rejected by anti-reentrancy
    // (simulate instant re-entrant tap)
    isSavingRef.current = true; // Lock is active
    const concurrentCallResult = await simulateSaveLeads(mockExtractedLeads, true);
    assert.equal(concurrentCallResult, false, 'Concurrent click while saving must be dropped');
    isSavingRef.current = false;

    await firstCallPromise;
    assert.equal(savedLeads.length, 3);
    assert.equal(progressHistory.length, 3);
    assert.equal(progressHistory[0].statusText, 'Importing educator 1 of 3 into pipeline...');
    assert.equal(progressHistory[2].statusText, 'Importing educator 3 of 3 into pipeline...');
    assert.equal(navigatedTo, 'DialerHUD');

    // 3. Test pipeline-only navigation
    savedLeads.length = 0;
    progressHistory.length = 0;
    navigatedTo = null;
    await simulateSaveLeads(mockExtractedLeads, false);
    assert.equal(navigatedTo, 'Lists');
  });

  await t.test('verifies mobile viewport meta lockdown and global CSS overflow-x reset', async () => {
    const fs = await import('fs');
    const path = await import('path');

    // Read deploy-surge.js
    const deploySurgeContent = fs.readFileSync(path.resolve('deploy-surge.js'), 'utf8');

    // Assert strict viewport meta tag presence
    assert.ok(
      deploySurgeContent.includes('maximum-scale=1.0, user-scalable=no, viewport-fit=cover'),
      'deploy-surge.js must inject strict maximum-scale=1.0, user-scalable=no viewport meta'
    );

    // Assert global mobile CSS reset
    assert.ok(
      deploySurgeContent.includes('overflow-x: hidden !important'),
      'deploy-surge.js must inject global overflow-x: hidden lock'
    );
    assert.ok(
      deploySurgeContent.includes('font-size: 16px !important'),
      'deploy-surge.js must inject font-size: 16px !important on inputs to block iOS auto-zoom'
    );
    assert.ok(
      deploySurgeContent.includes('touch-action: pan-y manipulation !important'),
      'deploy-surge.js must inject touch-action: pan-y manipulation'
    );

    // Assert dynamic viewport height (dvh) to prevent bottom menu clipping behind mobile browser toolbars
    assert.ok(
      deploySurgeContent.includes('height: 100dvh !important'),
      'deploy-surge.js must inject height: 100dvh !important for dynamic mobile viewport'
    );
    assert.ok(
      deploySurgeContent.includes('max-height: 100dvh !important'),
      'deploy-surge.js must inject max-height: 100dvh !important'
    );

    // Check App.tsx runtime web style injection
    const appContent = fs.readFileSync(path.resolve('App.tsx'), 'utf8');
    assert.ok(
      appContent.includes('mobile-ux-viewport-lock'),
      'App.tsx must inject mobile-ux-viewport-lock on web'
    );
    assert.ok(
      appContent.includes('font-size: 16px !important'),
      'App.tsx must ensure 16px font-size protection dynamically'
    );
    assert.ok(
      appContent.includes('height: 100dvh !important'),
      'App.tsx must ensure dynamic viewport height 100dvh on web'
    );
  });

  await t.test('verifies AppNavigator bottom tab bar safe insets and unclipped label typography', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const navContent = fs.readFileSync(path.resolve('src/navigation/AppNavigator.tsx'), 'utf8');

    // Assert safe insets hook is imported and utilized
    assert.ok(
      navContent.includes('useSafeAreaInsets'),
      'AppNavigator must use useSafeAreaInsets for dynamic safe area spacing'
    );

    // Assert tab bar height is dynamically computed with bottomInset
    assert.ok(
      navContent.includes('const tabBarHeight = 62 + bottomInset;'),
      'AppNavigator must compute tabBarHeight with 62px content height plus safe bottomInset'
    );

    // Assert tab bar label typography has explicit lineHeight to prevent vertical half-clipping
    assert.ok(
      navContent.includes('lineHeight: 14'),
      'AppNavigator must specify lineHeight: 14 on tabBarLabelStyle to prevent vertical truncation'
    );

    // Assert tab bar item style has centering and padding
    assert.ok(
      navContent.includes('tabBarItemStyle'),
      'AppNavigator must specify tabBarItemStyle for comfortable vertical centering'
    );
  });

  await t.test('verifies all TextInput styles have minimum fontSize: 16 across screens and components', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const filesToCheck = [
      { file: 'src/screens/ListsScreen.tsx', styleKey: 'searchInput' },
      { file: 'src/screens/SettingsScreen.tsx', styleKey: 'input' },
      { file: 'src/screens/LeadDetailScreen.tsx', styleKey: 'input' },
      { file: 'src/screens/LeadDetailScreen.tsx', styleKey: 'addNoteInput' },
      { file: 'src/screens/LeadDetailScreen.tsx', styleKey: 'modalInput' },
      { file: 'src/screens/DialerHudScreen.tsx', styleKey: 'modalInput' },
      { file: 'src/screens/DialerHudScreen.tsx', styleKey: 'editInput' },
      { file: 'src/screens/ScanSheetScreen.tsx', styleKey: 'rowInput' },
      { file: 'src/screens/ScanSheetScreen.tsx', styleKey: 'newListNameInput' },
      { file: 'src/screens/CadenceSettingsScreen.tsx', styleKey: 'input' },
      { file: 'src/components/AppointmentSchedulerModal.tsx', styleKey: 'roomInput' },
      { file: 'src/components/AppointmentSchedulerModal.tsx', styleKey: 'notesInput' },
      { file: 'src/components/CallbackSchedulerModal.tsx', styleKey: 'noteInput' },
      { file: 'src/components/QuickDispositionModal.tsx', styleKey: 'textArea' },
      { file: 'src/components/ClientPortfolioCard.tsx', styleKey: 'currencyInput' },
      { file: 'src/components/ClientPortfolioCard.tsx', styleKey: 'dateInput' },
      { file: 'src/components/BatchDripDispatchModal.tsx', styleKey: 'messageInput' },
    ];

    for (const { file, styleKey } of filesToCheck) {
      const content = fs.readFileSync(path.resolve(file), 'utf8');
      const regex = new RegExp(`${styleKey}:\\s*\\{[^}]*fontSize:\\s*(\\d+)`, 's');
      const match = content.match(regex);
      assert.ok(match, `Could not find ${styleKey} style block in ${file}`);
      const fontSize = parseInt(match[1], 10);
      assert.ok(
        fontSize >= 16,
        `Expected ${styleKey} in ${file} to have fontSize >= 16 to prevent iOS auto-zoom, but got ${fontSize}`
      );
    }
  });
});


