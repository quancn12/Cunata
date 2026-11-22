"""Execute the real publisher's copy logic, with all external effects fenced off.

Never run ops/publish.py as a CLI. Compile it under a non-main name, override
SRC/DST, replace git/subprocess/manifest, and supply a synthetic legacy config.
All filesystem writes remain below the supplied R2 artifact directory.
"""
import json
import pathlib
import subprocess
import sys
import types

sys.dont_write_bytecode = True
source = pathlib.Path(sys.argv[1]).resolve()
box = pathlib.Path(sys.argv[2]).resolve()
assert box.is_relative_to(pathlib.Path(__file__).resolve().parent)
src, dst = box / 'input', box / 'output'
for p in ('dist/public', 'dist/api', 'apps-script', 'public', 'ops'):
    (src / p).mkdir(parents=True, exist_ok=True)
(dst / '.git').mkdir(parents=True, exist_ok=True)
(src / 'dist/index.html').write_text('<html>R2 synthetic shell</html>', encoding='utf-8')
(src / 'dist/api/rpc.js').write_text('export default function rpc() {}', encoding='utf-8')
(src / 'dist/api/package.json').write_text('{"type":"module"}', encoding='utf-8')
(src / 'dist/api/catalog.json').write_text('[]', encoding='utf-8')
(src / 'apps-script/Code.js').write_text('// R2 legacy sentinel', encoding='utf-8')
(src / 'public/config.json').write_text('{"appsScriptUrl":""}', encoding='utf-8')
# This is synthetic input under R2, never the real ops/prod_config.json.
(src / 'ops/prod_config.json').write_text('{"appsScriptUrl":"http://127.0.0.1:9/legacy"}', encoding='utf-8')

manifest = types.ModuleType('manifest')
manifest.build = lambda: (set(), [])
sys.modules['manifest'] = manifest
ns = {'__name__': 'r2_publish_sandbox', '__file__': str(source / 'ops/publish.py')}
exec(compile((source / 'ops/publish.py').read_text(encoding='utf-8'), ns['__file__'], 'exec'), ns)
ns['SRC'], ns['DST'] = src, dst
git_calls = []
def git(*args, **kwargs):
    git_calls.append(args)
    return ''
ns['git'] = git
def deny_process(*args, **kwargs):
    raise AssertionError('R2 sandbox forbids subprocess/push/deploy')
ns['subprocess'] = types.SimpleNamespace(run=deny_process, DEVNULL=subprocess.DEVNULL)
# Even if future code tries to read another path, fail before it is opened.
def audit(event, args):
    if event in ('socket.connect', 'socket.getaddrinfo', 'subprocess.Popen'):
        raise AssertionError('R2 sandbox forbids network and external processes')
    if event == 'open' and isinstance(args[0], (str, bytes)):
        path = pathlib.Path(args[0]).resolve()
        if path.name == 'prod_config.json' and not path.is_relative_to(box):
            raise AssertionError('R2 forbids reading real production configuration')
sys.addaudithook(audit)
rc = ns['main']()
assert rc == 0, f'publisher sandbox failed: {rc}'
assert not any(c[0] in ('commit', 'push') for c in git_calls), git_calls
print('R2_PUBLISH_OUTPUT=' + str(dst))
