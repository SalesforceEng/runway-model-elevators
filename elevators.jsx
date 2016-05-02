"use strict";

let React = require('React');
let ReactDOM = require('ReactDOM');
let BootstrapMenu = require('bootstrap-menu');
let jQuery = require('jquery');
let Tooltip = require('Tooltip');
let Util = require('Util');
let _ = require('lodash');

let View = function(controller, svg, module) {

let model = module.env;
let tooltip = new Tooltip(jQuery('#tooltip'));

let numFloors = model.vars.get('floorControls').size();
let numElevators = model.vars.get('elevators').size();
let numPeople = model.vars.get('people').size();

let highlighting = h =>
  (h.kind === 'timesegment' &&
   _.inRange(controller.workspace.clock,
             h.absoluteStart, h.absoluteEnd));

let Layout = (width, height) => {
  let layout = {};
  layout.floor = floorId => {
    let h = (height * .9) / numFloors;
    return Util.fillBBox({
      x: width * .02,
      y: h * (numFloors - floorId) + height * .05,
      w: width * .96,
      h: h,
    });
  };

  layout.label = floorId => {
    let floor = layout.floor(floorId);
    return Util.fillBBox({
      x: width * .05,
      y: floor.y + height * .02,
      w: width * .08,
      h: floor.h - height * .04,
    });
  };

  layout.elevators = floorId => {
    let floor = layout.floor(floorId);
    let label = layout.label(floorId);
    return Util.fillBBox({
      x: label.x2,
      y: floor.y + height * .02,
      w: width * .6,
      h: floor.h - height * .04,
    });
  };

  layout.elevator = (floorId, id) => {
    let elevators = layout.elevators(floorId);
    let w = elevators.w / numElevators;
    return Util.fillBBox({
      x: elevators.x + w * (id - 1) + w * .1,
      y: elevators.y,
      w: w * .8,
      h: elevators.h,
    });
  };

  layout.floorControls = floorId => {
    let floor = layout.floor(floorId);
    let elevators = layout.elevators(floorId);
    return Util.fillBBox({
      x: elevators.x2 + width * .02,
      y: floor.y + height * .02,
      w: 5,
      h: floor.h - height * .04,
    });
  };

  layout.people = floorId => {
    let floor = layout.floor(floorId);
    let floorControls = layout.floorControls(floorId);
    let x = floorControls.x2 + width * .02;
    return Util.fillBBox({
      x: x,
      y: floor.y + height * .02,
      w: floor.x2 - x,
      h: floor.h - height * .04,
    });
  };

  layout.person = (floorId, count) => {
    let people = layout.people(floorId);
    let w = people.w / numPeople;
    return Util.fillBBox({
      x: people.x + w * (count - 1),
      y: people.y,
      w: w,
      h: people.h,
    });
  };
  return layout;
};

let elevatorFloor = (evar) => evar.lookup('location').match({
    AtFloor: a => a.at.value,
    Between: b => {
      let frac = ((controller.workspace.clock - b.lookup('leftAt').value) /
                  (b.lookup('nextAt').value - b.lookup('leftAt').value));
      return evar.lookup('direction').match({
        'Up': () => b.next.value - 1 + frac,
        'Down': () => b.next.value + (1 - frac),
      });
    },
  });

let elevatorDoors = (evar) => evar.lookup('location').match({
    AtFloor: a => a.doors,
    Between: () => model.getVar('Closed'),
  });

let Elevator = React.createClass({
  mixins: [tooltip.Mixin],

  componentDidMount: function() {
    let id = this.props.elevatorId;
    this.menu = ruleMenu(`#elevator-${id}`, [
      ['move', id],
      ['moveDoors', id],
      ['changeDirection', id],
      ['clearControl', id],
    ]);
  },

  componentWillUnmount: function() {
    this.menu.destroy();
  },

  getVar: function() {
    let id = this.props.elevatorId;
    return model.getVar('elevators').index(id);
  },

  render: function() {
    let layout = this.props.layout;
    let id = this.props.elevatorId;
    let evar = this.getVar();
    let floor = elevatorFloor(evar);
    let bbox = layout.elevator(floor, id);
    let arrow = evar.lookup('direction').match({
      Up: () => ({
          x1: bbox.cx,
          x2: bbox.cx,
          y1: bbox.y,
          y2: bbox.y - 4,
      }),
      Down: () => ({
          x1: bbox.cx,
          x2: bbox.cx,
          y1: bbox.y2,
          y2: bbox.y2 + 4,
      }),
    });
    let doorColor = fracOpen => {
      let dec = 0x55 + Math.round((0xff - 0x55) * fracOpen);
      let hex = dec.toString(16);
      return `#${hex}${hex}${hex}`;
    };
    let doors = elevatorDoors(evar).match({
      Closed: () => doorColor(0),
      Open: () => doorColor(1),
      Opening: o => doorColor(
        (controller.workspace.clock - o.lookup('startAt').value) /
        (o.lookup('doneAt').value - o.lookup('startAt').value)),
      Closing: c => doorColor(1 -
        (controller.workspace.clock - c.lookup('startAt').value) /
        (c.lookup('doneAt').value - c.lookup('startAt').value)),
    });
    let stroke = 'black';
    controller.highlight.forEach(h => {
      if (highlighting(h) && h.d.elevator === id) {
        stroke = 'red';
      }
    });

    return <g
      id={'elevator-' + id}
      className="clickable"
      onMouseOver={this.tooltipMouseOver}
      onMouseOut={this.tooltipMouseOut}
      >
      <rect
        style={{fill: doors, stroke: stroke}}
        x={bbox.x} y={bbox.y}
        width={bbox.w} height={bbox.h}
        />
      <line style={{
          stroke: 'green',
          markerEnd: 'url(#greentriangle)',
        }}
        x1={arrow.x1} y1={arrow.y1}
        x2={arrow.x2} y2={arrow.y2} />
    </g>;
  },
});

let FloorControl = React.createClass({
  render: function() {
    let bbox = this.props.layout.floorControls(this.props.floor);
    let triangle = active => <path
      d="M 0,3 L 5,3 2.5,0 z"
      style={{fill: active ? 'red' : 'gray', stroke: 'none'}} />;
    let controlsVar = model.vars.get('floorControls').index(this.props.floor);
    let scale = bbox.h / 2 * .8 / 2.5;
    let up = <g transform={`translate(${bbox.x}, ${bbox.y + bbox.h * .1}) scale(${scale})`}>
        {triangle(controlsVar.lookup('upActive').toString() === 'True')}
      </g>;
    let down = <g transform={`translate(${bbox.x}, ${bbox.y + bbox.h * .1 + bbox.h/2})  scale(${scale}) rotate(180, 2.5, 1.5)`}>
        {triangle(controlsVar.lookup('downActive').toString() === 'True')}
      </g>;
    if (this.props.floor == 1) {
      down = [];
    }
    if (this.props.floor == numFloors) {
      up = [];
    }
    return <g>{up}{down}</g>;
  },
});

let ruleMenu = (selector, rules) => new BootstrapMenu(selector, {
  menuEvent: 'click',
  actions: rules.map(rule => ({
      name: rule[0],
      onClick: () => controller.workspace.tryChangeState(() => {
        console.log(rule);
        let context = {};
        model.getRule(rule[0]).fire(rule[1], context);
      }),
  })),
});

let Person = React.createClass({
  mixins: [tooltip.Mixin],

  componentDidMount: function() {
    let id = this.props.personId;
    this.menu = ruleMenu(`#person-${id}`, [
      ['wake', id],
      ['boardOrLeave', id],
      ['leave', id],
    ]);
  },

  componentWillUnmount: function() {
    this.menu.destroy();
  },

  getVar: function() {
    let id = this.props.personId;
    return model.getVar('people').index(id);
  },

  render: function() {
    let layout = this.props.layout;
    let id = this.props.personId;
    let pvar = this.getVar();
    let text;
    let bbox = pvar.match({
      Sleeping: s => {
        text = 'z';
        return layout.person(s.floor, id);
      },
      Waiting: w => {
        text = w.lookup('destination').toString();
        return layout.person(w.floor, id);
      },
      Riding: r => {
        text = r.lookup('destination').toString();
        let evar = model.getVar('elevators').index(r.elevator);
        let riders = evar.lookup('riders');
        let bbox = layout.elevator(elevatorFloor(evar),
            r.elevator.value);
        let shift = bbox.w * .9 / riders.size() * (riders.indexOf(id) - 2);
        bbox.x += shift;
        bbox.x2 += shift;
        bbox.y -= bbox.h * .1;
        bbox.y2 -= bbox.h * .1;
        return bbox;
      },
    });

    let style = {
      fontSize: Util.fontSize(bbox),
    };
    controller.highlight.forEach(h => {
      if (highlighting(h) && h.d.person === this.props.personId) {
        style.fill = 'red';
        style.fontWeight = 'bold';
      }
    });

    return <g id={'person-' + id}
      className='clickable'
      onMouseOver={this.tooltipMouseOver}
      onMouseOut={this.tooltipMouseOut}>
        <text x={bbox.x} y={bbox.y2} style={style}>{text}</text>
    </g>;
  },
});

let Background = React.createClass({
  render: function() {
    let layout = this.props.layout;
    let lowerLine = (id) => {
      let bbox = layout.floor(id);
      return <line key={id}
        x1={bbox.x} y1={bbox.y2}
        x2={bbox.x2} y2={bbox.y2}
        style={{stroke: 'gray'}} />;
    };
    let lines = _.range(this.props.floors + 1).map(i => lowerLine(i + 1));
    let labels = _.range(this.props.floors).map(i => {
      let id = i + 1;
      let bbox = layout.label(id);
      return <text key={id} x={bbox.x} y={bbox.y2} style={{fontSize: Util.fontSize(bbox)}}>
          {id}
        </text>;
    });
    return <g id="floors">
      {lines}
      {labels}
    </g>;
  },
});

let ElevatorView = React.createClass({
  render: function() {
    let outerSVG = svg.parentElement;
    let box = outerSVG.viewBox.baseVal;
    let layout = Layout(box.width, box.height * .7);
    let destinations = [];
    model.vars.get('elevators').forEach((evar, eid) => {
      let floors = new Set();
      evar.lookup('floorCalls').forEach(floorCall => {
        floors.add(floorCall.lookup('floor').value);
      });
      evar.lookup('riders').forEach(pid => {
        model.vars.get('people').index(pid).match({
          Riding: r => floors.add(r.lookup('destination').value),
        });;
      });
      floors.forEach(floor => {
        let bbox = layout.elevator(floor, eid);
        destinations.push(<circle
          key={`dest-${eid}-${floor}`}
          cx={bbox.x + bbox.w/2}
          cy={bbox.y + bbox.h/2}
          r={2} />);
      });
    });
    let elevators = _.range(numElevators).map(i => (
      <Elevator key={i + 1} elevatorId={i + 1}
        layout={layout} />
    ));
    let people = _.range(numPeople).map(i => (
      <Person key={i + 1} personId={i + 1}
        layout={layout} />
    ));
    let floorControls = _.range(numFloors).map(i => (
      <FloorControl key={i + 1} floor={i + 1}
        layout={layout} />
    ));
    return <g>
      <Background layout={layout} floors={numFloors} />
      <g id="destinations">{destinations}</g>
      <g id="elevators">{elevators}</g>
      <g id="floorControls">{floorControls}</g>
      <g id="people">{people}</g>
    </g>;
  },
});

let reactComponent = ReactDOM.render(<ElevatorView />, svg);

let Graph = require('runway-browser/stackedevents.js');
let graph = controller.mountTab(elem => new Graph(controller, elem, ['waiting', 'riding']), 'graph', 'Graph');
window.graph = graph;

return {
  update: function(changes) {
    // trigger a render
    reactComponent.setState({}, () => {
      let trips = controller.workspace.takeOutput().trips;
      if (trips !== undefined) {
        trips.forEach(trip => {
          trip.waiting = trip.board;
          trip.riding = trip.end;
        });
        graph.push(trips);
      }
      tooltip.update();
    });
  }
};

}; // View

module.exports = View;
