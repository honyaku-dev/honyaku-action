import * as core from "@actions/core"
import createClient from "openapi-fetch"
import type { paths } from "@/generated/openapi/v1"
import { basename } from "path"
import path from "node:path"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { setTimeout } from "timers/promises"
import { execSync } from "child_process"
import AdmZip from "adm-zip"
import locales from "@/locales.json"

const POLL_INTERVAL_MS = 10_000

interface Locale {
  id: string
  name: string
  endonym: string
  bcp47: string | null
}

interface LockFile {
  sha256: string
  analysisHistoryId: string
}

function handle<T extends { data?: unknown; error?: unknown }>(response: T): Exclude<T["data"], null | undefined> {
  if (response.error) {
    throw new Error(`API error: ${JSON.stringify(response.error)}`)
  }

  return (response.data ?? {}) as Exclude<T["data"], null | undefined>
}

async function main() {
  // Prepare
  const sourceFile = core.getInput("source-file")
  const outputDir = core.getInput("output-dir")
  const baseUrl = core.getInput("base-url")
  const apiKey = core.getInput("api-key")
  const customPrompt = core.getInput("custom-prompt")
  const targets = core
    .getInput("targets")
    .split(",")
    .map((s) => s.split(":").map((t) => t.trim()))
    .flatMap(([id, name]) => (id === "all" ? locales.map((locale) => [locale.id, name]) : [[id, name]]))

  const client = createClient<paths>({ baseUrl, headers: { "X-Api-Key": apiKey } })

  // Check if translation is required
  const source = readFileSync(path.join(process.cwd(), sourceFile))
  const sha256 = createHash("sha256").update(source).digest("hex")

  const lockFile = path.join(process.cwd(), "honyaku-lock.json")

  let existingAnalysisHistoryId: string | null = null
  if (existsSync(lockFile)) {
    const data = JSON.parse(readFileSync(lockFile, "utf-8")) as LockFile
    existingAnalysisHistoryId = data.analysisHistoryId

    if (data.sha256 === sha256) return
  }

  // Request file upload URL and fields
  const { uploadedFileId, fields, url } = handle(await client.POST("/files", { body: { name: basename(sourceFile) } }))

  // Upload file to S3
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value)
  }
  form.append("file", new Blob([source]))
  const fileUploadResponse = await fetch(url, { method: "POST", body: form })
  if (!fileUploadResponse.ok) {
    throw new Error(`Failed to upload file: ${fileUploadResponse.statusText}`)
  }

  // Decompile file
  const { analysisResultId, analysisHistoryId } = handle(
    await client.POST("/decompilations", {
      body: { uploadedFileId, analysisHistoryId: existingAnalysisHistoryId },
    }),
  )

  // Queue translation job
  const targetLocales = targets.map(([localeId, name]): [Locale, string] => {
    const locale = locales.find((l) => l.id === localeId)
    if (!locale) {
      throw new Error(`Invalid locale ID: ${localeId}`)
    }
    const fileName = name!.replace("{id}", locale.id).replace("{ID}", locale.id.toUpperCase())
    return [locale, fileName]
  })

  const { jobId } = handle(
    await client.POST("/analysis/{analysisResultId}/entry-translations", {
      params: {
        path: {
          analysisResultId,
        },
      },
      body: {
        customPrompt,
        entries: targetLocales.map(([locale, name]) => ({
          locale: locale!.id,
          source: basename(sourceFile),
          name,
        })),
      },
    }),
  )

  let status = "unknown"
  while (status != "completed") {
    await setTimeout(POLL_INTERVAL_MS)
    const result = handle(
      await client.GET("/analysis/{analysisResultId}/entry-translations/{jobId}", {
        params: {
          path: {
            analysisResultId,
            jobId,
          },
        },
      }),
    )

    status = result.status
    core.info(`Translation job status: ${status}, remaining: ${result.remaining}`)

    if (status === "failed") {
      throw new Error("Translation job failed")
    }
  }

  // Export translated files
  const { url: exportUrl } = handle(
    await client.POST("/analysis/{analysisResultId}/exports", {
      params: {
        path: {
          analysisResultId,
        },
      },
    }),
  )

  const zipResponse = await fetch(exportUrl)
  if (!zipResponse.ok) {
    throw new Error(`Failed to download export zip: ${zipResponse.statusText}`)
  }

  const zipBuffer = Buffer.from(await zipResponse.arrayBuffer())
  const zip = new AdmZip(zipBuffer)
  for (const entry of zip.getEntries()) {
    if (entry.entryName.endsWith(basename(sourceFile))) continue
    zip.extractEntryTo(entry, outputDir, false, true)
  }

  // Update lock file
  writeFileSync(lockFile, JSON.stringify({ sha256, analysisHistoryId }, null, 2) + "\n")

  // Commit changes
  execSync("git config user.name github-actions[bot]", { stdio: "inherit" })
  execSync("git config user.email 41898282+github-actions[bot]@users.noreply.github.com", { stdio: "inherit" })
  execSync(`git add ${JSON.stringify(lockFile)} ${JSON.stringify(outputDir)}`, { stdio: "inherit" })
  execSync('git commit -m "chore: update translations"', { stdio: "inherit" })
  execSync("git pull --rebase", { stdio: "inherit" })
  execSync("git push", { stdio: "inherit" })
}

main()
  .then(() => {
    core.info("Translation completed successfully")
  })
  .catch((error) => {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed("An unknown error occurred")
    }
  })
