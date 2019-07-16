const acorn = require('acorn-node');
const walk = require("acorn-node/walk");
const fs = require('fs');
const {execFileSync} = require('child_process');
const glob = require("glob");

// TODO: literals with URLs might be more unique than the average literal ...
function collectLiterals(code) {
  const literals = [];

  walk.ancestor(acorn.parse(code, {sourceType: 'module'}), {
    CallExpression(node) {
      if (node.callee.name === 'require') return;
      // this.visitChildren(node);
    },

    Literal(node, ancestors) {
      // Ignore the basic stuff.
      if (typeof node.value === 'boolean') return;
      if (Number.isInteger(node.value) && node.value >= -100 && node.value <= 100) return;

      // This will normalize. ex:
      // 1e1 -> 10
      // "test" => test
      // 'test' => test
      const literal = String(node.value);

      // This will _not_ normalize. ex:
      // 1e1, "test", 'test' are all _unique_.
      // const literal = node.raw;

      // Ignore short literals.
      if (literal.length <= 10) {
        return;
      }

      // Ignore strings in `require`.
      // TODO: ignore imports too.
      if (ancestors[ancestors.length - 2].type === 'CallExpression' &&
          ancestors[ancestors.length - 2].callee.name === 'require' &&
          ancestors[ancestors.length - 1].type === 'Literal' &&
          ancestors[ancestors.length - 2].arguments[0] === node) {
        return;
      }

      // console.log(`Found a literal: ${node.value}`, node);
      literals.push(literal);
    }
  });

  return literals;
}

async function start() {
  const packages = [
    {name: 'moment', version: '2.24.0'},
    {name: 'lighthouse', version: '5.0'},
  ]
  
  if (!fs.existsSync('packages')) fs.mkdirSync('packages');
  for (const {name, version} of packages) {
    const packageDir = `packages/${name}@${version}`;
    if (!fs.existsSync(packageDir)) {
      fs.mkdirSync(packageDir);
      try {
        execFileSync('bash', [
          '-c',
          `npm v ${name}@${version} dist.tarball | xargs curl | tar --strip-components=1 -xz -C ${packageDir}`,
        ]);
      } catch (err) {
        console.log(err.toString());
      }
    }

    const allLiterals = new Set();
    // TODO: can't parse TS with acorn.
    const codeFiles = glob.sync(`${packageDir}/**/*.js`);
    for (const file of codeFiles) {
      if (file.includes('jest.config.js')) continue;
      if (file.includes('webpack.js')) continue;
      if (file.includes('/test/')) continue;
      // console.log(file);

      let code = fs.readFileSync(file, 'utf-8');
      const literals = collectLiterals(code);
      literals.forEach(l => allLiterals.add(l));
    }

    console.log([...allLiterals]);

    // Just grab the "main" code from unpkg. Not very exhaustive, but quick.
    // const packageJsonUrl = `https://unpkg.com/${name}@${version}/package.json`;
    // const packageJson = await (await fetch(packageJsonUrl)).json();
    // const mainField = packageJson.main;
    // const mainUrl = new URL(mainField, packageJsonUrl).href;
    // const mainCode = await (await fetch(mainUrl)).text();
    // const literals = collectLiterals(mainCode);
    // console.log(literals);
  }
}

start();
