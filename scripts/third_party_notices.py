#!/usr/bin/env python3
"""Generate THIRD_PARTY_NOTICES.md: every npm package bundled into the app and every Rust crate compiled
into the Windows executable, the Rust crates the Linux packages add (26.65), the system libraries the AppImage carries
(kept by hand in scripts/linux_notices.md), with each license and the license texts shipped by the package (deduplicated).
Run from the repository root after `npm ci` and with network access for `cargo metadata`."""
import hashlib, json, os, subprocess, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LICENSE_NAMES = ('LICENSE', 'LICENCE', 'COPYING', 'NOTICE', 'OFL', 'UNLICENSE')

# 26.58: algorithm references of the many-body solver (no code included)
ALGORITHM_REFERENCES = ['## Algorithm references (26.58) / 算法参考', '', "The many-body solver of the Rust core (`engine/velophi-core/src/world`, integrator `softstep`) is VeloPhi's own code, written after the", 'algorithms published with the projects below (soft step / TGS-soft sub-stepping, soft constraint coefficients, contact manifolds', 'with feature ids, speculative contacts, Poisson-capped restitution, sleeping islands). No source code of these projects is', 'included in VeloPhi. They are acknowledged here with their licences.', 'Rust 核心的多体求解器（`engine/velophi-core/src/world`，积分器 `softstep`）由 VeloPhi 自行编写，参照下列项目公开的算法；VeloPhi 不包含它们的源代码。', '', '| Project | Copyright | License | Used as |', '|---|---|---|---|', '| Box2D v3 (https://box2d.org, https://github.com/erincatto/box2d) | © 2022–2026 Erin Catto | MIT | Algorithm reference (Solver2D / soft step, manifolds, restitution) |', '| Rapier and Parry (https://rapier.rs) | © Dimforge | Apache-2.0 | Algorithm reference (TGS-soft parameters, cross-platform determinism) |', '']

def license_files(d):
    out = []
    try:
        for f in sorted(os.listdir(d)):
            if f.upper().startswith(LICENSE_NAMES) and os.path.isfile(os.path.join(d, f)):
                out.append(os.path.join(d, f))
    except FileNotFoundError:
        pass
    return out

def npm_packages():
    data = json.loads(subprocess.run(['npm.cmd' if os.name == 'nt' else 'npm', 'ls', '--omit=dev', '--all', '--json'], cwd=root, capture_output=True, text=True, encoding='utf-8').stdout)
    seen = {}
    def walk(deps):
        for name, info in (deps or {}).items():
            key = (name, info.get('version'))
            if key in seen: continue
            d = os.path.join(root, 'node_modules', name)
            pj = os.path.join(d, 'package.json')
            meta = json.load(open(pj, encoding='utf-8')) if os.path.exists(pj) else {}
            lic = meta.get('license') or (meta.get('licenses') or [{}])[0].get('type') or 'UNKNOWN'
            repo = meta.get('repository')
            repo = repo.get('url') if isinstance(repo, dict) else repo
            seen[key] = {'name': name, 'version': info.get('version'), 'license': lic, 'repo': repo or meta.get('homepage') or '', 'files': license_files(d)}
            walk(info.get('dependencies'))
    walk(data.get('dependencies'))
    return list(seen.values())

def cargo_packages(folder='src-tauri', platform='x86_64-pc-windows-msvc', root_name=None):
    out = subprocess.run(['cargo', 'metadata', '--format-version', '1', '--locked', '--filter-platform', platform],
                         cwd=os.path.join(root, folder), capture_output=True, text=True, check=True).stdout
    m = json.loads(out)
    nodes = {n['id']: n for n in m['resolve']['nodes']}
    pk = {p['id']: p for p in m['packages']}
    rootid = m['resolve']['root'] if root_name is None else next(i for i, p in pk.items() if p['name'] == root_name)
    keep, stack = set(), [rootid]
    while stack:
        i = stack.pop()
        if i in keep: continue
        keep.add(i)
        for d in nodes[i]['deps']:
            if any(k['kind'] in (None, 'normal') for k in d['dep_kinds']):
                stack.append(d['pkg'])
    res = []
    for i in keep:
        p = pk[i]
        if i == rootid or p.get('source') is None: continue
        d = os.path.dirname(p['manifest_path'])
        res.append({'name': p['name'], 'version': p['version'], 'license': p.get('license') or (p.get('license_file') and 'see file') or 'UNKNOWN', 'repo': p.get('repository') or '', 'files': license_files(d)})
    return sorted(res, key=lambda x: (x['name'], x['version']))

