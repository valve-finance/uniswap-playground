import React from 'react'
import { Container, Table, Popup, Button, Modal, Icon } from 'semantic-ui-react'
import { v4 as uuidv4 } from 'uuid';
import { getCytoscapeCompModal,
         ToolTip,
         createContentFromComponent,
         updateElementsForRender,
         getUniqueKey } from './utils'

export default class CollapsibleRouteTable extends React.Component
{
  constructor(props) {
    super(props)
    const { title, headerData, routes, maxRoutes, sortOrder, sortPath,
            collapsible, expanded, 
            bindUpdateFn } = props

    // Cytoscape fun
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
    this.elements = []

    if (bindUpdateFn) {
      bindUpdateFn(this.update)
    }

    this.maxRoutes = 100
    if (maxRoutes) {
      const pMaxRoutes = parseInt(maxRoutes)
      if (!isNaN(pMaxRoutes) && pMaxRoutes > 0) {
        this.maxRoutes = pMaxRoutes
      }
    }

    this.sortOrder = (sortOrder) ? sortOrder : undefined
    this.sortPath = (sortPath) ? sortPath : undefined

    this.collapsible = true
    if (collapsible !== undefined) {
      this.collapsible = (collapsible) ? true : false
    }
    
    let _expanded = (expanded) ? true : false
    if (!this.collapsible) {
      _expanded = true 
    }

    // Used for collapse button to get display and set to table/none
    this.tableId = uuidv4()

    this.state = {
      title,
      headerData,
      routes: routes ? routes: [],
      expanded: _expanded
    }
  }

  /*
   * Janky - really screaming for state mgmt like redux.
   * Next fn must be => fn as it gets bound to
   * the parent component's socket.
   */
  update = (routes) => {
    // console.log('CollapsibleRouteTable update called')
    // console.log(routes)

    // Trim the number of maxroutes down ...
    const updatedRoutes = [routes, ...this.state.routes]
    if (updatedRoutes.length > this.maxRoutes) {
      updatedRoutes.splice(this.maxRoutes, (updatedRoutes.length - this.maxRoutes))
    }

    // Sort in the specified order
    if (this.sortOrder && this.sortPath) {
      updatedRoutes.sort((routeObjA, routeObjB) => {
        const routeDataA = routeObjA.routeData
        const routeDataB = routeObjB.routeData
        
        if (!routeDataA || !routeDataB) {
          return 0
        }

        const tradeA = routeDataA[this.sortPath]
        const tradeB = routeDataB[this.sortPath]
        if (!tradeA || !tradeB) {
          return 0
        }

        const deltaA = tradeA.delta
        const deltaB = tradeB.delta
        return (this.sortOrder === 'asc') ?
          (deltaA - deltaB) :
          (deltaB - deltaA)
      })
    }

    this.setState({ routes: updatedRoutes })
  }

  getCollapseButton() {
    if (this.collapsible) {
      return <Button icon
                    style={{marginLeft: '1em'}}
                    color='blue'
                    size='mini'
                    basic
                    circular 
                    onClick={(evt) => {
                      const tableEle = document.getElementById(this.tableId)
                      if (tableEle) {
                        tableEle.style.display = (tableEle.style.display === 'none') ?
                          'table' : 'none'
                      }
                      this.setState({expanded: !this.state.expanded})
                    }}>
              { this.state.expanded ? <Icon name='chevron up'/> : <Icon name='chevron down'/> }
            </Button>
    }

    return undefined
  }

  getTableTitle(title) {
    return <div style={{marginTop: 5,
                        display: 'flex', width: '100%', 
                        alignItems: 'center',
                        borderBottomStyle: 'solid', borderBottomColor: 'lightgray', borderBottomWidth: 1,
                        paddingBottom: 3}}>
             <h4 style={{marginBottom: 0}}>{title}</h4>
             <span style={{flex: 1}} />
             {this.getCollapseButton()}
           </div>
  }

  getHeaderCell(cellData) {
    if (cellData && cellData.mouseover) {
      return  <Table.HeaderCell key={getUniqueKey()}>
                <Popup  content={cellData.mouseover}
                        trigger={<span>{cellData.text}</span>} />
              </Table.HeaderCell> 
    } else if (cellData) {
      return <Table.HeaderCell key={getUniqueKey()}>{cellData.text}</Table.HeaderCell>
    } else {
      return undefined
    }
  }

  getTimeCell(timeInSeconds) {
    const timeInMilliseconds = timeInSeconds * 1000
    const date = new Date(timeInMilliseconds)
    return (
      <Table.Cell>
        {date.toLocaleTimeString()}<br/>
        {date.toLocaleDateString()}
      </Table.Cell>
    )
  }

  getTransactionCell(transactionId, dstAmount, usdApprox) {
    let brEle = undefined
    let usdString = ''
    if (usdApprox) {
      const usdAmount = parseFloat(usdApprox)
      if (!isNaN(usdAmount)) {
        brEle = <br />
        usdString = `($${new Intl.NumberFormat().format(usdAmount.toFixed(2))} USD)`
      }
    }

    return (
      <Table.Cell>
        <Popup content={`Etherscan transaction: ${transactionId}`}
              trigger={
                  <a href={`https://etherscan.io/tx/${transactionId}`}
                     target='_blank'
                     rel='noreferrer' >
                    {dstAmount}{brEle}
                    {usdString}
                  </a>
              } />
      </Table.Cell>
    )
  }

