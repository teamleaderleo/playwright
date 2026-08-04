from pathlib import Path

path = Path("tests/mcp/process-shutdown-capability.spec.ts")
text = path.read_text(encoding="utf-8")

old_import = "import { ChildProcess, spawn } from 'child_process';\n"
new_import = "import { ChildProcess, spawn, spawnSync } from 'child_process';\n"
if text.count(old_import) != 1:
    raise SystemExit(f"expected one child-process import, found {text.count(old_import)}")
text = text.replace(old_import, new_import, 1)

marker = "async function connectClient(url: URL): Promise<Client> {\n"
if text.count(marker) != 1:
    raise SystemExit(f"expected one client helper marker, found {text.count(marker)}")
help_test = """test('help names the process-shutdown capability and consequence', () => {
  const result = spawnSync('node', [...mcpServerPath, '--help'], {
    encoding: 'utf8',
    env: inheritAndCleanEnv(),
  });
  expect(result.status).toBe(0);
  const help = `${result.stdout}${result.stderr}`;
  expect(help).toContain('--allow-process-shutdown');
  expect(help).toContain('allow the HTTP process-shutdown route');
  expect(help).toContain('terminate this process');
});

"""
text = text.replace(marker, help_test + marker, 1)
path.write_text(text, encoding="utf-8")
