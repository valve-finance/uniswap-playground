
import { getRouterUrl, 
         getUniqueKey,
         ToolTip,
         createContentFromComponent,
         styleExistingAnalysisOptions,
         getPageDetails, 
         getCytoscapeComp,
         getReportGenerateController} from "./utils"
import  React from "react"
import './App.css'
import { Container, Segment, Header, Dimmer, Loader, Dropdown, Button, Popup, Icon } from 'semantic-ui-react'
import socketIOClient from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid';

const ROUTER_URL = getRouterUrl()

class CollapseButton extends React.Component
{
  constructor(props) {
    super(props)
    this.state = {
      expanded: false
    }
  }
  
  handleClick = () => {
    if (this.props.onClick) {
      this.props.onClick(this.props.collapsibleSectionIdx)
      this.setState({ expanded: !this.state.expanded })
    }
  }

  render = () => {
    return (
      <Button icon
              basic
              color='blue'
              size='mini'
              circular
              onClick={this.handleClick}>
        { this.state.expanded ?  <Icon name='chevron up'/> : <Icon name='chevron down'/> }
      </Button> )
  }
}

export default class ReportApp extends React.Component
{
  constructor(props) {
    super(props)

    this.clientId = uuidv4()
    this.socket = undefined


    // Route viewing members:
    //
    this.addCount = 0
    this.currentPage = 0
    this.pages = []
    this.poppedPages = undefined
    //
    this.cy = undefined
    this.layoutOptions = { 
      name: 'breadthfirst',
      fit: true,
      directed: true,
      padding: 100
    }
    //
    this.currentPopper = undefined
    this.currentPopperEle = undefined
    //
    this.scrollBack = false
    this.scrollY = 0
    this.collapseState = {}

    const elements = []
    this.state = {
      status: '',
      // Report UX setting state vars:
      //
      existingAnalysisOptions: [],
      blockNumberOptions: [],
      tokenSetOptions: [],
      proportioningAlgorithmOptions: [],
      maximumSwapsPerPathOptions: [],
      //
      showReportParams: false,
      existingAnalysis: undefined,
      analysisDescription: '',
      blockNumber: undefined,
      tokenSet: undefined,
      tradeAmount: 7500000,
      proportioningAlgorithm: undefined,
      maximumSwapsPerPath: undefined,
      maximumSegmentSlippage: 80,
      maximumRouteSlippage: 90,
      maximumConcurrentPaths: 10,
      maximumRoutesConsidered: 25,
      removeDuplicatePathPairs: true,
      limitSwapsForWETH: true,
      //
      // Collapsible element state
      //
      collapsibleSections: {},
      // Route viewing state vars:
      //
      elements,
      highlightUni: true,
      highlightValveSp: true,
      loading: false
    }
  }

  initSocketAndHandlers = () => {
    if (!this.socket) {
      this.socket = socketIOClient(ROUTER_URL)

      this.socket.on('connect', () => {
        console.debug(`Connected to ${ROUTER_URL}.`)
        this.socket.emit('report-init', this.clientId)
      })

      this.socket.on('disconnect', (reason) => {
        console.debug(`Disconnected from ${ROUTER_URL} because ${reason}.`)
      })

      this.socket.on('connect_error', (error) => {
        console.debug(`Connection error.\n${error}`)
        this.socket.disconnect()
        this.socket = undefined
      })

      this.socket.on('report-init', (payload) => {
        if (payload && payload.reportOptionsState) {
          const {reportOptionsState} = payload
          const {blockNumber, tokenSet, proportioningAlgorithm, maximumSwapsPerPath} = this.state
          if (!blockNumber && 
              reportOptionsState.blockNumberOptions &&
              reportOptionsState.blockNumberOptions.length) {
            //
            // Default it to the last block:
            //
            const lastBlockIdx = reportOptionsState.blockNumberOptions.length - 1
            reportOptionsState.blockNumber =
                reportOptionsState.blockNumberOptions[lastBlockIdx].value
          }
          if (!tokenSet) {
            reportOptionsState.tokenSet = 'Tokens in Pairs with $100M Liquidity'
          }
          if (!proportioningAlgorithm) {
            reportOptionsState.proportioningAlgorithm = 'MGTD4'
          }
          if (!maximumSwapsPerPath) {
            reportOptionsState.maximumSwapsPerPath = '3'
          }
          this.setState(reportOptionsState)
        }
      })
      
      this.socket.on('report-update', (payload) => {
        if (payload && payload.existingAnalysisOptions) {
          const { existingAnalysisOptions } = payload
          this.setState({ existingAnalysisOptions })
        }
      })

      this.socket.on('report-select', (payload) => {
        this.handleReportFromServer(payload)
      })

      this.socket.on('report-generate', (payload) => {
        this.handleReportFromServer(payload)
      })

      this.socket.on('report-fetch-route', (payload) => {
        const {paramsHash, src, dst, pages, error} = payload
        if (error) {
          console.error(`Failed to load route information.\n${error}`)
          this.setState({ loading: false })
        } else {
          if (pages && pages.length) {
            // Save the report page we're viewing
            this.poppedPages = this.pages

            // Setup the page of routes
            this.currentPage = 0
            this.pages = pages
            this.addCount = 0
            const elements = this.getElementsForRender()
            
            this.setState({ loading: false, elements })
          } else {
            console.error(`No route information available.\n${error}`)
            this.setState({ loading: false })
          }
        }
      })

      this.socket.on('status', (payload) => {
        if (payload && payload.status) {
          this.setState({status: payload.status})
        }
      })
    }
  }

