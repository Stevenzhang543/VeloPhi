// Build the test-only Node-API module of the Rust core (engine/velophi-napi) and copy it to
// engine/target/napi/velophi_core.node, where tests/setup/core.ts finds it. Used where no wasm32 toolchain is
// available (the WebAssembly build is the one the application ships and the release tests use).
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'engine', 'target', 'napi')
execFileSync('cargo', ['build', '--release', '--manifest-path', join(root, 'engine', 'velophi-napi', 'Cargo.toml')], { stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: target } })
const lib = ['libvelophi_napi.so', 'libvelophi_napi.dylib', 'velophi_napi.dll'].map(f => join(target, 'release', f)).find(existsSync)
if (!lib) throw new Error('velophi-napi: library not found')
copyFileSync(lib, join(target, 'velophi_core.node'))
console.log(`velophi-napi: ${join(target, 'velophi_core.node')}`)
