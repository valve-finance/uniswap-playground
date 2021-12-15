import * as ds from './debugScopes'
import { io, Socket } from 'socket.io-client'

import express from 'express'
import http from 'http'
import cors, { CorsRequest } from 'cors'
import helmet from 'helmet'
import requestIp from 'request-ip'
import socketio from 'socket.io'
import { v4 as uuidv4 } from 'uuid'

import * as c from './constants'


// TODO: back with Redis instead of mem
const rateLimitMem = require('./../middleware/rateLimiterMem.js')


const log = ds.getLog('misc')

const _isDev = (): boolean => {
  return (process.env.NODE_ENV === 'development')
}

// Placeholder until we get bull / redis in
const _getRequestId = (): string => {
  return uuidv4()
}

const _routerUrl = (): string => {
  // return _isDev() ?
  //   `http://localhost:${process.env.ROUTER_PORT}` :
  //   `${process.env.ROUTER_URL}:${process.env.ROUTER_PORT}`
  return `http://router:3031`
}

const _usdQuotes: string[] = []
const _routeData: any[] = []
let _routerSocket: Socket | undefined = undefined
const _initRouterSocket = (): Socket => {
  const routerUrl = _routerUrl()
  const socket = io(routerUrl)
  socket.on('connect', () => { log.info(`Router connected ${routerUrl}.`) })
  socket.on('disconnect', (reason: string) => { log.warn(`Router disconnected because ${reason}.`) })
  socket.on('connect_error', (error: any) => { log.warn(`Router connection error.\n${error}`) })
  socket.on('usdTokenQuote', (payload) => {
    // TODO: We need to improve usdTokenQuote to have a service-tag/request-id in case out of order quoting
    //       happens in future.  For now we just push it into the _usdQuotes object.
    if (payload && payload.tokens) {
      _usdQuotes.push(payload.tokens)
    }
  })
  socket.on('multipath-tracker', (payload) => {
    // TODO: We need to improve multipath to have a service-tag/request-id in case out of order quoting
    //       happens in future.  For now we just push it into the _routeData object.
    if (payload && payload.pages) {
      _routeData.push(payload.pages)
    }
  })
  return socket
}

export const initRouterSocket = (): void => {
  if (!_routerSocket) {
    _routerSocket = _initRouterSocket()
  }
}

let _app: undefined | express.Express = undefined
let _server: undefined | http.Server = undefined
let _socketServer: undefined | socketio.Server = undefined
let _clientSockets: any = {}
type InitialDataFn = () => any
export const initSocketServer = async(getInitialData: InitialDataFn, port?: string): Promise<void> => {
  if (!port) {
    // port = process.env.SERVER_PORT
    port = '3032'
  }
  log.info(`Starting Uniswap Market Tracking Socket Server on port ${port}...\n` +
           `(wait until 'READY' appears before issuing requests)`)

  if (!_app) {
    _app = express()

    _app.set('trust proxy', true)
    _app.use(cors())
    _app.use(helmet())
    _app.use(requestIp.mw())
    if (process.env.NODE_ENV != 'development') {
      _app.use(rateLimitMem)
    } else {
      log.warn('Rate limiting disabled in development environment.')
    }
    _app.use(express.json({limit: '5mb'}))
    _app.use(express.urlencoded({extended: true, limit: '5mb'}))

    const _httpMsg = 'Welcome to Uniswap Market Tracker Service.'
    _app.get(/.*/, async (req:any, res:any) => { res.status(c.OK).send(_httpMsg) })
    _app.post(/.*/, async (req:any, res:any) => { res.status(c.OK).send(_httpMsg) })
  }

  if (!_server) {
    _server = new http.Server(_app)
  }

  if (!_socketServer) {
    //  NOTE: 
    //        - May need to look at rate limiting socket requests/commands too. (TODO)
    //        - May need to tune/multiple process/core to deal with
    //          potential transport close errors when this gets too busy.
    //          See: https://github.com/socketio/socket.io/issues/3025
    //
    //  See these resources for cors options/examples:
    //        - https://github.com/expressjs/cors#configuration-options
    //        - https://socket.io/docs/v3/handling-cors/
    //
    const corsObj = { origin: ["http://localhost:3000", "https://playground.valve.finance"],
                      methods: ["GET", "POST"] }
    
    _socketServer = new socketio.Server(_server, { cors: corsObj })
  }

  _socketServer.on('connection', (socket: socketio.Socket) => {
    _clientSockets[socket.id] = socket
    log.debug(`${socket.id} connected (${Object.keys(_clientSockets).length} connections).`)

    socket.on('initialize', (payload: any) => {
      socket.emit('initialize', getInitialData())
    })

    socket.on('disconnect', (reason: string) => {
      if (_clientSockets.hasOwnProperty(socket.id)) {
        delete _clientSockets[socket.id]
      }
      log.debug(`${socket.id} disconnected (${Object.keys(_clientSockets).length} connections).\n` +
                reason)
    })
  })

  _server.listen(port, async () => {
    log.info(`Server on port ${port} READY!\n\n`)
  })
}

