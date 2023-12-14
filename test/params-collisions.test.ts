import { assert, test } from "vitest"
import * as Router from "../src/index.js"

test("should setup parametric and regexp node", t => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar", 1)
  router.on("GET", "/foo/:bar(123)", 2)

  assert.strictEqual(router.find("GET", "/foo/value")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/123")?.handler, 2)
})

test("should setup parametric and multi-parametric node", t => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar", 1)
  router.on("GET", "/foo/:bar.png", 2)

  assert.strictEqual(router.find("GET", "/foo/value")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/value.png")?.handler, 2)
})

test("should throw when set upping two parametric nodes", t => {
  const router = Router.make<number>()
  router.on("GET", "/foo/:bar", 1)
  assert.throws(() => router.on("GET", "/foo/:baz", 2))
})

test("should throw when set upping two regexp nodes", t => {
  const router = Router.make<number>()
  router.on("GET", "/foo/:bar(123)", 1)
  assert.throws(() => router.on("GET", "/foo/:bar(456)", 2))
})

test("should set up two parametric nodes with static ending", t => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar.png", 1)
  router.on("GET", "/foo/:bar.jpeg", 2)

  assert.strictEqual(router.find("GET", "/foo/value.png")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/value.jpeg")?.handler, 2)
})

test("should set up two regexp nodes with static ending", t => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar(123).png", 1)
  router.on("GET", "/foo/:bar(456).jpeg", 2)

  assert.strictEqual(router.find("GET", "/foo/123.png")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/456.jpeg")?.handler, 2)
})

test("node with longer static suffix should have higher priority", t => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar.png", 1)
  router.on("GET", "/foo/:bar.png.png", 2)

  assert.strictEqual(router.find("GET", "/foo/value.png")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/value.png.png")?.handler, 2)
})

test("node with longer static suffix should have higher priority", t => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar.png.png", 2)
  router.on("GET", "/foo/:bar.png", 1)

  assert.strictEqual(router.find("GET", "/foo/value.png")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/value.png.png")?.handler, 2)
})

test("should set up regexp node and node with static ending", t => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar(123)", 1)
  router.on("GET", "/foo/:bar(123).jpeg", 2)

  assert.strictEqual(router.find("GET", "/foo/123")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/123.jpeg")?.handler, 2)
})
