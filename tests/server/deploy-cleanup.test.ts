import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const shell =
  process.platform === "win32" ? "C:/Program Files/Git/bin/sh.exe" : "sh";

const dockerBoundary = `
      cd "$(dirname "$1")/.."
      log="$PWD/docker.log"
      scenario="$2"
      git() { return 0; }
      docker() {
        printf '%s\\n' "$*" >> "$log"
        case "$*" in
          'image ls '*) printf '%s\\n' sha256:migrate-current sha256:migrate-old ;;
          *'build --pull '*) [ "$scenario" != build-fails ] || return 22 ;;
          *'run --rm migrate'|*'pnpm exec prisma migrate deploy'*)
            [ "$scenario" != migration-fails ] || return 23 ;;
          *'up -d --no-deps --wait '*|*'up -d --no-build '*)
            [ "$scenario" != restart-fails ] || return 24 ;;
          *'prisma-production-data-check'*)
            if [ "$scenario" = postcheck-fails ] && [ "$(grep -c prisma-production-data-check "$log")" -eq 2 ]; then
              return 25
            fi ;;
          'image rm '*) [ "$scenario" != image-in-use ] || return 26 ;;
        esac
        return 0
      }
      export APP_VERSION=test GIT_SHA=test GIT_BRANCH=test GIT_DIRTY=false BUILD_TIME=test
      export ENV_FILE=missing.env COMPOSE_FILE='custom compose.yml' COMPOSE_PROJECT_NAME=cleanup-test
      export CLI_RELEASES_BUILD_DURING_DEPLOY=false CLI_RELEASES_SOURCE_DIR=
      . "$1"
    `;

function deploy(scenario = "") {
  const directory = mkdtempSync(path.join(tmpdir(), "deploy-cleanup-"));
  mkdirSync(path.join(directory, "scripts"));
  copyFileSync("scripts/deploy.sh", path.join(directory, "scripts/deploy.sh"));
  writeFileSync(path.join(directory, "scripts/backup-postgres.sh"), "exit 0\n");
  const script = path
    .join(directory, "scripts/deploy.sh")
    .replaceAll("\\", "/");
  try {
    const result = spawnSync(
      shell,
      ["-c", dockerBoundary, script, script, scenario],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(result.error).toBeUndefined();
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      commands: readFileSync(path.join(directory, "docker.log"), "utf8")
        .trim()
        .split("\n"),
    };
  } finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) {
      throw new Error(
        "Refusing cleanup outside the system temporary directory",
      );
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("deployment migration cleanup", () => {
  it("removes only migration resources after the final successful verification", () => {
    const result = deploy();
    expect(result.status, result.output).toBe(0);
    const cleanup = result.commands.indexOf(
      "compose -f custom compose.yml rm -f migrate",
    );
    expect(cleanup).toBeGreaterThan(0);
    const checks = result.commands.map((command, index) =>
      /production-data-check|up -d --no-build|up -d --no-deps --wait/.test(
        command,
      )
        ? index
        : -1,
    );
    expect(cleanup).toBeGreaterThan(Math.max(...checks));
    expect(result.commands).toContain(
      "image ls -q --filter label=com.docker.compose.project=cleanup-test --filter label=com.docker.compose.service=migrate",
    );
    expect(
      result.commands.filter((command) => command.startsWith("image rm ")),
    ).toEqual([
      "image rm sha256:migrate-current",
      "image rm sha256:migrate-old",
    ]);
  });

  it.each([
    ["build-fails", 22],
    ["migration-fails", 23],
    ["restart-fails", 24],
  ])("preserves migration resources when %s", (scenario, code) => {
    const result = deploy(String(scenario));
    expect(result.status, result.output).toBe(code);
    expect(result.commands.some((command) => / rm /.test(command))).toBe(false);
    expect(result.output).not.toContain("Deploy completed successfully.");
  });

  it("preserves migration resources after a failed final data check", () => {
    const result = deploy("postcheck-fails");
    expect(result.status, result.output).toBe(25);
    expect(result.commands.some((command) => / rm /.test(command))).toBe(false);
  });

  it("does not force-remove an image still referenced elsewhere", () => {
    const result = deploy("image-in-use");
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("WARNING");
    expect(
      result.commands.some(
        (command) =>
          command.startsWith("image rm ") && /--force| -f /.test(command),
      ),
    ).toBe(false);
  });
});
