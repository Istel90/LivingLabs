"""Read-only comparison of home files against the company snapshot and its Git base."""
import argparse
import collections
import hashlib
import json
from pathlib import Path


TEXT_EXTENSIONS = {'.js', '.mjs', '.cjs', '.ts', '.svelte', '.css', '.json', '.md', '.py', '.ps1', '.sql', '.txt', '.html', '.toml', '.yaml', '.yml', '.cmd', '.csv', '.svg'}


def comparison_digest(path, data):
    if data is None:
        return None
    if path.suffix.lower() in TEXT_EXTENSIONS or path.name in {'.gitignore', '.gitattributes'}:
        data = data.replace(b'\r\n', b'\n')
    return hashlib.sha256(data).hexdigest()


def sha(path):
    if not path.is_file():
        return None
    return comparison_digest(path, path.read_bytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, type=Path)
    parser.add_argument('--package', type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    manifest = json.loads((args.package / 'code-manifest.json').read_text(encoding='utf8'))
    root = args.repo.resolve(strict=True)
    result = []
    for item in manifest['files']:
        path = (root / item['path']).resolve()
        if not path.is_relative_to(root):
            raise ValueError('Unsafe manifest path')
        home = sha(path)
        company = item['compareSha256']
        base = item['baseCompareSha256']
        if home == company:
            state = 'same_as_company'
        elif company == base:
            state = 'home_change_preserve'
        elif home == base:
            state = 'company_change_candidate'
        else:
            state = 'both_differ_review'
        result.append({'path': item['path'], 'state': state})
    print(json.dumps({'readOnly': True, 'repo': str(root), 'baseCommit': manifest['baseCommit'],
                      'counts': dict(collections.Counter(r['state'] for r in result)),
                      'differences': [r for r in result if r['state'] != 'same_as_company']},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
