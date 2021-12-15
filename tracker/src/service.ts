import * as ds from './utils/debugScopes'
import * as m from './utils/misc'
import * as rest from './utils/rest'
import * as pgUtils from './utils/postgres'
import * as config from './config.json'
import * as fs from 'fs'

const log = ds.getLog('service')

interface UniTxn {
  timestamp: number,
  srcAddr: string
  srcSymbol: string
  dstAddr: string
  dstSymbol: string
  srcAmount: number
  dstAmount: number
  usdApprox: number
  block: number
  id: string
}

const getLatestBlock = async (missingDataRetries = 1): Promise<any> => {
  const payload = {
    query: `{
      blocks(first: 1, skip: 0, orderBy: number, orderDirection: desc, where: {number_gt: 9300000}) {
        number
      }
    }`,
    variables: {}
  }

  let attempt = 0
  let response: any = undefined
  while (attempt < missingDataRetries) {
    try {
      attempt++
      response = await rest.postWithRetry(config.blocklytics_graph_url, payload)
    } catch (error) {
      throw new Error('Failed to fetch data from Blocklytics Graph\n' + error)
    }
    if (response && response.data && response.data.blocks && response.data.blocks[0]) {
      return parseInt(response.data.blocks[0].number)
    } else {
      const _responseStr = JSON.stringify(response)
      const _responseStrShort = (_responseStr && _responseStr.length) ?
        _responseStr.substr(0, 1024) : _responseStr
      log.warn(`Attempt ${attempt} of ${missingDataRetries}.`)
      log.warn('Response from Blocklytics Graph does not contain property "data"\n' +
        `  url: ${config.blocklytics_graph_url}\n` +
        `  response: ${_responseStrShort}...\n` +
        `  query: ${JSON.stringify(payload.query)}\n`)
    }
  }
  return 13077711
}

const getTransactions = async (blockNumber: number, minAmountUsd: number = 50000): Promise<any> => {
  // 1. Fetch transactions meeting our criteria from the UNI V2 Graph
  //
  const payload = {
    query: `{
      transactions(
        where: {
          blockNumber_gt: ${blockNumber}
        }
      )
      {
        timestamp
        swaps (
          where: {
            amountUSD_gt: ${minAmountUsd}
          }
        )
        {
          pair {
            token0 {id, symbol}
            token1 {id, symbol}
          }
          transaction {
            id
            blockNumber
          }
          amount0In
          amount0Out
          amount1In
          amount1Out
          amountUSD
        }
      }
      _meta {
        block {
          number
        }
      }
    }`,
    variables: {}
  }

  let response: any = undefined
  try {
    response = await rest.postWithRetry(config.uniswap_v2_graph_url, payload)
  } catch (error) {
    throw new Error('Failed to fetch data from Uniswap V2 Graph\n' + error)
  }

  const result: any = { transactionObjs: [] }
  if (response && response.data) {

    // 2. Add the latest block number that the graph data is up-to-date with to this
    //    method's result:
    //
    const { _meta, transactions } = response.data
    if (_meta && _meta.block) {
      result['blockNumber'] = _meta.block.number
    }

    // 3. Convert the transactions to the format accepted by the router (i.e. tease out
    //    the transaction's source and destination token from an array of cascading swaps):
    //
    if (transactions) {
      for (const graphTxn of transactions) {
        const { timestamp, swaps } = graphTxn
        if (swaps.length > 0) {
          const firstSwap = swaps[0]
          const { amount0In, amount1In } = firstSwap
          const srcToken = (amount0In > 0) ? firstSwap.pair.token0 : firstSwap.pair.token1

          const lastSwap = swaps[swaps.length - 1]
          const { amount0Out, amount1Out, amountUSD } = lastSwap
          const dstToken = (amount0Out > 0) ? lastSwap.pair.token0 : lastSwap.pair.token1

          const actualTxn: UniTxn = {
            timestamp,
            srcAddr: srcToken.id,
            srcSymbol: srcToken.symbol,
            srcAmount: (amount0In > 0) ? amount0In : amount1In,
            dstAddr: dstToken.id,
            dstSymbol: dstToken.symbol,
            dstAmount: (amount0Out > 0) ? amount0Out : amount1Out,
            usdApprox: amountUSD,
            block: lastSwap.transaction.blockNumber,
            id: lastSwap.transaction.id
          }

          result.transactionObjs.push({ timestamp, graphTxn, actualTxn })
        }
      }
    }

    log.info(`Found ${result.transactionObjs.length} matching transactions in ${transactions.length} transactions in Block Number: ${blockNumber}`)
  }

  log.info('Processed After Block Number: ', blockNumber)
  return result
}

