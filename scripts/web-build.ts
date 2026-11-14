/**
 * Cunata Web M2-M6 — Modular Web Build & Packaging Pipeline
 * Conforms to WEB-contract.md §2, §3, §10 and tasks.json (WEB-W3-GLUE).
 *
 * Responsibilities:
 * - Invokes existing TypeScript compiler without new dependencies.
 * - Compiles ES2022 modules to staged directory (.dist-staging) to avoid concurrent write races.
 * - Rewrites relative imports (.ts to .js handled by compiler via tsconfig.build.json).
 * - Copies and rewrites shell, styles, and public assets with relative links for subpath (/Cunata/) hosting.
 * - Validates browser emit: verifies NO bare imports, NO test/Node scripts, subpath asset references.
 * - Atomically promotes staged output to dist/ when validation succeeds.
 */

// @ts-ignore
import rawFs from 'node:fs';
// @ts-ignore
import rawPath from 'node:path';
// @ts-ignore
import { spawnSync } from 'node:child_process';
// @ts-ignore
import { pathToFileURL } from 'node:url';

interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

interface NodeFs {
  existsSync(p: string): boolean;
  readFileSync(p: string, encoding: string): string;
  writeFileSync(p: string, data: string, encoding: string): void;
  rmSync(p: string, opts?: { recursive?: boolean; force?: boolean }): void;
  mkdirSync(p: string, opts?: { recursive?: boolean }): void;
  readdirSync(p: string, opts?: { withFileTypes?: boolean }): DirEntry[];
  copyFileSync(src: string, dest: string): void;
}

interface NodePath {
  resolve(...paths: string[]): string;
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
}

interface NodeProcess {
  platform: string;
  argv: string[];
  exit(code?: number): never;
}

const fs = rawFs as unknown as NodeFs;
const path = rawPath as unknown as NodePath;
const proc = (typeof process !== 'undefined' ? process : { platform: 'win32', argv: [], exit: () => {} }) as unknown as NodeProcess;

export interface BuildWebOptions {
  readonly rootDir?: string;
  readonly outDir?: string;
  readonly stagingDir?: string;
  readonly promote?: boolean;
  readonly silent?: boolean;
}

export interface EmitValidationResult {
  readonly valid: boolean;
  readonly bareImports: readonly string[];
  readonly testArtifacts: readonly string[];
  readonly absolutePaths: readonly string[];
  readonly issues: readonly string[];
}

export interface BuildResult {
  readonly success: boolean;
  readonly outDir: string;
  readonly stagingDir: string;
  readonly promoted: boolean;
  readonly validation: EmitValidationResult;
  readonly emittedFiles: readonly string[];
  readonly error?: string;
}

export function cleanDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

