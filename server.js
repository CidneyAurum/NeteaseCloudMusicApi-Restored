const fs = require('fs')
const path = require('path')
const express = require('express')
const request = require('./util/request')
const packageJSON = require('./package.json')
const exec = require('child_process').exec
const { cookieToJson } = require('./util/index')
const fileUpload = require('express-fileupload')
const decode = require('safe-decode-uri-component')

/**
 * The version check result.
 * @readonly
 * @enum {number}
 */
const VERSION_CHECK_RESULT = {
  FAILED: -1,
  NOT_LATEST: 0,
  LATEST: 1,
}

/**
 * @typedef {{
 *   identifier?: string,
 *   route: string,
 *   module: any
 * }} ModuleDefinition
 */

/**
 * @typedef {{
 *   port?: number,
 *   host?: string,
 *   checkVersion?: boolean,
 *   moduleDefs?: ModuleDefinition[]
 * }} NcmApiOptions
 */

/**
 * @typedef {{
 *   status: VERSION_CHECK_RESULT,
 *   ourVersion?: string,
 *   npmVersion?: string,
 * }} VersionCheckResult
 */

/**
 * @typedef {{
 *  server?: import('http').Server,
 * }} ExpressExtension
 */

/**
 * Get the module definitions dynamically.
 *
 * @param {string} modulesPath The path to modules (JS).
 * @param {Record<string, string>} [specificRoute] The specific route of specific modules.
 * @param {boolean} [doRequire] If true, require() the module directly.
 * Otherwise, print out the module path. Default to true.
 * @returns {Promise<ModuleDefinition[]>} The module definitions.
 *
 * @example getModuleDefinitions("./module", {"album_new.js": "/album/create"})
 */
async function getModulesDefinitions(
  modulesPath,
  specificRoute,
  doRequire = true,
) {
  const files = await fs.promises.readdir(modulesPath)
  const parseRoute = (/** @type {string} */ fileName) =>
    specificRoute && fileName in specificRoute
      ? specificRoute[fileName]
      : `/${fileName.replace(/\.js$/i, '').replace(/_/g, '/')}`

  const modules = files
    .reverse()
    .filter((file) => file.endsWith('.js'))
    .map((file) => {
      const identifier = file.split('.').shift()
      const route = parseRoute(file)
      const modulePath = path.join(modulesPath, file)
      const module = doRequire ? require(modulePath) : modulePath

      return { identifier, route, module }
    })

  return modules
}

/**
 * Check if the version of this API is latest.
 *
 * @returns {Promise<VersionCheckResult>} If true, this API is up-to-date;
 * otherwise, this API should be upgraded and you would
 * need to notify users to upgrade it manually.
 */
async function checkVersion() {
  return new Promise((resolve) => {
    exec('npm info NeteaseCloudMusicApi version', (err, stdout) => {
      if (!err) {
        let version = stdout.trim()

        /**
         * @param {VERSION_CHECK_RESULT} status
         */
        const resolveStatus = (status) =>
          resolve({
            status,
            ourVersion: packageJSON.version,
            npmVersion: version,
          })

        resolveStatus(
          packageJSON.version < version
            ? VERSION_CHECK_RESULT.NOT_LATEST
            : VERSION_CHECK_RESULT.LATEST,
        )
      } else {
        resolve({
          status: VERSION_CHECK_RESULT.FAILED,
        })
      }
    })
  })
}

/**
 * Construct the server of NCM API.
 *
 * @param {ModuleDefinition[]} [moduleDefs] Customized module definitions [advanced]
 * @returns {Promise<import("express").Express>} The server instance.
 */
