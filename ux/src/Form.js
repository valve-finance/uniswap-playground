import React from 'react'
import _ from 'lodash'

import { uniTokens } from './Tokens'

import { Button, Dropdown, Form, Label, Popup } from 'semantic-ui-react'

// function getUniqueListBy(arr, key) {
//   return [...new Map(arr.map(item => [item[key], item])).values()]
// }

const tokenSearch = (options, query) => {
  const re = new RegExp(_.escapeRegExp(query), 'i')
  let text = options.filter((opt) => re.test(opt.text))
  let addr = options.filter((opt) => re.test(opt.description))
  if (text.length) {
    return text
  }
  else if (addr.length) {
    return addr
  }
  else {
    return text
  }
}

const _tokenSymbolToAddr = (symbol) =>
{
  const ele = uniTokens.find((ele) => { return ele && (ele.symbol === symbol) })
  return ele ? ele.address : ''
}

export default class DataForm extends React.Component {
  constructor(props) {
    super(props)
    /* Good pairs to use for this mode of testing are:
     *   DAI -> WETH ($1M+, $10M)
     *   USDC -> WETH ($1M+, $10M)
     */
    this.su = (props.defaultTokens !== undefined)
    this.getQuoteUsdCB = props.getQuoteUsdCB
    this.initialState = props.initialState

    this.state = (this.su) ? {
      source: _tokenSymbolToAddr('USDC'),
      destination: _tokenSymbolToAddr('WETH'),
      amount: '10000000',
      amountUSD: '',
      hops: '3',
      results: '5',
      impact: '80',
      updateData: 'false',
      ignoreMaxHops: 'true',
      highlightUni: this.initialState.highlightUni,
      tokenAmounts: this.initialState.tokenAmounts,
      tokenAmountsUSD: this.initialState.tokenAmountsUSD,
      slippage: this.initialState.slippage,
      gainToDest: this.initialState.gainToDest,
      proportion: this.initialState.proportion,
    } : {
      source: '',
      destination: '',
      amount: '10',
      amountUSD: '',
      hops: '2',
      results: '5',
      impact: '80',
      updateData: 'true',
      ignoreMaxHops: 'true'
    }
  }

  // Hit the server socket with a quote request for
  // the current from token to the amount specified
  // in USD and update the token amount.
  //
  handleAmountUSD = async (amountUSD, source=undefined) => {
    const _source = source ? source : this.state.source
    const quoteUSD = await this.getQuoteUsdCB(_source, amountUSD)

    const stateChange = {}
    if (source) {
      stateChange['source'] = source
    }

    if (quoteUSD !== '') {
      // console.debug(`handleAmountUSD: quoteUSD=${quoteUSD}`)
      stateChange['amount'] = quoteUSD
      stateChange['amountUSD'] = amountUSD
    }

    this.setState(stateChange)
  }

