import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApiDocument } from './generate-openapi';

// biome-ignore lint/suspicious/noTsIgnore: The root TSC config is not set to compile this.
// @ts-ignore The root TSC config is not set to compile this.
const __dirname = dirname(fileURLToPath(import.meta.url));

async function createDocsHTML() {
  return `<!DOCTYPE html>
<html>
<head>
    <title>TODO API Documentation</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body {
        margin: 0;
        padding: 0;
      }
    </style>
</head>
<body>
    <redoc></redoc>
    <script src="https://cdn.jsdelivr.net/npm/redoc@latest/bundles/redoc.standalone.js"></script>
    <script>
      Redoc.init(${JSON.stringify(openApiDocument, null, 2)}, {
        scrollYOffset: 0,
        hideDownloadButton: false,
        theme: {
          colors: {
            primary: {
              main: '#32329f'
            }
          },
          typography: {
            fontSize: '14px',
            lineHeight: '1.5em',
            code: {
              fontSize: '13px'
            }
          }
        }
      }, document.querySelector('redoc'));
    </script>
</body>
</html>`;
}

createDocsHTML().then((html) => {
  const docsPath = path.resolve(`${__dirname}/../docs/openapi.html`);

  fs.writeFileSync(docsPath, html);
  console.log(`Documentation generated at "${docsPath}"`);
});
