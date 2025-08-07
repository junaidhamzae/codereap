import * as fs from 'fs/promises';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import { ImportDeclaration, CallExpression, ExportAllDeclaration, ExportDefaultDeclaration, ExportNamedDeclaration } from '@babel/types';

export interface ParsedFile {
  imports: string[];
  exports: string[];
  dynamicImports: string[];
}

export async function parseFile(filePath: string): Promise<ParsedFile> {
  const content = await fs.readFile(filePath, 'utf-8');
  const imports: string[] = [];
  const exports: string[] = [];
  const dynamicImports: string[] = [];

  const ast = babelParser.parse(content, {
    sourceType: 'module',
    plugins: [
      'typescript',
      'jsx',
    ],
  });

  traverse(ast, {
    ImportDeclaration(path: { node: ImportDeclaration; }) {
      imports.push(path.node.source.value);
    },
    CallExpression(path: { node: CallExpression; }) {
      if (path.node.callee.type === 'Identifier' && path.node.callee.name === 'require') {
        if (path.node.arguments.length > 0 && path.node.arguments[0].type === 'StringLiteral') {
          imports.push(path.node.arguments[0].value);
        }
      } else if (path.node.callee.type === 'Import') {
        if (path.node.arguments.length > 0 && path.node.arguments[0].type === 'StringLiteral') {
          dynamicImports.push(path.node.arguments[0].value);
        }
      }
    },
    ExportAllDeclaration(path: { node: ExportAllDeclaration; }) {
      if (path.node.source) {
        imports.push(path.node.source.value);
        exports.push(path.node.source.value);
      }
    },
    ExportDefaultDeclaration(path: { node: ExportDefaultDeclaration; }) {
      exports.push('default');
    },
    ExportNamedDeclaration(path: { node: ExportNamedDeclaration; }) {
      if (path.node.source) {
        imports.push(path.node.source.value);
      }
      if (path.node.specifiers) {
        path.node.specifiers.forEach(specifier => {
          if (specifier.exported.type === 'Identifier') {
            exports.push(specifier.exported.name);
          }
        });
      }
      if (path.node.declaration) {
        if (path.node.declaration.type === 'VariableDeclaration') {
          path.node.declaration.declarations.forEach(declaration => {
            if (declaration.id.type === 'Identifier') {
              exports.push(declaration.id.name);
            }
          });
        } else if (path.node.declaration.type === 'FunctionDeclaration' || path.node.declaration.type === 'ClassDeclaration') {
          if (path.node.declaration.id) {
            exports.push(path.node.declaration.id.name);
          }
        }
      }
    },
  });

  return { imports, exports, dynamicImports };
}