  getTokenButton(tokenAddr, tokenSymbol) {
    const tokenLink = <a href={`https://etherscan.io/address/${tokenAddr}`} 
                         target='_blank'
                         rel='noreferrer' >{tokenSymbol}</a>
    return  <Table.Cell>
              <Popup content={`Etherscan contract: ${tokenAddr}`} trigger={tokenLink} />
            </Table.Cell>
  }

  getCellClass(aCellValueNumerical) {
    if (aCellValueNumerical > 0.0)
      return 'positive'
    else if (aCellValueNumerical < 0.0)
      return 'negative'
    else
      return ''
  }

  getResultCell(routeData, routeSelector) {
    const trade = routeData[`${routeSelector}-path`]

    const ZERO_THRESH = 0.000000001

    const isNonZero = (Math.abs(trade.delta) > ZERO_THRESH)
    const deltaThresh = isNonZero ?  trade.delta : 0
    const tokenEst = `${parseFloat(trade.valve.token).toFixed(3)}`

    let improvement = `(${deltaThresh.toFixed(0)}%)`
    let viewButton = undefined
    if (isNonZero) {
      const isSinglePath = (routeSelector === 'single')
      const tradeType = isSinglePath ? 'Single Path Trade' : 'Multi-Path Trade'
      const title = `Valve Finance ${tradeType}: ${trade.srcSymbol} --> ${trade.dstSymbol}`
      const description = [
        `Estimated Uniswap trade produced ${parseFloat(trade.uni.token).toFixed(3)} ${trade.dstSymbol}.`,
        `Estimated Valve Finance trade produced ${parseFloat(trade.valve.token).toFixed(3)} ${trade.dstSymbol}`,
        `Valve Finance yielded ${deltaThresh.toFixed(3)}% ${(deltaThresh > 0) ? 'more' : 'less'} tokens.`
      ] 

      this.cy = undefined
      this.addCount = 0
      this.elements = routeData[`${routeSelector}-path-elements`]
      updateElementsForRender(this.elements,
                              false,          // tokenAmounts
                              true,           // tokenAmountsUSD,
                              isSinglePath,          // slippage,
                              !isSinglePath,  // proportion,
                              !isSinglePath)  // gain to dest

      improvement = (deltaThresh > 0) ? `(+${deltaThresh.toFixed(3)}%)` : `(${deltaThresh.toFixed(3)}%)`
      viewButton = <Modal trigger={ <Button icon basic color='blue' size='mini' ><Icon name='picture'/></Button> } 
                          header={title}
                          style={{width:'70vw', height: '70vh'}}
                          content={ 
                            <div style={{display: 'flex', flexDirection: 'column', flex: 1, width: '100%', height: '90%'}}>
                              <div style={{padding: 10}}>
                                {description.map(desc => {
                                  return <span key={getUniqueKey()}>{desc}<br /></span>
                                })}
                              </div>
                              {getCytoscapeCompModal(this.props.CytoscapeComp, this, true, isSinglePath)}
                            </div>
                          }
                          actions={[{ key: 'done', content: 'Done', positive: true }]} />
    }

    return (
      <Table.Cell className={this.getCellClass(deltaThresh)}>
        <div style={{display: 'flex', flexDirection: 'row'}}>
          <span style={{flex: 1}}>{tokenEst}&nbsp;{improvement}</span>
          <span style={{flex: 0}}>{viewButton}</span>
        </div>
      </Table.Cell>
    )
  }

  getSpResultCell(routeData) {
    return this.getResultCell(routeData, 'single')
  }

  getMpResultCell(routeData) {
    return this.getResultCell(routeData, 'multi')
  }

  getRow(route) {
    const { timestamp, actualTxn, routeData } = route
    if (actualTxn && routeData) {
      const { id, srcAddr, srcSymbol, dstAddr, dstSymbol, dstAmount, usdApprox } = actualTxn

      const sPath = routeData['single-path']
      if (!sPath) {
        console.warn(`Transaction with no results.`, actualTxn, routeData)
        return undefined
      }

      const uniActual = `${parseFloat(dstAmount).toFixed(3)}`
      const uniEst = `${parseFloat(sPath.uni.token).toFixed(3)}`

      return (
        <Table.Row key={id}>
          {this.getTimeCell(timestamp)}
          {this.getTokenButton(srcAddr, srcSymbol)}
          {this.getTokenButton(dstAddr, dstSymbol)}
          {this.getTransactionCell(id, uniActual, usdApprox)}
          <Table.Cell>{uniEst}</Table.Cell>
          {this.getSpResultCell(routeData)}
          {this.getMpResultCell(routeData)}
        </Table.Row>
      )
    }
    return undefined
  }

  handleCyMouseover(evt) {
    const id = evt.target.id()
    const targetObj = this.cy.getElementById(id).json()
    console.log(`handleCyMouseover called on `, targetObj)
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

  handleCyMouseout() {
    if (this.currentPopper) {
      this.currentPopper.destroy()
      document.body.removeChild(this.currentPopperEle)
      this.currentPopper = undefined
      this.currentPopperEle = undefined
    }
  }


  render() {
    const { title, headerData, routes, expanded } = this.state

    return (
      <Container textAlign='left'>
        {this.getTableTitle(title)}

        <Table id={this.tableId} striped celled style={{textAlign: 'center',
                                                        display: expanded ? 'table' : 'none' }}>
          <Table.Header>
            <Table.Row>
              {headerData.map(cellData => { return this.getHeaderCell(cellData) })}
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {routes.map(route => { return this.getRow(route)} )}
          </Table.Body>
        </Table>
      </Container>
    )
  }
}