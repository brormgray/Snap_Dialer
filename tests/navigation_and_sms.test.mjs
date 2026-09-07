import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Navigation Resolution & Lead Card Communications Workflow', () => {
  // 1. Back Navigation Resolution
  it('correctly resolves back navigation using canGoBack with MainTabs fallback', () => {
    const createMockNavigator = (canGoBackResult) => {
      const history = [];
      return {
        canGoBack: () => canGoBackResult,
        goBack: () => history.push('goBack'),
        navigate: (name, params) => history.push({ name, params }),
        getHistory: () => history,
      };
    };

    const resolveBackNavigation = (navigation) => {
      if (navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
        navigation.goBack();
      } else if (navigation && typeof navigation.navigate === 'function') {
        navigation.navigate('MainTabs', { screen: 'Lists' });
      }
    };

    // Scenario A: Screen was pushed onto stack (canGoBack = true)
    const navWithHistory = createMockNavigator(true);
    resolveBackNavigation(navWithHistory);
    assert.deepStrictEqual(navWithHistory.getHistory(), ['goBack'], 'Should call goBack when canGoBack is true');

    // Scenario B: Screen was opened as root or direct tab (canGoBack = false)
    const navRoot = createMockNavigator(false);
    resolveBackNavigation(navRoot);
    assert.deepStrictEqual(
      navRoot.getHistory(),
      [{ name: 'MainTabs', params: { screen: 'Lists' } }],
      'Should navigate to MainTabs / Lists when canGoBack is false'
    );
  });

  // 2. Lead Card Action Routing
  it('routes card body tap to LeadDetail and AI Text button with autoOpenSms flag', () => {
    const navigationHistory = [];
    const mockNavigation = {
      navigate: (screen, params) => navigationHistory.push({ screen, params }),
    };

    const testLead = {
      id: 'lead_123',
      name: 'Sarah Jenkins',
      phone: '(386) 555-0199',
      school: 'Deltona High',
    };

    // Action A: Tap card body
    const handleCardTap = (lead) => {
      mockNavigation.navigate('LeadDetail', { leadId: lead.id });
    };

    // Action B: Tap AI Text button
    const handleAiTextTap = (lead) => {
      mockNavigation.navigate('LeadDetail', { leadId: lead.id, autoOpenSms: true });
    };

    handleCardTap(testLead);
    assert.deepStrictEqual(navigationHistory[0], {
      screen: 'LeadDetail',
      params: { leadId: 'lead_123' },
    });

    handleAiTextTap(testLead);
    assert.deepStrictEqual(navigationHistory[1], {
      screen: 'LeadDetail',
      params: { leadId: 'lead_123', autoOpenSms: true },
    });
  });

  // 3. Telephony URL Generation (iOS vs Android separator)
  it('correctly formats SMS protocol URL with platform separators (& for iOS, ? for Android)', () => {
    const buildSmsUrl = (phone, body, isIOS) => {
      const cleanNumber = phone.replace(/[^\d+]/g, '');
      const separator = isIOS ? '&' : '?';
      const encodedBody = encodeURIComponent(body);
      return `sms:${cleanNumber}${separator}body=${encodedBody}`;
    };

    const phone = '(386) 555-0144';
    const message = 'Hi Sarah, this is with ValuTeachers!';

    const iosUrl = buildSmsUrl(phone, message, true);
    assert.strictEqual(
      iosUrl,
      'sms:3865550144&body=Hi%20Sarah%2C%20this%20is%20with%20ValuTeachers!'
    );

    const androidUrl = buildSmsUrl(phone, message, false);
    assert.strictEqual(
      androidUrl,
      'sms:3865550144?body=Hi%20Sarah%2C%20this%20is%20with%20ValuTeachers!'
    );
  });

  // 4. Fallback Template Pre-population
  it('generates non-empty fallback template immediately before AI re-draft', () => {
    const generateFallbackSms = (lead) => {
      const firstName = (lead.name || 'Educator').split(' ')[0];
      return `Hi ${firstName}, this is with ValuTeachers following up on your FRS Report Card from ${lead.school || 'your school'}. When is a good time to connect?`;
    };

    const lead = { name: 'Michael Scott', school: 'Scranton Middle' };
    const sms = generateFallbackSms(lead);
    assert.ok(sms.includes('Michael'), 'Template should contain educator first name');
    assert.ok(sms.includes('Scranton Middle'), 'Template should contain school');
    assert.ok(sms.length > 20, 'Template should have meaningful content');
  });
});