/*
 * _clientData gets pushed to a web client on first connect and also gets persisted.
 * It consists of:
 *  - the last n trades
 *  - top 5 all time trades
 *  - top 5 trades today
 *  - bottom 5 all time trades
 *  - bottom 5 trades today
 *  - statistics (how many txns all time, today, same, better, worse)
 *    - This section will differ from the above 5
 * Methodology
 */
const _clientData: any = []
export const getClientData = () => {
  return _clientData
}

const ZERO_THRESH = 0.000000001
const MAX_ENTRIES_TO_STORE = 100
const NUM_MINMAX_ENTRIES_TO_STORE = 10

const HEADER_DATA = [
  { text: 'Time' },
  { text: 'From' },
  { text: 'To' },
  { text: 'Actual Txn.' },
  {
    text: 'Uni Est. *',
    mouseover: 'Uniswap estimated value using same source data as Valve Finance estimates.'
  },
  {
    text: 'Valve SP Est. *',
    mouseover: 'Valve Finance Single-Path Route Result (excludes gas est.)'
  },
  {
    text: 'Valve MP Est. *',
    mouseover: 'Valve Finance Multi-Path Route Result (excludes gas est.)'
  }
]

const getMinMaxTableObj = (id: string, topBottom: string, pathType: string, duration: string, routesArr: any): any => {
  const title = `${topBottom} ${pathType} Trades ${duration}`

  const sortOrder = (topBottom === 'Top') ? 'desc' : 'asc'
  const sortPath = (pathType === 'Multi-Path') ? 'multi-path' : 'single-path'

  return {
    id,
    type: 'tradeTable',
    title,
    headerData: HEADER_DATA,
    collapsible: true,
    expanded: false,
    routes: routesArr,
    maxRoutes: NUM_MINMAX_ENTRIES_TO_STORE,
    sortOrder,
    sortPath,
    updateFn: id
  }
}

/**
 * Sorts tradeArr in descending order. Returns the smallest value.
 * 
 * @param tradeArr 
 * @param routeType 
 * @returns 
 */
const orderTradesDescDelta = (tradeArr: any, routeType: string): number => {
  const _routeType = routeType.toLowerCase()
  if (_routeType !== 'single-path' && _routeType !== 'multi-path') {
    throw new Error(`orderTradesDescDelta: routeType must be 'single-path' OR 'multi-path': ${routeType}`)
  }

  tradeArr.sort((txnA: any, txnB: any) => {
    let deltaA = ZERO_THRESH
    let deltaB = ZERO_THRESH
    if (txnA && txnA.routeData && txnA.routeData[_routeType] && txnA.routeData[_routeType].delta) {
      deltaA = txnA.routeData[_routeType].delta
    }
    if (txnB && txnB.routeData && txnB.routeData[_routeType] && txnB.routeData[_routeType].delta) {
      deltaB = txnB.routeData[_routeType].delta
    }
    return deltaB - deltaA
  })

  if (tradeArr.length > NUM_MINMAX_ENTRIES_TO_STORE) {
    tradeArr.splice(NUM_MINMAX_ENTRIES_TO_STORE,
      tradeArr.length - NUM_MINMAX_ENTRIES_TO_STORE)
  }

  if (tradeArr.length > 0) {
    return tradeArr[tradeArr.length - 1]
  } else {
    return ZERO_THRESH
  }
}

/**
 * Sorts tradeArr in ascending order (negative numbers). Returns the largest value.
 * 
 * @param tradeArr 
 * @param routeType 
 * @returns 
 */
