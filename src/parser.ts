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
}

export interface ParsedFile {
  imports: string[];
  exports: string[];
  dynamicImports: string[];
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
      return { imports, exports, dynamicImports, importSpecs: [], exportsInfo };
    }
    return { imports, exports, dynamicImports };
  }

  const ast = babelParser.parse(content, {
    sourceType: 'module',
    plugins: [
      'typescript',
      'jsx',
    ],
  });

  traverse(ast, {
    Program(path: NodePath<Program>) {
      programPathRef = path;
    },
    ImportDeclaration(path: { node: ImportDeclaration }) {
      const src = path.node.source.value;
      imports.push(src);
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

    traverse(ast, {
      Identifier(idPath: NodePath<Identifier>) {
        if (isInsideExportDecl(idPath) || isDeclarationId(idPath)) return;
        const name = idPath.node.name;
        for (const [publicName, local] of publicToLocal.entries()) {
          if (local === name) {
            namedUsage[publicName].referencedInFile = true;
          }
        }
        if (defaultLocalName && name === defaultLocalName && !isInsideExportDecl(idPath) && !isDeclarationId(idPath)) {
          // handled below via defaultReferenced, but we can mark a flag here
        }
      },
    });

    let defaultReferenced = false;
    if (defaultLocalName) {
      traverse(ast, {
        Identifier(idPath: NodePath<Identifier>) {
          if (isInsideExportDecl(idPath) || isDeclarationId(idPath)) return;
          if (idPath.node.name === defaultLocalName) defaultReferenced = true;
        },
      });
    }

    const exportUsage = {
      default: exportsInfo.hasDefault ? { exists: true, localName: defaultLocalName, referencedInFile: defaultReferenced } : undefined,
      named: namedUsage,
    };

    return { imports, exports, dynamicImports, importSpecs, exportsInfo, exportUsage };
  }
  return { imports, exports, dynamicImports };
}
