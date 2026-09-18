#!/usr/bin/env node
// 同步版本号并（可选）打出发布标签。
//
// package.json 是版本号的唯一事实来源，服务端在运行时直接读取它，因此这里
// 只需改一个文件。README 中的发布示例会跟着一起更新，避免文档里的版本号
// 停留在历史版本上。
//
//   node scripts/release.mjs 1.0.1          # 仅同步版本号
//   node scripts/release.mjs patch          # 基于当前版本递增
//   node scripts/release.mjs minor --tag    # 同步、提交并打标签
//   node scripts/release.mjs 1.1.0 --dry-run
//
// --tag 会额外执行 git commit 与 git tag -a；推送需要手动确认，因为推送
// 标签会触发 CI 构建镜像、覆盖 :latest 并创建 GitHub Release。

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = path.join(rootDir, 'package.json')
const readmePath = path.join(rootDir, 'README.md')

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function git(...args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim()
}

// "patch" / "minor" / "major" 基于当前版本递增；预发布标识会被丢弃，
// 因为 1.1.0-rc.1 的下一个 patch 应当是 1.1.1 而非 1.1.2。
function resolveVersion(input, current) {
  if (SEMVER.test(input)) return input
  const bump = ['major', 'minor', 'patch'].indexOf(input)
  if (bump === -1) fail(`版本号无效：${input}（需为 x.y.z 或 major/minor/patch）`)
  const parts = current.match(SEMVER).slice(1, 4).map(Number)
  parts[bump] += 1
  for (let i = bump + 1; i < 3; i += 1) parts[i] = 0
  return parts.join('.')
}

function compare(a, b) {
  const [x, y] = [a, b].map((v) => v.match(SEMVER).slice(1, 4).map(Number))
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const withTag = args.includes('--tag')
const force = args.includes('--force')
const target = args.find((arg) => !arg.startsWith('--'))

if (!target) fail('用法：node scripts/release.mjs <x.y.z|patch|minor|major> [--tag] [--dry-run] [--force]')

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const current = packageJson.version
if (!SEMVER.test(current)) fail(`package.json 中的版本号不是合法 semver：${current}`)

const next = resolveVersion(target, current)
const tagName = `v${next}`

if (next === current && !withTag) fail(`版本号已经是 ${next}，无需变更（如需强制重写请加 --force）`)
if (compare(next, current) < 0 && !force) {
  fail(`${next} 低于当前版本 ${current}，这会导致版本回退（确认无误请加 --force）`)
}

// 打标签前要求工作区干净，否则提交会裹入无关改动。
if (withTag && !dryRun) {
  if (git('status', '--porcelain')) fail('工作区存在未提交的改动，请先提交或暂存后再打标签')
  const existing = git('tag', '--list', tagName)
  if (existing) fail(`标签 ${tagName} 已存在`)
}

const edits = []

const nextPackageJson = fs.readFileSync(packagePath, 'utf8').replace(
  /("version"\s*:\s*)"[^"]+"/,
  `$1"${next}"`,
)
edits.push({ file: packagePath, content: nextPackageJson, label: 'package.json' })

// README 的发布示例固定写成 git tag / git push origin，只改这两行。
// 不能笼统替换所有 vX.Y.Z：正文里说明预发布命名的 `v1.1.0-beta.1`
// 属于语法例子，被改写后会变成自相矛盾的文档。
const readme = fs.readFileSync(readmePath, 'utf8')
const nextReadme = readme.replace(
  /^(git (?:tag|push origin(?: main)?) )v\d+\.\d+\.\d+$/gm,
  `$1${tagName}`,
)
if (nextReadme !== readme) edits.push({ file: readmePath, content: nextReadme, label: 'README.md' })

console.log(`${current} → ${next}`)
for (const edit of edits) console.log(`  · ${edit.label}`)

if (dryRun) {
  console.log('\n(--dry-run，未写入任何文件)')
  process.exit(0)
}

for (const edit of edits) fs.writeFileSync(edit.file, edit.content)
console.log('✓ 版本号已同步')

if (!withTag) {
  console.log(`\n下一步提交并打标签：\n  node scripts/release.mjs ${next} --tag --force`)
  process.exit(0)
}

git('add', ...edits.map((edit) => path.relative(rootDir, edit.file)))
// 重新跑同一条命令时文件内容已一致，此时不要产生空提交。
if (git('diff', '--cached', '--name-only')) {
  git('commit', '-m', `🔖 chore: Release ${tagName}`)
} else {
  console.log('· 版本号无变化，跳过提交')
}
git('tag', '-a', tagName, '-m', `KeyFort ${tagName}`)
console.log(`✓ 已提交并创建标签 ${tagName}`)
console.log(`\n推送以发布（将触发镜像构建、覆盖 :latest 并创建 Release）：\n  git push origin main ${tagName}`)
