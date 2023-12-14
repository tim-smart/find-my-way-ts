import { assert, test } from "vitest"
import * as Router from "../src/index.js"

test("Test route with optional parameter", t => {
  const router = Router.make<boolean>()

  router.on("GET", "/a/:param/b/:optional?", true)

  assert.deepStrictEqual(router.find("GET", "/a/foo-bar/b")?.params, {
    param: "foo-bar",
  })
  assert.deepStrictEqual(router.find("GET", "/a/foo-bar/b/foo")?.params, {
    param: "foo-bar",
    optional: "foo",
  })
})

test("Test for duplicate route with optional param", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/foo/:bar?", true)
  assert.throws(() => router.on("GET", "/foo", true))
})

test("Test for param with ? not at the end", t => {
  const router = Router.make<boolean>()

  assert.throws(() => router.on("GET", "/foo/:bar?/baz", true))
})

test("Multi parametric route with optional param", t => {
  const router = Router.make<boolean>()

  router.on("GET", "/a/:p1-:p2?", true)

  assert.deepStrictEqual(router.find("GET", "/a/foo-bar-baz")?.params, {
    p1: "foo",
    p2: "bar-baz",
  })
  assert.deepStrictEqual(router.find("GET", "/a")?.params, {})
})

test("Optional Parameter with ignoreTrailingSlash = true", t => {
  const router = Router.make<boolean>({
    ignoreTrailingSlash: true,
    ignoreDuplicateSlashes: false,
  })

  router.on("GET", "/test/hello/:optional?", true)

  assert.deepStrictEqual(router.find("GET", "/test/hello/")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/test/hello")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/test/hello/foo")?.params, {
    optional: "foo",
  })
  assert.deepStrictEqual(router.find("GET", "/test/hello/foo/")?.params, {
    optional: "foo",
  })
})

test("Optional Parameter with ignoreTrailingSlash = false", t => {
  const router = Router.make<boolean>({
    ignoreTrailingSlash: false,
    ignoreDuplicateSlashes: false,
  })

  router.on("GET", "/test/hello/:optional?", true)

  assert.deepStrictEqual(router.find("GET", "/test/hello/")?.params, {
    optional: "",
  })
  assert.deepStrictEqual(router.find("GET", "/test/hello")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/test/hello/foo")?.params, {
    optional: "foo",
  })
  assert.isUndefined(router.find("GET", "/test/hello/foo/"))
})

test("Optional Parameter with ignoreDuplicateSlashes = true", t => {
  const router = Router.make<boolean>({
    ignoreDuplicateSlashes: true,
  })

  router.on("GET", "/test/hello/:optional?", true)

  assert.deepStrictEqual(router.find("GET", "/test//hello")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/test/hello")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/test/hello/foo")?.params, {
    optional: "foo",
  })
  assert.deepStrictEqual(router.find("GET", "/test//hello//foo")?.params, {
    optional: "foo",
  })
})

test("Optional Parameter with ignoreDuplicateSlashes = false", t => {
  const router = Router.make<boolean>({
    ignoreDuplicateSlashes: false,
  })

  router.on("GET", "/test/hello/:optional?", true)

  assert.isUndefined(router.find("GET", "/test//hello"))
  assert.deepStrictEqual(router.find("GET", "/test/hello")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/test/hello/foo")?.params, {
    optional: "foo",
  })
  assert.isUndefined(router.find("GET", "/test//hello//foo"))
})
