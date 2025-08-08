import path from 'path';
import fs from 'fs';

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json'];

export interface ResolveOptions {
  root: string; // absolute project root
  baseUrl?: string; // absolute base directory
  paths?: Record<string, string[]>; // tsconfig-like mapping
  extensions?: string[];
}

function tryResolveAsFileOrDir(candidatePath: string, extensions: string[]): string | null {
  if (fs.existsSync(candidatePath)) {
    const stats = fs.statSync(candidatePath);
    if (stats.isDirectory()) {
      for (const ext of extensions) {
        const indexPath = path.join(candidatePath, 'index' + ext);
        if (fs.existsSync(indexPath)) {
          return indexPath;
        }
      }
      return null;
    }
    return candidatePath;
  }
  for (const ext of extensions) {
    const withExt = candidatePath + ext;
    if (fs.existsSync(withExt)) {
      return withExt;
    }
  }
  return null;
}

function resolveWithTsPaths(specifier: string, options: ResolveOptions, extensions: string[]): string | null {
  const mapping = options.paths || {};
  for (const [pattern, targets] of Object.entries(mapping)) {
    // Convert pattern with * to regex capture
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '(.*)');
    const regex = new RegExp('^' + escaped + '$');
    const m = specifier.match(regex);
    if (!m) continue;
    for (const target of targets) {
      // Replace all * in target with captured groups
      let replaced = target;
      for (let i = 1; i < m.length; i++) {
        replaced = replaced.replace(/\*/g, m[i]);
      }
      const abs = path.resolve(options.root, replaced);
      const resolved = tryResolveAsFileOrDir(abs, extensions);
      if (resolved) return resolved;
    }
  }
  return null;
}

export function resolveImport(from: string, specifier: string, options?: ResolveOptions): string | null {
  const extensions = options?.extensions ?? DEFAULT_EXTENSIONS;

  // 1) Relative imports
  if (specifier.startsWith('.')) {
    const fromDir = path.dirname(from);
    const candidate = path.resolve(fromDir, specifier);
    return tryResolveAsFileOrDir(candidate, extensions);
  }

  // 2) tsconfig/jsconfig paths
  if (options?.paths) {
    const p = resolveWithTsPaths(specifier, options, extensions);
    if (p) return p;
  }

  // 3) baseUrl
  if (options?.baseUrl) {
    const candidate = path.resolve(options.baseUrl, specifier);
    const p = tryResolveAsFileOrDir(candidate, extensions);
    if (p) return p;
  }

  // 4) project root as a last resort for absolute-like paths
  if (options?.root) {
    const candidate = path.resolve(options.root, specifier);
    const p = tryResolveAsFileOrDir(candidate, extensions);
    if (p) return p;
  }

  // 5) Node resolution (packages)
  try {
    return require.resolve(specifier, { paths: [path.dirname(from)] });
  } catch (_e) {
    console.error(`Could not resolve '${specifier}' from '${from}'`);
    return null;
  }
}
