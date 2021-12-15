import ReactDOM from 'react-dom'
import { Container, Segment, Header, Dropdown, Form, Button } from 'semantic-ui-react'

/*
 * CAREFUL - one of these returns a port, the other a path only b/c
 *           of how NGINX is forwarding https trafic.
 */
export const getTrackerUrl = () => {
  // const remote = (process.env.NODE_ENV !== 'development' ||
  //                 process.env.REACT_APP_FORCE_REMOTE === 'on')
  // if (remote) {
  //   return `${process.env.REACT_APP_TRACKER_HOST}`
  // } 

  // return `${process.env.REACT_APP_LOCAL_HOST}:${process.env.REACT_APP_TRACKER_PORT}`
  return `http://localhost:3032`
}

/*
 * CAREFUL - one of these returns a port, the other a path only b/c
 *           of how NGINX is forwarding https trafic.
 */
export const getRouterUrl = () => {
  // const remote = (process.env.NODE_ENV !== 'development' ||
  //                 process.env.REACT_APP_FORCE_REMOTE === 'on')
  // if (remote) {
  //   return `${process.env.REACT_APP_ROUTER_HOST}`
  // }
  // return `${process.env.REACT_APP_LOCAL_HOST}:${process.env.REACT_APP_ROUTER_PORT}`
  return `http://localhost:3031`
}


let _key = 0
export const getUniqueKey=() => {
  return `${_key++}`
}

export const createToolTipLine = (line) => {
  return ( <span key={getUniqueKey()}>{line}<br/></span>)
}

export const ToolTip = (props) => {
  const ttStyle = {backgroundColor:'white',
                   borderStyle: 'dashed',
                   borderWidth: '1',
                   borderColor: 'black',
                   borderRadius: 5,
                   padding: 15,
                   width: 450 }

  const toolTipContainer = (props && props.content) ?
      ( <Container type="container" style={ttStyle}>{props.content.map(createToolTipLine)}</Container> ) :
      undefined

  return toolTipContainer
}

export const createContentFromComponent = (component) => {
  const domEle = document.createElement('div')
  domEle.style.zIndex=9999999
  ReactDOM.render(component, domEle)
  document.body.appendChild(domEle)
  return domEle
}

export const styleExistingAnalysisOptions = (existingAnalysisOptions, showReportParams) =>
{
  const styledOptions = []
  if (existingAnalysisOptions) {
    for (const option of existingAnalysisOptions) {
      const styledContentRows = []

      for (const contentRow of option.contentRows) {
        const { formatting, descriptor, value } = contentRow
        switch (formatting) {
          case 'title':
            styledContentRows.push(
              <span style={{fontSize: 'large'}} key={getUniqueKey()}>
                {value}
              </span> )
            break

          case 'sub-title':
            styledContentRows.push(
              <span style={{marginLeft: '2em', fontSize: 'small', marginTop: 12}} key={getUniqueKey()}>
                {value}
              </span> )
            break

          case 'description':
            styledContentRows.push(
              <span style={{marginLeft: '2em', fontSize: 'small', marginTop: 8, marginBottom: 4}} key={getUniqueKey()}>
                <span style={{marginRight: '1em'}}>
                  {descriptor}:
                </span>
                {value}
              </span> )
            break

          case 'parameter':
            if (showReportParams) {
              styledContentRows.push(
                <span style={{marginLeft: '3em', fontFamily: 'monospace', fontSize: 'small', marginTop: 4}}
                      key={getUniqueKey()}>
                  <span style={{marginRight: '1em'}}>
                    {descriptor}:
                  </span>
                  {value}
                </span> )
            }
            break

          default:
            styledContentRows.push( <span>{`${descriptor}: ${value}`}</span> )
            break
        }
      }

      const content = <div style={{ display:'flex',
                                    flexDirection:'column',
                                    borderColor: 'lightgray',
                                    borderStyle: 'solid',
                                    borderWidth: 1,
                                    borderRadius: 5,
                                    padding: 5}}>
                          { styledContentRows }
                        </div>

      styledOptions.push({
        key: option.key,
        text: option.text,
        value: option.value,
        content
      })
    }
  }

  return styledOptions
}

