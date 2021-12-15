import React from 'react'
import { Container } from 'semantic-ui-react'
import socketIOClient from 'socket.io-client'
import UpdateableContainer from './UpdateableContainer'
import CollapsibleRouteTable from './CollapsibleRouteTable'
import { getUniqueKey, getTrackerUrl } from './utils'

const TRACKER_URL = getTrackerUrl()

export default class DashboardApp extends React.Component {
  constructor(props) {
    super(props)
    this.socket = undefined

    this.tableFns = {}
    this.state = {
      pageData: undefined
    }
  }

  initSocketAndHandlers = () => {
    if (!this.socket) {
      this.socket = socketIOClient(TRACKER_URL)
      this.socket.on('connect', () => {console.debug(`Connected to ${TRACKER_URL}.`)})
      this.socket.on('disconnect', (reason) => {console.debug(`Disconnected from ${TRACKER_URL} because ${reason}.`)})
      this.socket.on('connect_error', (error) => {
        console.debug(`Connection error.\n${error}`)
        // Commenting these out should enable connection retry logic:
        // this.socket.disconnect()
        // this.socket = undefined
      })
      // Load the first 100? routes for user
      this.socket.on('initialize', (payload) => {
        console.log(payload)
        this.setState({pageData: payload})
      })
      // This will be called every 15s -> 60s to update the list 
      // of trades
      this.socket.on('update', (payload) => {
        // console.log('Socket update called ...')
        this.updateTables(payload)
      })
    }
  }

  componentDidMount = async () => {
    this.initSocketAndHandlers()
    this.socket.emit('initialize', {clientId: 'pbj'})
  }

  updateTables = (payload) => {
    // console.log('Update payload:\n' +
    //             '================================================================================\n', 
    //             payload)
    for (const tableFn in payload) {
      if (this.tableFns.hasOwnProperty(tableFn)) {
        this.tableFns[tableFn](payload[tableFn])
      } else {
        // Special case for statistics
        // console.log(`tableFn: ${tableFn}:\n`, payload[tableFn])
      }
    }
  }

  render() {
    const eles = [ <div key={getUniqueKey()} style={{marginTop: '6em'}} /> ]
    let containerEles = undefined
    const { pageData } = this.state
    if (pageData !== undefined) {
      pageData.map(tableData => {
        switch (tableData.type) {
          case 'tradeTable':
            const routeTable = <CollapsibleRouteTable
                                 key={getUniqueKey()}
                                 CytoscapeComp={this.props.CytoscapeComp}
                                 title={tableData.title}
                                 headerData={tableData.headerData}
                                 routes={tableData.routes}
                                 maxRoutes={tableData.maxRoutes}
                                 sortOrder={tableData.sortOrder}
                                 sortPath={tableData.sortPath}
                                 collapsible={tableData.collapsible}
                                 expanded={tableData.expanded}
                                 bindUpdateFn={(updateFn) => {this.tableFns[tableData.updateFn] = updateFn}} />
            if (containerEles) {
              containerEles.push(routeTable)
            } else {
              eles.push(routeTable)
            }
            break;
          
          case 'contentDict':
              const contentEle = <UpdateableContainer
                                   key={getUniqueKey()}
                                   content={tableData.content}
                                   keyOrder={Object.keys(tableData.content)}
                                   bindUpdateFn={(updateFn) => {this.tableFns[tableData.id] = updateFn}} />

              if (containerEles) {
                containerEles.push(contentEle)
              } else {
                eles.push(contentEle)
              }
            break;

          case 'section':
            if (containerEles && containerEles.length > 0) {
              eles.push(<Container key={getUniqueKey()}>{containerEles}</Container>)
            }
            containerEles = [<h2 key={getUniqueKey()} style={{marginTop: 25}}>{tableData.title}</h2>]
            break;
          
          case 'end-section':
            if (containerEles && containerEles.length > 0) {
              eles.push(<Container key={getUniqueKey()}>{containerEles}</Container>)
            }
            containerEles = undefined
            break;
        
          default:
            break;
        }
      })
      if (containerEles && containerEles.length) {
        eles.push(<Container key={getUniqueKey()}>{containerEles}</Container>)
      }
      eles.push(<Container key={getUniqueKey()}>
                  <h2 style={{marginTop: 25}}>Methodology</h2>
                  <span style={{fontFamily: 'monospace', fontSize: 'medium'}}>
                    All trades shown are obtained from the Uniswap V2 Subgraph (see: https://https://thegraph.com/legacy-explorer/subgraph/uniswap/uniswap-v2), where amountUsd &gt; $50,000.
                  </span><br /><br />
                  <span style={{fontFamily: 'monospace', fontSize: 'medium'}}>
                    Values shown for the actual trade are from the aforementioned subgraph. 
                  </span><br /><br />
                  <span style={{fontFamily: 'monospace', fontSize: 'medium'}}>
                    Estimated values shown are computed using the Uniswap V2 SDK, adapted to use 
                    swap/pool information obtained from the Uniswap V2 Subgraph at the block 
                    before the transaction occurs. (This is done because this data's slippage will
                    be less favorable to our algorithms--i.e. this is a conservative approach to 
                    comparing the trade data.)
                  </span><br /><br />
                  <span style={{fontFamily: 'monospace', fontSize: 'medium'}}>
                    The Uniswap V2 SDK trade computations have been adapted to quickly compute trade
                    values one swap at a time and in so doing, do not preserve arbitrary precision, but
                    convert to standard JS double precision numeric types between swaps, leading to some
                    finite precision error.
                  </span><br /><br />
                  <span style={{fontFamily: 'monospace', fontSize: 'medium'}}>
                    Gas prices are not included in the estimated trade yields or percentage differences.
                  </span>
                </Container> )
    }

    return eles
  }
}