def main():
    npm = npm_packages()
    crates = cargo_packages()
    # 26.65 (D298): the Linux executables are built from the same lock file; only the crates that Windows does not use are listed
    win = {(p['name'], p['version']) for p in crates}
    linux = [p for p in cargo_packages('src-tauri', 'x86_64-unknown-linux-gnu') if (p['name'], p['version']) not in win]
    engine = cargo_packages('engine', 'wasm32-unknown-unknown', 'velophi-wasm')
    texts = {}
    def ref(files):
        ids = []
        for f in files:
            t = open(f, encoding='utf-8', errors='replace').read().strip()
            h = hashlib.sha256(t.encode()).hexdigest()[:10]
            texts.setdefault(h, (t, []))
            texts[h][1].append(os.path.basename(f))
            ids.append(h)
        return ids
    lines = ['# Third-party notices / 第三方组件声明', '',
             'VeloPhi bundles the following open-source components. Each is used unmodified under its own license, except where a section below says otherwise.',
             'VeloPhi 使用了下列开源组件，除下文另有说明外均未修改，按各自许可证使用。许可证全文见文末（相同文本只列一次）。', '',
             *ALGORITHM_REFERENCES,
             *open(os.path.join(root, 'scripts', 'data_notices.md'), encoding='utf-8').read().strip().splitlines(), '',
             f'## npm packages in the application ({len(npm)})', '', '| Package | Version | License | License text |', '|---|---|---|---|']
    for p in sorted(npm, key=lambda x: x['name']):
        lines.append(f"| {p['name']} | {p['version']} | {p['license']} | {', '.join('§' + h for h in ref(p['files'])) or '—'} |")
    lines += ['', f'## Rust crates in the Windows executable ({len(crates)})', '', '| Crate | Version | License | License text |', '|---|---|---|---|']
    for p in crates:
        lines.append(f"| {p['name']} | {p['version']} | {p['license']} | {', '.join('§' + h for h in ref(p['files'])) or '(SPDX: ' + p['license'] + ')'} |")
    lines += ['', f'## Rust crates added in the Linux executables ({len(linux)})', '',
              'The deb, rpm and AppImage packages contain every crate of the Windows executable that is not specific to Windows, and these.', '',
              '| Crate | Version | License | License text |', '|---|---|---|---|']
    for p in linux:
        lines.append(f"| {p['name']} | {p['version']} | {p['license']} | {', '.join('§' + h for h in ref(p['files'])) or '(SPDX: ' + p['license'] + ')'} |")
    lines += ['', *open(os.path.join(root, 'scripts', 'linux_notices.md'), encoding='utf-8').read().strip().splitlines(), '']
    lic = json.load(open(os.path.join(root, 'scripts', 'linux', 'appimage-licenses.json'), encoding='utf-8'))
    pkgs = [l.split()[:2] for l in open(os.path.join(root, 'scripts', 'linux', 'appimage-source-packages.txt'), encoding='utf-8') if l.strip() and not l.startswith('?')]
    missing = [s for s, _ in pkgs if s not in lic]
    if missing:
        sys.exit('scripts/linux/appimage-licenses.json has no licence for: ' + ', '.join(missing))
    lines += [f'| Ubuntu 22.04 source package ({len(pkgs)}) | Version | License of the shipped libraries |', '|---|---|---|']
    lines += [f'| {s} | {v} | {lic[s]} |' for s, v in sorted(pkgs)]
    lines += ['', '| License | Text |', '|---|---|']
    ldir = os.path.join(root, 'scripts', 'linux-licenses')
    for f in sorted(os.listdir(ldir)):
        lines.append(f"| {f[:-4]} | §{ref([os.path.join(ldir, f)])[0]} |")
    lines += ['', f'## Rust crates in the WebAssembly engine ({len(engine)})', '', '| Crate | Version | License | License text |', '|---|---|---|---|']
    for p in engine:
        lines.append(f"| {p['name']} | {p['version']} | {p['license']} | {', '.join('§' + h for h in ref(p['files'])) or '(SPDX: ' + p['license'] + ')'} |")
    lines += ['', '## License texts', '']
    for h, (t, names) in texts.items():
        lines += [f'### §{h}', '', '```', t, '```', '']
    out = os.path.join(root, 'docs', 'THIRD_PARTY_NOTICES.md')
    open(out, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'{out}: {len(npm)} npm packages, {len(crates)} crates, {len(linux)} Linux-only crates, {len(engine)} engine crates, {len(texts)} distinct license texts')

main()