export const broadcastUpdate = (payload: any) => {
  if (_clientSockets) {
    const clientSocketArr: Socket[] = Object.values(_clientSockets)
    clientSocketArr.forEach((clientSocket: Socket) => {
      clientSocket.emit('update', payload)
    })
  }
}

export const delayMs = async(ms: number = 1000): Promise<void> => {
  await new Promise<void>((resolve) => { setTimeout(() => {resolve()}, ms) })
}

// Because of the TODO above related to usdTokenQuote, do not call this multiple times concurrently until
// we address the need for a service-tag/request-id
export const getUsdFromTokenAmt = async (tokenAddr: string,
                                   tokenAmt: number): Promise<number> => {
  if (!_routerSocket) {
    _routerSocket = _initRouterSocket()
  }

  // Clear the quote array:
  _usdQuotes.splice(0, _usdQuotes.length)
  _routerSocket.emit('usdTokenQuote', tokenAddr, tokenAmt.toString())
  
  // Check for the socket result every 100ms until timeout:
  const ONE_HUNDRED_MS = 100
  const REQ_TIMEOUT = 5 * 1000
  //
  let timeRemaining = REQ_TIMEOUT
  while (timeRemaining > 0 && _usdQuotes.length <= 0) {
    timeRemaining -= ONE_HUNDRED_MS
    await delayMs(ONE_HUNDRED_MS)
  }

  // pop returns string or undefined in this case; convert to NaN
  let result = _usdQuotes.pop()
  return (result) ? parseFloat(result) : NaN
} 

