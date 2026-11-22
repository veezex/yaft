import { copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const engineSource = 'https://github.com/capsuleers-app/capsuleers.fitting-engine/tree/64981d2887c544d56e64e47b53f57f162bb386b4';

export function releaseNotices(): Plugin {
  return {
    name: 'yaft-release-notices',
    apply: 'build',
    async writeBundle(output) {
      const directory = resolve(output.dir ?? 'dist');
      const repo = process.env.GITHUB_REPOSITORY;
      const sha = process.env.GITHUB_SHA;
      const repository = repo && /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : 'veezex/yaft';
      const source = `https://github.com/${repository}${sha && /^[0-9a-f]{40}$/.test(sha) ? '/tree/' + sha : ''}`;
      await Promise.all([
        copyFile('LICENSE', resolve(directory, 'license.txt')),
        copyFile('THIRD_PARTY_NOTICES.md', resolve(directory, 'third-party-notices.txt')),
        copyFile('node_modules/react/LICENSE', resolve(directory, 'react-license.txt')),
        copyFile('node_modules/eve-fit-engine/NOTICE', resolve(directory, 'engine-notice.txt')),
        writeFile(resolve(directory, 'licenses.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YAFT | Licenses and source code</title>
</head>
<body>
  <main>
    <h1>YAFT licenses and source code</h1>
    <ul>
      <li><a href="${source}">YAFT source code</a></li>
      <li><a href="${engineSource}">Fitting engine source code</a></li>
      <li><a href="license.txt">GNU General Public License v3</a></li>
      <li><a href="third-party-notices.txt">Third-party notices</a></li>
      <li><a href="engine-notice.txt">Fitting engine notice</a></li>
      <li><a href="react-license.txt">React and React DOM license</a></li>
    </ul>
    <p>© 2014 CCP hf. All rights reserved. EVE, EVE Online, CCP, and all related logos and images
      are trademarks or registered trademarks of CCP hf. YAFT is an independent application.</p>
    <p><a href="./">Return to YAFT</a></p>
  </main>
</body>
</html>
`),
      ]);
    },
  };
}
