import * as fs from 'fs/promises';
import path from 'path';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import {
  ImportDeclaration,
  CallExpression,
  ExportAllDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  VariableDeclarator,
  ObjectPattern,
  Identifier,
  Program,
} from '@babel/types';
import type { NodePath } from '@babel/traverse';

export type ImportKind = 'esm' | 'cjs' | 'dynamic';

export interface ImportSpecifierInfo {
  source: string;
  kind: ImportKind;
  imported: {
    default: boolean;
    named: string[];
    namespace: boolean;
  };
}

export interface ReExportInfo {
  source: string;
  named?: string[];
  star?: boolean;
}

export interface ExportInfo {
  hasDefault: boolean;
  named: string[];
  reExports: ReExportInfo[];
  /** Map of exported const name → string literal value (for cross-file constant propagation) */
  namedConstValues?: Record<string, string>;
}

export interface ParsedFile {
  imports: string[];
  exports: string[];
  dynamicImports: string[];
  /** Glob patterns found in glob.sync() / glob.globSync() calls */
  globImports: string[];
  /** Identifiers used in glob calls that couldn't be resolved locally (for cross-file resolution) */
  unresolvedGlobRefs?: { identifier: string; importSource: string }[];
  // Optional details when symbol collection is enabled
  importSpecs?: ImportSpecifierInfo[];
  exportsInfo?: ExportInfo;
  exportUsage?: {
    default?: { exists: boolean; localName?: string; referencedInFile: boolean };
    named: Record<string, { localName?: string; referencedInFile: boolean; reexport?: boolean }>;
  };
}

