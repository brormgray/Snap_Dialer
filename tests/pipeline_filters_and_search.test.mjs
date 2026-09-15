import test from 'node:test';
import assert from 'node:assert/strict';

// Import or recreate domain functions mirroring ListsScreen and PipelineStateService
function hasEverBeenCalled(lead, callLogs = []) {
  if (!lead) return false;
  const attempts = Number(lead.attempts_count || 0);
  if (attempts > 0) return true;
  if (lead.last_disposition && lead.last_disposition !== 'pending') return true;
  if (lead.last_attempt_at) return true;

  const validLeadId = lead.id && String(lead.id).trim() !== '' && String(lead.id).trim() !== 'undefined';
  if (validLeadId && Array.isArray(callLogs) && callLogs.length > 0) {
    const hasLog = callLogs.some(
      (log) => log && log.lead_id && String(log.lead_id).trim() === String(lead.id).trim()
    );
    if (hasLog) return true;
  }

  return false;
}

function filterLeadsPipeline({
  leads,
  callLogs = [],
  selectedListId = 'all',
  selectedSchool = 'all',
  priorityFilter = 'all',
  filterTab = 'all',
  searchQuery = '',
  now = new Date(),
}) {
  // 1. Scope leads
  const scopedLeads = leads.filter((l) => {
    if (!l) return false;
    if (selectedListId !== 'all' && l.list_id !== selectedListId) return false;
    if (
      selectedSchool !== 'all' &&
      String(l.school || 'VOL').toLowerCase().trim() !== selectedSchool.toLowerCase().trim()
    ) {
      return false;
    }
    if (priorityFilter === 'fresh' && (l.priority_tier || 1) !== 1) return false;
    if (priorityFilter === 'legacy' && l.priority_tier !== 3) return false;
    return true;
  });

  // 2. Filter by Tab
  let result = scopedLeads;
  if (filterTab === 'pending') {
    result = result.filter((l) => !hasEverBeenCalled(l, callLogs));
  } else if (filterTab === 'appts') {
    result = result.filter((l) => l.last_disposition === 'appointment_set' && !l.appointment_outcome);
  } else if (filterTab === 'dispo_needed') {
    result = result.filter((l) => {
      if (l.last_disposition !== 'appointment_set' || l.appointment_outcome) return false;
      const apptTime = l.appointment_scheduled_at ? new Date(l.appointment_scheduled_at).getTime() : 0;
      return apptTime > 0 && now.getTime() >= apptTime + 30 * 60 * 1000;
    });
  } else if (filterTab === 'connected') {
    result = result.filter((l) => ['connected', 'spoke'].includes(l.last_disposition || ''));
  } else if (filterTab === 'callback') {
    result = result.filter((l) => {
      const isAnswered = ['appointment_set', 'connected', 'spoke', 'do_not_call', 'bad_number', 'other'].includes(
        l.last_disposition || ''
      );
      if (isAnswered) return false;
      const hasValidFollowUp = l.follow_up_at && !isNaN(new Date(l.follow_up_at).getTime());
      return l.last_disposition === 'callback_requested' || !!hasValidFollowUp;
    });
  } else if (filterTab === 'unanswered') {
    result = result.filter((l) => ['no_answer', 'voicemail'].includes(l.last_disposition || ''));
  } else if (filterTab === 'clients') {
    result = result.filter((l) => Boolean(l.is_client));
  }

  // 3. Filter by Search Query
  if (searchQuery.trim().length > 0) {
    const q = searchQuery.toLowerCase().trim();
    result = result.filter((l) => {
      if (!l) return false;
      const nameStr = String(l.name || '').toLowerCase();
      const phoneDigits = String(l.phone || '').replace(/\D/g, '');
      const phoneRaw = String(l.phone || '').toLowerCase();
      const schoolStr = String(l.school || '').toLowerCase();
      const periodStr = String(l.planning_period || '').toLowerCase();
      const roomStr = String(l.room_number || '').toLowerCase();
      const notesStr = String(l.notes || '').toLowerCase();

      return (
        nameStr.includes(q) ||
        phoneDigits.includes(q) ||
        phoneRaw.includes(q) ||
        schoolStr.includes(q) ||
        periodStr.includes(q) ||
        roomStr.includes(q) ||
        notesStr.includes(q)
      );
    });
  }

  return result;
}

