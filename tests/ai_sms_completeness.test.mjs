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
    if (id.includes('settingsRepository')) {
      return { SettingsRepository: { getSettings: async () => ({ user_name: 'Alex', agency_name: 'ValuTeachers' }) } };
    }
    if (id.includes('callLogsRepository')) {
      return { CallLogsRepository: { getLogsForLead: async () => [] } };
    }
    if (id.includes('geminiModelService')) {
      return { GeminiModelService: { getActiveModels: async () => ['gemini-2.5-flash', 'gemini-2.0-flash'] } };
    }
    if (id.includes('dateTimeAwareService')) {
      return {
        DateTimeAwareService: {
          getAppointmentTokens: () => ({ hasAppointment: false, relativeInfo: null }),
          formatDate: () => 'Oct 19, 2026',
          formatTime: () => '10:00 AM',
          getSuggestedOutreachTimeframe: () => ({ timeframePhrase: 'this week', planningSuggestion: 'during planning' }),
        },
      };
    }
    if (id.includes('frsKnowledgeBank')) {
      return { FrsKnowledgeBank: { recommendWisdomSeed: () => null } };
    }
    return {};
  };
  runner(moduleObj, moduleObj.exports, mockRequire);
  return moduleObj.exports;
}

const aiSmsModule = loadModule('src/services/aiSmsService.ts');
const { AiSmsService } = aiSmsModule;

describe('AI SMS Generation Truncation Defense & Completeness Suite', () => {
  describe('1. cleanAndValidateSmsText Sentence Integrity', () => {
    it('accepts clean, complete SMS messages ending with valid terminal punctuation', () => {
      const input = 'Hi Jennifer, this is Alex with ValuTeachers. Looking forward to our sit-down tomorrow during planning to review your FRS numbers!';
      const validated = AiSmsService.cleanAndValidateSmsText(input, 'STOP');
      assert.strictEqual(validated, input);
    });

    it('salvages complete sentences when a response is cut off mid-sentence (MAX_TOKENS)', () => {
      const truncated = 'Hi Jennifer, this is Alex with ValuTeachers. Thank you for meeting with me at Mainland High. I wanted to see if the DROP numbers we';
      const validated = AiSmsService.cleanAndValidateSmsText(truncated, 'MAX_TOKENS');
      assert.strictEqual(
        validated,
        'Hi Jennifer, this is Alex with ValuTeachers. Thank you for meeting with me at Mainland High.'
      );
    });

    it('rejects truncated fragments that lack a complete sentence of sufficient length', () => {
      const fragment = 'Hi Jennifer, this is Alex and I am reaching out to discuss your';
      const validated = AiSmsService.cleanAndValidateSmsText(fragment, 'MAX_TOKENS');
      assert.strictEqual(validated, null, 'Should return null to trigger model fallback rather than broken text');
    });

    it('strips conversational LLM preambles seamlessly', () => {
      const inputWithPreamble = 'Here is the tailored SMS draft: Hi Jennifer, this is Alex with ValuTeachers. Looking forward to connecting!';
      const validated = AiSmsService.cleanAndValidateSmsText(inputWithPreamble, 'STOP');
      assert.strictEqual(
        validated,
        'Hi Jennifer, this is Alex with ValuTeachers. Looking forward to connecting!'
      );
    });

    it('cleans enclosing quotes and excessive whitespace', () => {
      const quoted = '  "Hi Jennifer, this is Alex.   Did the FRS calculations make sense?"  ';
      const validated = AiSmsService.cleanAndValidateSmsText(quoted, 'STOP');
      assert.strictEqual(validated, 'Hi Jennifer, this is Alex. Did the FRS calculations make sense?');
    });
  });

  describe('2. AiSmsService Source Code Invariants', () => {
    const aiSmsSrc = fs.readFileSync(path.resolve(__dirname, '../src/services/aiSmsService.ts'), 'utf8');

    it('enforces maxOutputTokens of at least 1200 for ample generation headroom', () => {
      assert.ok(aiSmsSrc.includes('maxOutputTokens: 1200'), 'Should use 1200 maxOutputTokens');
      assert.strictEqual(aiSmsSrc.includes('maxOutputTokens: 600'), false, 'Should NOT use 600 tokens');
    });

    it('disables thinking tokens (thinkingBudget: 0) for reasoning/thinking models', () => {
      assert.ok(aiSmsSrc.includes('thinkingBudget: 0'), 'Should configure thinkingBudget: 0');
      assert.ok(aiSmsSrc.includes('isThinkingModel'), 'Should identify thinking models');
    });

    it('filters out internal thought scratchpad parts before concatenating text', () => {
      assert.ok(aiSmsSrc.includes('!p.thought'), 'Should filter out thought parts');
    });

    it('invokes cleanAndValidateSmsText before returning generated SMS', () => {
      assert.ok(aiSmsSrc.includes('this.cleanAndValidateSmsText(rawText, finishReason)'));
    });
  });

  describe('3. Modal Display & TextInput Auto-Growth Invariants', () => {
    const batchModalSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/BatchDripDispatchModal.tsx'), 'utf8');
    const hudSrc = fs.readFileSync(path.resolve(__dirname, '../src/screens/DialerHudScreen.tsx'), 'utf8');
    const leadDetailSrc = fs.readFileSync(path.resolve(__dirname, '../src/screens/LeadDetailScreen.tsx'), 'utf8');

    it('verifies BatchDripDispatchModal TextInput has scrollEnabled={false} for full multiline expansion', () => {
      assert.ok(batchModalSrc.includes('scrollEnabled={false}'), 'Batch modal TextInput should have scrollEnabled={false}');
    });

    it('verifies category tabs in BatchDripDispatchModal are disabled during AI generation', () => {
      assert.ok(batchModalSrc.includes("onPress={() => handleSelectCategory('action_appointment')}\n                    disabled={isGeneratingAi}"));
      assert.ok(batchModalSrc.includes("onPress={() => handleSelectCategory('pure_insight')}\n                    disabled={isGeneratingAi}"));
      assert.ok(batchModalSrc.includes("onPress={() => handleSelectCategory('school_community')}\n                    disabled={isGeneratingAi}"));
    });

    it('verifies DialerHudScreen and LeadDetailScreen SMS composers prevent height clipping', () => {
      assert.ok(hudSrc.includes('minHeight: 120'), 'DialerHudScreen should use minHeight instead of fixed height');
      assert.ok(leadDetailSrc.includes('minHeight: 120'), 'LeadDetailScreen should use minHeight instead of fixed height');
    });
  });
});
