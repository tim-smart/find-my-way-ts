import * as Router from "../index.js"
import * as QS from "../QueryString.js"

const FULL_PATH_REGEXP = /^https?:\/\/.*?\//
const OPTIONAL_PARAM_REGEXP = /(\/:[^/()]*?)\?(\/?)/

interface Route<A = unknown> {
  readonly method: string
  readonly path: Router.PathInput
  readonly pattern: string
  readonly handler: A
  readonly params: ReadonlyArray<string>
}

/** @internal */
export const make = <A>(
  options: Partial<Router.RouterConfig> = {},
): Router.Router<A> => new RouterImpl(options)

class RouterImpl<A> implements Router.Router<A> {
  constructor(options: Partial<Router.RouterConfig> = {}) {
    this.options = {
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: true,
      caseSensitive: false,
      maxParamLength: 100,
      ...options,
    }
  }

  readonly options: Router.RouterConfig
  routes: Array<Route> = []
  trees: Record<string, StaticNode> = {}

  on(
    method: string | Iterable<string>,
    path: Router.PathInput,
    handler: A,
  ): void {
    const optionalParamMatch = path.match(OPTIONAL_PARAM_REGEXP)
    if (optionalParamMatch && optionalParamMatch.index !== undefined) {
      assert(
        path.length === optionalParamMatch.index + optionalParamMatch[0].length,
        "Optional Parameter needs to be the last parameter of the path",
      )

      const pathFull = path.replace(
        OPTIONAL_PARAM_REGEXP,
        "$1$2",
      ) as Router.PathInput
      const pathOptional = path.replace(
        OPTIONAL_PARAM_REGEXP,
        "$2",
      ) as Router.PathInput

      this.on(method, pathFull, handler)
      this.on(method, pathOptional, handler)
      return
    }

    if (this.options.ignoreDuplicateSlashes) {
      path = removeDuplicateSlashes(path)
    }

    if (this.options.ignoreTrailingSlash) {
      path = trimLastSlash(path)
    }

    const methods = typeof method === "string" ? [method] : method
    for (const method of methods) {
      this._on(method, path, handler)
    }
  }

  all(path: Router.PathInput, handler: A) {
    this.on(httpMethods, path, handler)
  }

  private _on(method: string, path: Router.PathInput, handler: A): void {
    if (this.trees[method] === undefined) {
      this.trees[method] = new StaticNode("/")
    }

    let pattern = path
    if (pattern === "*" && this.trees[method].prefix.length !== 0) {
      const currentRoot = this.trees[method]
      this.trees[method] = new StaticNode("")
      this.trees[method].staticChildren["/"] = currentRoot
    }

    let parentNodePathIndex = this.trees[method].prefix.length
    let currentNode: Node = this.trees[method]

    const params = []
    for (let i = 0; i <= pattern.length; i++) {
      if (pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) === 58) {
        // It's a double colon
        i++
        continue
      }

      const isParametricNode =
        pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) !== 58
      const isWildcardNode = pattern.charCodeAt(i) === 42

      if (
        isParametricNode ||
        isWildcardNode ||
        (i === pattern.length && i !== parentNodePathIndex)
      ) {
        let staticNodePath = pattern.slice(parentNodePathIndex, i)
        if (!this.options.caseSensitive) {
          staticNodePath = staticNodePath.toLowerCase()
        }
        staticNodePath = staticNodePath.split("::").join(":")
        staticNodePath = staticNodePath.split("%").join("%25")
        // add the static part of the route to the tree
        currentNode = (currentNode as StaticNode).createStaticChild(
          staticNodePath,
        )
      }

