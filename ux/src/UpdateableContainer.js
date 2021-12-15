import React from 'react'
import { Container, Table, Popup, Button, Modal, Icon } from 'semantic-ui-react'
import { getUniqueKey } from './utils'

export default class UpdateableContainer extends React.Component
{
  constructor(props) {
    super(props)
    const { content, keyOrder, bindUpdateFn } = props

    if (bindUpdateFn) {
      bindUpdateFn(this.update)
    }

    this.state = {
      content,
      keyOrder
    }
  }

  /*
   * Janky - really screaming for state mgmt like redux.
   * Next fn must be => fn as it gets bound to
   * the parent component's socket.
   */
  update = (content ) => {
    // console.log('UpdateableContainer update called')
    // console.log(content)

    this.setState({ content })
  }

  render() {
    const { content, keyOrder } = this.state

    return (
      <Container textAlign='left'>
        {keyOrder.map(key => {
          const rowData = content[key]
          let value = (rowData.text.includes('$USD')) ? 
              rowData.value.toFixed(2) : rowData.value
          const row = `${rowData.text}  ${value}`
          if (rowData) {
            return  <span key={getUniqueKey()}
                          style={{fontFamily: 'monospace', fontSize: 'medium'}}>
                      {row}<br />
                    </span>
          } else {
            return undefined
          }
        })}
      </Container>
    )
  }
}
