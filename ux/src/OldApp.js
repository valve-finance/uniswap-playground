import { getRouterUrl } from "./utils"
import React from "react"
import './App.css'
import { uniTokens } from './Tokens'

import {
  Container,
  Segment,
  Header,
  Dimmer,
  Loader
} from 'semantic-ui-react'

import DataForm from './Form'
import Flow from './Flow'
import socketIOClient from 'socket.io-client'

const ROUTER_URL = getRouterUrl()

export default class App extends React.Component {
  constructor(props) {
    super(props)
    this.socket = undefined
    this.formData = {}
    this.state = {
      graphs: [],
      uniRoute: '',
      coinList: [],
      loading: false
    }
  }
  initSocketAndHandlers = () => {
    if (!this.socket) {
      this.socket = socketIOClient(ROUTER_URL)
      this.socket.on('connect', () => {console.debug(`Connected to ${ROUTER_URL}.`)})
      this.socket.on('disconnect', (reason) => {console.debug(`Disconnected from ${ROUTER_URL} because ${reason}.`)})
      this.socket.on('connect_error', (error) => {
        console.debug(`Connection error.`)
        this.socket.disconnect()
        this.socket = undefined
      })
      this.socket.on('route', (payload) => {
        console.debug(`${ROUTER_URL}, route request ${payload.requestId}: ${payload.status}`)
        this.setState({status: payload.status})
        if (payload.routes || payload.error) {
          const { routes, uniRoute, error} = payload
          if (error) {
            alert(error)
          } else if (routes && routes.length) {
            this.setState({graphs: [], routes, uniRoute})
            this.parseData(routes, this.formData)
            console.log(`Payload Data:\n${JSON.stringify(payload, null, 2)}`)
            this.setState({loading: false})
          } else {
            alert('No routes found')
            this.setState({loading: false})
          }
        }
      })
    }
  }
  componentDidMount = async () => {
    this.initSocketAndHandlers()
    let coinList = []
    for (let coin of uniTokens) {
      const { address, chainId, symbol, logoURI} = coin
      if (chainId === 1) {
        coinList.push({
          key: address,
          value: address,
          // text: `(${symbol}) ${address}`,
          text: symbol,
          description: address,
          image: { avatar: true, src: logoURI }
        })
      }
    }
    this.setState({coinList})
  }
  handleAddition = (e, value) => {
    this.setState((prevState) => ({
      coinList: [{ 
        text: value,
        key: value,
        description: value,
        image: null,
        value 
      }, ...prevState.coinList],
    }))
  }
  handleSubmit = async (e, formData) => {
    e.preventDefault()
    this.setState({loading: true, graphs: [], uniRoute: ''})
    const {
      source,
      destination,
      amount,
      hops,
      results,
      impact
    } = formData
    const reqData = {
      "route": {
        "source": source.toLowerCase(),
        "dest": destination.toLowerCase(),
        "amount": amount,
        "options": {
            "max_hops": hops,
            "max_results": results,
            "max_impact": impact
        }
      }
    }
    if (!this.socket) {
      this.initSocketAndHandlers()
    }
    this.formData = formData  // Store the formData in a member var for the socket 'route' handler 
    this.socket.emit('route', ...Object.values(reqData.route))
  }
  parseData = (routes, formData) => {
    let y = 0
    let i = 0
    let graphs = []
    const { uniRoute } = this.state
    for (let prop of routes) {
      let { orderedSwaps, routeStr } = prop
      const isUniRoute = (uniRoute === routeStr)
      let x = 0
      for (let swap of orderedSwaps) {
        const srcAddr = swap.src
        const dstAddr = swap.dst
        const poolAddr = swap.id
        const { impact, amountIn, amountOut, amountInUSD, amountOutUSD } = swap
        const src = (srcAddr === swap.token0.id) ? swap.token0.symbol : swap.token1.symbol
        const dst = (dstAddr === swap.token0.id) ? swap.token0.symbol : swap.token1.symbol
        const srcId = `${srcAddr}-${i}`
        if (!graphs.find(x => x.id === srcId)) {
          graphs.push({
            id: srcId,
            sourcePosition: (srcAddr === formData.source.toLowerCase()) ? 'right' : null,
            type: (srcAddr === formData.source.toLowerCase()) ? 'input' : 'default',
            targetPosition: (srcAddr === formData.source.toLowerCase()) ? null : 'left',
            data: { label: 
              <div>
                <h5>{src.toUpperCase()}</h5>
                <i>{parseFloat(amountIn).toFixed(2)}</i>
                <p style={{color: '#85bb65'}}><b>{`$${parseFloat(amountInUSD).toFixed(2)}`}</b></p>
              </div> 
            },
            position: { x, y },
            style: (isUniRoute) ? {
              background: '#D6D5E6',
              color: '#333',
              border: '1px solid #fa0d61',
            } : null
          })
          x += 250
        }
        const dstId = `${dstAddr}-${i}`
        if (!graphs.find(x => x.id === dstId)) {
          graphs.push({
            id: dstId,
            sourcePosition: 'right',
            type: (dstAddr === formData.destination.toLowerCase()) ? 'output' : 'default',
            targetPosition: 'left',
            data: { label: 
              <div>
                <h5>{dst.toUpperCase()}</h5>
                <i>{parseFloat(amountOut).toFixed(2)}</i>
                <p style={{color: '#85bb65'}}><b>{`$${parseFloat(amountOutUSD).toFixed(2)}`}</b></p>
              </div> 
            },
            position: { x, y },
            style: (isUniRoute) ? {
              background: '#D6D5E6',
              color: '#333',
              border: '1px solid #fa0d61',
            } : null
          })
          x += 250
        }
        graphs.push({
          id: `${poolAddr}-${i}`,
          source: `${srcAddr}-${i}`,
          type: 'smoothstep',
          target: `${dstAddr}-${i}`,
          style: { stroke: i ? null : 'green' },
          animated: i ? false : true,
          // label: (isUniRoute) ? `Uniswap` : `${parseFloat(impact).toFixed(3)}%`,
          label: `${parseFloat(impact).toFixed(3)}%`,
          arrowHeadType: 'arrowclosed',
          labelBgStyle: (isUniRoute) ? { fill: '#fa0d61', color: '#fff', fillOpacity: 0.7 } : { fill: '#FFCC00', color: '#fff', fillOpacity: 0.7 }
        })
      }
      i += 1
      y += 150
    }
    this.setState({ graphs })
  }
  render() {
    const {
      graphs,
      uniRoute,
      coinList,
      loading,
      status
    } = this.state
    let routesEle = (graphs.length) ?
      (
        <div style={{marginTop: '50px',
                     flex: 1,
                     flexDirection: 'column',
                     alignItems: 'flex-start'}}>
          <div style={{
            height: window.innerHeight/1.7,
            alignItems: 'center',
            textAlign: 'center'
          }}>
            <h3>UNI Route Recommendation: {uniRoute}</h3>
            <Flow data={graphs}/>
          </div>
        </div>
      ) : undefined

    return (
      <Container textAlign='center'>
        <Header as='h1' style={{marginTop: '20px'}}>Uniswap Routing Playground</Header>
        <Segment>
          <DataForm 
            coinList={coinList} 
            handleSubmit={this.handleSubmit}
            handleAddition={this.handleAddition}
          />
          <Dimmer active={loading} inverted>
            <Loader inverted>{status}...</Loader>
          </Dimmer>
          {routesEle}
        </Segment>
      </Container>
    )
  }
}