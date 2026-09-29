import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function loadModule(filePath) {
  const absPath = path.resolve(filePath);
  const src = fs.readFileSync(absPath, 'utf8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const moduleObj = { exports: {} };
  const runner = new Function('module', 'exports', transpiled.outputText);
  runner(moduleObj, moduleObj.exports);
  return moduleObj.exports;
}

const { FrsKnowledgeBank, FRS_WISDOM_BANK } = loadModule('src/data/frsKnowledgeBank.ts');

function loadAiSmsService() {
  const servicePath = path.resolve('src/services/aiSmsService.ts');
  const src = fs.readFileSync(servicePath, 'utf8');
  return src;
}

describe('FRS Drip Intelligence & Wisdom Seeding Suite (Steps 1 & 2)', () => {
  describe('1. FrsKnowledgeBank Catalog & Matching Engine', () => {
    it('verifies all 10 FRS wisdom seeds exist with complete metadata', () => {
      const seeds = FrsKnowledgeBank.getAllSeeds();
      assert.strictEqual(seeds.length >= 10, true);

      const expectedKeys = [
        'drop_expansion',
        'drop_tax_trap',
        'pension_gap',
        'pretax_takehome',
        'second_election',
        'downside_floor',
        'sick_leave_rollover',
        'student_loan_idr',
        'his_subsidy',
        'vesting_milestone',
      ];

      for (const k of expectedKeys) {
        const found = seeds.find((s) => s.key === k);
        assert.ok(found, `Expected wisdom seed ${k} to exist in knowledge bank`);
        assert.ok(found.title.length > 0);
        assert.ok(found.shortLabel.length > 0);
        assert.ok(found.factualInsight.length > 20);
        assert.ok(found.samplePhrasing.length > 20);
      }
    });

    it('correctly parses years in FRS from various string formats', () => {
      assert.strictEqual(FrsKnowledgeBank.parseYearsInFrs('18'), 18);
      assert.strictEqual(FrsKnowledgeBank.parseYearsInFrs('24 years'), 24);
      assert.strictEqual(FrsKnowledgeBank.parseYearsInFrs('5-10 yrs'), 5);
      assert.strictEqual(FrsKnowledgeBank.parseYearsInFrs('30+'), 30);
      assert.strictEqual(FrsKnowledgeBank.parseYearsInFrs(null), null);
      assert.strictEqual(FrsKnowledgeBank.parseYearsInFrs(''), null);
    });

    it('maps career phases accurately based on years of service', () => {
      assert.strictEqual(FrsKnowledgeBank.getCareerPhase(2), 'early');
      assert.strictEqual(FrsKnowledgeBank.getCareerPhase(7), 'early');
      assert.strictEqual(FrsKnowledgeBank.getCareerPhase(8), 'mid');
      assert.strictEqual(FrsKnowledgeBank.getCareerPhase(19), 'mid');
      assert.strictEqual(FrsKnowledgeBank.getCareerPhase(20), 'drop_zone');
      assert.strictEqual(FrsKnowledgeBank.getCareerPhase(29), 'drop_zone');
      assert.strictEqual(FrsKnowledgeBank.getCareerPhase(30), 'retirement');
      assert.strictEqual(FrsKnowledgeBank.getCareerPhase(null), 'mid');
    });

    it('recommends DROP expansion for veteran educators (20+ years)', () => {
      const lead = {
        id: 'lead_vet',
        name: 'Sarah Jenkins',
        years_in_frs: '24 years',
        school: 'Spruce Creek High',
        planning_period: '4th period',
      };
      const rec = FrsKnowledgeBank.recommendWisdomSeed(lead);
      assert.strictEqual(rec.key, 'drop_expansion');
      assert.ok(rec.factualInsight.includes('SB 7024'));
    });

    it('recommends DROP tax trap when tax or payout is mentioned in interests or notes', () => {
      const lead = {
        id: 'lead_tax',
        name: 'Robert Davis',
        years_in_frs: '26 years',
        frs_interests: ['DROP', 'Tax payout'],
      };
      const rec = FrsKnowledgeBank.recommendWisdomSeed(lead);
      assert.strictEqual(rec.key, 'drop_tax_trap');
      assert.ok(rec.factualInsight.includes('20% mandatory federal tax withholding'));
    });

    it('recommends sick leave tax rollover when handwritten note or interest mentions sick leave', () => {
      const lead = {
        id: 'lead_sick',
        name: 'Linda Martinez',
        years_in_frs: '18 years',
        custom_questions: 'What happens to my accumulated sick days when I retire?',
      };
      const rec = FrsKnowledgeBank.recommendWisdomSeed(lead);
      assert.strictEqual(rec.key, 'sick_leave_rollover');
      assert.ok(rec.shortLabel.includes('Sick Leave'));
    });

    it('recommends student loan AGI benefit when student loans or PSLF are noted', () => {
      const lead = {
        id: 'lead_student',
        name: 'Michael Chang',
        years_in_frs: '3 years',
        notes: 'Has $45k student debt on PSLF plan',
      };
      const rec = FrsKnowledgeBank.recommendWisdomSeed(lead);
      assert.strictEqual(rec.key, 'student_loan_idr');
    });

    it('recommends downside floor when risk, market, or crash is mentioned', () => {
      const lead = {
        id: 'lead_risk',
        name: 'David Wilson',
        years_in_frs: '12 years',
        appointment_notes: 'Hesitant about stock market volatility and crash risk',
      };
      const rec = FrsKnowledgeBank.recommendWisdomSeed(lead);
      assert.strictEqual(rec.key, 'downside_floor');
    });

    it('honors explicit topic override regardless of profile attributes', () => {
      const lead = {
        id: 'lead_override',
        name: 'Amanda Bell',
        years_in_frs: '2 years',
      };
      const rec = FrsKnowledgeBank.recommendWisdomSeed(lead, 'second_election');
      assert.strictEqual(rec.key, 'second_election');
    });
  });

  describe('2. AiSmsService Prompt & Thread Continuity Architecture', () => {
    const aiSmsSrc = loadAiSmsService();

    it('verifies AiSmsService extracts conversation thread continuity and previous SMS', () => {
      assert.ok(aiSmsSrc.includes('CONVERSATION & THREAD CONTINUITY CONTEXT:'));
      assert.ok(aiSmsSrc.includes('- Previous SMS Sent:'));
      assert.ok(aiSmsSrc.includes('- Last Outreach / Sit-Down Outcome:'));
      assert.ok(aiSmsSrc.includes('- Wrap-up / Interaction Notes:'));
      assert.ok(aiSmsSrc.includes('You are following up on this ongoing dialogue'));
    });

    it('verifies AiSmsService prompt injects FRS Wisdom & Value Seed', () => {
      assert.ok(aiSmsSrc.includes('FRS WISDOM & VALUE SEED (CRITICAL DIRECTIVE):'));
      assert.ok(aiSmsSrc.includes('- Featured FRS Topic:'));
      assert.ok(aiSmsSrc.includes('- FRS Law / Formula Fact:'));
      assert.ok(aiSmsSrc.includes('- Key Phrasing Guide:'));
      assert.ok(aiSmsSrc.includes('Subtly weave in this high-value FRS insight'));
    });

    it('verifies AiSmsService extracts rich Report Card details (salary, contributions, questions)', () => {
      assert.ok(aiSmsSrc.includes('Current Annual Salary:'));
      assert.ok(aiSmsSrc.includes('Present 403(b) Contribution:'));
      assert.ok(aiSmsSrc.includes('Handwritten Question / Note on Card:'));
      assert.ok(aiSmsSrc.includes('FRS Knowledge Level:'));
    });
  });

  describe('3. DripDispatcherService & Batch Modal UI Integration (Step 3)', () => {
    const modalSrc = fs.readFileSync(path.resolve('src/components/BatchDripDispatchModal.tsx'), 'utf8');
    const dispatcherSrc = fs.readFileSync(path.resolve('src/services/dripDispatcherService.ts'), 'utf8');

    it('verifies DripDispatcherService DueDripItem interface and getDueDrips attaches recommendedWisdomSeed', () => {
      assert.ok(dispatcherSrc.includes('recommendedWisdomSeed?: FrsWisdomSeed;'));
      assert.ok(dispatcherSrc.includes('FrsKnowledgeBank.recommendWisdomSeed(syntheticLead)'));
    });

    it('verifies BatchDripDispatchModal displays SEEDED FRS INSIGHT panel and topic chips', () => {
      assert.ok(modalSrc.includes('SEEDED FRS INSIGHT'));
      assert.ok(modalSrc.includes('FRS_WISDOM_BANK.map((seed) => {'));
      assert.ok(modalSrc.includes('styles.wisdomChipActive'));
      assert.ok(modalSrc.includes('handleGenerateAiSms(undefined, seed.key)'));
      assert.ok(modalSrc.includes('HapticsService.tick()'));
    });

    it('verifies handleGenerateAiSms in modal passes topicOverride to AiSmsService', () => {
      assert.ok(modalSrc.includes('handleGenerateAiSms = async (toneFocus?: any, topicOverride?: FrsTopicKey)'));
      assert.ok(modalSrc.includes('const effectiveTopic = topicOverride || selectedFrsTopic || currentItem.recommendedWisdomSeed?.key;'));
      assert.ok(modalSrc.includes('AiSmsService.generatePersuasiveSMS('));
    });
  });

  describe('4. Smart Offline Fallbacks with FRS Wisdom Seeding (Step 4)', () => {
    const aiSmsSrc = loadAiSmsService();

    it('verifies getSmartFallbackSMS includes topic-aware wisdom branches for monthly nurture drips', () => {
      // Direct source inspection of getSmartFallbackSMS branching
      assert.ok(aiSmsSrc.includes("if (frsTopicKey === 'drop_expansion')"));
      assert.ok(aiSmsSrc.includes("if (frsTopicKey === 'sick_leave_rollover')"));
      assert.ok(aiSmsSrc.includes("if (frsTopicKey === 'pretax_takehome')"));
      assert.ok(aiSmsSrc.includes("if (frsTopicKey === 'downside_floor')"));
      assert.ok(aiSmsSrc.includes("if (frsTopicKey === 'second_election')"));
      assert.ok(aiSmsSrc.includes("if (frsTopicKey === 'drop_tax_trap')"));

      // Verify specific FRS insights in fallbacks
      assert.ok(aiSmsSrc.includes('under SB 7024, DROP is now 8 years instead of 5 for teachers'));
      assert.ok(aiSmsSrc.includes('rolling terminal sick leave into an approved tax-sheltered vehicle'));
      assert.ok(aiSmsSrc.includes('putting $100/mo into retirement typically only reduces your take-home pay by about $75'));
      assert.ok(aiSmsSrc.includes('guaranteed 0% downside floor with growth tied to market gains'));
      assert.ok(aiSmsSrc.includes('one-time "Second Election" to switch between the Pension and Investment plans'));
      assert.ok(aiSmsSrc.includes('cashing out DROP funds triggers an automatic 20% federal tax withholding'));
    });
  });
});

