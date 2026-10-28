import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { Flags } from "./arguments.js";
import { CliError } from "./errors.js";
type Profile = Record<string, string>;
type Config = { current?: string; profiles: Record<string, Profile> };
const keys: Record<string, string> = {
  domain: "YUNXIAO_DOMAIN",
  "organization-id": "YUNXIAO_ORGANIZATION_ID",
  edition: "YUNXIAO_EDITION",
  "project-ids": "YUNXIAO_PROJECT_IDS",
  category: "YUNXIAO_WORKITEM_CATEGORIES",
};
export function configPath(f: Flags, env: NodeJS.ProcessEnv): string {
  return String(
    f.config ??
      env.YUNXIAO_CONFIG ??
      join(
        env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
        "yunxiao",
        "config.json",
      ),
  );
}
async function readConfig(file: string): Promise<Config> {
  try {
    const c = JSON.parse(await readFile(file, "utf8"));
    if (
      !c ||
      !c.profiles ||
      typeof c.profiles !== "object" ||
      Array.isArray(c.profiles)
    )
      throw Error();
    for (const [name, p] of Object.entries(c.profiles)) {
      if (!name || !p || typeof p !== "object" || Array.isArray(p))
        throw Error();
      for (const [k, v] of Object.entries(p))
        if (
          ![...Object.keys(keys), "token-env"].includes(k) ||
          typeof v !== "string"
        )
          throw Error();
    }
    if (
      c.current !== undefined &&
      (typeof c.current !== "string" || !Object.hasOwn(c.profiles, c.current))
    )
      throw Error();
    return c;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { profiles: {} };
    throw new CliError(
      "INVALID_CONFIG",
      "Invalid configuration file; expected profiles with supported string fields.",
    );
  }
}
export async function resolveConfig(
  f: Flags,
  env: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv> {
  const c = await readConfig(configPath(f, env));
  const name = String(f.profile ?? env.YUNXIAO_PROFILE ?? c.current ?? "");
  if (!name) return { ...env };
  if (!Object.hasOwn(c.profiles, name))
    throw new CliError("INVALID_CONFIG", `Profile not found: ${name}`);
  const p = c.profiles[name];
  const result: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(keys)) if (p[k]) result[v] = p[k];
  if (p["token-env"]) result.YUNXIAO_TOKEN = env[p["token-env"]];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) result[k] = v;
  return result;
}
export async function configCommand(
  command: string,
  name: string | undefined,
  f: Flags,
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  const file = configPath(f, env);
  const c = await readConfig(file);
  if (command === "list")
    return Object.keys(c.profiles).map((name) => ({
      name,
      current: name === c.current,
    }));
  if (command === "show") {
    const selected = String(
      f.profile ?? env.YUNXIAO_PROFILE ?? c.current ?? "",
    );
    if (!Object.hasOwn(c.profiles, selected))
      throw new CliError("INVALID_CONFIG", "Select an existing profile.");
    return { name: selected, ...c.profiles[selected] };
  }
  if (
    !name ||
    !/^[-\w.]+$/.test(name) ||
    ["__proto__", "constructor", "prototype"].includes(name)
  )
    throw new CliError("INVALID_CONFIG", "Invalid profile name.");
  if (command === "use") {
    if (!Object.hasOwn(c.profiles, name))
      throw new CliError("INVALID_CONFIG", `Profile not found: ${name}`);
    c.current = name;
  } else if (command === "set") {
    if (f.token !== undefined)
      throw new CliError(
        "INVALID_CONFIG",
        "Use --token-env to reference a credential environment variable.",
      );
    const p = { ...(Object.hasOwn(c.profiles, name) ? c.profiles[name] : {}) };
    for (const k of [...Object.keys(keys), "token-env"])
      if (f[k] !== undefined) p[k] = String(f[k]);
    if (p["token-env"] && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p["token-env"]))
      throw new CliError("INVALID_CONFIG", "Invalid --token-env.");
    c.profiles[name] = p;
  }
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(c, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temp, file);
  return { file, profile: name, current: c.current };
}
