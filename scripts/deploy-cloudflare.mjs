import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCloudflarePublication } from './lib/cloudflare-static-publication.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = 'wrangler@4.149.0';

export async function deployCloudflare(argv, { run = runCommand, verify = verifyCloudflarePublication, projectRoot = root } = {}) {
  const options = parseOptions(argv);
  if (options.help) { process.stdout.write(usage()); return; }
  const config = await readFile(resolve(projectRoot, 'cloudflare.deploy.json'), 'utf8')
    .then(JSON.parse).catch((error) => { if (error.code === 'ENOENT') return {}; throw error; });
  const project = options.project ?? config.project ?? 'rock-atlas';
  const productionBranch = config.production_branch ?? 'main';
  const branch = options.branch ?? (options.preview ? config.preview_branch ?? 'preview' : productionBranch);
  if (!/^[a-z0-9][a-z0-9-]{0,57}$/.test(project) || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(branch) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(productionBranch)) throw new Error('Invalid Pages project or branch');
  if (options.preview && branch === productionBranch) throw new Error('Preview branch must differ from production branch');
  const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? config.account_id;
  if (account && !/^[a-f0-9]{32}$/i.test(account)) throw new Error('Invalid Cloudflare account ID');
  const context = { cwd: projectRoot, env: { ...process.env, ...(account ? { CLOUDFLARE_ACCOUNT_ID: account } : {}) } };
  if (!options.skipBuild) await run(['run', 'build'], { ...context, capture: false });
  const trustedKeys = JSON.parse(await readFile(resolve(projectRoot, 'src/data/catalog/trusted-catalog-keys.json'), 'utf8'));
  const report = await verify({ dist: resolve(projectRoot, 'dist'), trustedKeys, fileLimit: options.fileLimit ?? config.file_limit ?? 20_000 });
  process.stdout.write(`${JSON.stringify({ project, branch, ...report }, null, 2)}\n`);
  if (options.dryRun) {
    process.stdout.write('本地发布检查通过；未登录、未创建项目、未上传。\n');
    return report;
  }
  const wrangler = (args, capture = false) => run(['exec', '--yes', `--package=${WRANGLER}`, '--', 'wrangler', ...args], { ...context, capture });
  const identity = await wrangler(['whoami', '--json'], true).catch(() => null);
  if (!identity) {
    if (process.env.CLOUDFLARE_API_TOKEN || !process.stdin.isTTY) throw new Error('请先运行 npm exec --yes --package=wrangler@4.149.0 -- wrangler login，或配置有效的 CLOUDFLARE_API_TOKEN 与 CLOUDFLARE_ACCOUNT_ID');
    await wrangler(['login']);
  }
  // The list call also verifies account access. Its failure must not be mistaken for a missing project.
  const listed = await wrangler(['pages', 'project', 'list', '--json'], true);
  const projects = JSON.parse(listed.stdout);
  if (!Array.isArray(projects)) throw new Error('Unexpected Pages project list response');
  // Wrangler 4's JSON output uses these display keys and does not expose production_branch.
  const existing = projects.find((item) => item['Project Name'] === project);
  if (!existing) await wrangler(['pages', 'project', 'create', project, '--production-branch', productionBranch]);
  await wrangler(['pages', 'deploy', resolve(projectRoot, 'dist'), '--project-name', project, '--branch', branch, '--commit-dirty=true']);
  process.stdout.write(`已上传分支 ${branch}。部署类型与具体 URL 以上方 Wrangler 输出和项目设置为准。\n`);
  return report;
}

function parseOptions(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (['--dry-run', '--skip-build', '--preview', '--help'].includes(flag)) result[flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
    else if (['--project', '--branch', '--file-limit'].includes(flag)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      result[flag === '--file-limit' ? 'fileLimit' : flag.slice(2)] = flag === '--file-limit' ? Number(value) : value;
    } else throw new Error(`Unknown argument: ${flag}\n${usage()}`);
  }
  return result;
}
function usage() {
  return '用法：npm run deploy:cloudflare -- [--project rock-atlas] [--preview | --branch NAME] [--dry-run] [--skip-build] [--file-limit 20000]\n首次发布可自动打开 Cloudflare 登录；无交互环境使用账号 ID 和 API Token。\n';
}
async function runCommand(args, options) {
  const npmCli = process.env.npm_execpath;
  if (process.platform === 'win32' && !npmCli) throw new Error('Windows 请通过 npm run deploy:cloudflare 启动发布脚本');
  const executable = npmCli ? process.execPath : 'npm';
  const commandArgs = npmCli ? [npmCli, ...args] : args;
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, commandArgs, { cwd: options.cwd, env: options.env,
      stdio: options.capture ? ['inherit', 'pipe', 'pipe'] : 'inherit', shell: false });
    let stdout = '', stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolveResult({ stdout, stderr });
      else reject(new Error(`发布步骤失败（退出码 ${code}）：npm ${args.join(' ')}\n${stderr}`));
    });
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await deployCloudflare(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`发布终止：${error.message}\n`); process.exitCode = 1;
  });
}
