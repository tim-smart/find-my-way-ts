import { assert, test } from "vitest"
import * as Router from "../src/index.js"

test("should sanitize the url - query", t => {
  const router = Router.make<boolean>()
  router.on("GET", "/test", true)
  assert.deepStrictEqual(
    router.find("GET", "/test?hello=world")?.searchParams,
    { hello: "world" },
  )
})

test("should sanitize the url - hash", t => {
  const router = Router.make<boolean>()

  router.on("GET", "/test", true)

  assert.deepStrictEqual(router.find("GET", "/test#hello")?.searchParams, {
    hello: "",
  })
})

test("handles path and query separated by ;", t => {
  const router = Router.make<boolean>()
  router.on("GET", "/test", true)
  assert.deepStrictEqual(
    router.find("GET", "/test;jsessionid=123456")?.searchParams,
    { jsessionid: "123456" },
  )
})