export async function parseFile(
  filePath: string,
  opts?: { collectSymbols?: boolean }
): Promise<ParsedFile> {
  const content = await fs.readFile(filePath, 'utf-8');
  const imports: string[] = [];
  const exports: string[] = [];
  const dynamicImports: string[] = [];
  const globImports: string[] = [];
  const collectSymbols = Boolean(opts && opts.collectSymbols);
  const importSpecs: ImportSpecifierInfo[] = [];
  const exportsInfo: ExportInfo = { hasDefault: false, named: [], reExports: [] };
  const exportNamedLocalMap: Record<string, { localName?: string; reexport?: boolean }> = {};
  let defaultLocalName: string | undefined = undefined;
  let programPathRef: NodePath<Program> | undefined;

  // Skip AST parsing for non-JS/TS files that we still want to include as nodes
  const ext = path.extname(filePath).toLowerCase();
  const isScript = ['.js', '.jsx', '.ts', '.tsx'].includes(ext);
  if (!isScript) {
    if (collectSymbols) {
      return { imports, exports, dynamicImports, globImports, importSpecs: [], exportsInfo };
    }
    return { imports, exports, dynamicImports, globImports };
  }

  let ast;
  try {
    ast = babelParser.parse(content, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
      ],
    });
  } catch (err: any) {
    // Log the error but don't fail the entire process
    console.warn(`Warning: Failed to parse ${filePath}:`, err.message || err);
    // Return empty results for this file
    if (collectSymbols) {
      return { imports: [], exports: [], dynamicImports: [], globImports: [], importSpecs: [], exportsInfo: { hasDefault: false, named: [], reExports: [] } };
    }
    return { imports: [], exports: [], dynamicImports: [], globImports: [] };
  }

  // Lightweight constant propagation: track `const X = 'literal'` bindings
  const constStrings = new Map<string, string>();
  // Track imported identifiers → import source for cross-file constant propagation
  const importedIdentifiers = new Map<string, string>();
  // Track unresolved glob references for cross-file resolution
  const unresolvedGlobRefs: { identifier: string; importSource: string }[] = [];

  traverse(ast, {
    Program(path: NodePath<Program>) {
      programPathRef = path;
    },
    ImportDeclaration(path: { node: ImportDeclaration }) {
      const src = path.node.source.value;
      imports.push(src);
      // Track imported identifiers for cross-file constant propagation
      for (const spec of path.node.specifiers) {
        if (spec.type === 'ImportSpecifier' && spec.imported.type === 'Identifier') {
          importedIdentifiers.set(spec.local.name, src);
        } else if (spec.type === 'ImportDefaultSpecifier') {
          importedIdentifiers.set(spec.local.name, src);
        }
      }
      if (collectSymbols) {
        let hasDefault = false;
        let namespace = false;
        const named: string[] = [];
        for (const spec of path.node.specifiers) {
          if (spec.type === 'ImportDefaultSpecifier') {
            hasDefault = true;
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            namespace = true;
          } else if (spec.type === 'ImportSpecifier') {
            if (spec.imported.type === 'Identifier') {
              named.push(spec.imported.name);
            }
          }
        }
        importSpecs.push({
          source: src,
          kind: 'esm',
          imported: { default: hasDefault, named, namespace },
        });
      }
    },
    VariableDeclarator(path: { node: VariableDeclarator }) {
      // Track const bindings with string literal values for constant propagation
      const initVal = path.node.init as any;
      if (
        initVal &&
        initVal.type === 'StringLiteral' &&
        (path.node.id as any).type === 'Identifier'
      ) {
        constStrings.set((path.node.id as Identifier).name, initVal.value);
      }

      // Track CJS require bindings for cross-file constant propagation
      const initReq = path.node.init as any;
      if (
        initReq &&
        initReq.type === 'CallExpression' &&
        initReq.callee?.type === 'Identifier' && initReq.callee.name === 'require' &&
        initReq.arguments?.length > 0 &&
        initReq.arguments[0].type === 'StringLiteral'
      ) {
        const reqSrc = initReq.arguments[0].value as string;
        if ((path.node.id as any).type === 'ObjectPattern') {
          const pattern = path.node.id as ObjectPattern;
          for (const prop of pattern.properties as any[]) {
            if (prop?.type === 'ObjectProperty' && prop.key?.type === 'Identifier') {
              importedIdentifiers.set(prop.key.name, reqSrc);
            }
          }
        } else if ((path.node.id as any).type === 'Identifier') {
          importedIdentifiers.set((path.node.id as Identifier).name, reqSrc);
        }
      }

      if (!collectSymbols) return;
      const init = path.node.init as any;
      if (
        init &&
        init.type === 'CallExpression' &&
        (init.callee.type === 'Identifier' && init.callee.name === 'require') &&
        init.arguments &&
        init.arguments.length > 0 &&
        init.arguments[0].type === 'StringLiteral'
      ) {
        const src = init.arguments[0].value as string;
        // Ensure imports list contains the source (keeps parity with CallExpression handler)
        imports.push(src);
        if ((path.node.id as any).type === 'Identifier') {
          importSpecs.push({
            source: src,
            kind: 'cjs',
            imported: { default: true, named: [], namespace: false },
          });
        } else if ((path.node.id as any).type === 'ObjectPattern') {
          const pattern = path.node.id as ObjectPattern;
          const named: string[] = [];
          for (const prop of pattern.properties as any[]) {
            if (prop && prop.type === 'ObjectProperty') {
              const key = (prop.key as Identifier);
              if (key && key.type === 'Identifier') named.push(key.name);
            }
          }
          importSpecs.push({
            source: src,
            kind: 'cjs',
            imported: { default: false, named, namespace: false },
          });
        }
      }
    },
    CallExpression(path: { node: CallExpression }) {
      if (
        path.node.callee.type === 'Identifier' &&
        path.node.callee.name === 'require'
      ) {
        if (
          path.node.arguments.length > 0 &&
          path.node.arguments[0].type === 'StringLiteral'
        ) {
          const src = path.node.arguments[0].value;
          imports.push(src);
          if (collectSymbols) {
            // Bare require without binding → treat as default import usage
            importSpecs.push({
              source: src,
              kind: 'cjs',
              imported: { default: true, named: [], namespace: false },
            });
          }
        }
      } else if (
        // Detect glob.sync(arg), glob.globSync(arg)
        path.node.callee.type === 'MemberExpression' &&
        path.node.callee.object.type === 'Identifier' &&
        path.node.callee.property.type === 'Identifier' &&
        (
          (path.node.callee.object.name === 'glob' && (path.node.callee.property.name === 'sync' || path.node.callee.property.name === 'globSync')) ||
          (path.node.callee.object.name === 'fg' && path.node.callee.property.name === 'sync')
        ) &&
        path.node.arguments.length > 0
      ) {
        const arg = path.node.arguments[0];
        const value = arg.type === 'StringLiteral'
          ? arg.value
          : (arg.type === 'Identifier' ? constStrings.get(arg.name) : undefined);
        if (value) {
          globImports.push(value);
        } else if (arg.type === 'Identifier' && importedIdentifiers.has(arg.name)) {
          unresolvedGlobRefs.push({ identifier: arg.name, importSource: importedIdentifiers.get(arg.name)! });
        }
      } else if (
        // Detect globSync(arg) — destructured import
        path.node.callee.type === 'Identifier' &&
        path.node.callee.name === 'globSync' &&
        path.node.arguments.length > 0
      ) {
        const arg = path.node.arguments[0];
        const value = arg.type === 'StringLiteral'
          ? arg.value
          : (arg.type === 'Identifier' ? constStrings.get(arg.name) : undefined);
        if (value) {
          globImports.push(value);
        } else if (arg.type === 'Identifier' && importedIdentifiers.has(arg.name)) {
          unresolvedGlobRefs.push({ identifier: arg.name, importSource: importedIdentifiers.get(arg.name)! });
        }
      } else if (path.node.callee.type === 'Import') {
        if (
          path.node.arguments.length > 0 &&
          path.node.arguments[0].type === 'StringLiteral'
        ) {
          const src = path.node.arguments[0].value;
          dynamicImports.push(src);
          if (collectSymbols) {
            importSpecs.push({
              source: src,
              kind: 'dynamic',
              imported: { default: false, named: [], namespace: false },
            });
          }
        }
      }
    },
    ExportAllDeclaration(path: { node: ExportAllDeclaration }) {
      if (path.node.source) {
        const src = path.node.source.value;
        imports.push(src);
        exports.push(src);
        if (collectSymbols) {
          exportsInfo.reExports.push({ source: src, star: true });
        }
      }
    },
    ExportDefaultDeclaration(path: { node: ExportDefaultDeclaration }) {
      exports.push('default');
      if (collectSymbols) {
        exportsInfo.hasDefault = true;
        // Try to capture a local binding name when present
        const decl: any = path.node.declaration as any;
        if (decl && (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') && decl.id && decl.id.type === 'Identifier') {
          defaultLocalName = decl.id.name;
        } else if (decl && decl.type === 'Identifier') {
          defaultLocalName = decl.name;
        }
      }
    },
    ExportNamedDeclaration(path: { node: ExportNamedDeclaration }) {
      if (path.node.source) {
        const src = path.node.source.value;
        imports.push(src);
        // Re-export specific named from source
        if (collectSymbols) {
          const names: string[] = [];
          if (path.node.specifiers) {
            path.node.specifiers.forEach((specifier) => {
              if (specifier.exported.type === 'Identifier') {
                names.push(specifier.exported.name);
                exportNamedLocalMap[specifier.exported.name] = { reexport: true };
              }
            });
          }
          exportsInfo.reExports.push({ source: src, named: names });
        }
      }
      if (path.node.specifiers) {
        path.node.specifiers.forEach((specifier) => {
          if (specifier.exported.type === 'Identifier') {
            exports.push(specifier.exported.name);
            // Track re-exported const string values (e.g. const X = 'val'; export { X })
            const localName = (specifier as any).local?.type === 'Identifier' ? (specifier as any).local.name : specifier.exported.name;
            if (!path.node.source && constStrings.has(localName)) {
              if (!exportsInfo.namedConstValues) exportsInfo.namedConstValues = {};
              exportsInfo.namedConstValues[specifier.exported.name] = constStrings.get(localName)!;
            }
            if (collectSymbols) {
              exportsInfo.named.push(specifier.exported.name);
              if ((specifier as any).local && (specifier as any).local.type === 'Identifier') {
                exportNamedLocalMap[specifier.exported.name] = {
                  localName: (specifier as any).local.name,
                  reexport: false,
                };
              } else if (!(specifier as any).local) {
                // no local means it's part of a re-export already handled
              }
            }
          }
        });
      }
      if (path.node.declaration) {
        if (path.node.declaration.type === 'VariableDeclaration') {
          path.node.declaration.declarations.forEach((declaration) => {
            if ((declaration.id as any).type === 'Identifier') {
              const name = (declaration.id as Identifier).name;
              exports.push(name);
              // Track exported const string values for cross-file constant propagation
              const declInit = declaration.init as any;
              if (declInit && declInit.type === 'StringLiteral') {
                if (!exportsInfo.namedConstValues) exportsInfo.namedConstValues = {};
                exportsInfo.namedConstValues[name] = declInit.value;
              }
              if (collectSymbols) {
                exportsInfo.named.push(name);
                exportNamedLocalMap[name] = { localName: name, reexport: false };
              }
            }
          });
        } else if (
          path.node.declaration.type === 'FunctionDeclaration' ||
          path.node.declaration.type === 'ClassDeclaration'
        ) {
          if (path.node.declaration.id) {
            const name = path.node.declaration.id.name;
            exports.push(name);
            if (collectSymbols) {
              exportsInfo.named.push(name);
              exportNamedLocalMap[name] = { localName: name, reexport: false };
            }
          }
        }
      }
    },
  });

  if (collectSymbols) {
    // Compute intra-file referenced flags by scanning identifiers excluding export declarations
    const namedUsage: Record<string, { localName?: string; referencedInFile: boolean; reexport?: boolean }> = {};
    const publicToLocal = new Map<string, string>();
    for (const [publicName, meta] of Object.entries(exportNamedLocalMap)) {
      namedUsage[publicName] = { localName: meta.localName, referencedInFile: false, reexport: meta.reexport };
      if (meta.localName) publicToLocal.set(publicName, meta.localName);
    }

    const isInsideExportDecl = (p: NodePath): boolean => {
      return Boolean(p.findParent((pp) => (pp as any).isExportNamedDeclaration?.() || (pp as any).isExportDefaultDeclaration?.()));
    };
    const isDeclarationId = (p: NodePath): boolean => {
      const parent: any = p.parentPath;
      if (!parent) return false;
      if (parent.isFunctionDeclaration?.()) {
        return parent.node.id === (p as any).node;
      }
      if (parent.isClassDeclaration?.()) {
        return parent.node.id === (p as any).node;
      }
      if (parent.isVariableDeclarator?.()) {
        return parent.node.id === (p as any).node;
      }
      return false;
    };

    let defaultReferenced = false;
    traverse(ast, {
      Identifier(idPath: NodePath<Identifier>) {
        if (isInsideExportDecl(idPath) || isDeclarationId(idPath)) return;
        const name = idPath.node.name;
        for (const [publicName, local] of publicToLocal.entries()) {
          if (local === name) {
            namedUsage[publicName].referencedInFile = true;
          }
        }
        if (defaultLocalName && name === defaultLocalName) {
          defaultReferenced = true;
        }
      },
    });

    const exportUsage = {
      default: exportsInfo.hasDefault ? { exists: true, localName: defaultLocalName, referencedInFile: defaultReferenced } : undefined,
      named: namedUsage,
    };

    return { imports, exports, dynamicImports, globImports, unresolvedGlobRefs, importSpecs, exportsInfo, exportUsage };
  }
  // Always include exportsInfo with namedConstValues for cross-file constant propagation
  const hasConstValues = exportsInfo.namedConstValues && Object.keys(exportsInfo.namedConstValues).length > 0;
  return { imports, exports, dynamicImports, globImports, unresolvedGlobRefs, ...(hasConstValues ? { exportsInfo } : {}) };
}
