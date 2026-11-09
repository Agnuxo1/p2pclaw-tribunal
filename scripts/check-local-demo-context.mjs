// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { localDemoContext } from '../server/tribunal/local-demo-context.ts';

const env = { BUILDER_LOCAL_CONTEXT_PROFILE:'1', NODE_ENV:'development',
  APP_URL:'http://127.0.0.1:10000', OPENAI_BASE_URL:'http://127.0.0.1:4040/v1',
  AGENT_ENGINE:'ai-sdk:openai', AGENT_BUILT_IN_ENGINES:'ai-sdk:openai',
  AGENT_MODEL:'p2pclaw-qwen35-27b' };
const scope = { profile:'builder-local-synthetic-demo', revision:2 };
let context = { actionScope:scope, allowedActionNames:['create-paper','save-draft','agent-teams'] };
let reads = 0;
const config = localDemoContext(env, () => { reads++; return context; });
assert.deepEqual(localDemoContext({}, () => { throw Error('disabled callback'); }), {});
for (const key of Object.keys(env).filter(key => key !== 'BUILDER_LOCAL_CONTEXT_PROFILE')) {
  assert.throws(() => localDemoContext({ ...env, [key]:'different' }), /Invalid local demo context/);
}
const surface = config.resolveActionSurface({ availableActionNames:
  ['save-draft','execute-sql','publish-to-p2pclaw','agent-teams','save-draft','shell'] });
assert.deepEqual(surface.allowedActionNames, ['save-draft','agent-teams']);
assert.deepEqual(surface.actionScope, scope);
const unreadable = new Proxy({}, { get(){ throw Error('HTTP body must not be consumed again'); } });
const prepared = await config.prepareRequest(unreadable);
assert.equal(reads, 0);
prepared.prepareAfterModel({ model:'p2pclaw-qwen35-27b' });
assert.equal(reads, 1);
assert.throws(() => prepared.prepareAfterModel({ model:'other-model' }), /Invalid resolved/);
for (const invalid of [undefined, null, [], {}, { ...scope, revision:1 }, { ...scope, extra:true }]) {
  context = { actionScope:invalid, allowedActionNames:['create-paper'] };
  assert.throws(() => prepared.prepareAfterModel({ model:'p2pclaw-qwen35-27b' }), /Invalid effective/);
}
for (const invalid of [[], ['execute-sql'], ['create-paper','publish-to-p2pclaw'], 'create-paper']) {
  context = { actionScope:scope, allowedActionNames:invalid };
  assert.throws(() => prepared.prepareAfterModel({ model:'p2pclaw-qwen35-27b' }), /Invalid effective/);
}
console.log('PASS: disabled profile, six environment bindings, bounded action surface, consumed-body callback, model and request-scope rejection controls. No HTTP/model calls.');
