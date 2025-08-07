import fg from 'fast-glob';
import path from 'path';

export async function scanFiles(root: string, extensions: string[], exclude: string[], rootDir: string): Promise<string[]> {
  const scanDir = rootDir || root;
  const pattern = `${scanDir}/**/*.{${extensions.join(',')}}`;
  const files = await fg(pattern, {
    ignore: ['**/node_modules/**', ...exclude],
    absolute: true,
  });
  return files.map(file => path.resolve(file));
}

