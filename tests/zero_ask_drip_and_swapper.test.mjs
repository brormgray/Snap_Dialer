import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadModule(relPath) {
  const absPath = path.resolve(__dirname, '..', relPath);
  const src = fs.readFileSync(absPath, 'utf8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const moduleObj = { exports: {} };
  const runner = new Function('module', 'exports', 'require', transpiled.outputText);
  const mockRequire = (id) => {
    if (id === 'react-native') {
      return { Platform: { OS: 'ios' }, Alert: { alert: () => {} } };
    }
    if (id === '../theme/colors' || id === './colors') {
      return { Colors: { heavenlyGold: '#D4A017', brandAccent: '#38BDF8', livingWhite: '#FFFFFF' } };
    }
    if (id.includes('dripTemplates')) {
      return loadModule('src/data/dripTemplates.ts');
    }
    if (id.includes('telephonyService')) {
      return loadModule('src/services/telephonyService.ts');
    }
    if (id.includes('dateTimeAwareService')) {
      return loadModule('src/services/dateTimeAwareService.ts');
    }
    if (id.includes('frsKnowledgeBank')) {
      return loadModule('src/data/frsKnowledgeBank.ts');
    }
    if (id.includes('leadsRepository')) {
      return { LeadsRepository: { updateLeadDetails: async () => {} } };
    }
    if (id.includes('callLogsRepository')) {
      return { CallLogsRepository: { logCall: async () => {} } };
    }
    if (id.includes('settingsRepository')) {
      return { SettingsRepository: { getSettings: async () => ({ user_name: 'Alex', agency_name: 'ValuTeachers' }) } };
    }
    if (id.includes('geminiModelService')) {
      return { GeminiModelService: { getActiveModels: async () => ['gemini-2.0-flash'] } };
    }
    return {};
  };
  runner(moduleObj, moduleObj.exports, mockRequire);
  return moduleObj.exports;
}

const dripTemplatesModule = loadModule('src/data/dripTemplates.ts');
const {
  NURTURE_DRIP_TEMPLATES,
  NON_FRS_NURTURE_DRIP_TEMPLATES,
  CLIENT_REVIEW_DRIP_TEMPLATES,
  NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES,
  ZERO_ASK_FRS_INSIGHT_TEMPLATES,
  ZERO_ASK_SCHOOL_COMMUNITY_TEMPLATES,
  DIRECT_ASK_NURTURE_TEMPLATES,
  ZERO_ASK_NON_FRS_INSIGHT_TEMPLATES,
  ZERO_ASK_NON_FRS_COMMUNITY_TEMPLATES,
  DIRECT_ASK_NON_FRS_NURTURE_TEMPLATES,
  ALL_DRIP_TEMPLATES,
  getTemplatesByCategory,
  getAlternativeTemplate,
  getDripTemplateById,
} = dripTemplatesModule;

const telephonyModule = loadModule('src/services/telephonyService.ts');
const { TelephonyService } = telephonyModule;

const dripDispatcherModule = loadModule('src/services/dripDispatcherService.ts');
const { DripDispatcherService } = dripDispatcherModule;

const aiSmsModule = loadModule('src/services/aiSmsService.ts');
const { AiSmsService } = aiSmsModule;

describe('Zero-Ask "Trust & Relationship" SMS Drip & 1-Tap Category Swapper Suite', () => {

  describe('1. Zero-Ask Template Copy & Call-to-Action Validation', () => {
    const FORBIDDEN_ASK_PATTERNS = [
      /\bsit[- ]?down\b/i,
      /\bplanning period\b/i,
      /\bRoom \d+/i,
      /\bwhen can we\b/i,
      /\bwhen are you free\b/i,
      /\b15[- ]?min/i,
      /\b10[- ]?min/i,
      /\bcan we touch base in\b/i,
      /\blet me know if you would like to meet\b/i,
    ];

    it('verifies all ZERO_ASK_FRS_INSIGHT_TEMPLATES have is_zero_ask: true and pure_insight category', () => {
      assert.ok(ZERO_ASK_FRS_INSIGHT_TEMPLATES.length >= 6);
      for (const tpl of ZERO_ASK_FRS_INSIGHT_TEMPLATES) {
        assert.strictEqual(tpl.is_zero_ask, true, `${tpl.id} should have is_zero_ask: true`);
        assert.strictEqual(tpl.drip_category, 'pure_insight', `${tpl.id} should be pure_insight`);
        
        // Assert absence of pushy appointment language
        for (const pattern of FORBIDDEN_ASK_PATTERNS) {
          assert.strictEqual(
            pattern.test(tpl.body),
            false,
            `Zero-ask template "${tpl.id}" must NOT contain meeting ask pattern ${pattern}. Body: "${tpl.body}"`
          );
        }

        // Assert presence of relationship-building closing
        const hasWarmClosing = /no reply needed|files|records|files!|records!|Have a (great|wonderful)|peace of mind|clarity|classes|smoothly/i.test(tpl.body);
        assert.strictEqual(
          hasWarmClosing,
          true,
          `Template "${tpl.id}" should have a warm zero-ask closing. Body: "${tpl.body}"`
        );
      }
    });

    it('verifies all ZERO_ASK_SCHOOL_COMMUNITY_TEMPLATES have is_zero_ask: true and school_community category', () => {
      assert.ok(ZERO_ASK_SCHOOL_COMMUNITY_TEMPLATES.length >= 4);
      for (const tpl of ZERO_ASK_SCHOOL_COMMUNITY_TEMPLATES) {
        assert.strictEqual(tpl.is_zero_ask, true, `${tpl.id} should have is_zero_ask: true`);
        assert.strictEqual(tpl.drip_category, 'school_community', `${tpl.id} should be school_community`);

        for (const pattern of FORBIDDEN_ASK_PATTERNS) {
          assert.strictEqual(
            pattern.test(tpl.body),
            false,
            `Zero-ask community template "${tpl.id}" must NOT contain meeting ask pattern ${pattern}. Body: "${tpl.body}"`
          );
        }

        const hasGoodwillClosing = /thank you|encouragement|weekend|students|corner|educator|restful/i.test(tpl.body);
        assert.strictEqual(
          hasGoodwillClosing,
          true,
          `Template "${tpl.id}" should contain community goodwill closing. Body: "${tpl.body}"`
        );
      }
    });

    it('verifies all ZERO_ASK_NON_FRS_INSIGHT_TEMPLATES have is_zero_ask: true and no educator terminology', () => {
      assert.ok(ZERO_ASK_NON_FRS_INSIGHT_TEMPLATES.length >= 3);
      for (const tpl of ZERO_ASK_NON_FRS_INSIGHT_TEMPLATES) {
        assert.strictEqual(tpl.is_zero_ask, true);
        assert.strictEqual(tpl.drip_category, 'pure_insight');
        assert.strictEqual(/FRS|DROP|school|planning period|teacher/i.test(tpl.body), false);
      }
    });

    it('verifies all ZERO_ASK_NON_FRS_COMMUNITY_TEMPLATES have is_zero_ask: true and warm personal goodwill', () => {
      assert.ok(ZERO_ASK_NON_FRS_COMMUNITY_TEMPLATES.length >= 2);
      for (const tpl of ZERO_ASK_NON_FRS_COMMUNITY_TEMPLATES) {
        assert.strictEqual(tpl.is_zero_ask, true);
        assert.strictEqual(tpl.drip_category, 'school_community');
        assert.strictEqual(/FRS|DROP|school|planning period|teacher/i.test(tpl.body), false);
      }
    });
  });

  describe('2. Hybrid Weaved Cadence Structure', () => {
    it('verifies NURTURE_DRIP_TEMPLATES weaves Direct Asks with Zero-Ask touches', () => {
      assert.strictEqual(NURTURE_DRIP_TEMPLATES.length, 11);

      // Step 0 & 1: Sprint (action asks)
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[0].drip_category, 'action_appointment');
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[0].is_zero_ask, false);
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[1].drip_category, 'action_appointment');
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[1].is_zero_ask, false);

      // Step 2: Bridge Week 2 (Zero-Ask FRS Insight: SB 7024 DROP)
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[2].drip_category, 'pure_insight');
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[2].is_zero_ask, true);

      // Step 3: Bridge Week 3 (Action Ask: Paycheck Cutoff)
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[3].drip_category, 'action_appointment');
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[3].is_zero_ask, false);

      // Step 4: Bridge Week 4 (Zero-Ask School Goodwill: Teacher Appreciation)
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[4].drip_category, 'school_community');
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[4].is_zero_ask, true);

      // Step 5: Bridge Week 6 (Action Ask: Permission to Pause)
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[5].drip_category, 'action_appointment');
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[5].is_zero_ask, false);

      // Step 6: Month 2 (Zero-Ask FRS Insight: One-Time Second Election)
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[6].drip_category, 'pure_insight');
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[6].is_zero_ask, true);

      // Step 7: Month 3 (Action Ask: 0% Floor)
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[7].drip_category, 'action_appointment');
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[7].is_zero_ask, false);

      // Step 8: Month 4 (Zero-Ask School Community: Mid-Month District Payroll)
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[8].drip_category, 'school_community');
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[8].is_zero_ask, true);

      // Step 9: Month 5 (Action Ask: Longevity Milestones)
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[9].drip_category, 'action_appointment');
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[9].is_zero_ask, false);

      // Step 10: Indefinite Monthly (Action Ask: Seasonal Roadmap)
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[10].drip_category, 'action_appointment');
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[10].is_zero_ask, false);
    });

    it('verifies NON_FRS_NURTURE_DRIP_TEMPLATES weaves Direct Asks with Zero-Ask touches', () => {
      assert.strictEqual(NON_FRS_NURTURE_DRIP_TEMPLATES.length, 11);
      assert.strictEqual(NON_FRS_NURTURE_DRIP_TEMPLATES[2].drip_category, 'pure_insight');
      assert.strictEqual(NON_FRS_NURTURE_DRIP_TEMPLATES[2].is_zero_ask, true);
      assert.strictEqual(NON_FRS_NURTURE_DRIP_TEMPLATES[4].drip_category, 'school_community');
      assert.strictEqual(NON_FRS_NURTURE_DRIP_TEMPLATES[4].is_zero_ask, true);
      assert.strictEqual(NON_FRS_NURTURE_DRIP_TEMPLATES[6].drip_category, 'pure_insight');
      assert.strictEqual(NON_FRS_NURTURE_DRIP_TEMPLATES[6].is_zero_ask, true);
      assert.strictEqual(NON_FRS_NURTURE_DRIP_TEMPLATES[8].drip_category, 'school_community');
      assert.strictEqual(NON_FRS_NURTURE_DRIP_TEMPLATES[8].is_zero_ask, true);
    });
  });

  describe('3. Category Banks & Helper Lookups', () => {
    it('resolves correct banks via getTemplatesByCategory', () => {
      const frsAsks = getTemplatesByCategory('action_appointment', true);
      assert.strictEqual(frsAsks, DIRECT_ASK_NURTURE_TEMPLATES);

      const frsInsights = getTemplatesByCategory('pure_insight', true);
      assert.strictEqual(frsInsights, ZERO_ASK_FRS_INSIGHT_TEMPLATES);

      const frsGoodwill = getTemplatesByCategory('school_community', true);
      assert.strictEqual(frsGoodwill, ZERO_ASK_SCHOOL_COMMUNITY_TEMPLATES);

      const nonFrsAsks = getTemplatesByCategory('action_appointment', false);
      assert.strictEqual(nonFrsAsks, DIRECT_ASK_NON_FRS_NURTURE_TEMPLATES);

      const nonFrsInsights = getTemplatesByCategory('pure_insight', false);
      assert.strictEqual(nonFrsInsights, ZERO_ASK_NON_FRS_INSIGHT_TEMPLATES);

      const nonFrsGoodwill = getTemplatesByCategory('school_community', false);
      assert.strictEqual(nonFrsGoodwill, ZERO_ASK_NON_FRS_COMMUNITY_TEMPLATES);
    });

    it('cycles cleanly through alternatives via getAlternativeTemplate', () => {
      const alt0 = getAlternativeTemplate('pure_insight', 0, true);
      const alt1 = getAlternativeTemplate('pure_insight', 1, true);
      const altWrapped = getAlternativeTemplate('pure_insight', ZERO_ASK_FRS_INSIGHT_TEMPLATES.length, true);

      assert.ok(alt0);
      assert.ok(alt1);
      assert.strictEqual(altWrapped.id, alt0.id);
    });

    it('retains all legacy template IDs in ALL_DRIP_TEMPLATES without duplicate IDs', () => {
      const legacyIds = [
        'tpl_nurture_sprint_24h',
        'tpl_nurture_sprint_48h',
        'tpl_nurture_day7_multiplier',
        'tpl_nurture_day21_drop_inflation',
        'tpl_nurture_day45_tax_catchup',
        'tpl_nurture_day90_semester_checkin',
        'tpl_non_frs_nurture_sprint_24h',
        'tpl_non_frs_nurture_sprint_48h',
        'tpl_non_frs_nurture_bridge_wk2',
        'tpl_non_frs_nurture_bridge_wk4',
        'tpl_non_frs_nurture_month2_ss_gap',
        'tpl_non_frs_nurture_month4_tax',
      ];

      for (const id of legacyIds) {
        const found = getDripTemplateById(id);
        assert.ok(found, `Expected legacy template ID ${id} to exist in ALL_DRIP_TEMPLATES`);
      }

      // Check uniqueness of ALL_DRIP_TEMPLATES IDs
      const idSet = new Set();
      for (const tpl of ALL_DRIP_TEMPLATES) {
        assert.strictEqual(idSet.has(tpl.id), false, `Duplicate template ID found: ${tpl.id}`);
        idSet.add(tpl.id);
      }
    });
  });

  describe('4. Token Interpolation Verification', () => {
    const mockLead = {
      id: 'lead-test-1',
      name: 'Sarah Connor',
      phone: '3865551234',
      school: 'Spruce Creek High',
      room_number: '204',
      planning_period: 'Period 3',
      years_in_frs: '14',
      is_frs: true,
      company: 'ValuTeachers',
    };

    it('interpolates all tokens cleanly across all zero-ask templates', () => {
      const allZeroAsk = [
        ...ZERO_ASK_FRS_INSIGHT_TEMPLATES,
        ...ZERO_ASK_SCHOOL_COMMUNITY_TEMPLATES,
        ...ZERO_ASK_NON_FRS_INSIGHT_TEMPLATES,
        ...ZERO_ASK_NON_FRS_COMMUNITY_TEMPLATES,
      ];

      for (const tpl of allZeroAsk) {
        const interpolated = TelephonyService.interpolateTemplate(
          tpl,
          mockLead,
          'Alex',
          new Date(),
          'ValuTeachers'
        );

        assert.ok(interpolated.length > 20);
        // Verify no unparsed {{...}} placeholders remain
        const unparsedMatch = interpolated.match(/\{\{([a-zA-Z0-9_]+)\}\}/);
        assert.strictEqual(
          unparsedMatch,
          null,
          `Template "${tpl.id}" left unparsed token "${unparsedMatch?.[0]}" in output: "${interpolated}"`
        );
        assert.ok(interpolated.includes('Sarah'), `Expected first name "Sarah" in "${interpolated}"`);
      }
    });
  });

  describe('5. DripDispatcherService Category Alternatives Integration', () => {
    it('populates categoryAlternatives for all 3 categories with pre-interpolated messages', () => {
      const testLeads = [
        {
          id: 'lead-due-1',
          name: 'Jennifer Aniston',
          phone: '3865559876',
          school: 'Mainland High',
          room_number: '112',
          planning_period: 'Period 4',
          is_frs: true,
          drip_track: 'prospect_nurture',
          drip_step: 2,
          next_drip_scheduled_at: '2026-10-01', // Due today
          text_ok: true,
        },
      ];

      const dueItems = DripDispatcherService.getDueDrips(testLeads, 'Alex', 'ValuTeachers');
      assert.strictEqual(dueItems.length, 1);

      const item = dueItems[0];
      assert.strictEqual(item.stepNumber, 2);
      assert.strictEqual(item.track, 'prospect_nurture');
      assert.strictEqual(item.isZeroAsk, true);
      assert.strictEqual(item.dripCategory, 'pure_insight');

      // Verify categoryAlternatives exists with all 3 keys
      assert.ok(item.categoryAlternatives, 'Expected categoryAlternatives to be defined');
      assert.ok(item.categoryAlternatives.action_appointment);
      assert.ok(item.categoryAlternatives.pure_insight);
      assert.ok(item.categoryAlternatives.school_community);

      // Verify action_appointment alternative
      const askAlt = item.categoryAlternatives.action_appointment;
      assert.strictEqual(askAlt.category, 'action_appointment');
      assert.strictEqual(askAlt.isZeroAsk, false);
      assert.ok(askAlt.formattedMessage.includes('Jennifer'));

      // Verify pure_insight alternative
      const insightAlt = item.categoryAlternatives.pure_insight;
      assert.strictEqual(insightAlt.category, 'pure_insight');
      assert.strictEqual(insightAlt.isZeroAsk, true);
      assert.ok(insightAlt.formattedMessage.includes('Jennifer'));
      assert.ok(insightAlt.formattedMessage.includes('SB 7024'));

      // Verify school_community alternative
      const communityAlt = item.categoryAlternatives.school_community;
      assert.strictEqual(communityAlt.category, 'school_community');
      assert.strictEqual(communityAlt.isZeroAsk, true);
      assert.ok(communityAlt.formattedMessage.includes('Jennifer'));
      assert.ok(communityAlt.formattedMessage.includes('Mainland High'));
    });
  });

  describe('6. AiSmsService Zero-Ask Smart Fallbacks', () => {
    const mockLead = {
      id: 'lead-fallback-1',
      name: 'Marcus Brody',
      school: 'University High',
      phone: '4075551212',
      is_frs: true,
      company: 'ValuTeachers',
    };

    it('generates zero-ask insight fallback without appointment language', () => {
      const msg = AiSmsService.getSmartFallbackSMS(
        mockLead,
        'Alex',
        'zero_ask_insight',
        new Date(),
        'ValuTeachers'
      );

      assert.ok(msg.includes('Marcus'));
      assert.ok(msg.includes('SB 7024'));
      assert.ok(msg.includes('No reply needed'));
      assert.strictEqual(/sit[- ]?down/i.test(msg), false);
      assert.strictEqual(/planning period/i.test(msg), false);
    });

    it('generates zero-ask school community fallback without appointment language', () => {
      const msg = AiSmsService.getSmartFallbackSMS(
        mockLead,
        'Alex',
        'zero_ask_community',
        new Date(),
        'ValuTeachers'
      );

      assert.ok(msg.includes('Marcus'));
      assert.ok(msg.includes('University High'));
      assert.ok(msg.includes('encouragement'));
      assert.ok(msg.includes('Thank you for everything you do'));
      assert.strictEqual(/sit[- ]?down/i.test(msg), false);
      assert.strictEqual(/planning period/i.test(msg), false);
    });

    it('generates non-FRS zero-ask fallbacks without educator or appointment terms', () => {
      const nonFrsLead = {
        id: 'lead-fallback-non-frs',
        name: 'David Wallace',
        phone: '2125559999',
        is_frs: false,
        company: 'Horizon Financial',
      };

      const insightMsg = AiSmsService.getSmartFallbackSMS(
        nonFrsLead,
        'Alex',
        'zero_ask_insight',
        new Date(),
        'Horizon Financial'
      );
      assert.ok(insightMsg.includes('David'));
      assert.ok(insightMsg.includes('Social Security'));
      assert.ok(insightMsg.includes('No reply needed'));
      assert.strictEqual(/\b(FRS|DROP|school|classroom|teacher)\b/i.test(insightMsg), false);

      const communityMsg = AiSmsService.getSmartFallbackSMS(
        nonFrsLead,
        'Alex',
        'zero_ask_community',
        new Date(),
        'ValuTeachers'
      );
      assert.ok(communityMsg.includes('David'));
      assert.ok(communityMsg.includes('wishing you a wonderful'));
      assert.strictEqual(/sit[- ]?down/i.test(communityMsg), false);
    });
  });
});