export const getRouteData = async (srcAddr: string,
                             dstAddr: string,
                             srcAmt: number,
                             block: number): Promise<any> => {
  if (!_routerSocket) {
    _routerSocket = _initRouterSocket()
  }

  // Clear the route data array
  _routeData.splice(0, _routeData.length)
  _routerSocket.emit('multipath-tracker', 
                     srcAddr,
                     dstAddr,
                     srcAmt.toString(),
                     {
                        max_hops: '3',
                        max_results: '10',
                        max_impact: '80',
                        update_data: 'false',
                        ignore_max_hops: 'false',
                        block: block.toString()
                     })

  // Check for the socket result every 250ms until timeout:
  const TWOFIFTY_MS = 250 
  const REQ_TIMEOUT = 30 * 1000
  //
  let timeRemaining = REQ_TIMEOUT
  while (timeRemaining > 0 && _routeData.length <= 0) {
    timeRemaining -= TWOFIFTY_MS
    await delayMs(TWOFIFTY_MS)
  }

  // pop returns string or undefined in this case; convert to NaN
  const pages = _routeData.pop()
  log.debug(`Received ${pages ? pages.length : 0} pages of route data.`)
  let result: any = {}
  if (!pages || pages.length <= 0) {
    result['error'] = 'No results'
  }

  const ZERO_THRESH = 0.000000001
  if (pages && pages.length > 0) {
    const page = pages[0]
    result['single-path'] = page.trade

    // Selectively include diagram elements for situations when
    // view button appears in dashboard.
    const { delta } = page.trade
    if (Math.abs(delta) > ZERO_THRESH) {
      result['single-path-elements'] = page.elements
    }

    // Determine the best route's MGTD:
    //   - Ugly workaround:  find the elements that are edges with hop=1, put their mgtds in an
    //                       array and sort to find the best MGTD:
    //
    const mgtds: number[] = []
    for (const spEle of page.elements) {
      if (spEle.data && 
          spEle.data.hop === 1 &&
          spEle.data.gainToDest) {
        const gtds: number[] = Object.values(spEle.data.gainToDest)
        mgtds.push(...gtds)
      }
    }
    result['mgtd-stats'] = {
      num: mgtds.length,
      min: (mgtds.length === 0) ? 0 : Math.min(...mgtds),
      max: (mgtds.length === 0) ? 0 : Math.max(...mgtds),
      avg: (mgtds.length === 0) ? 0 : mgtds.reduce((prev: number, curr: number) => prev + curr) / (mgtds.length ? mgtds.length : 1)
    }
  }

  if (pages && pages.length > 1) {
    const page = pages[1]
    result['multi-path'] = page.trade

    // Selectively include diagram elements for situations when
    // view button appears in dashboard.
    const { delta } = page.trade
    if (Math.abs(delta) > ZERO_THRESH) {
      result['multi-path-elements'] = page.elements
    }
  }
  return result
}

export const getDbRow = (routeObj: any):any => {
  const { timestamp, actualTxn, routeData } = routeObj
  if (!timestamp || !actualTxn || !routeData) {
    return
  }
  const timestampMs = timestamp * 1000
  const txnDate = new Date(timestampMs)
  const isoDate = txnDate.toISOString()

  const spTrade = routeData['single-path']
  const mpTrade = routeData['multi-path']
  const mgtdData = routeData['mgtd-stats']

  let estUniYield = 0
  let estSpYield = 0
  let estMpYield = 0
  let estUniYieldUsd = 0
  let estSpYieldUsd = 0
  let estMpYieldUsd = 0
  let spDelta = 0
  let mpDelta = 0
  let numMgtd = 0
  let minMgtd = 0
  let maxMgtd = 0
  let avgMgtd = 0

  if (spTrade) {
    estUniYield = spTrade.uni.token
    estUniYieldUsd = spTrade.uni.usd

    estSpYield = spTrade.valve.token
    estSpYieldUsd = spTrade.valve.usd

    spDelta = spTrade.delta
  }

  if (mpTrade) {
    estMpYield = mpTrade.valve.token
    estMpYieldUsd = mpTrade.valve.usd

    mpDelta = mpTrade.delta
  }

  if (mgtdData) {
    numMgtd = mgtdData.num
    minMgtd = mgtdData.min
    maxMgtd = mgtdData.max
    avgMgtd = mgtdData.avg
  }

  const dbRow = {
    timestamp: isoDate,
    block_number: actualTxn.block,
    id: actualTxn.id,
    src_symbol: actualTxn.srcSymbol,
    src_address: actualTxn.srcAddr,
    src_amount: actualTxn.srcAmount,
    dst_symbol: actualTxn.dstSymbol,
    dst_address: actualTxn.dstAddr,
    usd_approx: actualTxn.usdApprox,
    actual_yield: actualTxn.dstAmount,
    est_uni_yield: estUniYield,
    est_sp_yield: estSpYield,
    est_mp_yield: estMpYield,
    est_uni_yield_usd: estUniYieldUsd,
    est_sp_yield_usd: estSpYieldUsd,
    est_mp_yield_usd: estMpYieldUsd,
    sp_delta: spDelta,
    mp_delta: mpDelta,
    num_mgtd: numMgtd,
    min_mgtd: minMgtd,
    max_mgtd: maxMgtd,
    avg_mgtd: avgMgtd
  }

  return dbRow
}