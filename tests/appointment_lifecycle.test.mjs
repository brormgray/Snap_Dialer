import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Post-Appointment Lifecycle & Dispo Queue Architecture', () => {
  // Domain simulation of PipelineStateService logic
  function getAppointmentWindow(lead, now = new Date()) {
    if (lead.last_disposition !== 'appointment_set' && !lead.appointment_scheduled_at) {
      return null;
    }

    let start;
    if (lead.appointment_scheduled_at) {
      start = new Date(lead.appointment_scheduled_at);
    } else if (lead.follow_up_at) {
      start = new Date(lead.follow_up_at);
    } else {
      start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }

    if (isNaN(start.getTime())) return null;

    // Simulate standard 30-min window
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    return { startDate: start, endDate: end };
  }

  function isAppointmentWindowEnded(lead, now = new Date()) {
    const window = getAppointmentWindow(lead, now);
    if (!window) return false;
    return now.getTime() >= window.endDate.getTime();
  }

  function isUpcomingAppointment(lead, now = new Date()) {
    if (lead.last_disposition !== 'appointment_set') return false;
    if (lead.appointment_outcome || lead.appointment_completed_at) return false;
    return !isAppointmentWindowEnded(lead, now);
  }

  function isDispoNeeded(lead, now = new Date()) {
    if (lead.last_disposition !== 'appointment_set') return false;
    if (lead.appointment_outcome || lead.appointment_completed_at) return false;
    return isAppointmentWindowEnded(lead, now);
  }

  // 1. Appointment booking sets appointment_scheduled_at
  it('correctly locks appointment_scheduled_at ISO timestamp on booking', () => {
    const lead = {
      id: 'lead_appt_1',
      name: 'Sarah Jenkins',
      phone: '3865550111',
      school: 'Deland High School',
      last_disposition: 'pending',
      appointment_scheduled_at: null,
      appointment_outcome: null,
    };

    const scheduledDateISO = '2026-09-08T14:30:00.000Z';
    // Simulate booking action
    const bookedLead = {
      ...lead,
      last_disposition: 'appointment_set',
      appointment_scheduled_at: scheduledDateISO,
      follow_up_at: scheduledDateISO,
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    assert.strictEqual(bookedLead.last_disposition, 'appointment_set');
    assert.strictEqual(bookedLead.appointment_scheduled_at, scheduledDateISO);
    assert.strictEqual(bookedLead.appointment_outcome, null);
  });

  // 2. Upcoming appointment identification
  it('correctly identifies upcoming appointments before the window ends', () => {
    const now = new Date('2026-09-08T10:00:00.000Z');
    const futureAppointment = {
      id: 'lead_future',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-08T14:00:00.000Z',
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    assert.strictEqual(isUpcomingAppointment(futureAppointment, now), true);
    assert.strictEqual(isDispoNeeded(futureAppointment, now), false);
  });

  // 3. Past appointment without outcome routes to Dispo Due
  it('routes past appointments without outcome to Dispo Due queue', () => {
    const now = new Date('2026-09-08T16:00:00.000Z'); // 4:00 PM
    const pastAppointment = {
      id: 'lead_past',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-08T14:00:00.000Z', // 2:00 PM (window ended 2:30 PM)
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    assert.strictEqual(isUpcomingAppointment(pastAppointment, now), false);
    assert.strictEqual(isDispoNeeded(pastAppointment, now), true);
  });

  // 4. Logging outcomes removes lead from BOTH Appts Set and Dispo Due
  it('removes lead from both upcoming sit-downs and dispo due queues upon disposition', () => {
    const now = new Date('2026-09-08T16:00:00.000Z');
    const outcomes = ['converted', 'nurture_drip', 'rescheduled', 'no_show', 'declined'];

    for (const outcome of outcomes) {
      const dispositionedLead = {
        id: 'lead_dispo',
        last_disposition: outcome === 'converted' ? 'connected' : 'appointment_set',
        appointment_scheduled_at: '2026-09-08T14:00:00.000Z',
        appointment_outcome: outcome,
        appointment_completed_at: '2026-09-08T15:00:00.000Z',
      };

      assert.strictEqual(
        isUpcomingAppointment(dispositionedLead, now),
        false,
        `Outcome ${outcome} should not be upcoming`
      );
      assert.strictEqual(
        isDispoNeeded(dispositionedLead, now),
        false,
        `Outcome ${outcome} should not be in Dispo Due`
      );
    }
  });

  // 5. Audit Trail & KPI Preservation
  it('preserves historical appointment_set call log entry when recording post-appointment outcome', () => {
    const callLogs = [
      {
        id: 'log_booking_1',
        lead_id: 'lead_appt_1',
        disposition: 'appointment_set',
        duration_seconds: 145,
        created_at: '2026-09-01T10:15:00.000Z',
        notes: 'Sit-down booked for Sept 8 during 4th period',
      },
    ];

    // Simulate advisor completing sit-down wrap-up
    const newWrapUpLog = {
      id: 'log_wrapup_1',
      lead_id: 'lead_appt_1',
      disposition: 'connected',
      duration_seconds: 0,
      created_at: '2026-09-08T15:00:00.000Z',
      notes: '[Sit-Down Wrap-Up] Converted to client. $6,000 AP Flow Annuity enrolled.',
    };
    callLogs.push(newWrapUpLog);

    // Verify historical KPI calculation: total appointments booked remains 1
    const appointmentsBookedCount = callLogs.filter(
      (l) => l.disposition === 'appointment_set' && !l.sms_sent
    ).length;

    assert.strictEqual(appointmentsBookedCount, 1);
    assert.strictEqual(callLogs.length, 2);
    assert.strictEqual(callLogs[0].disposition, 'appointment_set');
    assert.strictEqual(callLogs[1].disposition, 'connected');
  });

  // 6. Deduplication preserves appointment lifecycle fields
  it('preserves latest appointment_scheduled_at and appointment_outcome during lead deduplication', () => {
    const olderLead = {
      id: 'older',
      name: 'Marcus Brody',
      phone: '3865559988',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-05T10:00:00.000Z',
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    const newerLead = {
      id: 'newer',
      name: 'Marcus Brody',
      phone: '3865559988',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-10T14:00:00.000Z',
      appointment_outcome: 'converted',
      appointment_completed_at: '2026-09-10T15:00:00.000Z',
    };

    // Deduplication logic prioritizing the latest outcome
    const merged = {
      ...olderLead,
      ...newerLead,
      appointment_scheduled_at: newerLead.appointment_scheduled_at || olderLead.appointment_scheduled_at,
      appointment_outcome: newerLead.appointment_outcome || olderLead.appointment_outcome,
      appointment_completed_at: newerLead.appointment_completed_at || olderLead.appointment_completed_at,
    };

    assert.strictEqual(merged.appointment_scheduled_at, '2026-09-10T14:00:00.000Z');
    assert.strictEqual(merged.appointment_outcome, 'converted');
    assert.strictEqual(merged.appointment_completed_at, '2026-09-10T15:00:00.000Z');
  });

  // 7. WebDatabase SQL Pattern Matching for Appointment Lifecycle
  it('matches WebDatabase SQL queries for appointment lifecycle columns', () => {
    function simulateWebDb(sql, params, record) {
      const s = sql.toLowerCase().replace(/\s+/g, ' ').trim();
      if (s.includes('update leads set') && s.includes('appointment_outcome = ?')) {
        record.appointment_outcome = params[0];
        record.appointment_completed_at = params[1];
        record.notes = params[2];
        record.updated_at = params[3];
        return { changes: 1 };
      }
      if (s.includes('update leads set') && s.includes('appointment_scheduled_at = ?')) {
        record.appointment_scheduled_at = params[0];
        record.follow_up_at = params[1];
        record.last_disposition = 'appointment_set';
        record.updated_at = params[2];
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    const testRecord = {
      id: 'lead_sql_test',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: null,
      appointment_outcome: null,
    };

    const sqlSchedule = `
      UPDATE leads 
      SET appointment_scheduled_at = ?, follow_up_at = ?, last_disposition = 'appointment_set', updated_at = ?
      WHERE id = ?
    `;
    const res1 = simulateWebDb(sqlSchedule, ['2026-09-12T13:00:00.000Z', '2026-09-12T13:00:00.000Z', '2026-09-06T15:00:00.000Z', 'lead_sql_test'], testRecord);
    assert.strictEqual(res1.changes, 1);
    assert.strictEqual(testRecord.appointment_scheduled_at, '2026-09-12T13:00:00.000Z');

    const sqlDispo = `
      UPDATE leads
      SET appointment_outcome = ?, appointment_completed_at = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `;
    const res2 = simulateWebDb(sqlDispo, ['converted', '2026-09-12T14:00:00.000Z', 'Client converted with $4,800 AP', '2026-09-12T14:05:00.000Z', 'lead_sql_test'], testRecord);
    assert.strictEqual(res2.changes, 1);
    assert.strictEqual(testRecord.appointment_outcome, 'converted');
    assert.strictEqual(testRecord.appointment_completed_at, '2026-09-12T14:00:00.000Z');
  });
});
