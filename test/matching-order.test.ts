import { assert, test } from "vitest"
import * as Router from "../src/index.js"

test("Matching order", () => {
  const router = Router.make<boolean>()

  router.on("GET", "/foo/bar/*", true)
  router.on("GET", "/foo/:param/static", true)

  assert.deepStrictEqual(router.find("GET", "/foo/bar/static")?.params, {
    "*": "static",
  })
  assert.deepStrictEqual(router.find("GET", "/foo/value/static")?.params, {
    param: "value",
  })
})
