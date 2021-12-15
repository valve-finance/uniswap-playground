export const options = {
  interaction: {
    hover: true,
  },
  edges: {
    smooth: {
      type: "cubicBezier",
      forceDirection: "vertical",
      roundness: 0.4,
    },
  },
  layout: {
    hierarchical: {
      direction: "LR",
    },
  },
  nodes: {
    scaling: {
      min: 16,
      max: 32,
    },
  },
  physics: {
    barnesHut: { gravitationalConstant: -30000 },
    stabilization: { iterations: 2500 },
  }
}

export const events = {
  select: ({ nodes, edges }) => {
    console.log("Selected nodes:")
    console.log(nodes)
    console.log("Selected edges:")
    console.log(edges)
    // alert("Selected node: " + nodes)
  },
  doubleClick: ({ pointer: { canvas } }) => {
    console.log("Double Clicked")
  },
  hover: (e, { edges }) => {
    edges.update({
      id: e.edge,
      font: {
        size: 14,
      },
    })
  },
  click: (params) => {
    console.log(JSON.stringify(
      params,
      null,
      4
    ));
  },
  oncontext: (params) => {
    console.log(JSON.stringify(
      params,
      null,
      4
    ))
  },
  dragStart: (params) => {
    // There's no point in displaying this event on screen, it gets immediately overwritten
    console.log("dragStart Event:", params);
  },
  dragging: (params) => {
    console.log(JSON.stringify(
      params,
      null,
      4
    ))
  },
  dragEnd: (params) => {
    console.log(JSON.stringify(
      params,
      null,
      4
    ))
  },
  controlNodeDragging: (params) => {
    console.log(JSON.stringify(
      params,
      null,
      4
    ))
  },
  controlNodeDragEnd: (params) => {
    console.log(JSON.stringify(
      params,
      null,
      4
    ))
  },
  zoom: (params) => {
    console.log(JSON.stringify(
      params,
      null,
      4
    ))
  },
  showPopup: (params) => {
    console.log(JSON.stringify(
      params,
      null,
      4
    ))
  },
  hidePopup: () => {
    console.log("hidePopup Event");
  },
  selectNode: (params) => {
    console.log("selectNode Event:", params);
  },
  selectEdge: (params) => {
    console.log("selectEdge Event:", params);
  },
  deselectNode: (params) => {
    console.log("deselectNode Event:", params);
  },
  deselectEdge: (params) => {
    console.log("deselectEdge Event:", params);
  },
  hoverNode: (params) => {
    console.log("hoverNode Event:", params);
  },
  hoverEdge: (params) => {
    console.log("hoverEdge Event:", params);
  },
  blurNode: (params) => {
    console.log("blurNode Event:", params);
  },
  blurEdge: (params) => {
    console.log("blurEdge Event:", params);
  }
}