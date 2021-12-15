import { getRouterUrl, ToolTip, createContentFromComponent, getUniqueKey, updateElementsForRender } from "./utils"
import  React from "react"
import './App.css'
import { uniTokens } from './Tokens'
import { Container, Segment, Header, Dimmer, Loader } from 'semantic-ui-react'
import DataForm from './Form'
import socketIOClient from 'socket.io-client'

const ROUTER_URL = getRouterUrl()

const FORM_INITIAL_STATE = {
  highlightUni: true,
  highlightValveSp: true,
  tokenAmounts: false,
  tokenAmountsUSD: true,
  slippage: true,
  gainToDest: false,
  proportion: false
}

export default class MultiRouteApp extends React.Component {
  constructor(props) {
    super(props)

    const elements = []

    this.socket = undefined
    this.formData = {}
    
    this.layoutOptions = { 
      name: 'breadthfirst',
      fit: true,
      directed: true,
      padding: 100,
    }
    this.cy = undefined
    this.currentPopper = undefined
    this.currentPopperEle = undefined

    this.addCount = 0
    this.currentPage = 0
    this.pages = []

    this.formState = FORM_INITIAL_STATE
    this.state = {
      coinList: [],
      loading: false,
      elements,
      highlightUni: true,
      highlightValveSp: true,
    }
  }

