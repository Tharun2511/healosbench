import { Hono } from "hono"
import { resolve } from "path"

const DATA_DIR = resolve(import.meta.dir, "../../../../data")

export const transcriptsRouter = new Hono()

// Returns the gold (correct) answer JSON for a transcript ID
transcriptsRouter.get("/:id/gold", async (c) => {
  const id = c.req.param("id")
  const file = Bun.file(resolve(DATA_DIR, "gold", `${id}.json`))
  if (!(await file.exists())) return c.json({ error: "Not found" }, 404)
  return c.json(await file.json())
})

// Returns the raw transcript text for a transcript ID
transcriptsRouter.get("/:id/text", async (c) => {
  const id = c.req.param("id")
  const file = Bun.file(resolve(DATA_DIR, "transcripts", `${id}.txt`))
  if (!(await file.exists())) return c.json({ error: "Not found" }, 404)
  return c.text(await file.text())
})