async function consturctServer(moduleDefs) {
  const app = express()
  const allowedOrigins = new Set((process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',').map((origin) => origin.trim()).filter(Boolean))
  app.disable('x-powered-by')
  app.set('trust proxy', process.env.TRUST_PROXY === 'true')
  app.get('/healthz', (_, res) => res.json({ status: 'ok' }))

  /**
   * Serving static files
   */
  app.use(express.static(path.join(__dirname, 'public')))
  /**
   * CORS & Preflight request
   */
  app.use((req, res, next) => {
    {
      const origin = req.headers.origin
      let sameOrigin = false
      if (origin) {
        try {
          const value = new URL(origin)
          sameOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname)
            && value.origin === `${req.protocol}://${req.headers.host}`
        } catch (_) { /* Invalid origins are denied below. */ }
      }
      if (origin && (sameOrigin || allowedOrigins.has(origin))) {
        res.set({
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Origin': origin,
          'Vary': 'Origin',
        })
      } else if (origin) {
        return res.status(403).json({ code: 403, message: 'Origin is not allowed' })
      }
      res.set({
        'Access-Control-Allow-Headers': 'X-Requested-With,Content-Type',
        'Access-Control-Allow-Methods': 'PUT,POST,GET,DELETE,OPTIONS',
        'Content-Type': 'application/json; charset=utf-8',
      })
    }
    req.method === 'OPTIONS' ? res.status(204).end() : next()
  })

  /**
   * Cookie Parser
   */
  app.use((req, _, next) => {
    req.cookies = {}
    //;(req.headers.cookie || '').split(/\s*;\s*/).forEach((pair) => { //  Polynomial regular expression //
    ;(req.headers.cookie || '').split(';').forEach((pair) => {
      pair = pair.trim()
      let crack = pair.indexOf('=')
      if (crack < 1 || crack == pair.length - 1) return
      req.cookies[decode(pair.slice(0, crack)).trim()] = decode(
        pair.slice(crack + 1),
      ).trim()
    })
    next()
  })

  /**
   * Body Parser and File Upload
   */
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: false, limit: '1mb' }))

  app.use(fileUpload({ limits: { fileSize: 10 * 1024 * 1024, files: 1 }, abortOnLimit: true }))

  /**
   * Cache
   */
  // POST bodies and account cookies affect results; never share responses or
  // Set-Cookie headers across requests through a URL-only cache.

  /**
   * Special Routers
   */
  const special = {
    'daily_signin.js': '/daily_signin',
    'fm_trash.js': '/fm_trash',
    'personal_fm.js': '/personal_fm',
  }

  /**
   * Load every modules in this directory
   */
  const moduleDefinitions =
    moduleDefs ||
    (await getModulesDefinitions(path.join(__dirname, 'module'), special))

  for (const moduleDef of moduleDefinitions) {
    // Register the route.
    app.use(moduleDef.route, async (req, res) => {
      ;[req.query, req.body].forEach((item) => {
        if (typeof item.cookie === 'string') {
          item.cookie = cookieToJson(decode(item.cookie))
        }
      })

      let query = Object.assign(
        {},
        { cookie: req.cookies },
        req.query,
        req.body,
        req.files,
      )

      try {
        const moduleResponse = await moduleDef.module(query, (...params) => {
          // 参数注入客户端IP
          const obj = [...params]
          let ip = req.ip

          if (ip.substring(0, 7) == '::ffff:') {
            ip = ip.substring(7)
          }
          if (ip == '::1') {
            ip = global.cnIp
          }
          // console.log(ip)
          obj[3] = {
            ...obj[3],
            ip,
          }
          return request(...obj)
        })
        console.log('[OK]', req.method, moduleDef.route, moduleResponse.status)

        const cookies = moduleResponse.cookie
        if (!query.noCookie) {
          if (Array.isArray(cookies) && cookies.length > 0) {
            if (req.protocol === 'https') {
              // Try to fix CORS SameSite Problem
              res.append(
                'Set-Cookie',
                cookies.map((cookie) => {
                  return cookie + '; SameSite=None; Secure'
                }),
              )
            } else {
              res.append('Set-Cookie', cookies)
            }
          }
        }
        res.status(moduleResponse.status).send(moduleResponse.body)
      } catch (/** @type {*} */ moduleResponse) {
        console.log('[ERR]', req.method, moduleDef.route)
        if (!moduleResponse || !moduleResponse.body) {
          res.status(404).send({
            code: 404,
            data: null,
            msg: 'Not Found',
          })
          return
        }
        if (moduleResponse.body.code == '301')
          moduleResponse.body.msg = '需要登录'
        if (!query.noCookie) {
          if (Array.isArray(moduleResponse.cookie)) res.append('Set-Cookie', moduleResponse.cookie)
        }

        res.status(moduleResponse.status).send(moduleResponse.body)
      }
    })
  }

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error)
    const status = error && error.type === 'entity.too.large' ? 413 : 400
    res.status(status).json({ code: status, message: 'Invalid or oversized request' })
  })
  return app
}

/**
 * Serve the NCM API.
 * @param {NcmApiOptions} options
 * @returns {Promise<import('express').Express & ExpressExtension>}
 */
async function serveNcmApi(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 3000)
  const host = options.host ?? process.env.HOST ?? '127.0.0.1'
  if (!Number.isInteger(port) || port < 0 || port > 65535 || typeof host !== 'string' || !host) {
    throw new Error('Invalid HOST or PORT')
  }

  const checkVersionSubmission =
    options.checkVersion &&
    checkVersion().then(({ npmVersion, ourVersion, status }) => {
      if (status == VERSION_CHECK_RESULT.NOT_LATEST) {
        console.log(
          `最新版本: ${npmVersion}, 当前版本: ${ourVersion}, 请及时更新`,
        )
      }
    })
  const constructServerSubmission = consturctServer(options.moduleDefs)

  const [_, app] = await Promise.all([
    checkVersionSubmission,
    constructServerSubmission,
  ])

  /** @type {import('express').Express & ExpressExtension} */
  const appExt = app
  await new Promise((resolve, reject) => {
    appExt.server = app.listen(port, host, resolve)
    appExt.server.once('error', reject)
  })
  console.log(`server running @ http://${host}:${appExt.server.address().port}`)

  return appExt
}

module.exports = {
  serveNcmApi,
  getModulesDefinitions,
  constructServer: consturctServer,
}
