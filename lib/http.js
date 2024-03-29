let axios = require('axios')
let parseCookies = require('./utils').parseCookies
let iconv = require('iconv-lite')
let https = require('https')

let checkEncoding = enc => {
  // check iconv supported encoding
  if (enc && !iconv.encodingExists(enc)) {
    return new Error('encoding not supported by iconv-lite')
  }
}

function responseStatusHook(res) {

  if (res.data.code != 1) {
    throw new Error(res.data.message)
  }
}

class SessionConfig {
  constructor(baseURL, headers = {
    'Accept': 'application/json, text/javascript, */*; q=0.01'
  }, responseHooks = []) {
    this.baseURL = baseURL
    this.headers = headers
    this.responseHooks = responseHooks
  }
}

class SessionManager {

  constructor(config) {
    SharedConfig.responseHooks = config.responseHooks
    const axiosIns = axios.create({
      baseURL: config.baseURL,
      timeout: 60000,
      withCredentials: true,
      headers: config.headers,
      responseType: 'arraybuffer',
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    })

    axiosIns.interceptors.request.use(function (conf) {
        const token = SharedConfig.token
        if (token != null) {
          conf.headers = conf.headers || {}
          conf.headers.Authorization =  `Bearer ${token}`
        }
        return conf
    })

    axiosIns.interceptors.response.use(
      res => {
        var cookies = res.headers['set-cookie']
        if (cookies && cookies.length) {
          var parsedCookies = parseCookies(cookies)
          axiosIns.defaults.headers.common['cookie'] = parsedCookies
        }

        let contentType = res.headers['content-type']
        if (!contentType.match(/image\/(png|jpeg|jpg|webp)/i)) {
          let enc
          if (res.headers['content-type']) {
            // Extracted from headers
            enc = (res.headers['content-type'].match(/charset=(.+)/) || []).pop()
          }
          let buffter = res.data
          if (!enc) {
            // Extracted from <meta charset="gb2312"> or <meta http-equiv=Content-Type content="text/html;charset=gb2312">
            enc = (buffter.toString().match(/<meta.+?charset=['"]?([^"']+)/i) || []).pop()
          }
          let err = checkEncoding(enc)
          if (err) {
            throw err
          }

          let text = iconv.decode(buffter, enc)
          res.text = text
          res.data = JSON.parse(text)

          SharedConfig.responseHooks?.forEach(hook => {
            hook(res)
          })

        }
        return res
      },
      error => Promise.reject(error)
    )

    this.axiosIns = axiosIns
  }
}

SessionManager.prototype.R = async function (method, path, body) {

  let responsePromise
  switch (method) {
    case 'GET':
      responsePromise = await this.axiosIns.get(path, {
        params: body
      })
      break
    case 'POST':
      responsePromise = await this.axiosIns.post(path, body)
      break
    case 'DELETE':
      responsePromise = await this.axiosIns.delete(path, body)
      break
    case 'PUT':
      responsePromise = await this.axiosIns.put(path, body)
      break
    case 'PATCH':
      responsePromise = await this.axiosIns.patch(path, body)
      break
    default:

      break
  }
  return responsePromise
}

let SharedConfig = {}

module.exports = {
  SessionManager,
  SessionConfig,
  SharedConfig,
  ResponseStatusHook: responseStatusHook
}