  initSocketAndHandlers = () => {
    if (!this.socket) {
      this.socket = socketIOClient(ROUTER_URL)
      this.socket.on('connect', () => {console.debug(`Connected to ${ROUTER_URL}.`)})
      this.socket.on('disconnect', (reason) => {console.debug(`Disconnected from ${ROUTER_URL} because ${reason}.`)})
      this.socket.on('connect_error', (error) => {
        console.debug(`Connection error.\n${error}`)
        this.socket.disconnect()
        this.socket = undefined
      })

      this.socket.on('multipath', (payload) => {
        if (payload && payload.hasOwnProperty('pages')) {
          this.pages = payload.pages
          this.currentPage = 0
          this.addCount = 0
          const alertOnEmpty = true
          const elements = this.updatePageElementsForRender(alertOnEmpty)
          this.setState({
            loading: false,
            elements,
          })
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

  updatePageElementsForRender() {
    if (!this.pages ||
        this.currentPage >= this.pages.length ||
        !this.pages[this.currentPage].hasOwnProperty('elements')) {
      let alertMsg = 'No routing results returned. Nothing to display.'
      console.error(alertMsg)
      alert(alertMsg)
      return []
    }

    const elements = [...this.pages[this.currentPage].elements]
    const formState = this.formState

    updateElementsForRender(elements, 
                            formState.tokenAmounts,
                            formState.tokenAmountsUSD,
                            formState.slippage,
                            formState.proportion,
                            formState.gainToDest)

    return elements
  }

  handleNextPage = (e) => {
    if (this.pages && this.pages.length > 0) {
      this.currentPage++
      this.addCount = 0
      if (this.currentPage > this.pages.length - 1) {
        this.currentPage = 0
      }

      const elements = this.updatePageElementsForRender()

      this.setState({
        elements
      })
    }
  }

  handleHighlightUni = (e) => {
    if (this.pages && this.pages.length > 0) {

      this.addCount = 0
      // Don't need to modify elements - no page change.
      const elements = [...this.pages[this.currentPage].elements]
      this.setState({
        elements,
        highlightUni: !this.state.highlightUni
      })
    }
  }

  handleHighlightValveSp = (e) => {
    if (this.pages && this.pages.length > 0) {

      this.addCount = 0
      // Don't need to modify elements - no page change.
      const elements = [...this.pages[this.currentPage].elements]
      this.setState({
        elements,
        highlightValveSp: !this.state.highlightValveSp
      })
    }
  }

  handleAdvancedControlChange = (formState) => {
    this.formState = formState

    if (this.pages && this.pages.length > 0) {
      this.addCount = 0
      const elements = this.updatePageElementsForRender()
      const stateChange = { elements }
      this.setState(stateChange)
    }
  }

  // Sends an usdTokenQuote event for the current source token amount
  // to the socket server and then waits REQUEST_TIMEOUT seconds for it
  // before doing nothing.
  handleUsdQuoteRequest = async (source, usdAmount) => {
    if (!this.socket) {
      this.initSocketAndHandlers()
    }

    const REQUEST_TIMEOUT = 5 * 1000   // five seconds
    this.socket.emit('usdTokenQuote', source, usdAmount)

    const tokens = await new Promise((resolve, reject) => {
      const status = {
        resolved: false
      }

      const listenerFn = (payload) => {
        if (!status.resolved) {
          status.resolved = true
          resolve(payload.tokens ? payload.tokens : '')
        }
      }
      this.socket.once('usdTokenQuote', listenerFn)

      setTimeout(() => {
                   if (!status.resolved) {
                     status.resolved = true
                     this.socket.offAny(listenerFn)
                     resolve('')
                     console.warn(`USD quote request for ${usdAmount} of ${source} timed out after ${REQUEST_TIMEOUT} ms.`)
                    }
                 }, 
                 REQUEST_TIMEOUT)
    })

    return tokens
  }

  handleCyMouseover = (evt) => {
    const id = evt.target.id()
    const targetObj = this.cy.getElementById(id).json()
    let content = []
    const { data } = targetObj
    if (data) {
      content.push(`Pair ID: ${data.pairId}`)
      content.push(`Segment slippage: ${data.slippage}`)
      content.push(`Gain to destination:`)
      if (data.gainToDest) {
        for (const routeId in data.gainToDest) {
          const gain = data.gainToDest[routeId]
          content.push(` * ${gain} (route: ${routeId})`)
        }
      }
      if (data.trades) {
        for (const tradeId in data.trades) {
        content.push(`Trade ${tradeId}:`)
          const trade = data.trades[tradeId]
          content.push(` * proportion ${trade.proportion}`)
          content.push(` * impact ${trade.impact}`)
          content.push(` * input ${trade.inputAmountP}  ($${trade.inputUsd})`)
          content.push(` * output ${trade.outputAmount}  ($${trade.outputUsd})`)
        }
      }
    }

    this.currentPopperEle = createContentFromComponent(<ToolTip content={content}/>)
    this.currentPopper = evt.target.popper({
      content: this.currentPopperEle,
      popper: {
        placement: 'right',
        removeOnDestroy: true
      }
    })
  }

  handleCyMouseout = () => {
    if (this.currentPopper) {
      this.currentPopper.destroy()
      document.body.removeChild(this.currentPopperEle)
      this.currentPopper = undefined
      this.currentPopperEle = undefined
    }
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
    this.setState({loading: true})
    const {
      source,
      destination,
      amount,
      hops,
      results,
      impact,
      updateData,
      ignoreMaxHops
    } = formData
    const reqData = {
      "route": {
        "source": source.toLowerCase(),
        "dest": destination.toLowerCase(),
        "amount": amount,
        "options": {
            "max_hops": hops,
            "max_results": results,
            "max_impact": impact,
            "update_data": updateData,
            "ignore_max_hops": ignoreMaxHops
        }
      }
    }
    if (!this.socket) {
      this.initSocketAndHandlers()
    }
    this.formData = formData  // Store the formData in a member var for the socket 'route' handler 
    this.socket.emit('multipath', ...Object.values(reqData.route))
  }

  render() {
    const {
      coinList,
      loading,
      status,
      elements
    } = this.state
    
    const { CytoscapeComp } = this.props

    // See https://github.com/plotly/react-cytoscapejs for documentation on CytoscapeComponent:
    //
    const currPage = this.pages[this.currentPage]
    const isMultiroute = (currPage && currPage.trade && currPage.trade.isMultiroute)
    const highlightOn = isMultiroute ? true : this.state.highlightUni
    const highlightValveSp = isMultiroute ? false : this.state.highlightValveSp

    const pageDetails = (elements && elements.length) ? 
      ( <div>
          <Header style={{marginTop: 35, marginBottom: 0}} as='h2'>{currPage.title}</Header>
          {currPage.description.map(row => {
            return (row.textStyle === 'bold') ?
              (<div key={getUniqueKey()} style={{marginTop: 5, marginBottom: 0, fontWeight: 'bold'}}>{row.text}</div>) :
              (<div key={getUniqueKey()} style={{marginTop: 5, marginBottom: 0}}>{row.text}</div>)
          })}
          
        </div>
      ) : undefined

    const ele = (elements && elements.length) ? ( <CytoscapeComp
      cy={(cy) => {
        if (!this.cy) {
          this.cy = cy

          cy.on('add', evt => {
            // console.debug(`add called on ${evt.target.id()}`)
            this.addCount++
            if (this.addCount === this.state.elements.length) {
              // console.debug(`Added all elements. Attempting to rerun layout and add edge mouseover handlers...`)
              cy.layout(this.layoutOptions).run()
              // cy.fit(undefined, 50)

              cy.edges().on('mouseover', evt => {
                this.handleCyMouseover(evt)
              })

              cy.edges().on('mouseout', () => {
                this.handleCyMouseout()
              })
            }
          })

          /* mouseover and mouseout are replicated here
           * b/c the first time the component is created,
           * the add event is not generated.
           */
          cy.edges().on('mouseover', evt => {
            this.handleCyMouseover(evt)
          })

          cy.edges().on('mouseout', () => {
            this.handleCyMouseout()
          })

          // cy.on('remove', evt => {
          //   console.debug(`remove called on ${evt.target.id()}`)
          // })

        }}
      }

      elements={this.state.elements}
      layout={this.layoutOptions}
      style={ { textAlign: 'left',
                display: 'block',
                height: '50vh',
                width: '100%',
                minHeight: '600px',
                minWidth: '800px',
                backgroundColor: 'white' } }

      stylesheet={[
        {
          // See: https://js.cytoscape.org/#style/node-body
          selector: 'node',
          style: {
            'width': 75,
            'height': 75,
            'shape': (highlightValveSp) ? 'data(shape)' : 'ellipse',
            'label': 'data(label)',
            'background-color': (highlightOn) ? 'data(color)' : 'LightGray',
            'border-color': 'black',
            'border-width': 1,
            'border-style': 'solid',
            'text-wrap': 'wrap',
            'text-max-width': 256,
            'text-halign': 'left',
            'text-valign': 'center',
            'text-margin-x': -10
          }
        },
        // See: https://js.cytoscape.org/#style/edge-line
        {
          selector: 'edge',
          style: {
            'width': 3,
            'line-color': (highlightOn) ? 'data(color)' : 'Gainsboro',
            'target-arrow-color': (highlightOn) ? 'data(color)' : 'Gainsboro',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 2,
            'curve-style': 'bezier',
            'text-wrap': 'wrap',
            'text-max-width': 256,
            'label': 'data(label)',
            'text-halign': 'left',
            'text-valign': 'center'
          }
        }
      ]} 
      userZoomingEnabled={false}
      /> ) : undefined

    return (
      <Container textAlign='left' style={{ paddingTop: '5em' }}>
        <Header as='h1' style={{marginTop: '20px'}}>Uniswap Trade Simulation Analysis</Header>
        <Segment>
          <DataForm
            defaultTokens={true}
            nextPageCB={this.handleNextPage}
            highlightUniCB={this.handleHighlightUni}
            advancedControlCB={this.handleAdvancedControlChange}
            getQuoteUsdCB={this.handleUsdQuoteRequest}
            initialState={FORM_INITIAL_STATE}
            coinList={coinList} 
            handleSubmit={this.handleSubmit}
            handleAddition={this.handleAddition}
          />
          {pageDetails}
          {ele}
        </Segment>
        <Dimmer active={loading} inverted>
          <Loader inverted>{status}</Loader>
        </Dimmer>
      </Container>
    )
  }
}
