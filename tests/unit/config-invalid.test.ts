import fs from 'node:fs';
import path from 'node:path';
import { loadCodereapConfig, loadTsJsConfig } from '../../src/config';
import { withTempDir } from '../helpers/withTempDir';

describe('config invalid scenarios', () => {
  it('handles invalid JSON in codereap.config.json', () => withTempDir('config-', (root) => {
    fs.writeFileSync(path.join(root, 'codereap.config.json'), '{invalid json');
    const cfg = loadCodereapConfig(root);
    expect(cfg.root).toBe(root);
  }));

  it('handles missing ts/jsconfig', () => withTempDir('config-', (root) => {
    const cfg = loadTsJsConfig(root);
    expect(cfg).toEqual({});
  }));
});


