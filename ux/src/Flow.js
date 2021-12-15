import React from 'react'
import ReactFlow from 'react-flow-renderer'

export default class HorizontalFlow extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      elements: this.props.data
    }
    this.reactFlowInstance = null
  }
  componentWillReceiveProps = (nextProps) => {
    this.setState({elements: nextProps.data})
    // if (this.reactFlowInstance) {
    //   this.reactFlowInstance.fitView()
    // }
  }
  onLoad = (reactFlowInstance) => {
    // reactFlowInstance.fitView()
    this.reactFlowInstance = reactFlowInstance
  }
  onElementClick = (event, element) => {
    const { id, type } = element
    const clId = id.substr(0, id.indexOf('-'))
    const stub = (type === 'smoothstep') ? 'pair/': 'token/'
    const url = "https://v2.info.uniswap.org/" + stub + clId
    window.open(url, "_blank")
  }
  render() {
    const { elements } = this.state
    return (
      <ReactFlow
        elements={elements}
        style={{overflow: 'auto', height: '95%'}}  /* Make lots of results visible */
        onElementClick={this.onElementClick}
        onLoad={this.onLoad}
        nodesDraggable={false}
        paneMoveable={false}
        selectNodesOnDrag={false}
        zoomOnScroll={false}
        preventScrolling={false}
      />
    )
  }
}