import { assert, test } from "vitest"
import * as Router from "../src/index.js"

test("path params match", t => {
  const router = Router.make<1 | 2 | "c" | "param">()

  router.on("GET", "/ab1", 1)
  router.on("GET", "/ab2", 2)
  router.on("GET", "/ac", "c")
  router.on("GET", "/:pam", "param")

  assert.strictEqual(router.find("GET", "/ab1")?.handler, 1)
  assert.strictEqual(router.find("GET", "/ab1/")?.handler, 1)
  assert.strictEqual(router.find("GET", "//ab1")?.handler, 1)
  assert.strictEqual(router.find("GET", "//ab1//")?.handler, 1)
  assert.strictEqual(router.find("GET", "/ab2")?.handler, 2)
  assert.strictEqual(router.find("GET", "/ab2/")?.handler, 2)
  assert.strictEqual(router.find("GET", "//ab2")?.handler, 2)
  assert.strictEqual(router.find("GET", "//ab2//")?.handler, 2)
  assert.strictEqual(router.find("GET", "/ac")?.handler, "c")
  assert.strictEqual(router.find("GET", "/ac/")?.handler, "c")
  assert.strictEqual(router.find("GET", "//ac")?.handler, "c")
  assert.strictEqual(router.find("GET", "//ac//")?.handler, "c")
  assert.strictEqual(router.find("GET", "/foo")?.handler, "param")
  assert.strictEqual(router.find("GET", "/foo/")?.handler, "param")
  assert.strictEqual(router.find("GET", "//foo")?.handler, "param")
  assert.strictEqual(router.find("GET", "//foo//")?.handler, "param")
  assert.deepStrictEqual(router.find("GET", "/abcdef"), {
    handler: "param",
    params: { pam: "abcdef" },
    searchParams: {},
  })
  assert.deepStrictEqual(router.find("GET", "/abcdef/"), {
    handler: "param",
    params: { pam: "abcdef" },
    searchParams: {},
  })
  assert.deepStrictEqual(router.find("GET", "//abcdef"), {
    handler: "param",
    params: { pam: "abcdef" },
    searchParams: {},
  })
})
