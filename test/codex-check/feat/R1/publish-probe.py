"""Execute the real publisher in an inert fixture; no git, deploy or production config."""
import importlib.util
import json
import pathlib
import sys
import types

publisher, source, destination = map(pathlib.Path, sys.argv[1:])
spec = importlib.util.spec_from_file_location('r1_publish_probe', publisher)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)  # __main__ guard remains false
module.SRC, module.DST = source, destination
destination.mkdir(parents=True, exist_ok=True)
(destination / '.git').mkdir(exist_ok=True)
manifest = types.ModuleType('manifest')
manifest.build = lambda: (set(), [])
sys.modules['manifest'] = manifest

def no_subprocess(*args, **kwargs):
    raise AssertionError('R1 publish probe forbids subprocess/git/network')

module.subprocess.run = no_subprocess
# Empty status stops before commit/push. Other git operations remain forbidden.
def fake_git(*args, **kwargs):
    assert args == ('status', '--porcelain'), ('Forbidden git operation', args)
    return ''

def staging_git(*args, **kwargs):
    if args == ('add', '-A'):
        return ''  # inert staging marker, no actual git process
    return fake_git(*args, **kwargs)

module.git = staging_git
assert module.main() == 0, 'WEB-contract §22: publisher stages fixture successfully'
assert (destination / 'api' / 'rpc.js').is_file(), 'WEB-contract §22: publish dist/api -> api/ at public root'
assert not (destination / 'site' / 'api').exists(), 'WEB-contract §22: never copy API into site/'
for rel, expected in [('site/public/config.json', '/api/rpc'), ('public/config.json', 'https://cunata.vercel.app/api/rpc')]:
    actual = json.loads((destination / rel).read_text(encoding='utf-8'))
    assert actual == {'apiBase': expected}, f'WEB-contract §22: {rel} apiBase must be {expected}'
assert (destination / 'apps-script' / 'Code.js').read_bytes() == (source / 'apps-script' / 'Code.js').read_bytes(), 'WEB-contract §22: preserve Apps Script, no Sheet migration'
print('R1_PUBLISH_PROBE_OK')