      if (isParametricNode) {
        let isRegexNode = false
        const regexps = []

        let lastParamStartIndex = i + 1
        for (let j = lastParamStartIndex; ; j++) {
          const charCode = pattern.charCodeAt(j)

          const isRegexParam = charCode === 40
          const isStaticPart = charCode === 45 || charCode === 46
          const isEndOfNode = charCode === 47 || j === pattern.length

          if (isRegexParam || isStaticPart || isEndOfNode) {
            const paramName = pattern.slice(lastParamStartIndex, j)
            params.push(paramName)

            isRegexNode = isRegexNode || isRegexParam || isStaticPart

            if (isRegexParam) {
              const endOfRegexIndex = getClosingParenthensePosition(pattern, j)
              const regexString = pattern.slice(j, endOfRegexIndex + 1)

              regexps.push(trimRegExpStartAndEnd(regexString))

              j = endOfRegexIndex + 1
            } else {
              regexps.push("(.*?)")
            }

            const staticPartStartIndex = j
            for (; j < pattern.length; j++) {
              const charCode = pattern.charCodeAt(j)
              if (charCode === 47) break
              if (charCode === 58) {
                const nextCharCode = pattern.charCodeAt(j + 1)
                if (nextCharCode === 58) j++
                else break
              }
            }

            let staticPart = pattern.slice(staticPartStartIndex, j)
            if (staticPart) {
              staticPart = staticPart.split("::").join(":")
              staticPart = staticPart.split("%").join("%25")
              regexps.push(escapeRegExp(staticPart))
            }

            lastParamStartIndex = j + 1

            if (
              isEndOfNode ||
              pattern.charCodeAt(j) === 47 ||
              j === pattern.length
            ) {
              const nodePattern = isRegexNode ? "()" + staticPart : staticPart
              const nodePath = pattern.slice(i, j)

              pattern = pattern.slice(0, i + 1) + nodePattern + pattern.slice(j)
              i += nodePattern.length

              const regex = isRegexNode
                ? new RegExp("^" + regexps.join("") + "$")
                : undefined
              currentNode = (currentNode as StaticNode).createParametricChild(
                regex,
                staticPart,
                nodePath,
              )
              parentNodePathIndex = i + 1
              break
            }
          }
        }
      } else if (isWildcardNode) {
        // add the wildcard parameter
        params.push("*")
        currentNode = (currentNode as StaticNode).createWildcardChild()
        parentNodePathIndex = i + 1

        if (i !== pattern.length - 1) {
          throw new Error("Wildcard must be the last character in the route")
        }
      }
    }

    if (!this.options.caseSensitive) {
      pattern = pattern.toLowerCase() as Router.PathInput
    }

    if (pattern === "*") {
      pattern = "/*"
    }

    for (const existRoute of this.routes) {
      if (existRoute.method === method && existRoute.pattern === pattern) {
        throw new Error(
          `Method '${method}' already declared for route '${pattern}'`,
        )
      }
    }

    const route = { method, path, pattern, params, handler }
    this.routes.push(route)
    currentNode.addRoute(route)
  }

  has(method: string, path: string): boolean {
    const node = this.trees[method]
    if (node === undefined) {
      return false
    }

    const staticNode = node.getStaticChild(path)
    if (staticNode === undefined) {
      return false
    }

    return staticNode.isLeafNode
  }

  find(method: string, path: string): Router.FindResult<A> | undefined {
    let currentNode: Node | undefined = this.trees[method]
    if (currentNode === undefined) return undefined

    if (path.charCodeAt(0) !== 47) {
      // 47 is '/'
      path = path.replace(FULL_PATH_REGEXP, "/")
    }

    // This must be run before sanitizeUrl as the resulting function
    // .sliceParameter must be constructed with same URL string used
    // throughout the rest of this function.
    if (this.options.ignoreDuplicateSlashes) {
      path = removeDuplicateSlashes(path)
    }

    let sanitizedUrl
    let querystring
    let shouldDecodeParam

    try {
      sanitizedUrl = safeDecodeURI(path)
      path = sanitizedUrl.path
      querystring = sanitizedUrl.querystring
      shouldDecodeParam = sanitizedUrl.shouldDecodeParam
    } catch (error) {
      return undefined
    }

    if (this.options.ignoreTrailingSlash) {
      path = trimLastSlash(path)
    }

    const originPath = path

    if (this.options.caseSensitive === false) {
      path = path.toLowerCase()
    }

    const maxParamLength = this.options.maxParamLength

    let pathIndex = (currentNode as StaticNode).prefix.length
    const params = []
    const pathLen = path.length

    const brothersNodesStack: Array<BrotherNode> = []

    while (true) {
      if (pathIndex === pathLen && currentNode.isLeafNode) {
        const handle = currentNode.handlerStorage?.find()
        if (handle !== undefined) {
          return {
            handler: handle.handler as A,
            params: handle.createParams(params),
            searchParams: QS.parse(querystring),
          } as const
        }
      }

      let node: Node | undefined = currentNode.getNextNode(
        path,
        pathIndex,
        brothersNodesStack,
        params.length,
      )

      if (node === undefined) {
        if (brothersNodesStack.length === 0) {
          return undefined
        }

        const brotherNodeState = brothersNodesStack.pop()!
        pathIndex = brotherNodeState.brotherPathIndex
        params.splice(brotherNodeState.paramsCount)
        node = brotherNodeState.brotherNode
      }

      currentNode = node

      // static route
      if (currentNode._tag === "StaticNode") {
        pathIndex += currentNode.prefix.length
        continue
      }

      if (currentNode._tag === "WildcardNode") {
        let param = originPath.slice(pathIndex)
        if (shouldDecodeParam) {
          param = safeDecodeURIComponent(param)
        }

        params.push(param)
        pathIndex = pathLen
        continue
      }

      if (currentNode._tag === "ParametricNode") {
        let paramEndIndex = originPath.indexOf("/", pathIndex)
        if (paramEndIndex === -1) {
          paramEndIndex = pathLen
        }

        let param = originPath.slice(pathIndex, paramEndIndex)
        if (shouldDecodeParam) {
          param = safeDecodeURIComponent(param)
        }

        if (currentNode.regex !== undefined) {
          const matchedParameters: RegExpExecArray | null =
            currentNode.regex.exec(param)
          if (matchedParameters === null) continue

          for (let i = 1; i < matchedParameters.length; i++) {
            const matchedParam: string = matchedParameters[i]
            if (matchedParam.length > maxParamLength) {
              return undefined
            }
            params.push(matchedParam)
          }
        } else {
          if (param.length > maxParamLength) {
            return undefined
          }
          params.push(param)
        }

        pathIndex = paramEndIndex
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Handler storage
// ----------------------------------------------------------------------------

interface Handler {
  readonly params: ReadonlyArray<string>
  readonly handler: unknown
  readonly createParams: (
    paramsArray: ReadonlyArray<string>,
  ) => Record<string, string>
}

class HandlerStorage {
  readonly handlers: Array<Handler> = []
  unconstrainedHandler: Handler | undefined

  find() {
    return this.unconstrainedHandler
  }

  add(route: Route) {
    const handler: Handler = {
      params: route.params,
      handler: route.handler,
      createParams: compileCreateParams(route.params),
    }
    this.handlers.push(handler)
    this.unconstrainedHandler = this.handlers[0]
  }
}

// ----------------------------------------------------------------------------
// Nodes
// ----------------------------------------------------------------------------

interface BrotherNode {
  readonly paramsCount: number
  readonly brotherPathIndex: number
  readonly brotherNode: Node
}

type Node = StaticNode | ParametricNode | WildcardNode

abstract class NodeBase {
  isLeafNode = false
  routes: Array<Route> | undefined
  handlerStorage: HandlerStorage | undefined

  addRoute(route: Route) {
    if (this.routes === undefined) {
      this.routes = [route]
    } else {
      this.routes.push(route)
    }

    if (this.handlerStorage === undefined) {
      this.handlerStorage = new HandlerStorage()
    }
    this.isLeafNode = true
    this.handlerStorage.add(route)
  }

  abstract getNextNode(
    path: string,
    pathIndex: number,
    nodeStack: any,
    paramsCount: number,
  ): Node | undefined
}

abstract class ParentNode extends NodeBase {
  readonly staticChildren: Record<string, StaticNode> = {}

  findStaticMatchingChild(
    path: string,
    pathIndex: number,
  ): StaticNode | undefined {
    const staticChild = this.staticChildren[path.charAt(pathIndex)]
    if (
      staticChild === undefined ||
      !staticChild.matchPrefix(path, pathIndex)
    ) {
      return undefined
    }
    return staticChild
  }

  getStaticChild(path: string, pathIndex = 0): StaticNode | undefined {
    if (path.length === pathIndex) {
      return this as any
    }

    const staticChild = this.findStaticMatchingChild(path, pathIndex)
    if (staticChild === undefined) {
      return undefined
    }

    return staticChild.getStaticChild(
      path,
      pathIndex + staticChild.prefix.length,
    )
  }

  createStaticChild(path: string): StaticNode {
    if (path.length === 0) {
      return this as any
    }

    let staticChild = this.staticChildren[path.charAt(0)]
    if (staticChild) {
      let i = 1
      for (; i < staticChild.prefix.length; i++) {
        if (path.charCodeAt(i) !== staticChild.prefix.charCodeAt(i)) {
          staticChild = staticChild.split(this, i)
          break
        }
      }
      return staticChild.createStaticChild(path.slice(i))
    }

    const label = path.charAt(0)
    this.staticChildren[label] = new StaticNode(path)
    return this.staticChildren[label]
  }
}

class StaticNode extends ParentNode {
  readonly _tag = "StaticNode"
  constructor(prefix: string) {
    super()
    this.setPrefix(prefix)
  }

  prefix!: string
  matchPrefix!: (path: string, pathIndex: number) => boolean
  readonly parametricChildren: Array<ParametricNode> = []

  wildcardChild: WildcardNode | undefined

  private setPrefix(prefix: string) {
    this.prefix = prefix

    if (prefix.length === 1) {
      this.matchPrefix = (_path, _pathIndex) => true
    } else {
      const len = prefix.length
      this.matchPrefix = function (path, pathIndex) {
        for (let i = 1; i < len; i++) {
          if (path.charCodeAt(pathIndex + i) !== this.prefix.charCodeAt(i)) {
            return false
          }
        }
        return true
      }
    }
  }

  getParametricChild(regex: RegExp | undefined): ParametricNode | undefined {
    if (regex === undefined) {
      return this.parametricChildren.find(child => child.isRegex === false)
    }

    const source = regex.source
    return this.parametricChildren.find(child => {
      if (child.regex === undefined) {
        return false
      }
      return child.regex.source === source
    })
  }

  createParametricChild(
    regex: RegExp | undefined,
    staticSuffix: string | undefined,
    nodePath: string,
  ) {
    let child = this.getParametricChild(regex)
    if (child !== undefined) {
      child.nodePaths.add(nodePath)
      return child
    }

    child = new ParametricNode(regex, staticSuffix, nodePath)
    this.parametricChildren.push(child)
    this.parametricChildren.sort((child1, child2) => {
      if (!child1.isRegex) return 1
      if (!child2.isRegex) return -1

      if (child1.staticSuffix === undefined) return 1
      if (child2.staticSuffix === undefined) return -1

      if (child2.staticSuffix.endsWith(child1.staticSuffix)) return 1
      if (child1.staticSuffix.endsWith(child2.staticSuffix)) return -1

      return 0
    })

    return child
  }

  createWildcardChild() {
    if (this.wildcardChild === undefined) {
      this.wildcardChild = new WildcardNode()
    }
    return this.wildcardChild
  }

  split(parentNode: ParentNode, length: number) {
    const parentPrefix = this.prefix.slice(0, length)
    const childPrefix = this.prefix.slice(length)

    this.setPrefix(childPrefix)

    const staticNode = new StaticNode(parentPrefix)
    staticNode.staticChildren[childPrefix.charAt(0)] = this
    parentNode.staticChildren[parentPrefix.charAt(0)] = staticNode

    return staticNode
  }

  getNextNode(
    path: string,
    pathIndex: number,
    nodeStack: Array<BrotherNode>,
    paramsCount: number,
  ): Node | undefined {
    let node: Node | undefined = this.findStaticMatchingChild(path, pathIndex)
    let parametricBrotherNodeIndex = 0

    if (node === undefined) {
      if (this.parametricChildren.length === 0) {
        return this.wildcardChild
      }

      node = this.parametricChildren[0]
      parametricBrotherNodeIndex = 1
    }

    if (this.wildcardChild !== undefined) {
      nodeStack.push({
        paramsCount,
        brotherPathIndex: pathIndex,
        brotherNode: this.wildcardChild,
      })
    }

    for (
      let i = this.parametricChildren.length - 1;
      i >= parametricBrotherNodeIndex;
      i--
    ) {
      nodeStack.push({
        paramsCount,
        brotherPathIndex: pathIndex,
        brotherNode: this.parametricChildren[i],
      })
    }

    return node
  }
}

class ParametricNode extends ParentNode {
  readonly _tag = "ParametricNode"
  constructor(
    readonly regex: RegExp | undefined,
    readonly staticSuffix: string | undefined,
    nodePath: string,
  ) {
    super()
    this.isRegex = !!regex
    this.nodePaths = new Set([nodePath])
  }

  readonly isRegex: boolean
  readonly nodePaths: Set<string>

  getNextNode(path: string, pathIndex: number) {
    return this.findStaticMatchingChild(path, pathIndex)
  }
}

class WildcardNode extends NodeBase {
  readonly _tag = "WildcardNode"
  getNextNode(
    _path: string,
    _pathIndex: number,
    _nodeStack: any,
    _paramsCount: number,
  ): Node | undefined {
    return undefined
  }
}

// --

interface Assert {
  (condition: any, message?: string): asserts condition
}
const assert: Assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

function removeDuplicateSlashes(path: string): Router.PathInput {
  return path.replace(/\/\/+/g, "/") as Router.PathInput
}

function trimLastSlash(path: string): Router.PathInput {
  if (path.length > 1 && path.charCodeAt(path.length - 1) === 47) {
    return path.slice(0, -1) as Router.PathInput
  }
  return path as Router.PathInput
}

function compileCreateParams(
  params: ReadonlyArray<string>,
): (paramsArray: ReadonlyArray<string>) => Record<string, string> {
  const len = params.length
  return function (paramsArray) {
    const paramsObject: Record<string, string> = {}
    for (let i = 0; i < len; i++) {
      paramsObject[params[i]] = paramsArray[i]
    }
    return paramsObject
  }
}

function getClosingParenthensePosition(path: string, idx: number) {
  // `path.indexOf()` will always return the first position of the closing parenthese,
  // but it's inefficient for grouped or wrong regexp expressions.
  // see issues #62 and #63 for more info

  let parentheses = 1

  while (idx < path.length) {
    idx++

    // ignore skipped chars
    if (path[idx] === "\\") {
      idx++
      continue
    }

    if (path[idx] === ")") {
      parentheses--
    } else if (path[idx] === "(") {
      parentheses++
    }

    if (!parentheses) return idx
  }

  throw new TypeError('Invalid regexp expression in "' + path + '"')
}

function trimRegExpStartAndEnd(regexString: string) {
  // removes chars that marks start "^" and end "$" of regexp
  if (regexString.charCodeAt(1) === 94) {
    regexString = regexString.slice(0, 1) + regexString.slice(2)
  }

  if (regexString.charCodeAt(regexString.length - 2) === 36) {
    regexString =
      regexString.slice(0, regexString.length - 2) +
      regexString.slice(regexString.length - 1)
  }

  return regexString
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// It must spot all the chars where decodeURIComponent(x) !== decodeURI(x)
// The chars are: # $ & + , / : ; = ? @
function decodeComponentChar(highCharCode: number, lowCharCode: number) {
  if (highCharCode === 50) {
    if (lowCharCode === 53) return "%"

    if (lowCharCode === 51) return "#"
    if (lowCharCode === 52) return "$"
    if (lowCharCode === 54) return "&"
    if (lowCharCode === 66) return "+"
    if (lowCharCode === 98) return "+"
    if (lowCharCode === 67) return ","
    if (lowCharCode === 99) return ","
    if (lowCharCode === 70) return "/"
    if (lowCharCode === 102) return "/"
    return undefined
  }
  if (highCharCode === 51) {
    if (lowCharCode === 65) return ":"
    if (lowCharCode === 97) return ":"
    if (lowCharCode === 66) return ";"
    if (lowCharCode === 98) return ";"
    if (lowCharCode === 68) return "="
    if (lowCharCode === 100) return "="
    if (lowCharCode === 70) return "?"
    if (lowCharCode === 102) return "?"
    return undefined
  }
  if (highCharCode === 52 && lowCharCode === 48) {
    return "@"
  }
  return undefined
}

function safeDecodeURI(path: string) {
  let shouldDecode = false
  let shouldDecodeParam = false

  let querystring = ""

  for (let i = 1; i < path.length; i++) {
    const charCode = path.charCodeAt(i)

    if (charCode === 37) {
      const highCharCode = path.charCodeAt(i + 1)
      const lowCharCode = path.charCodeAt(i + 2)

      if (decodeComponentChar(highCharCode, lowCharCode) === undefined) {
        shouldDecode = true
      } else {
        shouldDecodeParam = true
        // %25 - encoded % char. We need to encode one more time to prevent double decoding
        if (highCharCode === 50 && lowCharCode === 53) {
          shouldDecode = true
          path = path.slice(0, i + 1) + "25" + path.slice(i + 1)
          i += 2
        }
        i += 2
      }
      // Some systems do not follow RFC and separate the path and query
      // string with a `;` character (code 59), e.g. `/foo;jsessionid=123456`.
      // Thus, we need to split on `;` as well as `?` and `#`.
    } else if (charCode === 63 || charCode === 59 || charCode === 35) {
      querystring = path.slice(i + 1)
      path = path.slice(0, i)
      break
    }
  }
  const decodedPath = shouldDecode ? decodeURI(path) : path
  return { path: decodedPath, querystring, shouldDecodeParam } as const
}

function safeDecodeURIComponent(uriComponent: string) {
  const startIndex = uriComponent.indexOf("%")
  if (startIndex === -1) return uriComponent

  let decoded = ""
  let lastIndex = startIndex

  for (let i = startIndex; i < uriComponent.length; i++) {
    if (uriComponent.charCodeAt(i) === 37) {
      const highCharCode = uriComponent.charCodeAt(i + 1)
      const lowCharCode = uriComponent.charCodeAt(i + 2)

      const decodedChar = decodeComponentChar(highCharCode, lowCharCode)
      decoded += uriComponent.slice(lastIndex, i) + decodedChar

      lastIndex = i + 3
    }
  }
  return (
    uriComponent.slice(0, startIndex) + decoded + uriComponent.slice(lastIndex)
  )
}

const httpMethods = [
  "ACL",
  "BIND",
  "CHECKOUT",
  "CONNECT",
  "COPY",
  "DELETE",
  "GET",
  "HEAD",
  "LINK",
  "LOCK",
  "M-SEARCH",
  "MERGE",
  "MKACTIVITY",
  "MKCALENDAR",
  "MKCOL",
  "MOVE",
  "NOTIFY",
  "OPTIONS",
  "PATCH",
  "POST",
  "PROPFIND",
  "PROPPATCH",
  "PURGE",
  "PUT",
  "REBIND",
  "REPORT",
  "SEARCH",
  "SOURCE",
  "SUBSCRIBE",
  "TRACE",
  "UNBIND",
  "UNLINK",
  "UNLOCK",
  "UNSUBSCRIBE",
] as const
