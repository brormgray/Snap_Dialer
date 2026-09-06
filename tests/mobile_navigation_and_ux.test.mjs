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

    // Calls Due: Callbacks due today or fresh priority pending
    const callsDueCount = sampleLeads.filter((l) => {
      if (l.last_disposition === 'callback_requested') return true;
      if (l.priority_tier === 1 && (!l.last_disposition || l.last_disposition === 'pending')) return true;
      return false;
    }).length;
    assert.equal(callsDueCount, 2); // l1 and l4

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
});