  componentDidMount = async () => {
    this.initSocketAndHandlers()
  }

  componentDidUpdate = () => {
    if (this.scrollBack) {
      this.scrollBack = false
      window.scrollTo(0, this.scrollY)
    }
  }

  getElementsForRender(alertOnEmpty=false) {
    if (!this.pages ||
        this.currentPage >= this.pages.length ||
        !this.pages[this.currentPage].hasOwnProperty('elements')) {
      let alertMsg = 'No routing results returned. Nothing to display.'
      console.error(alertMsg)
      alert(alertMsg)
      return []
    }

    const elements = [ ...this.pages[this.currentPage].elements ]
    // TODO: Bring the control panel into the report route viewer
    const formState = {
      tokenAmounts: true,
      tokenAmountsUSD: true,
      gainToDest: true,
      slippage: false,
      proportion: true
    }

    // Modify the element label properties based on the state vars:
    //
    elements.forEach(element => {
      const eleData = element.data
      const isNode = eleData.hasOwnProperty('symbol')

      if (isNode) {
        let labelLines = [ eleData.symbol ]
        formState.tokenAmounts && labelLines.push(parseFloat(eleData.amount).toFixed(6))
        formState.tokenAmountsUSD && labelLines.push(`($${eleData.amountUSD})`)
        eleData.label = labelLines.join('\n')
      } else {  // edge
        const isMultiroute = eleData.hasOwnProperty('trades')
        let labelLines = []

        if (isMultiroute) {
          if (eleData.trades) {
            let impact = 0.0
            let proportion = 0.0

            // Use the first trade for now.
            for (const tradeKey in eleData.trades) {
              const trade = eleData.trades[tradeKey]
              impact = parseFloat(trade.impact)
              proportion = 100 * trade.proportion
              break
            } 

            if (formState.slippage) {
              labelLines.push(`Slip: ${impact.toFixed(3)}%`)
              labelLines.push(`(Prev: ${parseFloat(eleData.slippage).toFixed(3)}%)`)
            }
            if (formState.proportion) {
              labelLines.push(`Prop: ${proportion.toFixed(3)}%`)
            }
          }
        } else {
          formState.slippage && labelLines.push(`Slip: ${parseFloat(eleData.slippage).toFixed(3)}%`)
        }

        if (formState.gainToDest) {
          let maxGTD = 0.0
          Object.values(eleData.gainToDest).forEach(gtd => (maxGTD = (maxGTD > gtd) ? maxGTD : gtd))
          let maxGTDPct = maxGTD * 100
          labelLines.push(`MGTD: ${maxGTDPct.toFixed(3)}%`)
        }

        eleData.label = labelLines.join('\n')
      }

    })

    return elements
  }

  handleReportFromServer = (serverPayload) => {
    if (serverPayload && serverPayload.hasOwnProperty('pages')) {
      this.pages = serverPayload.pages
      this.currentPage = 0
      this.addCount = 0
      const alertOnEmpty = true
      const elements = this.getElementsForRender(alertOnEmpty)
      this.collapseState = {}
      this.setState({ loading: false, elements, status: '' })
    }
  }

  handleNextPage = async(e) => {
    if (this.pages && this.pages.length > 0) {
      this.currentPage++
      this.addCount = 0
      if (this.currentPage > this.pages.length - 1) {
        this.currentPage = 0
      }

      const elements = JSON.parse(JSON.stringify(this.getElementsForRender()))

      this.setState({
        elements
      })
    }
  }
  
  handlePrevPage = (e) => {
    if (this.pages && this.pages.length > 0) {
      this.currentPage--
      this.addCount = 0
      if (this.currentPage < 0) {
        this.currentPage = this.pages.length - 1
      }

      const elements = this.getElementsForRender()

      this.setState({
        elements
      })
    }
  }

