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
} from '@babel/types';

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
      if (collectSymbols) exportsInfo.hasDefault = true;
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
            if (collectSymbols) exportsInfo.named.push(specifier.exported.name);
          }
        });
      }
      if (path.node.declaration) {
        if (path.node.declaration.type === 'VariableDeclaration') {
          path.node.declaration.declarations.forEach((declaration) => {
            if ((declaration.id as any).type === 'Identifier') {
              const name = (declaration.id as Identifier).name;
              exports.push(name);
              if (collectSymbols) exportsInfo.named.push(name);
            }
          });
        } else if (
          path.node.declaration.type === 'FunctionDeclaration' ||
          path.node.declaration.type === 'ClassDeclaration'
        ) {
          if (path.node.declaration.id) {
            const name = path.node.declaration.id.name;
            exports.push(name);
            if (collectSymbols) exportsInfo.named.push(name);
          }
        }
      }
    },
  });

  if (collectSymbols) {
    return { imports, exports, dynamicImports, importSpecs, exportsInfo };
  }
  return { imports, exports, dynamicImports };
}
