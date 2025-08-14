const esbuild = require('esbuild');
const path = require('path');

async function bundleViewer() {
  try {
    const result = await esbuild.build({
      entryPoints: [path.resolve(__dirname, '../src/viewer/public/app.js')],
      bundle: true,
      outfile: path.resolve(__dirname, '../dist/viewer/app.bundle.js'),
      format: 'iife', // Immediately-invoked function expression for browser
      minify: true,
      sourcemap: true,
      target: ['es2020'],
      loader: {
        '.js': 'js',
      },
    });
    console.log('Bundled viewer successfully');
  } catch (error) {
    console.error('Error bundling viewer:', error);
    process.exit(1);
  }
}

bundleViewer();
