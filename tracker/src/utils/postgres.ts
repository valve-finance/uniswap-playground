import { Pool } from 'pg'
import format from 'pg-format'
import 'dotenv/config.js'

import * as ds from './debugScopes'
const log = ds.getLog('postgres')



const pool = new Pool({
  user: process.env.PG_USER,
  password: process.env.PG_PWD,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT ? parseInt(process.env.PG_PORT) : 5432
})

pool.on('error', (err, client) => {
  log.error('Unexpected error on idle client', err)
  process.exit(-1)
})



export const getValveFiTxnTableName = (): string => {
  return 'valve_finance_txns'
}



export const endPool = async () => {
 await pool.end()
}

export const runQuery = async (aQuery: string): Promise<any> => {
  try {
    return await pool.query(aQuery)
  } catch (error) {
    throw error
  }
}

export const insertRows = async(aTableName: string,
                                anObjArr: any[],
                                aHeader?: string,
                                theValues?: any[],
                                ignoreConflict?: boolean) =>
{
  const keyStr = (aHeader) ? 
    aHeader : 
    Object.keys(anObjArr[0]).join(', ')
  const values = (theValues) ? 
    theValues : 
    anObjArr.map((val) => Object.values(val))

  const conflictResolution = (ignoreConflict) ? 'ON CONFLICT DO NOTHING' : ''

  // From: https://github.com/brianc/node-postgres/issues/957#issuecomment-200000070
  const queryStr = format(`
    INSERT INTO "${aTableName}" ( ${keyStr} )
    VALUES
      %L ${conflictResolution}`, values)

  try {
    return await runQuery(queryStr)
  } catch (error) {
    let firstRow = 'unknown'
    try {
      firstRow = JSON.stringify(values[0])
    } catch (suppressedError) {}

    throw new Error(`Failed inserting ${anObjArr.length} rows into table ${aTableName}.\n` +
                    `first row = ${firstRow}\n` +
                    `${error}`)
  }
}

export const createTransactionTable = async(tableName: string, partitioned=true): Promise<void> => {
  let queryStr = `
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      timestamp TIMESTAMPTZ NOT NULL,
      block_number INT NOT NULL,
      id VARCHAR(66),
      src_symbol TEXT,
      src_address VARCHAR(42) NOT NULL,
      src_amount NUMERIC,
      dst_symbol TEXT,
      dst_address VARCHAR(42) NOT NULL,
      usd_approx NUMERIC,
      actual_yield NUMERIC,
      est_uni_yield NUMERIC,
      est_sp_yield NUMERIC,
      est_mp_yield NUMERIC,
      est_uni_yield_usd NUMERIC,
      est_sp_yield_usd NUMERIC,
      est_mp_yield_usd NUMERIC,
      sp_delta NUMERIC,
      mp_delta NUMERIC,
      num_mgtd NUMERIC,
      min_mgtd NUMERIC,
      max_mgtd NUMERIC,
      avg_mgtd NUMERIC,
      PRIMARY KEY (id, timestamp)
    )`
  queryStr += (partitioned) ? ` PARTITION BY RANGE (timestamp);` : ';'

  await runQuery(queryStr)
}

export const createPartitionTable = async(aTableName:string,
                                          anIsoTimestamp: string): Promise<any> =>
{
  const partitionTableName =  getPartitionTableName(aTableName, anIsoTimestamp)
  const partitionStart = getPartitionRangeStart(anIsoTimestamp)
  const partitionEnd = getPartitionRangeEnd(anIsoTimestamp)

  const queryStr = `
    CREATE TABLE IF NOT EXISTS "${partitionTableName}" PARTITION OF "${aTableName}"
        FOR VALUES FROM ('${partitionStart}') TO ('${partitionEnd}');`

  // log.debug(`createPartitionTable: attempting creating table w/ query:\n${queryStr}\n`)
  return await runQuery(queryStr)
}

type NumToStrMapType = { [index: number]: string }

const UTC_TO_REG_MONTH_MAP : NumToStrMapType = {
  0: '01', 1: '02', 2: '03', 3: '04',
  4: '05', 5: '06', 6: '07', 7: '08',
  8: '09', 9: '10', 10: '11', 11: '12'
}

export function getPartition(anIsoDateString:string):string {
  const dateObj = new Date(anIsoDateString)
  return `${dateObj.getUTCFullYear()}-${UTC_TO_REG_MONTH_MAP[dateObj.getUTCMonth()]}`
}

export function getPartitionTableName(aTableName: string, anIsoDateString:string):string {
  const partition = getPartition(anIsoDateString)
  return `${aTableName}_${partition}`
}

/*
 *  We partition by month at present. This returns the start timestamp for the
 *  partition's range in the format given a date string containing 2020-09:
 * 
 *      "2020-09-01 00:00:00+00"
 */
function getPartitionRangeStart(anIsoDateString:string):string {
  const dateObj = new Date(anIsoDateString)
  return `${dateObj.getUTCFullYear()}-${UTC_TO_REG_MONTH_MAP[dateObj.getUTCMonth()]}-01 00:00:00+00`
}

/*
 *  We partition by month at present. This returns the start timestamp for the
 *  partition's range in the format given a date string containing 2020-09:
 * 
 *      "2020-10-01 00:00:00+00"
 * 
 *  Note the month is incremented!
 */
function getPartitionRangeEnd(anIsoDateString:string):string {
  const dateObj = new Date(anIsoDateString)
  let monthNum = dateObj.getUTCMonth() + 1
  let yearNum = dateObj.getUTCFullYear()
  if (monthNum > 11) {   // Correct for Dec.. where the year increments. (11 is UTC Dec.)
    monthNum = 0
    yearNum++
  }
  return `${yearNum}-${UTC_TO_REG_MONTH_MAP[monthNum]}-01 00:00:00+00`
}