export const getPageDetails = (currentPage) => 
{
  if (!currentPage || !currentPage.description || !currentPage.description.length > 0) {
    return undefined
  }

  const styledDescriptionRows = []
  for (const row of currentPage.description) {
    switch (row.textStyle) {
      case 'indent':
        styledDescriptionRows.push(
          <span key={getUniqueKey()}
                style={{marginTop: 5, marginBottom: 0, marginLeft: '2em', fontFamily: 'monospace'}}>
            {row.text}
            <br/>
          </span> )
        break

      case 'bold':
        styledDescriptionRows.push(
          <span key={getUniqueKey()}
                style={{marginTop: 5, marginBottom: 0, fontFamily: 'monospace', fontWeight: 'bold'}}>
            {row.text}
            <br/>
          </span> )
        break

      default:
        styledDescriptionRows.push(
          <span key={getUniqueKey()}
                style={{marginTop: 5, marginBottom: 0, fontFamily: 'monospace'}}>
            {row.text}<br/>
          </span> )
        break
    }
  }

  return ( <div>
             <Header style={{marginTop: 35, marginBottom: 0}} as='h1'>{currentPage.title}</Header>
             {styledDescriptionRows}
           </div> ) 
}

const _getCytoscapeStyleSheet = (highlightOn, shapesValveSp) => {
  return [
    {
      // See: https://js.cytoscape.org/#style/node-body
      selector: 'node',
      style: {
        'width': 75,
        'height': 75,
        'shape': (shapesValveSp) ? 'data(shape)' : 'ellipse',
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
  ]
}

export const getCytoscapeComp = (CytoscapeComp,
                                 parentInst,
                                 highlightOn,
                                 shapesValveSp) =>
{
  const { layoutOptions } = parentInst

  return ( 
    <CytoscapeComp
      cy={(cy) => {
        if (!parentInst.cy) {
          parentInst.cy = cy

          cy.userZoomingEnabled(true)
          cy.userPanningEnabled(true)

          cy.on('add', evt => {
            parentInst.addCount++
            // IMPORTANT: must reference element length & elements via
            //            parentInst directly (the way react detects differences etc.
            //            shortcutting by deconstructing above and using just 'elements'
            //            here and below results in rendering errors).
            // console.debug(`added ${parentInst.addCount} / ${parentInst.state.elements.length}`)
            if (parentInst.addCount === parentInst.state.elements.length) {
              // console.debug(`Performing layout`)
              cy.layout(layoutOptions).run()
              // cy.fit(undefined, 50)

              cy.edges().on('mouseover', evt => {
                parentInst.handleCyMouseover(evt)
              })

              cy.edges().on('mouseout', () => {
                parentInst.handleCyMouseout()
              })
            }
          })

          /* mouseover and mouseout are replicated here
           * b/c the first time the component is created,
           * the add event is not generated.
           */
          cy.edges().on('mouseover', evt => {
            parentInst.handleCyMouseover(evt)
          })

          cy.edges().on('mouseout', () => {
            parentInst.handleCyMouseout()
          })

          cy.on('remove', evt => {
            // console.debug(`remove called on ${evt.target.id()}`)
          })

        }}
      }
      userZoomingEnabled={true}
      elements={parentInst.state.elements}
      layout={layoutOptions}
      style={ { textAlign: 'left',
                display: 'block',
                height: '50vh',
                width: '100%',
                minHeight: '600px',
                minWidth: '800px',
                backgroundColor: 'white' } }
      stylesheet={_getCytoscapeStyleSheet(highlightOn, shapesValveSp)} /> )
}

export const getCytoscapeCompModal = (CytoscapeComp,
                                      parentInst,
                                      highlightOn,
                                      shapesValveSp) =>
{
  const { layoutOptions } = parentInst

  return ( 
    <CytoscapeComp
      cy={(cy) => {
        if (!parentInst.cy) {
          parentInst.cy = cy

          cy.userZoomingEnabled(true)
          cy.userPanningEnabled(true)

          cy.on('add', evt => {
            parentInst.addCount++
            // IMPORTANT: must reference element length & elements via
            //            parentInst directly (the way react detects differences etc.
            //            shortcutting by deconstructing above and using just 'elements'
            //            here and below results in rendering errors).
            // console.debug(`added ${parentInst.addCount} / ${parentInst.state.elements.length}`)
            if (parentInst.addCount === parentInst.elements.length) {
              // console.debug(`Performing layout`)
              cy.layout(layoutOptions).run()
              // cy.fit(undefined, 50)

              cy.edges().on('mouseover', evt => {
                parentInst.handleCyMouseover(evt)
              })

              cy.edges().on('mouseout', () => {
                parentInst.handleCyMouseout()
              })
            }
          })

          /* mouseover and mouseout are replicated here
           * b/c the first time the component is created,
           * the add event is not generated.
           */
          cy.edges().on('mouseover', evt => {
            parentInst.handleCyMouseover(evt)
          })

          cy.edges().on('mouseout', () => {
            parentInst.handleCyMouseout()
          })

          cy.on('remove', evt => {
            // console.debug(`remove called on ${evt.target.id()}`)
          })

        }}
      }
      userZoomingEnabled={true}
      elements={parentInst.elements}
      layout={layoutOptions}
      style={ { textAlign: 'left',
                flex: 1,
                backgroundColor: 'white' } }
      stylesheet={_getCytoscapeStyleSheet(highlightOn, shapesValveSp)} /> )
}

export const getReportGenerateController = (parentInst) =>
{
  const { analysisDescription,
          blockNumber,
          blockNumberOptions,
          tokenSet,
          tokenSetOptions,
          tradeAmount,
          proportioningAlgorithm,
          proportioningAlgorithmOptions,
          maximumSwapsPerPath,
          maximumSwapsPerPathOptions,
          maximumSegmentSlippage,
          maximumRouteSlippage,
          maximumConcurrentPaths,
          maximumRoutesConsidered,
          removeDuplicatePathPairs,
          limitSwapsForWETH } = parentInst.state
  return (
    <Segment>
      <div style={{display: 'flex', flex: 1, flexDirection: 'row', alignItems: 'baseline'}}>
        <Header as='h3' style={{flex:4}}>Generate New Analysis</Header>
        <Button
          style={{flex:1}}
          color='blue'
          onClick={(e) => {parentInst.handleReportGenerate(e)}} 
          type='submit'
          disabled={false} >
            Submit
        </Button>
      </div>
      <Form 
        style={{display:'flex', flex: 1, flexDirection:'row'}}
        onSubmit={(e) => {}}>
        <div style={{display:'flex', flex: 1, flexDirection:'column'}}>
          <Form.Group
            label='Analysis Metadata'
            key={'analysis_description'}
            style={{flex: 1, flexDirection:'column', padding: 10, margin: 5, borderWidth: 1, borderStyle: 'solid', borderColor: 'black', borderRadius: 5}}>
              <Header as='h5'>Analysis Metadata</Header>
              <Form.Input
                label='Analysis Description'
                value={analysisDescription}
                type='text'
                onChange={(e, { value }) => parentInst.setState({analysisDescription: value})} />
              <div className='field'>
                <label>Block Number(s)</label>
                <Dropdown
                  placeholder='Select block number(s) ...'
                  selection
                  disabled={true}
                  value={blockNumber}
                  options={blockNumberOptions}
                  onChange={(e, { value }) => parentInst.setState({blockNumber: value})} />
              </div>
              <div style={{flex:1}} />
          </Form.Group>

          <Form.Group
            label='Token Trade Settings'
            key={'tokens'}
            style={{flex: 1, flexDirection:'column', padding: 10, margin: 5, borderWidth: 1, borderStyle: 'solid', borderColor: 'black', borderRadius: 5}}>
              <Header as='h5'>Token Settings</Header>
              <div className='field'>
                <label>Token Set</label>
                <Dropdown
                  placeholder='Select a set of tokens ...'
                  selection
                  value={tokenSet}
                  options={tokenSetOptions}
                  onChange={(e, { value }) => parentInst.setState({tokenSet: value})} />
              </div>
              <Form.Input
                label='Trade Amount ($USD)'
                value={tradeAmount}
                type='number'
                onChange={(e, { value }) => parentInst.setState({tradeAmount: value})} />
              <div style={{flex:1}} />
          </Form.Group>
        </div>

        <Form.Group 
          label='Routing Settings'
          key={'routing'} 
          style={{flex: 1, flexDirection:'column', padding: 10, margin: 5, borderWidth: 1, borderStyle: 'solid', borderColor: 'black', borderRadius: 5}}>
          <Header as='h5'>Routing Settings</Header>
          <div className='field'>
            <label>Proportioning Algorithm</label>
            <Dropdown
              placeholder='Select a multi-path proportioning algorithm ...'
              selection
                value={proportioningAlgorithm}
              options={proportioningAlgorithmOptions}
              onChange={(e, { value }) => parentInst.setState({proportioningAlgorithm: value})} />
          </div>
          <div className='field'>
            <label>Maximum Swaps / Path</label>
            <Dropdown
              label=''
              placeholder='Select the maximum number of swaps per path...'
              selection
              value={maximumSwapsPerPath}
              options={maximumSwapsPerPathOptions}
              onChange={(e, { value }) => parentInst.setState({maximumSwapsPerPath: value})} />
          </div>
          <Form.Input
            label='Maximum Segment Slippage (%)'
            value={maximumSegmentSlippage}
            type='number'
            onChange={(e, { value }) => parentInst.setState({maximumSegmentSlippage: value})} />
          <Form.Input
            disabled={true}
            label='Maximum Route Slippage (%)'
            value={maximumRouteSlippage}
            type='number'
            onChange={(e, { value }) => parentInst.setState({maximumRouteSlippage: value})} />
          <Form.Input
            disabled={true}
            label='Maximum Concurrent Paths'
            value={maximumConcurrentPaths}
            type='number'
            onChange={(e, { value }) => parentInst.setState({maximumConcurrentPaths: value})} />
          <Form.Input
            label='Maximum Routes Considered'
            value={maximumRoutesConsidered}
            type='number'
            onChange={(e, { value }) => parentInst.setState({maximumRoutesConsidered: value})} />
          <div className='field' style={{display: 'flex', marginTop: 5, paddingRight: 3}}>
            <Button toggle 
                    size='small'
                    style={{flex:1}}
                    active={removeDuplicatePathPairs}
                    disabled={true}
                    onClick={(e) => parentInst.setState({removeDuplicatePathPairs: !removeDuplicatePathPairs})}>
              Remove Duplicate Path Pairs
            </Button>
          </div>
          <div className='field' style={{display: 'flex', marginTop: 5, paddingRight: 3}}>
            <Button toggle 
                    size='small'
                    style={{flex:1}}
                    active={limitSwapsForWETH}
                    disabled={true}
                    onClick={(e) => parentInst.setState({limitSwapsForWETH: !limitSwapsForWETH})}>
              Limit Swaps to 1 for wETH Source/Destination
            </Button>
          </div>
        </Form.Group>
      </Form>

    </Segment> )
}

export const updateElementsForRender = (elements,
                                        showTokenAmounts=false,
                                        showTokenAmountsUSD=true,
                                        showSlippage=false,
                                        showProportion=true,
                                        showGainToDest=true) => 
{
    // Modify the element label properties based on the state vars:
    //
    elements.forEach(element => {
      const eleData = element.data
      const isNode = eleData.hasOwnProperty('symbol')

      if (isNode) {
        let labelLines = [ eleData.symbol ]
        showTokenAmounts && labelLines.push(parseFloat(eleData.amount).toFixed(6))
        showTokenAmountsUSD && labelLines.push(`($${eleData.amountUSD})`)
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

            if (showSlippage) {
              labelLines.push(`Slip: ${impact.toFixed(3)}%`)
              labelLines.push(`(Prev: ${parseFloat(eleData.slippage).toFixed(3)}%)`)
            }
            if (showProportion) {
              labelLines.push(`Prop: ${proportion.toFixed(3)}%`)
            }
          }
        } else {
          showSlippage && labelLines.push(`Slip: ${parseFloat(eleData.slippage).toFixed(3)}%`)
        }

        if (showGainToDest) {
          let maxGTD = 0.0
          Object.values(eleData.gainToDest).forEach(gtd => (maxGTD = (maxGTD > gtd) ? maxGTD : gtd))
          let maxGTDPct = maxGTD * 100
          labelLines.push(`MGTD: ${maxGTDPct.toFixed(3)}%`)
        }

        eleData.label = labelLines.join('\n')
      }

    })
  }
