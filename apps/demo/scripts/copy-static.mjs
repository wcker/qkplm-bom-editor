import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

await mkdir(dist, { recursive: true });
await Promise.all(
  ['acceptance.html', 'examples.html', 'guide.css', 'help.html', 'index.html', 'styles.css'].map((fileName) =>
    copyFile(new URL(fileName, new URL('../src/', import.meta.url)), new URL(fileName, new URL('../dist/', import.meta.url))),
  ),
);