const orderTradesAscDelta = (tradeArr: any, routeType: string): number => {
  const _routeType = routeType.toLowerCase()
  if (_routeType !== 'single-path' && _routeType !== 'multi-path') {
    throw new Error(`orderTradesAscDelta: routeType must be 'single-path' OR 'multi-path': ${routeType}`)
  }

  tradeArr.sort((txnA: any, txnB: any) => {
    let deltaA = ZERO_THRESH
    let deltaB = ZERO_THRESH
    if (txnA && txnA.routeData && txnA.routeData[_routeType] && txnA.routeData[_routeType].delta) {
      deltaA = txnA.routeData[_routeType].delta
    }
    if (txnB && txnB.routeData && txnB.routeData[_routeType] && txnB.routeData[_routeType].delta) {
      deltaB = txnB.routeData[_routeType].delta
    }
    return deltaA - deltaB
  })

  if (tradeArr.length > NUM_MINMAX_ENTRIES_TO_STORE) {
    tradeArr.splice(NUM_MINMAX_ENTRIES_TO_STORE,
      tradeArr.length - NUM_MINMAX_ENTRIES_TO_STORE)
  }

  if (tradeArr.length > 0) {
    return tradeArr[tradeArr.length - 1]
  } else {
    return ZERO_THRESH
  }
}

const removeTradesOlderThan24h = (tradeArr: any): void => {
  let nowMs = Date.now()
  for (let idx = tradeArr.length - 1; idx >= 0; idx--) {
    const txn = tradeArr[idx]
    const { timestamp } = txn
    const timestampMs = 1000 * parseInt(timestamp)
    const ageMs = nowMs - timestampMs
    if (ageMs > 24 * 60 * 60 * 1000 /* 24h in ms */) {
      tradeArr.splice(idx, 1)   // Remove this element in place.
      // Desc. order for loop prevents side-effects
      // on subsequent removals.
    }
  }
}

// Ugly ....
// If proper time then store in postgres.  Sigh.
//
class SiteDataModel {
  constructor(clientData: any) {
    this.statisticsObj = {
      lastBlockProcessed: { text: 'Last block processed:', value: 0 },
      tradesAnalyzed: { text: `Trades analyzed:`, value: 0 },
      spTradesImproved: { text: `Single-path trades improved:`, value: 0 },
      spAvgImprovementUsd: { text: `Average single-path improvement ($USD):`, value: 0.0 },
      spTradesDegraded: { text: `Single-path trades degraded:`, value: 0 },
      spAvgDegradedUsd: { text: `Average single-path degredation ($USD):`, value: 0.0 },
      mpTradesImproved: { text: `Multi-path trades improved:`, value: 0 },
      mpAvgImprovementUsd: { text: `Average multi-path improvement ($USD):`, value: 0.0 },
      mpTradesDegraded: { text: `Multi-path trades degraded:`, value: 0 },
      mpAvgDegradedUsd: { text: `Average multi-path degredation ($USD):`, value: 0.0 },
    }

    clientData.push({
      id: 'statisticsSection',
      type: 'section',
      title: 'Statistics'
    })

    clientData.push({
      id: 'statisticsContent',
      type: 'contentDict',
      content: this.statisticsObj
    })

    clientData.push({
      id: 'spLeaderboardsSection',
      type: 'section',
      title: 'Single Path Leaderboards'
    })
    clientData.push(getMinMaxTableObj('topSpRoutesToday', 'Top', 'Single Path', 'Today', this.topSpRoutesToday))
    clientData.push(getMinMaxTableObj('topSpRoutesAllTime', 'Top', 'Single Path', 'All-Time', this.topSpRoutesAllTime))
    clientData.push(getMinMaxTableObj('bottomSpRoutesToday', 'Bottom', 'Single Path', 'Today', this.bottomSpRoutesToday))
    clientData.push(getMinMaxTableObj('bottomSpRoutesAllTime', 'Bottom', 'Single Path', 'All-Time', this.bottomSpRoutesAllTime))

    clientData.push({
      id: 'mpLeaderboardsSection',
      type: 'section',
      title: 'Multi-Path Leaderboards'
    })
    clientData.push(getMinMaxTableObj('topMpRoutesToday', 'Top', 'Multi-Path', 'Today', this.topMpRoutesToday))
    clientData.push(getMinMaxTableObj('topMpRoutesAllTime', 'Top', 'Multi-Path', 'All-Time', this.topMpRoutesAllTime))
    clientData.push(getMinMaxTableObj('bottomMpRoutesToday', 'Bottom', 'Multi-Path', 'Today', this.bottomMpRoutesToday))
    clientData.push(getMinMaxTableObj('bottomMpRoutesAllTime', 'Bottom', 'Multi-Path', 'All-Time', this.bottomMpRoutesAllTime))

    clientData.push({
      id: 'recentTradesSection',
      type: 'section',
      title: 'Recent Trades'
    })
    clientData.push({
      id: 'currentRoutes',
      type: 'tradeTable',
      title: `Valve Finance $50,000+ Uniswap V2 Trades`,
      headerData: HEADER_DATA,
      collapsible: false,
      expanded: true,
      routes: this.currentRoutes,
      maxRoutes: MAX_ENTRIES_TO_STORE,
      updateFn: 'currentRoutes'
    })
  }

