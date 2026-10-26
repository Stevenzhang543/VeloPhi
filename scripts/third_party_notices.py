#!/usr/bin/env python3
"""Generate THIRD_PARTY_NOTICES.md: every npm package bundled into the app and every Rust crate compiled
into the Windows executable, with its license and the license texts shipped by the package (deduplicated).
Run from the repository root after `npm ci` and with network access for `cargo metadata`."""
import hashlib, json, os, subprocess, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LICENSE_NAMES = ('LICENSE', 'LICENCE', 'COPYING', 'NOTICE', 'OFL', 'UNLICENSE')

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
    data = json.loads(subprocess.run(['npm', 'ls', '--omit=dev', '--all', '--json'], cwd=root, capture_output=True, text=True).stdout)
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
             'VeloPhi 26.50 bundles the following open-source components. Each is used unmodified under its own license.',
             'VeloPhi 26.50 使用了下列开源组件，均未修改，按各自许可证使用。许可证全文见文末（相同文本只列一次）。', '',
             f'## npm packages in the application ({len(npm)})', '', '| Package | Version | License | License text |', '|---|---|---|---|']
    for p in sorted(npm, key=lambda x: x['name']):
        lines.append(f"| {p['name']} | {p['version']} | {p['license']} | {', '.join('§' + h for h in ref(p['files'])) or '—'} |")
    lines += ['', f'## Rust crates in the Windows executable ({len(crates)})', '', '| Crate | Version | License | License text |', '|---|---|---|---|']
    for p in crates:
        lines.append(f"| {p['name']} | {p['version']} | {p['license']} | {', '.join('§' + h for h in ref(p['files'])) or '(SPDX: ' + p['license'] + ')'} |")
    lines += ['', f'## Rust crates in the WebAssembly engine ({len(engine)})', '', '| Crate | Version | License | License text |', '|---|---|---|---|']
    for p in engine:
        lines.append(f"| {p['name']} | {p['version']} | {p['license']} | {', '.join('§' + h for h in ref(p['files'])) or '(SPDX: ' + p['license'] + ')'} |")
    lines += ['', '## License texts', '']
    for h, (t, names) in texts.items():
        lines += [f'### §{h}', '', '```', t, '```', '']
    out = os.path.join(root, 'docs', 'THIRD_PARTY_NOTICES.md')
    open(out, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'{out}: {len(npm)} npm packages, {len(crates)} crates, {len(engine)} engine crates, {len(texts)} distinct license texts')

main()
