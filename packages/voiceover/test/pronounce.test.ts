import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPronunciations } from '../src/pronounce.ts'

test('replaces literal phrases and reports which rules fired', () => {
  const result = applyPronunciations('OpenAI 发布了 GPT-5。OpenAI 没说话。', {
    OpenAI: 'Open A I',
    'GPT-5': 'G P T five',
  })
  assert.equal(result.text, 'Open A I 发布了 G P T five。Open A I 没说话。')
  assert.deepEqual(result.applied.sort(), ['GPT-5', 'OpenAI'])
})

test('applies longer keys first so one rule cannot eat another prefix', () => {
  const result = applyPronunciations('马克·陈和马克都来了', { 马克: 'ma ke', '马克·陈': 'ma ke chen' })
  assert.equal(result.text, 'ma ke chen和ma ke都来了')
})

test('ignores empty rules, no-op rules and rules that never match', () => {
  assert.deepEqual(applyPronunciations('银行', {}), { text: '银行', applied: [] })
  assert.deepEqual(applyPronunciations('银行', { '': 'x', 银行: '' }), { text: '银行', applied: [] })
  assert.deepEqual(applyPronunciations('银行', { 银行: '银行' }), { text: '银行', applied: [] })
  assert.deepEqual(applyPronunciations('农业银行', { 工商银行: 'x' }), { text: '农业银行', applied: [] })
  assert.deepEqual(applyPronunciations('', { a: 'b' }), { text: '', applied: [] })
})
