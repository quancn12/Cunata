import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
// @ts-ignore Node built-ins are available to tests; the project has no @types/node.
import { isBuiltin } from 'node:module';
import { dirname, relative, resolve } from 'node:path';

// WEB §22 adds a server runtime to dist/api. Browser-only rules from §10
// still apply everywhere else; API imports must stay within their own graph.
export function assertRuntimeImport(distDir: string, file: string, specifier: string): void {
  const rel = relative(distDir, file).replace(/\\/g, '/');
  const server = rel.startsWith('api/');
  if (server && specifier.startsWith('node:')) {
    assert.ok(isBuiltin(specifier), `${rel}: unknown Node built-in ${specifier}`);
    return;
  }
  assert.ok(specifier.startsWith('./') || specifier.startsWith('../'), `${rel}: non-relative import ${specifier}`);
  assert.ok(!specifier.endsWith('.ts'), `${rel}: TypeScript import ${specifier}`);
  const target = resolve(dirname(file), specifier);
  const boundary = server ? resolve(distDir, 'api') : resolve(distDir);
  const targetRel = relative(boundary, target).replace(/\\/g, '/');
  assert.ok(targetRel !== '..' && !targetRel.startsWith('../'), `${rel}: import escapes runtime ${specifier}`);
  if (!server) assert.ok(!targetRel.startsWith('api/'), `${rel}: browser imports server API ${specifier}`);
  assert.ok(existsSync(target), `${rel}: missing import ${specifier}`);
}
