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
});
