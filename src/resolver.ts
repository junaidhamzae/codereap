import path from 'path';
import fs from 'fs';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json'];

export function resolveImport(from: string, specifier: string): string | null {
  if (specifier.startsWith('.')) {
    const fromDir = path.dirname(from);
    let resolvedPath = path.resolve(fromDir, specifier);

    if (fs.existsSync(resolvedPath)) {
      const stats = fs.statSync(resolvedPath);
      if (stats.isDirectory()) {
        for (const ext of EXTENSIONS) {
          const indexPath = path.join(resolvedPath, 'index' + ext);
          if (fs.existsSync(indexPath)) {
            return indexPath;
          }
        }
      } else {
        return resolvedPath;
      }
    }

    for (const ext of EXTENSIONS) {
      const fullPath = resolvedPath + ext;
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    return null; 
  }

  try {
    return require.resolve(specifier, { paths: [path.dirname(from)] });
  } catch (e) {
    console.error(`Could not resolve '${specifier}' from '${from}'`);
    return null;
  }
}
