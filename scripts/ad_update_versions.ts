import { resolve, dirname, fromFileUrl, join } from "https://deno.land/std@0.219.0/path/mod.ts"
import { expandGlob } from "https://deno.land/std@0.219.0/fs/mod.ts"
import { parse as toml_parse, stringify as toml_stringify } from "https://deno.land/std@0.219.0/toml/mod.ts";
import { parse as semver_parse, SemVer, greaterThan, format as semver_format } from "https://deno.land/std@0.219.0/semver/mod.ts"

const __dirname = resolve(dirname(fromFileUrl(import.meta.url)))
const ROOT = (...segs: string[]) => join(__dirname, '..', ...segs)

type CargoToml = {
  package: {
    name: string
    _name: string
    version: string
  },
  dependencies?: Record<string, string | { version?: string, path?: string, package?: string }>
  'dev-dependencies'?: Record<string, string | { version?: string, path?: string, package?: string }>
}

const packages = new Map<string, [SemVer, CargoToml]>()
const package_names = new Map<string, string>()

for await (const dirname of Deno.readDir(ROOT('crates'))) {
  const toml_path = ROOT('crates', dirname.name, 'Cargo.toml')
  const toml = toml_parse(await Deno.readTextFile(toml_path)) as CargoToml
  const version = semver_parse(toml.package.version)
  packages.set(toml_path, [version, toml])
}

let biggest_version: SemVer = semver_parse('0.0.0')

for (const [version] of packages.values()) {
  if (!greaterThan(version, biggest_version)) continue
  biggest_version = version
}

const bump_version_to = semver_format(semver_parse(`${biggest_version.major + 1}.0.0`))

console.log(`Bumping packages to: ${bump_version_to}`)

for (const [filepath, [,toml]] of packages.entries()) {
  console.log(`  Package ${toml.package.name}`)

  if (!toml.package._name) {
    console.log(`    rename ${toml.package.name} to ad_${toml.package.name}`)
    toml.package._name = toml.package.name
    toml.package.name = `ad_${toml.package.name}`
  }

  package_names.set(toml.package._name, toml.package.name)

  console.log(`    version ${toml.package.version} to ${bump_version_to}`)
  toml.package.version = bump_version_to

  for (const [key, details] of Object.entries(toml.dependencies || {})) {
    if (typeof details === 'string') continue
    if (!details.path) continue

    if (!details.package) {
      console.log(`      dep ${details.package}@${details.version} to ad_${key}@${bump_version_to}`)
      details.package = `ad_${key}`
      details.version = bump_version_to
    } else if (!details.package?.startsWith('ad_')) {
      console.log(`      dep ${details.package}@${details.version} to ad_${key}@${bump_version_to}`)
      details.package = `ad_${key}`
      details.version = bump_version_to
    } else {
      console.log(`      dep ${details.package}@${details.version} to ad_${key}@${bump_version_to}`)
      details.version = bump_version_to
    }
  }

  for (const [key, details] of Object.entries(toml["dev-dependencies"] || {})) {
    if (typeof details === 'string') continue
    if (!details.path) continue

    if (!details.package) {
      console.log(`      dep ${details.package}@${details.version} to ad_${key}@${bump_version_to}`)
      details.package = `ad_${key}`
      details.version = bump_version_to
    } else if (!details.package?.startsWith('ad_')) {
      console.log(`      dep ${details.package}@${details.version} to ad_${key}@${bump_version_to}`)
      details.package = `ad_${key}`
      details.version = bump_version_to
    } else {
      console.log(`      dep ${details.package}@${details.version} to ad_${key}@${bump_version_to}`)
      details.version = bump_version_to
    }
  }

  console.log()

  await Deno.writeTextFile(filepath, toml_stringify(toml))
}


console.log(`Rewriting Tests:`)

const rewrite_targets = ["tests", "benches", "examples"]

for (const [filepath, [,toml]] of packages.entries()) {
  const pkg_path = dirname(filepath)

  for await (const rewrite_target of rewrite_targets) {
      for await (const entry of expandGlob(`./${rewrite_target}/**/*.rs`, { root: pkg_path })) {
        if (!(await Deno.stat(entry.path)).isFile) continue
        const contents = await Deno.readTextFile(entry.path)
        const updated = contents.replace(new RegExp(`\ (?!ad_)${toml.package._name}`, "g"),  ` ${toml.package.name}`)
        if (contents !== updated) {
          console.log(`  updates ${entry.path}`)
        }
        await Deno.writeTextFile(entry.path, updated)
      }
  }
}

console.log()
console.log(`Packages updated: ${packages.size}`)