test('Pipeline Filtering & Search Hardening Suite', async (t) => {
  const sampleLeads = [
    {
      id: 'lead-1',
      name: 'Alice Johnson',
      phone: '(555) 123-4567',
      school: 'Deltona High',
      list_id: 'list-fall-2026',
      priority_tier: 1,
      room_number: 104, // Numeric room number
      planning_period: 'Period 3',
      notes: 'Interested in 403(b)',
      attempts_count: 0,
      last_disposition: null,
      last_attempt_at: null,
    },
    {
      id: 'lead-2',
      name: 'Bob Smith',
      phone: '5559876543',
      school: 'Galaxy Middle',
      list_id: 'list-fall-2026',
      priority_tier: 3,
      room_number: '202A',
      planning_period: null,
      notes: null,
      attempts_count: 1,
      last_disposition: 'no_answer',
      last_attempt_at: '2026-09-10T10:00:00Z',
    },
    {
      id: 'lead-3',
      name: 'Carol White',
      phone: '(555) 222-3333',
      school: 'Deltona High',
      list_id: 'list-spring-2026',
      priority_tier: 1,
      room_number: null,
      planning_period: 4, // Numeric period
      attempts_count: 1,
      last_disposition: 'connected',
      last_attempt_at: '2026-09-12T14:00:00Z',
    },
    {
      id: 'lead-4',
      name: 'David Brown',
      phone: '5554445555',
      school: 'Deltona High',
      list_id: 'list-fall-2026',
      priority_tier: 1,
      room_number: 305,
      attempts_count: 1,
      last_disposition: 'callback_requested',
      follow_up_at: '2026-09-18T10:00:00Z',
    },
    {
      id: 'lead-5',
      name: 'Eve Adams',
      phone: '555-777-8888',
      school: 'Pine Ridge High',
      list_id: 'list-fall-2026',
      priority_tier: 1,
      room_number: 'Office B',
      attempts_count: 2,
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-20T15:00:00Z',
      appointment_outcome: null,
    },
    {
      id: 'lead-6',
      name: 'Frank Miller',
      phone: '555-888-9999',
      school: 'Deltona High',
      list_id: 'list-fall-2026',
      priority_tier: 1,
      attempts_count: 3,
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-15T12:00:00Z', // Past appointment
      appointment_outcome: null,
    },
    {
      id: 'lead-7',
      name: 'Grace Hopper',
      phone: '555-000-1111',
      school: 'Galaxy Middle',
      list_id: 'list-fall-2026',
      priority_tier: 1,
      is_client: true,
      attempts_count: 2,
      last_disposition: 'connected',
    },
  ];

  await t.test('1. Search Filtering with non-string fields does not crash and accurately matches', () => {
    // Search numeric room number 104
    const resRoom = filterLeadsPipeline({ leads: sampleLeads, searchQuery: '104' });
    assert.equal(resRoom.length, 1);
    assert.equal(resRoom[0].name, 'Alice Johnson');

    // Search numeric room number 305
    const resRoom305 = filterLeadsPipeline({ leads: sampleLeads, searchQuery: '305' });
    assert.equal(resRoom305.length, 1);
    assert.equal(resRoom305[0].name, 'David Brown');

    // Search unformatted digits of phone
    const resPhone = filterLeadsPipeline({ leads: sampleLeads, searchQuery: '1234567' });
    assert.equal(resPhone.length, 1);
    assert.equal(resPhone[0].name, 'Alice Johnson');

    // Search with uppercase query
    const resCase = filterLeadsPipeline({ leads: sampleLeads, searchQuery: 'ALICE' });
    assert.equal(resCase.length, 1);
    assert.equal(resCase[0].name, 'Alice Johnson');

    // Search note substring
    const resNotes = filterLeadsPipeline({ leads: sampleLeads, searchQuery: '403(b)' });
    assert.equal(resNotes.length, 1);
    assert.equal(resNotes[0].name, 'Alice Johnson');
  });

  await t.test('2. Filter tabs operate accurately with 0ms sync', () => {
    // Tab: 'pending' (strictly never called)
    const resPending = filterLeadsPipeline({ leads: sampleLeads, filterTab: 'pending' });
    assert.equal(resPending.length, 1);
    assert.equal(resPending[0].name, 'Alice Johnson');

    // Tab: 'connected'
    const resConnected = filterLeadsPipeline({ leads: sampleLeads, filterTab: 'connected' });
    const connectedNames = resConnected.map((l) => l.name);
    assert.deepEqual(connectedNames.sort(), ['Carol White', 'Grace Hopper'].sort());

    // Tab: 'callback'
    const resCallback = filterLeadsPipeline({ leads: sampleLeads, filterTab: 'callback' });
    assert.equal(resCallback.length, 1);
    assert.equal(resCallback[0].name, 'David Brown');

    // Tab: 'unanswered'
    const resUnanswered = filterLeadsPipeline({ leads: sampleLeads, filterTab: 'unanswered' });
    assert.equal(resUnanswered.length, 1);
    assert.equal(resUnanswered[0].name, 'Bob Smith');

    // Tab: 'clients'
    const resClients = filterLeadsPipeline({ leads: sampleLeads, filterTab: 'clients' });
    assert.equal(resClients.length, 1);
    assert.equal(resClients[0].name, 'Grace Hopper');

    // Tab: 'appts'
    const resAppts = filterLeadsPipeline({ leads: sampleLeads, filterTab: 'appts' });
    assert.equal(resAppts.length, 2);
    assert.ok(resAppts.some((l) => l.name === 'Eve Adams'));
    assert.ok(resAppts.some((l) => l.name === 'Frank Miller'));

    // Tab: 'dispo_needed' (at 2026-09-15T15:00:00Z)
    const resDispo = filterLeadsPipeline({
      leads: sampleLeads,
      filterTab: 'dispo_needed',
      now: new Date('2026-09-15T15:00:00Z'),
    });
    assert.equal(resDispo.length, 1);
    assert.equal(resDispo[0].name, 'Frank Miller');
  });

  await t.test('3. Scoped combinations (Campaign + School + Priority + Tab + Search)', () => {
    // Deltona High only
    const resDeltona = filterLeadsPipeline({
      leads: sampleLeads,
      selectedSchool: 'deltona high',
    });
    assert.equal(resDeltona.length, 4);

    // Deltona High + Fresh Priority (tier 1) + list-fall-2026
    const resScoped = filterLeadsPipeline({
      leads: sampleLeads,
      selectedSchool: 'deltona high',
      priorityFilter: 'fresh',
      selectedListId: 'list-fall-2026',
    });
    // Expected: Alice Johnson, David Brown, Frank Miller (Carol White is in list-spring-2026)
    assert.equal(resScoped.length, 3);

    // Deltona High + Fresh + list-fall-2026 + Tab 'pending'
    const resPendingDeltona = filterLeadsPipeline({
      leads: sampleLeads,
      selectedSchool: 'deltona high',
      priorityFilter: 'fresh',
      selectedListId: 'list-fall-2026',
      filterTab: 'pending',
    });
    assert.equal(resPendingDeltona.length, 1);
    assert.equal(resPendingDeltona[0].name, 'Alice Johnson');

    // Combined with Search query 'Alice'
    const resSearchCombo = filterLeadsPipeline({
      leads: sampleLeads,
      selectedSchool: 'deltona high',
      filterTab: 'pending',
      searchQuery: 'Alice',
    });
    assert.equal(resSearchCombo.length, 1);
    assert.equal(resSearchCombo[0].name, 'Alice Johnson');

    // Mismatched search query returns empty
    const resEmpty = filterLeadsPipeline({
      leads: sampleLeads,
      selectedSchool: 'deltona high',
      filterTab: 'pending',
      searchQuery: 'NonExistent',
    });
    assert.equal(resEmpty.length, 0);
  });

  await t.test('4. Safe ID Matching in hasEverBeenCalled prevents false positives', () => {
    // Uncalled lead with undefined or missing ID
    const uncalledLeadNoId = {
      id: undefined,
      name: 'Ghost Lead',
      attempts_count: 0,
      last_disposition: null,
    };

    // Call log with undefined or missing lead_id
    const corruptedLogs = [
      { id: 'log-1', lead_id: undefined, disposition: 'no_answer', timestamp: '2026-09-15T12:00:00Z' },
      { id: 'log-2', lead_id: '', disposition: 'voicemail', timestamp: '2026-09-15T12:05:00Z' },
      { id: 'log-3', lead_id: 'undefined', disposition: 'spoke', timestamp: '2026-09-15T12:10:00Z' },
    ];

    // Must NOT match because validLeadId check rejects undefined/empty
    const isCalled = hasEverBeenCalled(uncalledLeadNoId, corruptedLogs);
    assert.equal(isCalled, false);

    // Valid lead with real call log
    const realLead = { id: 'lead-real-99', attempts_count: 0, last_disposition: null };
    const validLogs = [
      ...corruptedLogs,
      { id: 'log-4', lead_id: 'lead-real-99', disposition: 'no_answer', timestamp: '2026-09-15T12:15:00Z' },
    ];
    const isRealLeadCalled = hasEverBeenCalled(realLead, validLogs);
    assert.equal(isRealLeadCalled, true);
  });
});
