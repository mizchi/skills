import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager,
  type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

test('current SDK creates an isolated session with a custom extension and no model requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-skill-'));
  try {
    const resourceLoader = new DefaultResourceLoader({
      cwd: dir, agentDir: dir,
      noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [(pi: ExtensionAPI) => {
        pi.registerTool({
          name: 'greet', label: 'Greet', description: 'Return a greeting',
          parameters: Type.Object({ name: Type.String() }),
          async execute(_id, params) {
            return { content: [{ type: 'text', text: `Hello ${params.name}` }], details: {} };
          },
        });
      }],
    });
    await resourceLoader.reload();
    const modelRuntime = await ModelRuntime.create({ authPath: join(dir, 'auth.json'), modelsPath: join(dir, 'models.json') });
    const { session } = await createAgentSession({
      cwd: dir, agentDir: dir, resourceLoader, modelRuntime,
      sessionManager: SessionManager.inMemory(dir), tools: ['read', 'grep', 'find', 'ls', 'greet'],
    });
    try {
      assert.deepEqual([...session.getActiveToolNames()].sort(), ['find', 'greet', 'grep', 'ls', 'read']);
      assert.equal(session.messages.length, 0);
      assert.equal(typeof session.dispose, 'function');
    } finally { session.dispose(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
