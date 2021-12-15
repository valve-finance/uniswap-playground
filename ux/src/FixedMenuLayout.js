import React from 'react'
import {
  Button,
  Container,
  Icon,
  Image,
  Menu,
  Popup
} from 'semantic-ui-react'
import {
  BrowserRouter as Router,
  Switch,
  Route
} from "react-router-dom"
import OldApp from './OldApp'
import MultiRouteApp from './MultiRouteApp'
import ReportApp from './ReportApp'
import DashboardApp from './DashboardApp'
import Cytoscape from 'cytoscape'
import CytoscapeComponent from 'react-cytoscapejs'
import popper from 'cytoscape-popper'
Cytoscape.use(popper)

const FixedMenuLayout = () => {

  /* NOTE:  Below we pass in the CytoscapeComponent b/c there's a limitation on
   *        the number of times popper can be registered with the underlying 
   *        Cytoscape instance. Initializing and passing it in allows it to
   *        be re-used/shared between the two route/component instances.
   */ 
  return (
    <div>
      <Menu fixed='top' inverted>
        <Container>
          <Menu.Item as='a' href={`/`} header>
            <Image size='mini' src='./valve_icon.png' style={{ marginRight: '1.5em' }} />
            Valve Finance
          </Menu.Item>
          <Menu.Item position='right'>
            <Popup content='Dashboard' trigger={
              <Button as='a' href='/dashboard' icon inverted={false} color='purple' style={{ marginLeft: '0.5em' }}>
                <Icon name='tasks' size='large'/>
              </Button>
            } />
            <Popup content='Performance' trigger={
              <Button as='a' href='/performance' icon inverted={false} color='green' style={{ marginLeft: '0.5em' }}>
                <Icon name='chart line' size='large'/>
              </Button>
            } />
            <Popup content='Simulation' trigger={
              <Button as='a' href='/simulation' icon inverted={false} color='red' style={{ marginLeft: '0.5em' }}>
                <Icon name='code' size='large'/>
              </Button>
            } />
            <Popup content='Twitter' trigger={
              <Button as='a' href='https://twitter.com/getsimpleid' target='_blank' color='twitter' icon inverted={false} style={{ marginLeft: '0.5em' }}>
                <Icon name='twitter' size='large'/>
              </Button>
            } />
            <Popup content='Email' trigger={
              <Button icon as='a' href="mailto:hello@simpleid.xyz" target='_blank' inverted={false} style={{ marginLeft: '0.5em' }}>
                <Icon name='mail' size='large'/>
              </Button>
            } />
          </Menu.Item>
        </Container>
      </Menu>
      <Router>
        <Switch>
          <Route path="/dashboard">
            <DashboardApp CytoscapeComp={CytoscapeComponent} />
          </Route>
          <Route path="/simulation">
            <MultiRouteApp CytoscapeComp={CytoscapeComponent}/>
          </Route>
          <Route path="/analysisGenerator">
            <ReportApp allowGenerate={true} CytoscapeComp={CytoscapeComponent}/>
          </Route>
          <Route path="/playground">
            <OldApp />
          </Route>
          <Route path="/performance">
            <ReportApp CytoscapeComp={CytoscapeComponent}/>
          </Route>
          <Route path="/">
            <DashboardApp CytoscapeComp={CytoscapeComponent}/>
          </Route>
        </Switch>
      </Router>
    </div>
  )
}

export default FixedMenuLayout