  getSerializationStr(): string {
    const serializationObj = {
      statisticsObj: this.statisticsObj,
      topSpRoutesToday: this.topSpRoutesToday,
      topSpRoutesAllTime: this.topSpRoutesAllTime,
      bottomSpRoutesToday: this.bottomSpRoutesToday,
      bottomSpRoutesAllTime: this.bottomSpRoutesAllTime,
      topMpRoutesToday: this.topMpRoutesToday,
      topMpRoutesAllTime: this.topMpRoutesAllTime,
      bottomMpRoutesToday: this.bottomMpRoutesToday,
      bottomMpRoutesAllTime: this.bottomMpRoutesAllTime,
      currentRoutes: this.currentRoutes
    }

    return JSON.stringify(serializationObj, null, 2)
  }

  initFromSerializationStr(serialization: string): void {
    const that: any = this      // Workaround for string indexing this.

    const serializationObj = JSON.parse(serialization)
    for (const key of Object.keys(serializationObj)) {
      const obj: any = serializationObj[key]
      if (key === 'statisticsObj') {
        for (const objKey of Object.keys(obj)) {
          this.statisticsObj[objKey] = obj[objKey]
        }
      } else {
        obj.forEach((element: any) => { that[key].push(element) })
      }
    }
  }

  getStatisticsObj(): any {
    return this.statisticsObj
  }

  getLastBlock(): number {
    return this.statisticsObj.lastBlockProcessed.value
  }

  getClientDataArr(): any {
    return this.clientData
  }

  getRouteArrPointers(): any {
    return {
      topSpRoutesToday: this.topSpRoutesToday,
      topSpRoutesAllTime: this.topSpRoutesAllTime,
      bottomSpRoutesToday: this.bottomSpRoutesToday,
      bottomSpRoutesAllTime: this.bottomSpRoutesAllTime,
      topMpRoutesToday: this.topMpRoutesToday,
      topMpRoutesAllTime: this.topMpRoutesAllTime,
      bottomMpRoutesToday: this.bottomMpRoutesToday,
      bottomMpRoutesAllTime: this.bottomMpRoutesAllTime,
      currentRoutes: this.currentRoutes
    }
  }

  private statisticsObj: any
  private clientData: any
  private topSpRoutesToday: any = []
  private topSpRoutesAllTime: any = []
  private bottomSpRoutesToday: any = []
  private bottomSpRoutesAllTime: any = []
  private topMpRoutesToday: any = []
  private topMpRoutesAllTime: any = []
  private bottomMpRoutesToday: any = []
  private bottomMpRoutesAllTime: any = []
  private currentRoutes: any = []
}

const USE_DB: boolean = (process.env.PG_USE_DB === "true")