  render() {
    const { coinList,
            handleSubmit,
            handleAddition,
            nextPageCB,
            highlightUniCB,
            advancedControlCB,
            handleReportCB } = this.props

    const {
      source,
      destination,
      amount,
      amountUSD,
      hops,
      results,
      impact
    } = this.state

    const suContainerStyle = {display: 'block', textAlign: 'left'}
    const suElementStyle = {width: 175, marginTop: 2, borderColor: 'black', borderStyle: 'solid', borderWidth: 1}
    const suLabelStyle = {...suElementStyle, backgroundColor: 'white', borderWidth: 0, textAlign: 'right'}
    const suPanels = (this.su) ? (
        <div id='superuser' style={{marginTop:30}}>
          <div id='controls' style={suContainerStyle}>
              <Label size='large' style={{...suLabelStyle}}>Route Settings:</Label>
              <Button toggle 
                      size='small'
                      style={suElementStyle}
                      active={this.state.updateData === 'true'}
                      onClick={(e) => this.setState({updateData: (this.state.updateData === 'true' ? 'false' : 'true')})}>
                Update Pair Data
              </Button>
              <Button toggle 
                      size='small'
                      style={suElementStyle}
                      active={this.state.ignoreMaxHops === 'true'}
                      onClick={(e) => this.setState({ignoreMaxHops: (this.state.ignoreMaxHops === 'true' ? 'false' : 'true')})}>
                Ignore Max Hops
              </Button>
              <Button toggle 
                      size='small'
                      style={suElementStyle}
                      active={this.state.highlightUni}
                      onClick={ (e) => {
                        highlightUniCB(e)
                        const stateChange = {highlightUni: !this.state.highlightUni}
                        this.setState(stateChange)}} >
                Highlight UNI Route
              </Button>
              <Button color='blue'
                      style={suElementStyle}
                      size='small'
                      onClick={(e) => nextPageCB(e)}>
                Next Diagram&nbsp;&gt;&gt;
              </Button>
          </div>
          <div id='controls' style={suContainerStyle}>
              <Label size='large' style={{...suLabelStyle}}>Node Settings:</Label>
              <Button toggle 
                      size='small'
                      style={suElementStyle}
                      active={this.state.tokenAmounts}
                      onClick={ (e) => {
                        const stateChange = {tokenAmounts: !this.state.tokenAmounts}
                        const state = {...this.state, ...stateChange}
                        advancedControlCB(state)
                        this.setState(stateChange)}} >
                Token Amounts
              </Button>
              <Button toggle 
                      size='small'
                      style={suElementStyle}
                      active={this.state.tokenAmountsUSD}
                      onClick={ (e) => {
                        const stateChange = {tokenAmountsUSD: !this.state.tokenAmountsUSD}
                        const state = {...this.state, ...stateChange}
                        advancedControlCB(state)
                        this.setState(stateChange)}} >
                Token Amounts USD
              </Button>
          </div>
          <div id='controls' style={suContainerStyle}>
              <Label size='large' style={{...suLabelStyle}}>Edge Settings:</Label>
              <Button toggle 
                      size='small'
                      style={suElementStyle}
                      active={this.state.slippage}
                      onClick={ (e) => {
                        const stateChange = {slippage: !this.state.slippage}
                        const state = {...this.state, ...stateChange}
                        advancedControlCB(state)
                        this.setState(stateChange)}} >
                Slippage
              </Button>
              <Button toggle 
                      size='small'
                      style={suElementStyle}
                      active={this.state.gainToDest}
                      onClick={ (e) => {
                        const stateChange = {gainToDest: !this.state.gainToDest}
                        const state = {...this.state, ...stateChange}
                        advancedControlCB(state)
                        this.setState(stateChange)}} >
                Max Gain to Dest
              </Button>
              <Button toggle 
                      size='small'
                      style={suElementStyle}
                      active={this.state.proportion}
                      onClick={ (e) => {
                        const stateChange = {proportion: !this.state.proportion}
                        const state = {...this.state, ...stateChange}
                        advancedControlCB(state)
                        this.setState(stateChange)}} >
                Proportion
              </Button>
          </div>
          {handleReportCB ?
            ( <div id='reports' style={suContainerStyle}>
                <Label size='large' style={{...suLabelStyle}}>Reports:</Label>
                <Popup content='Compute best multi-hop trades for tokens in pairs with 100M liquidity.'
                      trigger={
                          <Button color='blue'
                                  style={suElementStyle}
                                  size='small'
                                  onClick={(e) => handleReportCB()}>
                            100M Liquidity&nbsp;&gt;&gt;
                          </Button> }
                />
              </div> ) : undefined }
        </div> )
        :
        undefined

    const amountUsdButton = (this.su) ? (
      <Form.Input 
        label='Amount (USD)'
        value={amountUSD}
        type='number'
        onChange={(e, { value }) => this.handleAmountUSD(value)}
        style={{flex: 20}}
      /> ) 
      :
      undefined

    return (
      <div>
        <Form onSubmit={(e) => handleSubmit(e, this.state)}>
          <Form.Group key={'tokens'} style={{flex: 100}}>
            <div style={{flex: 45}}>
              <h4>Input Token</h4>
              <Dropdown
                key={'input'}
                search={tokenSearch}
                selection
                fluid
                options={coinList}
                closeOnChange
                placeholder='Select Input Token'
                value={source}
                allowAdditions
                onChange={(e, { value }) => {
                  if (this.su) {
                    this.handleAmountUSD(this.state.amountUSD, value)
                  } else {
                    this.setState({source: value})
                  }
                }}
                onAddItem={(e, { value }) => handleAddition(e, value)}
              />
            </div>
            <div style={{flex: 10}}/>
            <div style={{flex: 45}}>
              <h4>Output Token</h4>
              <Dropdown
                key={'output'}
                label='Output Token'
                search={tokenSearch}
                fluid
                selection
                disabled={!source}
                options={coinList}
                closeOnChange
                placeholder='Select Output Token'
                value={destination}
                allowAdditions
                onChange={(e, { value }) => this.setState({destination: value})} 
                onAddItem={(e, { value }) => handleAddition(e, value)}
              />
            </div>
          </Form.Group>
          <Form.Group key={'others'} style={{flex: 100}}>
            <Form.Input 
              label='Amount'
              value={amount}
              type='number'
              onChange={(e, { value }) => this.setState({amount: value, amountUSD: ''})}
              style={{flex: 20}}
            />
            {amountUsdButton}
            <Form.Input
              label='Max Hops'
              className={((hops < 1 || hops > 3) && this.state.ignoreMaxHops !== 'true') ? "error" : ""}
              value={hops}
              type='number'
              onChange={(e, { value }) => this.setState({hops: value})}
              style={{flex: 20}}
            />
            {/* <Form.Input 
              label='Max Results'
              value={results}
              type='number'
              onChange={(e, { value }) => this.setState({results: value})}
              style={{flex: 20}}
            /> */}
            <Form.Input 
              label='Max Impact'
              value={impact}
              type='number'
              onChange={(e, { value }) => this.setState({impact: value})}
              style={{flex: 20}}
            />
            <div style={{flex: 15}}/>
            <Button
              color='blue'
              onClick={(e) => handleSubmit(e, this.state)} 
              type='submit'
              disabled={(!source || !destination || !amount || source === destination)}
              style={{flex: 5}}
            >
                Submit
            </Button>
          </Form.Group>
        </Form>
        {suPanels}
      </div>
    )
  }
};