  handleBackToReport = (e) => {
    if (this.poppedPages) {
      // Go back to the report page that is loaded:
      this.currentPage = 0
      this.pages = this.poppedPages
      this.poppedPages = undefined

      // NOTE: workaround - disposes of memory, may need to add
      //       code to wait for this.cy.destroyed() or route diagrams
      //       won't appear properly:
      //
      this.cy.destroy()
      this.cy = undefined

      const elements = this.getElementsForRender()
      this.setState({ elements })
      this.scrollBack = true
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

  handleViewRoute = (paramsHash, src, dst) => {
    if (!this.socket) {
      this.initSocketAndHandlers()
    }

    this.socket.emit('report-fetch-route', {paramsHash, src, dst})
    this.scrollY = window.scrollY
    this.setState({ loading: true })
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

  handleReportSelect = (paramsHash) => {
    if (!this.socket) {
      this.initSocketAndHandlers()
    }

    this.setState({loading: true, existingAnalysis: paramsHash}) 
    this.socket.emit('report-select', paramsHash)
  }

  handleReportGenerate = (e) => {
    e.preventDefault()

    if (!this.socket) {
      this.initSocketAndHandlers()
    }

    this.setState({loading: true})
    
    const properties = [ "analysisDescription",
                         "blockNumber",
                         "tokenSet",
                         "tradeAmount",
                         "proportioningAlgorithm",
                         "maximumSwapsPerPath",
                         "maximumSegmentSlippage",
                         "maximumRouteSlippage",
                         "maximumConcurrentPaths",
                         "maximumRoutesConsidered",
                         "removeDuplicatePathPairs",
                         "limitSwapsForWETH" ]

    const reportParameters = {}
    for (const parameter of properties) {
      reportParameters[parameter] = this.state[parameter]
    }

    this.socket.emit('report-generate', reportParameters)
  }

  handleCollapse = (collapsibleContainerId) => {
    const elementId = `cSection${collapsibleContainerId}`
    const cSectionDiv = document.getElementById(elementId)
    if (cSectionDiv) {
      cSectionDiv.style.display =
        (cSectionDiv.style.display === 'none') ? 'block' : 'none'

      this.collapseState[elementId] = cSectionDiv.style.display
    }
  }

  render() {
    const { CytoscapeComp, allowGenerate } = this.props

    const {
      status,
      existingAnalysisOptions,
      showReportParams,
      elements,
      highlightUni,
      highlightValveSp,
      loading } = this.state


    const currPage = this.pages[this.currentPage]

    const isMultiroute = (currPage && currPage.trade && currPage.trade.isMultiroute)
    const highlightOn = isMultiroute ? true : highlightUni
    const shapesValveSp = isMultiroute ? false : highlightValveSp

    const _styledExistingAnalysisOptions = styleExistingAnalysisOptions(existingAnalysisOptions,
                                                                        showReportParams)

    let generateReportController = undefined
    if (allowGenerate) {
      generateReportController = getReportGenerateController(this)
    }

    const pageDetails = getPageDetails(currPage)


    let mainView = undefined
    if (elements.length) {
      // Trade-Tree View and Page Controls (i.e. user viewing a specific trade)
      //
      mainView = (
        <Segment>
          <div style={{display: 'flex', flexDirection: 'row'}}>
            <Button color='blue' size='small' onClick={(e) => this.handleBackToReport(e)}>
              Back to Report
            </Button>
            <div style={{flex: 1}} />
            <Button color='teal' size='small' onClick={(e) => this.handlePrevPage(e)}>
              Previous Diagram&nbsp;&lt;&lt;
            </Button>
            <Button color='teal' size='small' onClick={(e) => this.handleNextPage(e)}>
              Next Diagram&nbsp;&gt;&gt;
            </Button>
          </div> 

          {pageDetails}

          {getCytoscapeComp(CytoscapeComp, this, highlightOn, shapesValveSp)}
        </Segment>
      )
    } else if (currPage && currPage.hasOwnProperty('content')) {
      // Report View and Collapse / Expand / View Controls 
      //
      const sectionStyle = {display:'flex',
                            width:'100%',
                            marginTop: 25,
                            borderColor:'black',
                            borderStyle: 'solid',
                            borderTopWidth: 0,
                            borderLeftWidth: 0,
                            borderRightWidth: 0,
                            borderBottomWidth: 1}
      const subSectionStyle = {display:'flex',
                               width:'100%',
                               marginTop: 15,
                               alignItems: 'center'}
      const tradeLineStyle = {display: 'flex',
                              flexDirection: 'row',
                              marginTop: 2,
                              alignItems: 'center',
                              fontFamily: 'monospace'}

      const reportElements = []
      
      // Collaspsible section management for creation & state
      //
      let cSectionElements = undefined
      let cSectionIdx = 0

      for (const reportLine of currPage.content) {
        let rowEle = undefined

        switch (reportLine.type) {
          case 'section':
            rowEle = (<span key={getUniqueKey()}>
                        <h2 style={sectionStyle} >
                          {reportLine.row}
                        </h2>
                      </span>)
            break

          case 'sub-section':
            rowEle = (<span key={getUniqueKey()} style={{alignItems: 'baseline'}}>
                        <h3 style={subSectionStyle}>
                          {reportLine.row}
                          {/* Button to handle dynamic section id values for onclick */}
                          {reportLine.collapsible ? 
                            <CollapseButton key={getUniqueKey()}
                                            collapsibleSectionIdx={cSectionIdx}
                                            onClick={this.handleCollapse} /> : 
                            undefined
                          }
                        </h3>
                      </span>)
            break

          case 'bold':
            rowEle = (<span key={getUniqueKey()} style={{fontWeight: 'bold'}}>
                        {reportLine.row}<br/>
                      </span>)
            break

          case 'indent':
            rowEle = (<span key={getUniqueKey()} style={{marginLeft: '2em', fontFamily: 'monospace'}}>
                        {reportLine.row}<br/>
                      </span>)
            break
        
          default:
            if (reportLine.src && reportLine.dst) {
              let viewButton = undefined
              if (reportLine.view) {
                viewButton = (<Popup key={getUniqueKey()}
                                     content={reportLine.row}
                                     trigger={
                                       <Button size='mini'
                                               color='blue'
                                               onClick={() => this.handleViewRoute(currPage.paramsHash,
                                                                                   reportLine.src,
                                                                                   reportLine.dst)}>
                                          View
                                        </Button> } 
                              /> )
              }

              rowEle = (<span key={getUniqueKey()} style={tradeLineStyle}>
                          <span style={{flex: 1, textAlign: 'left'}}>
                            {reportLine.row}
                          </span>
                          {viewButton}
                        </span>)
            } else {
              rowEle = (<span key={getUniqueKey()} style={{fontFamily: 'monospace'}}>
                          {reportLine.row}<br/>
                        </span>)
            }
            break
        }


        if (reportLine.type === 'section' ||
            reportLine.type === 'sub-section') {

          // Process the last sub section container
          if (cSectionElements) {
            const elementId = `cSection${cSectionIdx-1}`
            const displaySetting = this.collapseState.hasOwnProperty(elementId) ? this.collapseState[elementId] : 'none'

            reportElements.push(
              <div id={elementId} key={getUniqueKey()} style={{display: displaySetting}}>
                {cSectionElements}
              </div>
            )
          }
            
          reportElements.push(rowEle)
          if (reportLine.type === 'sub-section') {
            // Create new sub section container
            cSectionElements = []
            cSectionIdx++
          } else {
            // Don't put content in a sub section container
            cSectionElements = undefined
          }
        } else {
          if (cSectionElements) {
            cSectionElements.push(rowEle)
          } else {
            reportElements.push(rowEle)
          }
        }
      }
      // Process the final sub section container if it exists
      if (cSectionElements) {
        const elementId = `cSection${cSectionIdx-1}`
        const displaySetting = this.collapseState.hasOwnProperty(elementId) ? this.collapseState[elementId] : 'none'

        reportElements.push(
          <div id={elementId} key={getUniqueKey()} style={{display: displaySetting}}>
            {cSectionElements}
          </div>
        )
        cSectionElements = undefined
      }

      mainView = (
        <Segment>
          {pageDetails}
          <div style={{textAlign: 'left'}}>
            {reportElements}
          </div>
        </Segment> )
    }

    return (
      <Container textAlign='left' style={{ paddingTop: '5em' }}>
        <Header as='h1' style={{marginTop: '20px'}}>Uniswap Routing Performance Analysis</Header>
        <Dimmer active={loading} inverted>
          <Loader inverted>{status}...</Loader>
        </Dimmer>

        <Segment>
          <div style={{display: 'flex', flexDirection: 'column'}}>
            <Header as='h3'>Existing Analysis</Header>
            <div style={{display: 'flex', flex: 1, flexDirection: 'row'}}>
              <Dropdown
                style={{minHeight: 'auto', maxHeight: '20rem', marginRight: 5}}
                placeholder='Select an existing analysis...'
                fluid
                selection
                options={_styledExistingAnalysisOptions}
                onChange={(e, { value }) => this.handleReportSelect(value)} />
              <Button toggle 
                      size='tiny'
                      active={showReportParams}
                      onClick={(e) => this.setState({showReportParams: !showReportParams})}>
                Show Parameters
              </Button>
            </div>
          </div>
        </Segment>

        {generateReportController}
        {mainView}
      </Container>
    )
  }
}