export const startService = async (): Promise<void> => {
  // Prep database
  //
  const dbTableName = pgUtils.getValveFiTxnTableName()
  if (USE_DB) {
    await pgUtils.createTransactionTable(dbTableName, true /* partition */)
  }
  let lastPartition = ''

  // Toggle estimating using the data from the previous block (more accurate for slippage--esp. where large trades may
  // shift a pool's liquidity.)
  //
  const BLOCK_MINUS_ONE_ESTIMATES = true

  const PERSIST_FILE = 'site_data_model.json'
  const sdm = new SiteDataModel(_clientData)

  // Try to restore the site's data model from disk:
  //
  if (fs.existsSync(PERSIST_FILE)) {
    log.info('Restoring site data model from disk...')
    const serializationBuf = fs.readFileSync(PERSIST_FILE)
    sdm.initFromSerializationStr(serializationBuf.toString())
    log.info(`  Last block in site data model from disk: ${sdm.getLastBlock()}`)
  }

  const statisticsObj: any = sdm.getStatisticsObj()
  const { topSpRoutesToday,
    topSpRoutesAllTime,
    bottomSpRoutesToday,
    bottomSpRoutesAllTime,
    topMpRoutesToday,
    topMpRoutesAllTime,
    bottomMpRoutesToday,
    bottomMpRoutesAllTime,
    currentRoutes } = sdm.getRouteArrPointers()

  let minTopSpRoutesToday = orderTradesDescDelta(topSpRoutesToday, 'single-path')
  let minTopSpRoutesAllTime = orderTradesDescDelta(topSpRoutesAllTime, 'single-path')
  let maxBottomSpRoutesToday = orderTradesAscDelta(bottomSpRoutesToday, 'single-path')
  let maxBottomSpRoutesAllTime = orderTradesAscDelta(bottomSpRoutesAllTime, 'single-path')
  let minTopMpRoutesToday = orderTradesDescDelta(topMpRoutesToday, 'multi-path')
  let minTopMpRoutesAllTime = orderTradesDescDelta(topMpRoutesAllTime, 'multi-path')
  let maxBottomMpRoutesToday = orderTradesAscDelta(bottomMpRoutesToday, 'multi-path')
  let maxBottomMpRoutesAllTime = orderTradesAscDelta(bottomMpRoutesAllTime, 'multi-path')


  m.initRouterSocket()
  await m.initSocketServer(getClientData)

  let failedBlock: any = {
    number: 0,
    fails: 0
  }

  let lastBlockNumber = await getLatestBlock() - 10
  if (sdm.getLastBlock() > 0 && (sdm.getLastBlock() > lastBlockNumber)) {
    lastBlockNumber = sdm.getLastBlock()
  }

  while (true) {
    let blockNumber: any = undefined
    let transactionObjs: any = undefined
    try {
      const result: any = await getTransactions(lastBlockNumber)
      blockNumber = result.blockNumber
      transactionObjs = result.transactionObjs
    } catch (error) {
      if (failedBlock.blockNumber !== blockNumber) {
        failedBlock.blockNumber = blockNumber,
          failedBlock.fails = 0
      }
      failedBlock.fails++
      log.warn(`Failed to get transactions. Retrying block number ${blockNumber}. Reported error:\n${error}`)

      if (failedBlock.fails > 3) {
        log.warn(`Shutting down process after ${failedBlock.fails} fails on block number ${failedBlock.number}`)
        process.exit(0)
      }

      continue
    }

    if (blockNumber) {
      lastBlockNumber = blockNumber
    }

    if (transactionObjs && transactionObjs.length > 0) {
      transactionObjs.sort((objA: any, objB: any) => { return objA.timestamp - objB.timestamp })
      for (const txnObj of transactionObjs) {
        const { timestamp, graphTxn, actualTxn } = txnObj
        log.debug('Actual Txn:\n' +
          '================================================================================', actualTxn)

        // log.debug('Graph Txn Data:\n' +
        //           '================================================================================' +
        //           `${JSON.stringify(graphTxn, null, 2)}`)
        const block = (BLOCK_MINUS_ONE_ESTIMATES) ? actualTxn.block - 1 : actualTxn.block
        log.debug(`getRouteData(${actualTxn.srcAddr}, ${actualTxn.dstAddr}, ${actualTxn.srcAmount}, ${block})`)
        const routeData: any = await m.getRouteData(actualTxn.srcAddr,
          actualTxn.dstAddr,
          actualTxn.srcAmount,
          block)
        log.debug(`Routedata:\n` +
          `================================================================================\n`)
        for (const routeDataKey of Object.keys(routeData)) {
          if (routeDataKey.includes('elements')) {
            continue
          }
          log.debug(JSON.stringify(routeData[routeDataKey], null, 2))
        }

        // Prepare the update to broadcast and update all the internal data
        // leaderboards for trades ...
        //
        const update: any = {}
        statisticsObj.lastBlockProcessed.value = lastBlockNumber
        statisticsObj.tradesAnalyzed.value++
        update['statisticsContent'] = statisticsObj

        const routeObj = { timestamp, actualTxn, routeData }

        // Update the current routes leaderboard and ensure it's the correct
        // length:
        //
        update['currentRoutes'] = routeObj
        currentRoutes.unshift(routeObj)
        if (currentRoutes.length > MAX_ENTRIES_TO_STORE) {
          currentRoutes.pop()
        }

        // Update the single path leaderboards:
        //
        if (routeData.hasOwnProperty('single-path')) {
          const trade = routeData['single-path']
          const { delta } = trade
          if (Math.abs(delta) > ZERO_THRESH) {
            // Calculate the USD difference in the single path trade:
            //
            let spUsdDiff = 0
            if (trade.valve && trade.valve.usd &&
              trade.uni && trade.uni.usd) {
              spUsdDiff = trade.valve.usd - trade.uni.usd
            }

            if (delta > 0) {
              // If the trade improved add the trade amount to the average 
              // improved $USD and increment the improved trades count:
              //
              const { spAvgImprovementUsd, spTradesImproved } = statisticsObj
              spAvgImprovementUsd.value =
                ((spAvgImprovementUsd.value * spTradesImproved.value) + spUsdDiff) /
                (spTradesImproved.value + 1)
              spTradesImproved.value++
            } else if (delta < 0) {
              // If the trade degraded add the trade amount to the average 
              // degraded $USD and increment the degraded trades count:
              //
              const { spAvgDegradedUsd, spTradesDegraded } = statisticsObj
              spAvgDegradedUsd.value =
                ((spAvgDegradedUsd.value * spTradesDegraded.value) + spUsdDiff) /
                (spTradesDegraded.value + 1)
              spTradesDegraded.value++
            }

            // Update the single path top/bottom leaderboards for today:
            //
            if (delta > minTopSpRoutesToday || (delta > 0)) {
              topSpRoutesToday.push(routeObj)
              removeTradesOlderThan24h(topSpRoutesToday)
              minTopSpRoutesToday = orderTradesDescDelta(topSpRoutesToday, 'single-path')
              update['topSpRoutesToday'] = routeObj
            } else if (delta < maxBottomSpRoutesToday || (delta < 0)) {
              bottomSpRoutesToday.push(routeObj)
              removeTradesOlderThan24h(bottomSpRoutesToday)
              maxBottomSpRoutesToday = orderTradesAscDelta(bottomSpRoutesToday, 'single-path')
              update['bottomSpRoutesToday'] = routeObj
            }

            // Update the single path top/bottom leaderboards for all-time:
            //
            if (delta > minTopSpRoutesAllTime || (delta > 0)) {
              topSpRoutesAllTime.push(routeObj)
              minTopSpRoutesAllTime = orderTradesDescDelta(topSpRoutesAllTime, 'single-path')
              update['topSpRoutesAllTime'] = routeObj
            } else if (delta < maxBottomSpRoutesAllTime || (delta < 0)) {
              bottomSpRoutesAllTime.push(routeObj)
              maxBottomSpRoutesAllTime = orderTradesAscDelta(bottomSpRoutesAllTime, 'single-path')
              update['bottomSpRoutesAllTime'] = routeObj
            }
          }
        }

        // Update the multi-path leaderboards:
        //
        if (routeData.hasOwnProperty('multi-path')) {
          const trade = routeData['multi-path']
          const { delta } = trade
          if (Math.abs(delta) > ZERO_THRESH) {
            // Calculate the USD difference in the multi-path trade:
            //
            let mpUsdDiff = 0
            if (trade.valve && trade.valve.usd &&
              trade.uni && trade.uni.usd) {
              mpUsdDiff = trade.valve.usd - trade.uni.usd
            }

            if (delta > 0) {
              // If the trade improved add the trade amount to the average 
              // improved $USD and increment the improved trades count:
              //
              const { mpAvgImprovementUsd, mpTradesImproved } = statisticsObj
              mpAvgImprovementUsd.value =
                ((mpAvgImprovementUsd.value * mpTradesImproved.value) + mpUsdDiff) /
                (mpTradesImproved.value + 1)
              mpTradesImproved.value++
            } else if (delta < 0) {
              // If the trade degraded add the trade amount to the average 
              // degraded $USD and increment the degraded trades count:
              //
              const { mpAvgDegradedUsd, mpTradesDegraded } = statisticsObj
              mpAvgDegradedUsd.value =
                ((mpAvgDegradedUsd.value * mpTradesDegraded.value) + mpUsdDiff) /
                (mpTradesDegraded.value + 1)
              mpTradesDegraded.value++
            }

            // Update the multi-path top/bottom leaderboards for today:
            //
            if (delta > minTopMpRoutesToday || (delta > 0)) {
              topMpRoutesToday.push(routeObj)
              removeTradesOlderThan24h(topMpRoutesToday)
              minTopMpRoutesToday = orderTradesDescDelta(topMpRoutesToday, 'multi-path')
              update['topMpRoutesToday'] = routeObj
            } else if (delta < maxBottomMpRoutesToday || (delta < 0)) {
              bottomMpRoutesToday.push(routeObj)
              removeTradesOlderThan24h(bottomMpRoutesToday)
              maxBottomMpRoutesToday = orderTradesAscDelta(bottomMpRoutesToday, 'multi-path')
              update['bottomMpRoutesToday'] = routeObj
            }

            // Update the multi-path top/bottom leaderboards for all-time:
            //
            if (delta > minTopMpRoutesAllTime || (delta > 0)) {
              topMpRoutesAllTime.push(routeObj)
              minTopMpRoutesAllTime = orderTradesDescDelta(topMpRoutesAllTime, 'multi-path')
              update['topMpRoutesAllTime'] = routeObj
            } else if (delta < maxBottomMpRoutesAllTime || (delta < 0)) {
              bottomMpRoutesAllTime.push(routeObj)
              maxBottomMpRoutesAllTime = orderTradesAscDelta(bottomMpRoutesAllTime, 'multi-path')
              update['bottomMpRoutesAllTime'] = routeObj
            }
          }
        }

        m.broadcastUpdate(update)

        // TODO: future - make this async for perf.  rn we don't need that perf.
        if (USE_DB) {
          try {
            log.info(`Attempting to write txn to DB... (NODE_ENV = ${process.env.NODE_ENV}) `)
            if (process.env.NODE_ENV === 'production') {
              log.info(`  Updating partition...`)
              // Update the current DB table partition if needed ...
              //
              const timestampMs = 1000 * parseInt(timestamp)
              const txnDate = new Date(timestampMs)
              const isoDate = txnDate.toISOString()
              const partition = pgUtils.getPartition(isoDate)
              if (lastPartition !== partition) {
                await pgUtils.createPartitionTable(dbTableName, isoDate)
                lastPartition = partition
              }

              log.info(`  Inserting ...`)
              // Send the transaction to the DB
              //
              const dbRow: any = m.getDbRow(routeObj)
              await pgUtils.insertRows(dbTableName, [dbRow])
            }
          } catch (ignoredErr) {
            log.info(`  Error...`)
            log.warn(`Failed to write transaction to DB because\n` +
              `${ignoredErr}\n`)
          }
        }
      }
    } else {
      const update: any = {}
      statisticsObj.lastBlockProcessed.value = lastBlockNumber
      update['statisticsContent'] = statisticsObj
      m.broadcastUpdate(update)
    }

    // Store the site data model:
    const serializationStr = sdm.getSerializationStr()
    fs.writeFile(PERSIST_FILE,
      serializationStr,
      (err) => {
        if (err) {
          log.error(`Failed writing data model persist file: ${PERSIST_FILE}\n${err}`)
        }
      })
    await m.delayMs(60000)
  }
}