export function copyDirectoryRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function collectFiles(dir: string, ext?: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, ext));
    } else if (!ext || entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Validates emitted browser bundle in target directory:
 * 1. Checks that no bare imports exist in any emitted JavaScript file.
 * 2. Checks that no test, runner, or Node scripts leaked into dist.
 * 3. Checks that HTML shell has only relative URLs for subpath compatibility.
 */
export function validateBrowserEmit(targetDir: string): EmitValidationResult {
  const bareImports: string[] = [];
  const testArtifacts: string[] = [];
  const absolutePaths: string[] = [];
  const issues: string[] = [];

  if (!fs.existsSync(targetDir)) {
    return {
      valid: false,
      bareImports: [],
      testArtifacts: [],
      absolutePaths: [],
      issues: [`Directory does not exist: ${targetDir}`],
    };
  }

  // 1. Check all JS files for bare imports
  const jsFiles = collectFiles(targetDir, '.js');
  const importExportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const file of jsFiles) {
    const relFile = path.relative(targetDir, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');

    let match: RegExpExecArray | null;
    const checkSpecifier = (spec: string) => {
      const trimmed = spec.trim();
      // Relative imports must start with ./ or ../
      if (trimmed.startsWith('./') || trimmed.startsWith('../')) {
        return;
      }
      // Bare import or absolute or node: module
      bareImports.push(`${relFile} -> "${trimmed}"`);
    };

    while ((match = importExportRegex.exec(content)) !== null) {
      if (match[1]) checkSpecifier(match[1]);
    }
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      if (match[1]) checkSpecifier(match[1]);
    }
  }

  // 2. Check for test or node-only artifacts in targetDir
  const allFiles = collectFiles(targetDir);
  for (const file of allFiles) {
    const rel = path.relative(targetDir, file).replace(/\\/g, '/');
    if (
      rel.startsWith('test/') ||
      rel.startsWith('scripts/') ||
      rel.includes('.test.') ||
      rel.endsWith('.py') ||
      rel.includes('node_modules')
    ) {
      testArtifacts.push(rel);
    }
  }

  // 3. Check HTML shell for subpath compatibility (no leading absolute paths)
  const indexHtmlPath = path.join(targetDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    const html = fs.readFileSync(indexHtmlPath, 'utf8');
    const attrRegex = /(?:href|src)=["'](\/[^"']*)["']/gi;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(html)) !== null) {
      const val = attrMatch[1];
      if (val && !val.startsWith('//')) {
        absolutePaths.push(`index.html contains root-absolute link: "${val}"`);
      }
    }
  } else {
    issues.push('Missing dist/index.html');
  }

  if (bareImports.length > 0) {
    issues.push(`Found ${bareImports.length} bare import(s) in browser emit`);
  }
  if (testArtifacts.length > 0) {
    issues.push(`Found ${testArtifacts.length} test/Node artifact(s) in browser emit`);
  }
  if (absolutePaths.length > 0) {
    issues.push(`Found ${absolutePaths.length} root-absolute link(s) in dist/index.html`);
  }

  return {
    valid: issues.length === 0,
    bareImports: Object.freeze(bareImports),
    testArtifacts: Object.freeze(testArtifacts),
    absolutePaths: Object.freeze(absolutePaths),
    issues: Object.freeze(issues),
  };
}

/**
 * Prepares the shell and static assets inside the staging directory:
 * - Adapts src/app/shell.html to staging/index.html with relative links
 * - Copies styles/style.css to staging/styles/style.css
 * - Copies public/ assets to staging/public/
 */
