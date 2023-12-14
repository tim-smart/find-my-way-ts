import { assert, test } from "vitest"
import * as Router from "../src/index.js"

test("route with matching regex", t => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)", true)
  assert.deepStrictEqual(router.find("GET", "/test/12")?.handler, true)
})

test("route without matching regex", t => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)", true)
  assert.isUndefined(router.find("GET", "/test/test"))
})

test("route with an extension regex 2", t => {
  const router = Router.make<number>()

  router.on("GET", "/test/S/:file(^\\S+).png", 1)
  router.on("GET", "/test/D/:file(^\\D+).png", 2)

  assert.strictEqual(router.find("GET", "/test/S/foo.png")?.handler, 1)
  assert.strictEqual(router.find("GET", "/test/D/foo.png")?.handler, 2)
})

test("nested route with matching regex", t => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)/hello", true)
  assert.deepStrictEqual(router.find("GET", "/test/12/hello")?.handler, true)
})

test("mixed nested route with matching regex", t => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)/hello/:world", true)
  assert.deepStrictEqual(router.find("GET", "/test/12/hello/world")?.params, {
    id: "12",
    world: "world",
  })
})

test("mixed nested route with double matching regex", t => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)/hello/:world(^\\d+$)", true)
  assert.deepStrictEqual(router.find("GET", "/test/12/hello/15")?.params, {
    id: "12",
    world: "15",
  })
})

test("mixed nested route without double matching regex", t => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)/hello/:world(^\\d+$)", true)
  assert.isUndefined(router.find("GET", "/test/12/hello/test"))
})

test("route with an extension regex", t => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:file(^\\d+).png", true)
  assert.deepStrictEqual(router.find("GET", "/test/12.png")?.handler, true)
})

test("route with an extension regex - no match", t => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:file(^\\d+).png", true)
  assert.isUndefined(router.find("GET", "/test/aa.png"))
})

test("safe decodeURIComponent", t => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)", true)
  assert.isUndefined(router.find("GET", '/test/hel%"Flo'))
})
