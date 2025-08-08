import fs from 'fs';
import path from 'path';

export interface CodereapConfig {
  root?: string;
  extensions?: string[];
  exclude?: string[];
  importRoot?: string;
  aliases?: Record<string, string | string[]>;
  out?: string;
  pretty?: boolean;
}

export interface LoadedConfig {
  root: string;
  extensions: string[];
  exclude: string[];
  importRoot?: string; // absolute path
  paths?: Record<string, string[]>; // tsconfig-like
  out: string;
  pretty: boolean;
}

export interface TsJsConfig {
  baseUrl?: string; // absolute (mapped to importRoot)
  paths?: Record<string, string[]>;
}

const DEFAULT_EXTENSIONS = ['js', 'ts', 'jsx', 'tsx'];

export function loadCodereapConfig(root: string, explicitPath?: string): LoadedConfig {
  const rootAbs = path.resolve(root);
  const candidate = explicitPath
    ? path.resolve(rootAbs, explicitPath)
    : path.resolve(rootAbs, 'codereap.config.json');

  let data: CodereapConfig = {};
  if (fs.existsSync(candidate)) {
    try {
      const raw = fs.readFileSync(candidate, 'utf-8');
      data = JSON.parse(raw);
    } catch (_e) {
      // fall back to defaults if invalid
      data = {};
    }
  }

  const extensions = Array.isArray(data.extensions) && data.extensions.length > 0
    ? data.extensions
    : DEFAULT_EXTENSIONS;

  const exclude = Array.isArray(data.exclude) ? data.exclude : [];

  const importRootAbs = data.importRoot ? path.resolve(rootAbs, data.importRoot) : undefined;

  // Convert aliases to tsconfig-style paths
  let paths: Record<string, string[]> | undefined = undefined;
  if (data.aliases && typeof data.aliases === 'object') {
    paths = {};
    for (const [pattern, value] of Object.entries(data.aliases)) {
      const arr = Array.isArray(value) ? value : [value];
      paths[pattern] = arr.map((p) => path.normalize(p));
    }
  }

  return {
    root: data.root ? path.resolve(rootAbs, data.root) : rootAbs,
    extensions,
    exclude,
    importRoot: importRootAbs,
    paths,
    out: data.out || 'codereap-report',
    pretty: Boolean(data.pretty),
  };
}

export function loadTsJsConfig(root: string): TsJsConfig {
  const rootAbs = path.resolve(root);
  const tsconfigPath = path.join(rootAbs, 'tsconfig.json');
  const jsconfigPath = path.join(rootAbs, 'jsconfig.json');
  const configFile = fs.existsSync(tsconfigPath)
    ? tsconfigPath
    : (fs.existsSync(jsconfigPath) ? jsconfigPath : null);

  if (!configFile) return {};

  try {
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    const compilerOptions = cfg.compilerOptions || {};
    const baseUrl = compilerOptions.baseUrl
      ? path.resolve(rootAbs, compilerOptions.baseUrl)
      : undefined;
    const paths: Record<string, string[]> | undefined = compilerOptions.paths || undefined;
    return { baseUrl, paths };
  } catch (_e) {
    return {};
  }
}

export function mergeResolutionOptions(
  root: string,
  fromCli: { importRoot?: string; paths?: Record<string, string[]> },
  fromFile: { importRoot?: string; paths?: Record<string, string[]> },
  fromTsJs: { baseUrl?: string; paths?: Record<string, string[]> },
) {
  // Precedence: CLI > file config > ts/jsconfig
  const importRoot = fromCli.importRoot || fromFile.importRoot || fromTsJs.baseUrl;
  const paths = fromCli.paths || fromFile.paths || fromTsJs.paths;
  return { root: path.resolve(root), importRoot, paths };
}