export function prepareShellAndAssets(rootDir: string, stagingDir: string): void {
  // 1. Prepare shell HTML
  const shellSrcPath = path.join(rootDir, 'src/app/shell.html');
  const indexDestPath = path.join(stagingDir, 'index.html');

  if (fs.existsSync(shellSrcPath)) {
    let shellHtml = fs.readFileSync(shellSrcPath, 'utf8');
    // Transform relative stylesheet link: ../../styles/style.css -> ./styles/style.css
    shellHtml = shellHtml.replace(/href=["']\.\.\/\.\.\/styles\/style\.css["']/g, 'href="./styles/style.css"');
    // Transform module script entry: ./main.js -> ./app/main.js
    shellHtml = shellHtml.replace(/src=["']\.\/main\.js["']/g, 'src="./app/main.js"');
    fs.writeFileSync(indexDestPath, shellHtml, 'utf8');
  }

  // 2. Prepare styles
  const stylesSrcDir = path.join(rootDir, 'styles');
  const stylesDestDir = path.join(stagingDir, 'styles');
  if (fs.existsSync(stylesSrcDir)) {
    copyDirectoryRecursive(stylesSrcDir, stylesDestDir);
  }

  // 3. Prepare public assets (sample exam, SVG, etc.)
  const publicSrcDir = path.join(rootDir, 'public');
  const publicDestDir = path.join(stagingDir, 'public');
  if (fs.existsSync(publicSrcDir)) {
    copyDirectoryRecursive(publicSrcDir, publicDestDir);
  }
}

/**
 * Executes TypeScript compiler targeting stagingDir.
 */
export function compileTypescript(rootDir: string, stagingDir: string, silent = false): {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const isWin = proc.platform === 'win32';
  const npxCmd = isWin ? 'npx.cmd' : 'npx';
  const args = [
    '--no-install',
    'tsc',
    '-p',
    'tsconfig.build.json',
    '--outDir',
    stagingDir,
  ];

  const res = spawnSync(npxCmd, args, {
    cwd: rootDir,
    encoding: 'utf8',
    shell: true,
  });

  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  const exitCode = res.status ?? 1;
  const success = exitCode === 0;

  if (!silent && !success) {
    if (stdout) console.error('[web-build] tsc stdout:', stdout);
    if (stderr) console.error('[web-build] tsc stderr:', stderr);
  }

  return { success, stdout, stderr, exitCode };
}

/**
 * Atomically promotes staging directory into target dist directory.
 */
export function promoteStagedDist(stagingDir: string, distDir: string): void {
  if (!fs.existsSync(stagingDir)) {
    throw new Error(`Cannot promote non-existent staging directory: ${stagingDir}`);
  }

  // Clean or swap dist
  if (fs.existsSync(distDir)) {
    cleanDirectory(distDir);
  }
  fs.mkdirSync(distDir, { recursive: true });
  copyDirectoryRecursive(stagingDir, distDir);
  cleanDirectory(stagingDir);
}

/**
 * Main build entrypoint:
 * - Compiles to staging
 * - Populates relative shell & assets
 * - Validates browser emit
 * - Atomically promotes to dist (if promote !== false)
 */
export async function buildWeb(options?: BuildWebOptions): Promise<BuildResult> {
  const rootDir = path.resolve(options?.rootDir ?? '.');
  const distDir = path.resolve(rootDir, options?.outDir ?? 'dist');
  const stagingDir = path.resolve(rootDir, options?.stagingDir ?? '.dist-staging');
  const promote = options?.promote ?? true;
  const silent = options?.silent ?? false;

  if (!silent) {
    console.log(`[web-build] Starting build in staging: ${stagingDir}`);
  }

  // 1. Clean staging directory to ensure fresh isolation
  cleanDirectory(stagingDir);

  // 2. Run TypeScript compiler
  const compileRes = compileTypescript(rootDir, stagingDir, silent);
  if (!compileRes.success) {
    cleanDirectory(stagingDir);
    return {
      success: false,
      outDir: distDir,
      stagingDir,
      promoted: false,
      validation: {
        valid: false,
        bareImports: [],
        testArtifacts: [],
        absolutePaths: [],
        issues: [`TypeScript compilation failed with code ${compileRes.exitCode}: ${compileRes.stdout} ${compileRes.stderr}`],
      },
      emittedFiles: [],
      error: `TypeScript compilation failed with code ${compileRes.exitCode}`,
    };
  }

  // 3. Prepare shell and assets
  prepareShellAndAssets(rootDir, stagingDir);

  // 4. Validate emitted browser modules and assets
  const validation = validateBrowserEmit(stagingDir);
  if (!validation.valid) {
    if (!silent) {
      console.error('[web-build] Browser emit validation failed:', validation.issues);
    }
    cleanDirectory(stagingDir);
    return {
      success: false,
      outDir: distDir,
      stagingDir,
      promoted: false,
      validation,
      emittedFiles: [],
      error: `Validation failed: ${validation.issues.join('; ')}`,
    };
  }

  const emittedFiles = collectFiles(stagingDir).map((f) => path.relative(stagingDir, f).replace(/\\/g, '/'));

  // 5. Promote staged dist
  let promoted = false;
  if (promote) {
    promoteStagedDist(stagingDir, distDir);
    promoted = true;
    if (!silent) {
      console.log(`[web-build] Successfully promoted ${emittedFiles.length} files to ${distDir}`);
    }
  } else {
    if (!silent) {
      console.log(`[web-build] Staged build verified (${emittedFiles.length} files in staging, promote skipped)`);
    }
  }

  return {
    success: true,
    outDir: distDir,
    stagingDir,
    promoted,
    validation,
    emittedFiles: Object.freeze(emittedFiles),
  };
}

// Allow direct CLI invocation
const isMainModule = proc.argv[1] && pathToFileURL(path.resolve(proc.argv[1])).href === import.meta.url;
if (isMainModule) {
  buildWeb()
    .then((res) => {
      if (!res.success) {
        console.error('[web-build] Build failed:', res.error);
        proc.exit(1);
      }
      console.log('[web-build] Build completed successfully.');
      proc.exit(0);
    })
    .catch((err) => {
      console.error('[web-build] Fatal error:', err);
      proc.exit(1);
    });
}
