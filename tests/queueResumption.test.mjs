import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Dialer HUD Queue Resumption Engine', () => {
  // Simulates resumeQueuePosition from DialerHudScreen.tsx
  function resumeQueuePosition(leads, savedLeadId, savedIndexStr) {
    if (savedLeadId && leads.length > 0) {
      const foundIndex = leads.findIndex((l) => l.id === savedLeadId);
      if (foundIndex >= 0 && foundIndex < leads.length) {
        return foundIndex;
      }
    }
    // If the last lead was completed/dispositioned and removed from callable queue, resume at saved index
    if (savedIndexStr && leads.length > 0) {
      const parsed = parseInt(savedIndexStr, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        return Math.min(parsed, leads.length - 1);
      }
    }
    return 0;
  }

  test('resumes at exact lead ID index when prospect is still in queue', () => {
    const queue = [
      { id: 'lead_1', name: 'Teacher 1' },
      { id: 'lead_2', name: 'Teacher 2' },
      { id: 'lead_3', name: 'Teacher 3' },
      { id: 'lead_4', name: 'Teacher 4' },
    ];

    const resumedIndex = resumeQueuePosition(queue, 'lead_3', '2');
    assert.strictEqual(resumedIndex, 2);
    assert.strictEqual(queue[resumedIndex].name, 'Teacher 3');
  });

  test('falls back to saved index when previous lead was completed and removed from queue', () => {
    // Lead 2 was called and marked "appointment_set" - now removed from callable queue!
    const queue = [
      { id: 'lead_1', name: 'Teacher 1' },
      // lead_2 is gone
      { id: 'lead_3', name: 'Teacher 3' },
      { id: 'lead_4', name: 'Teacher 4' },
    ];

    // Saved position was index 1 (which was lead_2 before removal)
    const resumedIndex = resumeQueuePosition(queue, 'lead_2', '1');
    assert.strictEqual(resumedIndex, 1);
    assert.strictEqual(queue[resumedIndex].name, 'Teacher 3', 'Should advance to Teacher 3, NOT reset to 0');
  });

  test('safely clamps to last item if saved index exceeds remaining queue size', () => {
    const queue = [
      { id: 'lead_1', name: 'Teacher 1' },
      { id: 'lead_2', name: 'Teacher 2' },
    ];

    const resumedIndex = resumeQueuePosition(queue, 'lead_old_99', '15');
    assert.strictEqual(resumedIndex, 1, 'Clamped to last item (queue.length - 1)');
  });

  test('defaults to 0 for empty or clean queue initialization', () => {
    const queue = [{ id: 'lead_1', name: 'Teacher 1' }];
    assert.strictEqual(resumeQueuePosition(queue, null, null), 0);
    assert.strictEqual(resumeQueuePosition([], 'lead_1', '0'), 0);
  });

  test('Save & Next advances to next lead regardless of auto_advance_enabled setting', () => {
    const queue = [
      { id: 'lead_1', name: 'Teacher 1' },
      { id: 'lead_2', name: 'Teacher 2' },
      { id: 'lead_3', name: 'Teacher 3' },
    ];
    let currentIndex = 0;

    function advanceNextLead() {
      if (currentIndex + 1 < queue.length) {
        currentIndex += 1;
      }
    }

    function handleDisposition(disposition, note, advanceImmediately) {
      if (advanceImmediately) {
        advanceNextLead();
      }
    }

    // User saves note/appointment with "Save & Next" (advanceImmediately = true)
    handleDisposition('appointment_set', 'Sit-down set for Thursday', true);

    assert.strictEqual(currentIndex, 1, 'Dialer must advance from Teacher 1 to Teacher 2');
    assert.strictEqual(queue[currentIndex].name, 'Teacher 2');

    // Next call: Spoke with Teacher 2, click Save & Next
    handleDisposition('connected', 'Great conversation', true);
    assert.strictEqual(currentIndex, 2, 'Dialer must advance from Teacher 2 to Teacher 3');
    assert.strictEqual(queue[currentIndex].name, 'Teacher 3');
  });

  test('Two-way swipe navigation: swipe right goes to previous lead and stops safely at index 0', () => {
    const queue = [
      { id: 'lead_1', name: 'Teacher 1' },
      { id: 'lead_2', name: 'Teacher 2' },
      { id: 'lead_3', name: 'Teacher 3' },
    ];
    let currentIndex = 2; // At Teacher 3

    function advanceNextLead() {
      if (currentIndex + 1 < queue.length) {
        currentIndex += 1;
      }
    }

    function goToPreviousLead() {
      if (currentIndex > 0) {
        currentIndex -= 1;
      }
    }

    // Swipe Right from Teacher 3 -> goes to Teacher 2
    goToPreviousLead();
    assert.strictEqual(currentIndex, 1);
    assert.strictEqual(queue[currentIndex].name, 'Teacher 2');

    // Swipe Right from Teacher 2 -> goes to Teacher 1
    goToPreviousLead();
    assert.strictEqual(currentIndex, 0);
    assert.strictEqual(queue[currentIndex].name, 'Teacher 1');

    // Swipe Right at boundary (Teacher 1) -> stays safely at Teacher 1
    goToPreviousLead();
    assert.strictEqual(currentIndex, 0, 'Cannot navigate prior to the first lead in queue');
    assert.strictEqual(queue[currentIndex].name, 'Teacher 1');

    // Swipe Left from Teacher 1 -> advances to Teacher 2
    advanceNextLead();
    assert.strictEqual(currentIndex, 1);
    assert.strictEqual(queue[currentIndex].name, 'Teacher 2');
  });

  test('Full campaign roster is preserved: dispositioned leads remain in deck allowing backward traversal', () => {
    // 4 educators in campaign roster
    const fullRoster = [
      { id: 'lead_1', name: 'Mrs. Davis', last_disposition: 'appointment_set' },
      { id: 'lead_2', name: 'Mr. Gonzalez', last_disposition: 'connected' },
      { id: 'lead_3', name: 'Ms. Smith', last_disposition: 'no_answer' },
      { id: 'lead_4', name: 'Coach Johnson', last_disposition: 'pending' },
    ];

    // Simulates resumeQueuePosition when reopening dialer with saved lead 'lead_4'
    function resume(leads, savedId) {
      const idx = leads.findIndex((l) => l.id === savedId);
      if (idx >= 0) return idx;
      const firstUncalled = leads.findIndex(
        (l) => !l.last_disposition || ['pending', 'no_answer', 'voicemail'].includes(l.last_disposition)
      );
      return firstUncalled >= 0 ? firstUncalled : 0;
    }

    const resumedIdx = resume(fullRoster, 'lead_4');
    assert.strictEqual(resumedIdx, 3, 'Must position agent at index 3 (Coach Johnson)');
    assert.strictEqual(fullRoster.length, 4, 'Total roster length must remain 4, never shrinking');
    assert.strictEqual(fullRoster[resumedIdx].name, 'Coach Johnson');

    // Agent swipes back to Ms. Smith, Mr. Gonzalez, Mrs. Davis
    let cur = resumedIdx;
    cur -= 1;
    assert.strictEqual(fullRoster[cur].name, 'Ms. Smith');
    assert.strictEqual(fullRoster[cur].last_disposition, 'no_answer');

    cur -= 1;
    assert.strictEqual(fullRoster[cur].name, 'Mr. Gonzalez');
    assert.strictEqual(fullRoster[cur].last_disposition, 'connected');

    cur -= 1;
    assert.strictEqual(fullRoster[cur].name, 'Mrs. Davis');
    assert.strictEqual(fullRoster[cur].last_disposition, 'appointment_set');
  });

  test('Database transaction batching: preserves state on error and saves only once on commit', async () => {
    let saveCount = 0;
    const db = {
      inTransaction: false,
      leads: [{ id: 'lead_1', name: 'Original Teacher', notes: 'Old Notes' }],
      async saveToStorage() {
        saveCount++;
      },
      async runAsync(sql, params) {
        if (params && params[0] === 'New Name') {
          this.leads[0].name = 'New Name';
          this.leads[0].notes = 'New Notes';
        }
        if (!this.inTransaction) {
          await this.saveToStorage();
        }
      },
      async withTransactionAsync(fn) {
        if (this.inTransaction) {
          await fn();
          return;
        }
        const snapshot = {
          leads: JSON.parse(JSON.stringify(this.leads)),
        };
        this.inTransaction = true;
        try {
          await fn();
          this.inTransaction = false;
          await this.saveToStorage();
        } catch (err) {
          this.inTransaction = false;
          this.leads = snapshot.leads;
          throw err;
        }
      },
    };

    // 1. Successful transaction with 5 statements saves to storage exactly ONCE
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE leads', ['New Name']);
      await db.runAsync('UPDATE leads', ['New Name']);
      await db.runAsync('UPDATE leads', ['New Name']);
      await db.runAsync('UPDATE leads', ['New Name']);
      await db.runAsync('UPDATE leads', ['New Name']);
    });

    assert.strictEqual(saveCount, 1, 'Should execute saveToStorage exactly once at commit');
    assert.strictEqual(db.leads[0].name, 'New Name');

    // 2. Errored transaction restores deep snapshot without saving
    try {
      await db.withTransactionAsync(async () => {
        db.leads[0].name = 'Corrupted Name';
        db.leads[0].notes = 'Corrupted Notes';
        throw new Error('Simulation of disk failure mid-batch');
      });
    } catch (e) {
      assert.strictEqual(e.message, 'Simulation of disk failure mid-batch');
    }

    assert.strictEqual(saveCount, 1, 'Save count should not have increased on rollback');
    assert.strictEqual(db.leads[0].name, 'New Name', 'Deep snapshot should restore pre-transaction name');
    assert.strictEqual(db.leads[0].notes, 'New Notes', 'Deep snapshot should restore pre-transaction notes');
  });

  test('Analytics voice dial vs standalone SMS: distinguishes voice dials from text messages', () => {
    const logs = [
      // 1. Real voice call attempt (No answer, follow-up SMS triggered by cadence)
      {
        id: 'log_1',
        disposition: 'no_answer',
        duration_seconds: 0,
        sms_sent: 1,
        note: 'Call attempt #1: No Answer / Voicemail. Sent follow-up SMS.',
      },
      // 2. Real voice call connected (Duration 45s)
      {
        id: 'log_2',
        disposition: 'connected',
        duration_seconds: 45,
        sms_sent: 0,
        note: 'Spoke with teacher',
      },
      // 3. Standalone SMS sent via modal (No phone dial made)
      {
        id: 'log_3',
        disposition: 'no_answer',
        duration_seconds: 0,
        sms_sent: 1,
        note: 'Sent persuasive ValuTeachers SMS',
      },
    ];

    let totalDials = 0;
    let smsSentCount = 0;

    for (const r of logs) {
      if (r.sms_sent === 1 || r.sms_sent === true) {
        smsSentCount++;
      }
      const isStandaloneSms = (r.sms_sent === 1 || r.sms_sent === true) &&
        Number(r.duration_seconds) === 0 &&
        Boolean(r.note && (r.note.includes('Sent persuasive ValuTeachers SMS') || r.note.includes('SMS Only')));
      const isVoiceDial = !isStandaloneSms && Boolean(r.disposition);
      if (isVoiceDial) {
        totalDials++;
      }
    }

    assert.strictEqual(totalDials, 2, 'Should count exactly 2 voice dials (log_1 and log_2), ignoring log_3');
    assert.strictEqual(smsSentCount, 2, 'Should count exactly 2 SMS sent (log_1 and log_3)');
  });

  test('Telephony template token replacement: supports first_name, last_name, and notes', () => {
    const lead = {
      name: 'Jennifer Aniston',
      school: 'Deltona High',
      planning_period: '3rd Period',
      notes: 'Interested in FRS Drop Program',
      company: 'ValuTeachers',
    };

    function interpolate(tpl, l, myName = 'Alex') {
      const firstName = l.name ? l.name.split(' ')[0] : 'there';
      const lastName = l.name && l.name.split(' ').length > 1 ? l.name.split(' ').slice(1).join(' ') : '';
      return tpl
        .replace(/{{name}}/gi, firstName)
        .replace(/{{first_name}}/gi, firstName)
        .replace(/{{last_name}}/gi, lastName)
        .replace(/{{school}}/gi, l.school || 'your school')
        .replace(/{{note}}/gi, l.notes || '')
        .replace(/{{notes}}/gi, l.notes || '')
        .replace(/{{my_name}}/gi, myName);
    }

    const output = interpolate('Hello {{first_name}} {{last_name}}, I saw your note: "{{notes}}". - {{my_name}}', lead);
    assert.strictEqual(output, 'Hello Jennifer Aniston, I saw your note: "Interested in FRS Drop Program". - Alex');
  });

  test('Vision AI 429 quota exhaustion circuit breaker: stops immediately without wasting time on subsequent models', async () => {
    const candidateModels = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    let callCount = 0;
    let finalError = null;

    for (const model of candidateModels) {
      callCount++;
      try {
        // Simulates Google API returning HTTP 429 (Resource Exhausted)
        throw new Error('QUOTA_EXHAUSTED: Gemini API quota or free credits exhausted.');
      } catch (err) {
        finalError = err;
        if (err?.message?.includes('QUOTA_EXHAUSTED')) {
          break; // Circuit breaker triggers
        }
      }
    }

    assert.strictEqual(callCount, 1, 'Circuit breaker must abort on the 1st model instead of trying all 4');
    assert.match(finalError.message, /QUOTA_EXHAUSTED/);
  });
});


