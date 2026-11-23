// Roda o vitest pelo caminho canônico do disco.
//
// No Windows, o npm monta o caminho do binário a partir do cwd. Se o terminal
// abriu a pasta como `c:\...` (minúsculo, padrão do VS Code e do Git Bash), o
// vitest carrega o próprio runner como `c:/...`, mas o Vite resolve o
// `import "vitest"` dos testes como `C:/...`. Ficam duas instâncias do runner e
// todo `describe` falha com "Cannot read properties of undefined (reading 'config')".
// `realpathSync.native` devolve a letra do drive como está no disco (`C:`).
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const bin = realpathSync.native(fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)));
const cwd = realpathSync.native(process.cwd());

const { status, signal, error } = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
if (error) throw error;
if (signal) process.kill(process.pid, signal);
process.exit(status ?? 1);
