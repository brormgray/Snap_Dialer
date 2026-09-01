import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Agency Operations & Sit-Down Velocity Engine', () => {
  function computeRatios(totalDials, appointmentCount, connectedCount) {
    const contactRate = totalDials > 0 ? Math.round(((appointmentCount + connectedCount) / totalDials) * 100) : 0;
    const dialToApptRate = totalDials > 0 ? Math.round((appointmentCount / totalDials) * 100) : 0;
    const conversations = appointmentCount + connectedCount;
    const convToApptRate = conversations > 0 ? Math.round((appointmentCount / conversations) * 100) : 0;
    const dialsPerSitDown = appointmentCount > 0 ? Math.round((totalDials / appointmentCount) * 10) / 10 : 0;

    return {
      contactRate,
      dialToApptRate,
      convToApptRate,
      dialsPerSitDown,
    };
  }

  test('computes correct conversion velocity ratios', () => {
    // e.g. 50 dials, 5 appointments booked, 10 conversations
    const ratios = computeRatios(50, 5, 10);
    assert.strictEqual(ratios.dialToApptRate, 10); // 5 / 50 = 10%
    assert.strictEqual(ratios.contactRate, 30); // (5 + 10) / 50 = 30%
    assert.strictEqual(ratios.convToApptRate, 33); // 5 / 15 = 33%
    assert.strictEqual(ratios.dialsPerSitDown, 10); // 50 / 5 = 10 dials per sit-down
  });

  test('handles zero dials safely without divide by zero', () => {
    const ratios = computeRatios(0, 0, 0);
    assert.strictEqual(ratios.contactRate, 0);
    assert.strictEqual(ratios.dialToApptRate, 0);
    assert.strictEqual(ratios.convToApptRate, 0);
    assert.strictEqual(ratios.dialsPerSitDown, 0);
  });

  test('identifies peak response hour from call timestamps', () => {
    const hourlyMap = new Map();
    for (let h = 7; h <= 18; h++) {
      hourlyMap.set(h, { dials: 0, connected: 0 });
    }

    // Simulate calls: 3 dials at 10 AM (Period 3) with 2 connected, 5 dials at 2 PM with 1 connected
    hourlyMap.get(10).dials += 3;
    hourlyMap.get(10).connected += 2;
    hourlyMap.get(14).dials += 5;
    hourlyMap.get(14).connected += 1;

    const hourlyStats = Array.from(hourlyMap.entries()).map(([hour, data]) => ({
      hour,
      dials: data.dials,
      connected: data.connected,
      contactRate: data.dials > 0 ? Math.round((data.connected / data.dials) * 100) : 0,
    }));

    const activeHours = hourlyStats.filter((h) => h.dials > 0);
    const peakHour = [...activeHours].sort((a, b) => b.contactRate - a.contactRate)[0];

    assert.strictEqual(peakHour.hour, 10);
    assert.strictEqual(peakHour.contactRate, 67); // 2/3 = 67%
  });
});
