/*!
 * dmn-js - dmn-viewer v0.11.0

 * Copyright 2015 camunda Services GmbH and other contributors
 *
 * Released under the bpmn.io license
 * http://bpmn.io/license
 *
 * Source Code: https://github.com/dmn-io/dmn-js
 *
 * Date: 2018-02-25
 */

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.DmnJS = f()}})(function(){var define,module,exports;return (function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(_dereq_,module,exports){
/**
 * The code in the <project-logo></project-logo> area
 * must not be changed.
 *
 * @see http://bpmn.io/license for more information.
 */
'use strict';

var assign = _dereq_(250),
    filter = _dereq_(134),
    omit = _dereq_(254),
    isString = _dereq_(247),
    isNumber = _dereq_(244);

var domify = _dereq_(264),
    domQuery = _dereq_(266),
    domRemove = _dereq_(267);

var Diagram = _dereq_(73),
    DmnModdle = _dereq_(118);

var TableViewer = _dereq_(19);

var inherits = _dereq_(126);

var Importer = _dereq_(17);

var is = _dereq_(64).is;

var innerSVG = _dereq_(327);

function noop() {}

function lengthOne(arr) {
  return arr && arr.length === 1;
}

function checkValidationError(err) {

  // check if we can help the user by indicating wrong DMN 1.1 xml
  // (in case he or the exporting tool did not get that right)

  var pattern = /unparsable content <([^>]+)> detected([\s\S]*)$/,
      match = pattern.exec(err.message);

  if (match) {
    err.message =
      'unparsable content <' + match[1] + '> detected; ' +
      'this may indicate an invalid DMN 1.1 diagram file' + match[2];
  }

  return err;
}

var DEFAULT_OPTIONS = {
  width: '100%',
  height: '100%',
  position: 'relative',
  container: 'body',
  loadDiagram: false,
  disableDrdInteraction: false
};


/**
 * Ensure the passed argument is a proper unit (defaulting to px)
 */
function ensureUnit(val) {
  return val + (isNumber(val) ? 'px' : '');
}

/**
 * A viewer for DMN 1.1 diagrams.
 *
 * Have a look at {@link NavigatedViewer} or {@link Modeler} for bundles that include
 * additional features.
 *
 *
 * ## Extending the Viewer
 *
 * In order to extend the viewer pass extension modules to bootstrap via the
 * `additionalModules` option. An extension module is an object that exposes
 * named services.
 *
 * The following example depicts the integration of a simple
 * logging component that integrates with interaction events:
 *
 *
 * ```javascript
 *
 * // logging component
 * function InteractionLogger(eventBus) {
 *   eventBus.on('element.hover', function(event) {
 *     console.log()
 *   })
 * }
 *
 * InteractionLogger.$inject = [ 'eventBus' ]; // minification save
 *
 * // extension module
 * var extensionModule = {
 *   __init__: [ 'interactionLogger' ],
 *   interactionLogger: [ 'type', InteractionLogger ]
 * };
 *
 * // extend the viewer
 * var drdViewer = new Viewer({ additionalModules: [ extensionModule ] });
 * drdViewer.importXML(...);
 * ```
 *
 * @param {Object} [options] configuration options to pass to the viewer
 * @param {Object} [options.table] configuration options to pass to the table viewer
 * @param {DOMElement} [options.container] the container to render the viewer in, defaults to body.
 * @param {String|Number} [options.width] the width of the viewer
 * @param {String|Number} [options.height] the height of the viewer
 * @param {Object} [options.moddleExtensions] extension packages to provide
 * @param {Array<didi.Module>} [options.modules] a list of modules to override the default modules
 * @param {Array<didi.Module>} [options.additionalModules] a list of modules to use with the default modules
 */
function Viewer(options) {
  var TableEditor = TableViewer;

  options = assign({}, DEFAULT_OPTIONS ,options);

  this.moddle = this._createModdle(options);

  if (options.editor) {
    TableEditor = options.editor;
  }

  this.table = new TableEditor(assign({}, {
    container: options.container,
    moddle: this.moddle,
    loadDiagram: options.loadDiagram, // load the DRD diagram even if there's only one decision
    isDetached: true // we instanciate the table with a detached container
  }, options.table));

  this.container = this._createContainer(options);

  /* <project-logo> */

  addProjectLogo(this.container);

  /* </project-logo> */

  this._init(this.container, this.moddle, options);

  // setup decision drill down listener
  this.on('decision.open', function(context) {
    var decision = context.decision;

    this.showDecision(decision);
  }, this);
}

inherits(Viewer, Diagram);

module.exports = Viewer;

/**
 * Parse and render a DMN 1.1 diagram.
 *
 * Once finished the viewer reports back the result to the
 * provided callback function with (err, warnings).
 *
 * ## Life-Cycle Events
 *
 * During import the viewer will fire life-cycle events:
 *
 *   * import.parse.start (about to read model from xml)
 *   * import.parse.complete (model read; may have worked or not)
 *   * import.render.start (graphical import start)
 *   * import.render.complete (graphical import finished)
 *   * import.done (everything done)
 *
 * You can use these events to hook into the life-cycle.
 *
 * @param {String} xml the DMN 1.1 xml
 * @param {Function} [done] invoked with (err, warnings=[])
 */
Viewer.prototype.importXML = function(xml, done) {
  var loadDiagram = this._loadDiagram;

  // done is optional
  done = done || noop;

  var self = this;

  var oldNm = 'xmlns="http://www.omg.org/spec/DMN/20151101/dmn11.xsd"';

  // LEGACY YEAH! - convert to correct namespace
  if (xml.indexOf(oldNm)) {
    xml = xml.replace(new RegExp(oldNm), 'xmlns="http://www.omg.org/spec/DMN/20151101/dmn.xsd"');
  }

  // hook in pre-parse listeners +
  // allow xml manipulation
  xml = this._emit('import.parse.start', { xml: xml }) || xml;

  this.moddle.fromXML(xml, 'dmn:Definitions', function(err, definitions, context) {

    // hook in post parse listeners +
    // allow definitions manipulation
    definitions = self._emit('import.parse.complete', {
      error: err,
      definitions: definitions,
      context: context
    }) || definitions;

    if (err) {
      err = checkValidationError(err);

      self._emit('import.done', { error: err });

      return done(err);
    }

    var parseWarnings = context.warnings;

    self.importDefinitions(definitions, function(err, importWarnings) {
      var allWarnings = [].concat(parseWarnings, importWarnings || []),
          decisions;

      self._emit('import.done', { error: err, warnings: allWarnings });

      // if there is only one decision, switch to table view
      decisions = self.getDecisions();

      if (lengthOne(definitions.drgElements) &&
          lengthOne(decisions) &&
          loadDiagram === false) {
        self.showDecision(decisions[0]);
      } else {
        // set the DRD Editor as the current active editor
        self._activeEditor = self;
      }

      done(err, allWarnings);
    });
  });
};

/**
 * Export the currently displayed DMN 1.1 diagram as
 * a DMN 1.1 XML document.
 *
 * @param {Object} [options] export options
 * @param {Boolean} [options.format=false] output formated XML
 * @param {Boolean} [options.preamble=true] output preamble
 *
 * @param {Function} done invoked with (err, xml)
 */
Viewer.prototype.saveXML = function(options, done) {

  if (!done) {
    done = options;
    options = {};
  }

  var definitions = this.definitions;

  if (!definitions) {
    return done(new Error('no definitions loaded'));
  }

  this.moddle.toXML(definitions, options, done);
};

/**
 * Export the currently displayed DMN 1.1 diagram as
 * an SVG image.
 *
 * @param {Object} [options]
 * @param {Function} done invoked with (err, svgStr)
 */
Viewer.prototype.saveSVG = function(options, done) {

  if (!done) {
    done = options;
    options = {};
  }

  var canvas = this.get('canvas');

  var contentNode = canvas.getDefaultLayer(),
      defsNode = domQuery('defs', canvas._svg);

  var contents = innerSVG(contentNode),
      defs = (defsNode && defsNode.outerHTML) || '';

  var bbox = contentNode.getBBox();

  var svg =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<!-- created with dmn-js / http://bpmn.io -->\n' +
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
         'width="' + bbox.width + '" height="' + bbox.height + '" ' +
         'viewBox="' + bbox.x + ' ' + bbox.y + ' ' + bbox.width + ' ' + bbox.height + '" version="1.1">' +
      defs + contents +
    '</svg>';

  done(null, svg);
};

Viewer.prototype.importDefinitions = function(definitions, done) {
  // use try/catch to not swallow synchronous exceptions
  // that may be raised during model parsing
  try {

    if (this.definitions) {
      // clear existing rendered diagram
      this.clear();
    }

    // update definitions
    this.definitions = definitions;

    if (this.table) {
      this.table.definitions = definitions;
    }

    // perform graphical import
    Importer.importDRD(this, definitions, done);
  } catch (e) {
    // handle synchronous errors
    done(e);
  }
};

Viewer.prototype.getDecisions = function(definitions) {
  var defs = definitions || this.definitions;

  if (!defs) {
    return;
  }

  return filter(defs.drgElements, function(element) {
    return is(element, 'dmn:Decision');
  });
};

Viewer.prototype.attach = function(container, oldContainer) {
  var parent = this._parentContainer;

  if (oldContainer.parentElement === parent) {
    parent.removeChild(oldContainer);
  }

  parent.appendChild(container);
};

Viewer.prototype.getActiveEditor = function() {
  return this._activeEditor;
};

Viewer.prototype.showDecision = function(decision, attrs, done) {
  var table = this.table,
      self = this;

  if (typeof attrs === 'function') {
    done = attrs;
    attrs = {};
  }

  done = done || noop;

  this.attach(table.container, this.container);

  this._activeEditor = table;

  return table.showDecision(decision, function(err, warnings) {
    self._emit('view.switch', assign({ decision: decision }, attrs));

    done(err, warnings);
  });
};

Viewer.prototype.showDRD = function(attrs) {
  var decision = this.table.getCurrentDecision();

  attrs = attrs || {};

  this.attach(this.container, this.table.container);

  this._activeEditor = this;

  this._emit('view.switch', assign({ decision: decision }, attrs));
};

Viewer.prototype.getModules = function() {
  return this._modules;
};

/**
 * Destroy the viewer instance and remove all its
 * remainders from the document tree.
 */
Viewer.prototype.destroy = function() {

  // diagram destroy
  Diagram.prototype.destroy.call(this);

  // dom detach
  domRemove(this.container);
};

/**
 * Register an event listener
 *
 * Remove a previously added listener via {@link #off(event, callback)}.
 *
 * @param {String} event
 * @param {Number} [priority]
 * @param {Function} callback
 * @param {Object} [that]
 */
Viewer.prototype.on = function(event, priority, callback, target) {
  return this.get('eventBus').on(event, priority, callback, target);
};

/**
 * De-register an event listener
 *
 * @param {String} event
 * @param {Function} callback
 */
Viewer.prototype.off = function(event, callback) {
  this.get('eventBus').off(event, callback);
};


Viewer.prototype._init = function(container, moddle, options) {

  var baseModules = options.modules || this.getModules(),
      additionalModules = options.additionalModules || [],
      staticModules = [
        {
          drdjs: [ 'value', this ],
          moddle: [ 'value', moddle ],
          table: [ 'value', this.table ]
        }
      ];

  var diagramModules = [].concat(staticModules, baseModules, additionalModules);

  var diagramOptions = assign(omit(options, 'additionalModules'), {
    canvas: assign({}, options.canvas, { container: container }),
    modules: diagramModules
  });


  // this allows forcing the diagram loading
  // useful in the case where there's one decision table
  // and we want to still render the diagram
  this._loadDiagram = options.loadDiagram;

  // invoke diagram constructor
  Diagram.call(this, diagramOptions);

  // Enabled DRD interaction -> setup table switch buttons
  if (options.disableDrdInteraction === false) {
    this._setupTableSwitchListeners(options);
  }
};

Viewer.prototype._setupTableSwitchListeners = function(options) {
  var table = this.table;

  var translate = this.get('translate', false) || function(str) {
    return str;
  };

  var self = this;

  table.get('eventBus').on('controls.init', function(event) {

    event.controls.addControl(translate('Show DRD'), function() {
      self.showDRD({ fromTable: true });
    });
  });
};

/**
 * Emit an event on the underlying {@link EventBus}
 *
 * @param  {String} type
 * @param  {Object} event
 *
 * @return {Object} event processing result (if any)
 */
Viewer.prototype._emit = function(type, event) {
  return this.get('eventBus').fire(type, event);
};

Viewer.prototype._createContainer = function(options) {

  var parent = options.container,
      container;

  // support jquery element
  // unwrap it if passed
  if (parent.get) {
    parent = parent.get(0);
  }

  // support selector
  if (isString(parent)) {
    parent = domQuery(parent);
  }

  this._parentContainer = parent;

  container = domify('<div class="dmn-diagram"></div>');

  assign(container.style, {
    width: ensureUnit(options.width),
    height: ensureUnit(options.height),
    position: options.position
  });

  parent.appendChild(container);

  return container;
};

Viewer.prototype._createModdle = function(options) {
  var moddleOptions = assign({}, this._moddleExtensions, options.moddleExtensions);

  return new DmnModdle(moddleOptions);
};


// modules the viewer is composed of
Viewer.prototype._modules = [
  _dereq_(2),
  _dereq_(101),
  _dereq_(100),
  _dereq_(93),
  _dereq_(12),
  _dereq_(10),
  _dereq_(8)
];

// default moddle extensions the viewer is composed of
Viewer.prototype._moddleExtensions = {};

/* <project-logo> */

var PoweredBy = _dereq_(65),
    domEvent = _dereq_(265);

/**
 * Adds the project logo to the diagram container as
 * required by the bpmn.io license.
 *
 * @see http://bpmn.io/license
 *
 * @param {Element} container
 */
function addProjectLogo(container) {
  var logoData = PoweredBy.BPMNIO_LOGO;

  var linkMarkup =
    '<a href="http://bpmn.io" ' +
       'target="_blank" ' +
       'class="bjs-powered-by" ' +
       'title="Powered by bpmn.io" ' +
       'style="position: absolute; bottom: 15px; right: 15px; z-index: 100">' +
        '<img src="data:image/png;base64,' + logoData + '">' +
    '</a>';

  var linkElement = domify(linkMarkup);

  container.appendChild(linkElement);

  domEvent.bind(linkElement, 'click', function(event) {
    PoweredBy.open();

    event.preventDefault();
  });
}

/* </project-logo> */

},{"10":10,"100":100,"101":101,"118":118,"12":12,"126":126,"134":134,"17":17,"19":19,"2":2,"244":244,"247":247,"250":250,"254":254,"264":264,"265":265,"266":266,"267":267,"327":327,"64":64,"65":65,"73":73,"8":8,"93":93}],2:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  __depends__: [
    _dereq_(6),
    _dereq_(18)
  ]
};

},{"18":18,"6":6}],3:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_(136);

function DecisionLabelUpdater(eventBus, elementRegistry, graphicsFactory) {
  this._elementRegistry = elementRegistry;
  this._graphicsFactory = graphicsFactory;

  eventBus.on('view.switch', this.updateDecisionLabels, this);
}

DecisionLabelUpdater.$inject = [ 'eventBus', 'elementRegistry', 'graphicsFactory' ];

module.exports = DecisionLabelUpdater;

DecisionLabelUpdater.prototype.updateDecisionLabels = function(context) {
  var elementRegistry = this._elementRegistry,
      graphicsFactory = this._graphicsFactory,
      decisions;

  decisions = elementRegistry.filter(function(element) {
    return element.type === 'dmn:Decision';
  });

  forEach(decisions, function(decision) {
    var gfx = elementRegistry.getGraphics(decision.id);

    graphicsFactory.update('shape', decision, gfx);
  });

};

},{"136":136}],4:[function(_dereq_,module,exports){
'use strict';

var inherits = _dereq_(126),
    isArray = _dereq_(241),
    isObject = _dereq_(245),
    assign = _dereq_(250);

var domClasses = _dereq_(261),
    domQuery = _dereq_(266);

var svgAppend = _dereq_(320),
    svgAttr = _dereq_(322),
    svgCreate = _dereq_(325);

var BaseRenderer = _dereq_(82),
    RenderUtil = _dereq_(111),
    TextUtil = _dereq_(113),
    ModelUtil = _dereq_(64);

var is = ModelUtil.is,
    getName = ModelUtil.getName;

var createLine = RenderUtil.createLine;

function DrdRenderer(eventBus, pathMap, styles) {

  BaseRenderer.call(this, eventBus);

  var LABEL_STYLE = {
    fontFamily: 'Arial, sans-serif',
    fontSize: '12px'
  };

  var textUtil = new TextUtil({
    style: LABEL_STYLE,
    size: { width: 100 }
  });

  var markers = {};

  function addMarker(id, element) {
    markers[id] = element;
  }

  function marker(id) {
    var marker = markers[id];

    return 'url(#' + marker.id + ')';
  }

  function initMarkers(svg) {

    function createMarker(id, options) {
      var attrs = assign({
        strokeWidth: 1,
        strokeLinecap: 'round',
        strokeDasharray: 'none'
      }, options.attrs);

      var ref = options.ref || { x: 0, y: 0 };

      var scale = options.scale || 1;

      // fix for safari / chrome / firefox bug not correctly
      // resetting stroke dash array
      if (attrs.strokeDasharray === 'none') {
        attrs.strokeDasharray = [10000, 1];
      }

      var marker = svgCreate('marker');

      svgAttr(options.element, attrs);

      svgAppend(marker, options.element);

      svgAttr(marker, {
        id: id,
        viewBox: '0 0 20 20',
        refX: ref.x,
        refY: ref.y,
        markerWidth: 20 * scale,
        markerHeight: 20 * scale,
        orient: 'auto'
      });

      var defs = domQuery('defs', svg);

      if (!defs) {
        defs = svgCreate('defs');

        svgAppend(svg, defs);
      }

      svgAppend(defs, marker);

      return addMarker(id, marker);
    }

    var associationStart = svgCreate('path');
    svgAttr(associationStart, { d: 'M 11 5 L 1 10 L 11 15' });

    createMarker('association-start', {
      element: associationStart,
      attrs: {
        fill: 'none',
        stroke: 'black',
        strokeWidth: 1.5
      },
      ref: { x: 1, y: 10 },
      scale: 0.5
    });

    var associationEnd = svgCreate('path');
    svgAttr(associationEnd, { d: 'M 1 5 L 11 10 L 1 15' });

    createMarker('association-end', {
      element: associationEnd,
      attrs: {
        fill: 'none',
        stroke: 'black',
        strokeWidth: 1.5
      },
      ref: { x: 12, y: 10 },
      scale: 0.5
    });

    var informationRequirementEnd = svgCreate('path');
    svgAttr(informationRequirementEnd, { d: 'M 1 5 L 11 10 L 1 15 Z' });

    createMarker('information-requirement-end', {
      element: informationRequirementEnd,
      ref: { x: 11, y: 10 },
      scale: 1
    });

    var knowledgeRequirementEnd = svgCreate('path');
    svgAttr(knowledgeRequirementEnd, { d: 'M 1 3 L 11 10 L 1 17' });

    createMarker('knowledge-requirement-end', {
      element: knowledgeRequirementEnd,
      attrs: {
        fill: 'none',
        stroke: 'black',
        strokeWidth: 2
      },
      ref: { x: 11, y: 10 },
      scale: 0.8
    });

    var authorityRequirementEnd = svgCreate('circle');
    svgAttr(authorityRequirementEnd, { cx: 3, cy: 3, r: 3 });

    createMarker('authority-requirement-end', {
      element: authorityRequirementEnd,
      ref: { x: 3, y: 3 },
      scale: 0.9
    });
  }

  function computeStyle(custom, traits, defaultStyles) {
    if (!isArray(traits)) {
      defaultStyles = traits;
      traits = [];
    }

    return styles.style(traits || [], assign(defaultStyles, custom || {}));
  }


  function drawRect(p, width, height, r, offset, attrs) {

    if (isObject(offset)) {
      attrs = offset;
      offset = 0;
    }

    offset = offset || 0;

    attrs = computeStyle(attrs, {
      stroke: 'black',
      strokeWidth: 2,
      fill: 'white'
    });

    var rect = svgCreate('rect');
    svgAttr(rect, {
      x: offset,
      y: offset,
      width: width - offset * 2,
      height: height - offset * 2,
      rx: r,
      ry: r
    });
    svgAttr(rect, attrs);

    svgAppend(p, rect);

    return rect;
  }

  function renderLabel(p, label, options) {
    var text = textUtil.createText(label || '', options);
    domClasses(text).add('djs-label');
    svgAppend(p, text);

    return text;
  }

  function renderEmbeddedLabel(p, element, align) {
    var name = getName(element);
    return renderLabel(p, name, { box: element, align: align, padding: 5 });
  }

  function drawPath(p, d, attrs) {

    attrs = computeStyle(attrs, [ 'no-fill' ], {
      strokeWidth: 2,
      stroke: 'black'
    });

    var path = svgCreate('path');
    svgAttr(path, { d: d });
    svgAttr(path, attrs);

    svgAppend(p, path);

    return path;
  }


  var handlers = {
    'dmn:Decision': function(p, element, attrs) {
      var rect = drawRect(p, element.width, element.height, 0, attrs);

      renderEmbeddedLabel(p, element, 'center-middle');

      return rect;
    },
    'dmn:KnowledgeSource': function(p, element, attrs) {

      var pathData = pathMap.getScaledPath('KNOWLEDGE_SOURCE', {
        xScaleFactor: 1.021,
        yScaleFactor: 1,
        containerWidth: element.width,
        containerHeight: element.height,
        position: {
          mx: 0.0,
          my: 0.075
        }
      });

      var knowledgeSource = drawPath(p, pathData, {
        strokeWidth: 2,
        fill: 'white',
        stroke: 'black'
      });

      renderEmbeddedLabel(p, element, 'center-middle');

      return knowledgeSource;
    },
    'dmn:BusinessKnowledgeModel': function(p, element, attrs) {

      var pathData = pathMap.getScaledPath('BUSINESS_KNOWLEDGE_MODEL', {
        xScaleFactor: 1,
        yScaleFactor: 1,
        containerWidth: element.width,
        containerHeight: element.height,
        position: {
          mx: 0.0,
          my: 0.3
        }
      });

      var businessKnowledge = drawPath(p, pathData, {
        strokeWidth: 2,
        fill: 'white',
        stroke: 'black'
      });

      renderEmbeddedLabel(p, element, 'center-middle');

      return businessKnowledge;
    },
    'dmn:InputData': function(p, element, attrs) {

      var rect = drawRect(p, element.width, element.height, 22, attrs);

      renderEmbeddedLabel(p, element, 'center-middle');

      return rect;
    },
    'dmn:TextAnnotation': function(p, element, attrs) {
      var style = {
        'fill': 'none',
        'stroke': 'none'
      };
      var textElement = drawRect(p, element.width, element.height, 0, 0, style),
          textPathData = pathMap.getScaledPath('TEXT_ANNOTATION', {
            xScaleFactor: 1,
            yScaleFactor: 1,
            containerWidth: element.width,
            containerHeight: element.height,
            position: {
              mx: 0.0,
              my: 0.0
            }
          });

      drawPath(p, textPathData);

      var text = getSemantic(element).text || '';

      renderLabel(p, text, { box: element, align: 'left-middle', padding: 5 });

      return textElement;
    },
    'dmn:Association': function(p, element, attrs) {
      var semantic = getSemantic(element);

      attrs = assign({
        strokeDasharray: '0.5, 5',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        fill: 'none'
      }, attrs || {});

      if (semantic.associationDirection === 'One' ||
          semantic.associationDirection === 'Both') {
        attrs.markerEnd = marker('association-end');
      }

      if (semantic.associationDirection === 'Both') {
        attrs.markerStart = marker('association-start');
      }

      return drawLine(p, element.waypoints, attrs);
    },
    'dmn:InformationRequirement': function(p, element, attrs) {

      attrs = assign({
        strokeWidth: 1,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        markerEnd: marker('information-requirement-end')
      }, attrs || {});

      return drawLine(p, element.waypoints, attrs);
    },
    'dmn:KnowledgeRequirement': function(p, element, attrs) {

      attrs = assign({
        strokeWidth: 1,
        strokeDasharray: 5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        markerEnd: marker('knowledge-requirement-end')
      }, attrs || {});

      return drawLine(p, element.waypoints, attrs);
    },
    'dmn:AuthorityRequirement': function(p, element, attrs) {

      attrs = assign({
        strokeWidth: 1.5,
        strokeDasharray: 5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        markerEnd: marker('authority-requirement-end')
      }, attrs || {});

      return drawLine(p, element.waypoints, attrs);
    }
  };


  // draw shape and connection ////////////////////////////////////
  function drawShape(parent, element) {
    var h = handlers[element.type];

    if (!h) {
      return BaseRenderer.prototype.drawShape.apply(this, [ parent, element ]);
    } else {
      return h(parent, element);
    }
  }

  function drawConnection(parent, element) {
    var type = element.type;
    var h = handlers[type];

    if (!h) {
      return BaseRenderer.prototype.drawConnection.apply(this, [ parent, element ]);
    } else {
      return h(parent, element);
    }
  }

  function drawLine(p, waypoints, attrs) {
    attrs = computeStyle(attrs, [ 'no-fill' ], {
      stroke: 'black',
      strokeWidth: 2,
      fill: 'none'
    });

    var line = createLine(waypoints, attrs);

    svgAppend(p, line);

    return line;
  }

  this.canRender = function(element) {
    return is(element, 'dmn:DMNElement') ||
           is(element, 'dmn:InformationRequirement') ||
           is(element, 'dmn:KnowledgeRequirement') ||
           is(element, 'dmn:AuthorityRequirement');
  };

  this.drawShape = drawShape;
  this.drawConnection = drawConnection;


  // hook onto canvas init event to initialize
  // connection start/end markers on svg
  eventBus.on('canvas.init', function(event) {
    initMarkers(event.svg);
  });

}

inherits(DrdRenderer, BaseRenderer);

DrdRenderer.$inject = [ 'eventBus', 'pathMap', 'styles' ];

module.exports = DrdRenderer;


///////// helper functions /////////////////////////////
function getSemantic(element) {
  return element.businessObject;
}

},{"111":111,"113":113,"126":126,"241":241,"245":245,"250":250,"261":261,"266":266,"320":320,"322":322,"325":325,"64":64,"82":82}],5:[function(_dereq_,module,exports){
'use strict';

/**
 * Map containing SVG paths needed by BpmnRenderer.
 */

function PathMap() {

  /**
   * Contains a map of path elements
   *
   * <h1>Path definition</h1>
   * A parameterized path is defined like this:
   * <pre>
   * 'GATEWAY_PARALLEL': {
   *   d: 'm {mx},{my} {e.x0},0 0,{e.x1} {e.x1},0 0,{e.y0} -{e.x1},0 0,{e.y1} ' +
          '-{e.x0},0 0,-{e.y1} -{e.x1},0 0,-{e.y0} {e.x1},0 z',
   *   height: 17.5,
   *   width:  17.5,
   *   heightElements: [2.5, 7.5],
   *   widthElements: [2.5, 7.5]
   * }
   * </pre>
   * <p>It's important to specify a correct <b>height and width</b> for the path as the scaling
   * is based on the ratio between the specified height and width in this object and the
   * height and width that is set as scale target (Note x,y coordinates will be scaled with
   * individual ratios).</p>
   * <p>The '<b>heightElements</b>' and '<b>widthElements</b>' array must contain the values that will be scaled.
   * The scaling is based on the computed ratios.
   * Coordinates on the y axis should be in the <b>heightElement</b>'s array, they will be scaled using
   * the computed ratio coefficient.
   * In the parameterized path the scaled values can be accessed through the 'e' object in {} brackets.
   *   <ul>
   *    <li>The values for the y axis can be accessed in the path string using {e.y0}, {e.y1}, ....</li>
   *    <li>The values for the x axis can be accessed in the path string using {e.x0}, {e.x1}, ....</li>
   *   </ul>
   *   The numbers x0, x1 respectively y0, y1, ... map to the corresponding array index.
   * </p>
    m1,1
    l 0,55.3
    c 29.8,19.7 48.4,-4.2 67.2,-6.7
    c 12.2,-2.3 19.8,1.6 30.8,6.2
    l 0,-54.6
    z
    */
  this.pathMap = {
    'KNOWLEDGE_SOURCE': {
      d: 'm {mx},{my} ' +
         'l 0,{e.y0} ' +
         'c {e.x0},{e.y1} {e.x1},-{e.y2} {e.x2},-{e.y3} ' +
         'c {e.x3},-{e.y4} {e.x4},{e.y5} {e.x5},{e.y6} ' +
         'l 0,-{e.y7}z',
      width:  100,
      height: 65,
      widthElements: [ 29.8, 48.4, 67.2, 12.2, 19.8, 30.8 ],
      heightElements: [ 55.3, 19.7, 4.2, 6.7, 2.3, 1.6, 6.2, 54.6 ]
    },
    'BUSINESS_KNOWLEDGE_MODEL': {
      d: 'm {mx},{my} l {e.x0},-{e.y0} l {e.x1},0 l 0,{e.y1} l -{e.x2},{e.y2} l -{e.x3},0z',
      width:  125,
      height: 45,
      widthElements: [ 13.8, 109.2, 13.8, 109.1 ],
      heightElements: [ 13.2, 29.8, 13.2 ]
    },
    'TEXT_ANNOTATION': {
      d: 'm {mx}, {my} m 10,0 l -10,0 l 0,{e.y0} l 10,0',
      width: 10,
      height: 30,
      widthElements: [ 10 ],
      heightElements: [ 30 ]
    }
  };

  this.getRawPath = function getRawPath(pathId) {
    return this.pathMap[pathId].d;
  };

  /**
   * Scales the path to the given height and width.
   * <h1>Use case</h1>
   * <p>Use case is to scale the content of elements (event, gateways) based
   * on the element bounding box's size.
   * </p>
   * <h1>Why not transform</h1>
   * <p>Scaling a path with transform() will also scale the stroke and IE does not support
   * the option 'non-scaling-stroke' to prevent this.
   * Also there are use cases where only some parts of a path should be
   * scaled.</p>
   *
   * @param {String} pathId The ID of the path.
   * @param {Object} param <p>
   *   Example param object scales the path to 60% size of the container (data.width, data.height).
   *   <pre>
   *   {
   *     xScaleFactor: 0.6,
   *     yScaleFactor:0.6,
   *     containerWidth: data.width,
   *     containerHeight: data.height,
   *     position: {
   *       mx: 0.46,
   *       my: 0.2,
   *     }
   *   }
   *   </pre>
   *   <ul>
   *    <li>targetpathwidth = xScaleFactor * containerWidth</li>
   *    <li>targetpathheight = yScaleFactor * containerHeight</li>
   *    <li>Position is used to set the starting coordinate of the path. M is computed:
    *    <ul>
    *      <li>position.x * containerWidth</li>
    *      <li>position.y * containerHeight</li>
    *    </ul>
    *    Center of the container <pre> position: {
   *       mx: 0.5,
   *       my: 0.5,
   *     }</pre>
   *     Upper left corner of the container
   *     <pre> position: {
   *       mx: 0.0,
   *       my: 0.0,
   *     }</pre>
   *    </li>
   *   </ul>
   * </p>
   *
   */
  this.getScaledPath = function getScaledPath(pathId, param) {
    var rawPath = this.pathMap[pathId];

    // positioning
    // compute the start point of the path
    var mx, my;

    if (param.abspos) {
      mx = param.abspos.x;
      my = param.abspos.y;
    } else {
      mx = param.containerWidth * param.position.mx;
      my = param.containerHeight * param.position.my;
    }

    var coordinates = {}; //map for the scaled coordinates
    if (param.position) {

      // path
      var heightRatio = (param.containerHeight / rawPath.height) * param.yScaleFactor;
      var widthRatio = (param.containerWidth / rawPath.width) * param.xScaleFactor;


      //Apply height ratio
      for (var heightIndex = 0; heightIndex < rawPath.heightElements.length; heightIndex++) {
        coordinates['y' + heightIndex] = rawPath.heightElements[heightIndex] * heightRatio;
      }

      //Apply width ratio
      for (var widthIndex = 0; widthIndex < rawPath.widthElements.length; widthIndex++) {
        coordinates['x' + widthIndex] = rawPath.widthElements[widthIndex] * widthRatio;
      }
    }

    //Apply value to raw path
    var path = format(
      rawPath.d, {
        mx: mx,
        my: my,
        e: coordinates
      }
    );
    return path;
  };
}

module.exports = PathMap;


////////// helpers //////////

// copied from https://github.com/adobe-webplatform/Snap.svg/blob/master/src/svg.js
var tokenRegex = /\{([^\}]+)\}/g,
    objNotationRegex = /(?:(?:^|\.)(.+?)(?=\[|\.|$|\()|\[('|")(.+?)\2\])(\(\))?/g; // matches .xxxxx or ["xxxxx"] to run over object properties

function replacer(all, key, obj) {
  var res = obj;
  key.replace(objNotationRegex, function(all, name, quote, quotedName, isFunc) {
    name = name || quotedName;
    if (res) {
      if (name in res) {
        res = res[name];
      }
      typeof res == 'function' && isFunc && (res = res());
    }
  });
  res = (res == null || res == obj ? all : res) + '';

  return res;
}

function format(str, obj) {
  return String(str).replace(tokenRegex, function(all, key) {
    return replacer(all, key, obj);
  });
}

},{}],6:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  __init__: [ 'drdRenderer', 'decisionLabelUpdater' ],
  drdRenderer: [ 'type', _dereq_(4) ],
  pathMap: [ 'type', _dereq_(5)],
  decisionLabelUpdater: [ 'type', _dereq_(3) ]
};

},{"3":3,"4":4,"5":5}],7:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264),
    domQuery = _dereq_(266),
    domDelegate = _dereq_(263);

function DefinitionIdView(eventBus, canvas) {
  this._eventBus = eventBus;
  this._canvas = canvas;

  eventBus.on('diagram.init', function() {
    this._init();
  }, this);

  eventBus.on('import.done', function(event) {
    this.update();
  }, this);
}

DefinitionIdView.$inject = [ 'eventBus', 'canvas' ];

module.exports = DefinitionIdView;

/**
 * Initialize
 */
DefinitionIdView.prototype._init = function() {
  var canvas = this._canvas,
      eventBus = this._eventBus;

  var parent = canvas.getContainer(),
      container = this._container = domify(DefinitionIdView.HTML_MARKUP);

  parent.appendChild(container);

  this.nameElement = domQuery('.dmn-definitions-name', this._container);
  this.idElement = domQuery('.dmn-definitions-id', this._container);

  domDelegate.bind(container, '.dmn-definitions-name, .dmn-definitions-id', 'mousedown', function(event) {
    event.stopPropagation();
  });

  eventBus.fire('definitionIdView.create', {
    html: container
  });
};

DefinitionIdView.prototype.update = function(newName) {
  var businessObject = this._canvas.getRootElement().businessObject;

  this.nameElement.textContent = businessObject.name;
  this.idElement.textContent = businessObject.id;
};


/* markup definition */

DefinitionIdView.HTML_MARKUP =
  '<div class="dmn-definitions">' +
    '<div class="dmn-definitions-name" title="Definition Name"></div>' +
    '<div class="dmn-definitions-id" title="Definition ID"></div>' +
  '</div>';

},{"263":263,"264":264,"266":266}],8:[function(_dereq_,module,exports){
module.exports = {
  __depends__: [ ],
  __init__: [ 'definitionPropertiesView' ],
  definitionPropertiesView: [ 'type', _dereq_(7) ]
};

},{"7":7}],9:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264),
    domDelegate = _dereq_(263);

function DrillDown(eventBus, overlays, drdRules, config) {
  this._eventBus = eventBus;
  this._overlays = overlays;
  this._drdRules = drdRules;
  this._config = config;

  eventBus.on([ 'drdElement.added', 'shape.create' ], function(context) {
    var element = context.element,
        canDrillDown = drdRules.canDrillDown(element);

    if (canDrillDown) {
      this.addOverlay(element, canDrillDown);
    }
  }, this);
}

module.exports = DrillDown;

DrillDown.$inject = [ 'eventBus', 'overlays', 'drdRules', 'config' ];


DrillDown.prototype.addOverlay = function(decision, decisionType) {
  var overlays = this._overlays;

  var icon = decisionType === 'table' ? 'decision-table' : 'literal-expression';

  var overlay = domify([
    '<div class="drill-down-overlay">',
    '<span class="dmn-icon-' + icon + '" />',
    '</div>'
  ].join(''));

  var overlayId = overlays.add(decision, {
    position: {
      top: 1,
      left: 1
    },
    html: overlay
  });

  if (!this._config.disableDrdInteraction) {
    overlay.style.cursor = 'pointer';
    this.bindEventListener(decision, overlay, overlayId);
  }
};

DrillDown.prototype.bindEventListener = function(decision, overlay, id) {
  var overlays = this._overlays,
      eventBus = this._eventBus;

  var overlaysRoot = overlays._overlayRoot;

  domDelegate.bind(overlaysRoot, '[data-overlay-id="' + id + '"]', 'click', function() {

    eventBus.fire('decision.open', { decision: decision.businessObject });
  });
};

},{"263":263,"264":264}],10:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  __depends__: [
    _dereq_(87)
  ],
  __init__: [ 'drillDown' ],
  drillDown: [ 'type', _dereq_(9) ]
};

},{"87":87,"9":9}],11:[function(_dereq_,module,exports){
'use strict';

var ModelUtil = _dereq_(64),
    is = ModelUtil.is,
    isAny = ModelUtil.isAny;

var inherits = _dereq_(126);

var RuleProvider = _dereq_(94);

/**
 * DRD specific modeling rule
 */
function DrdRules(eventBus) {
  RuleProvider.call(this, eventBus);
}

inherits(DrdRules, RuleProvider);

DrdRules.$inject = [ 'eventBus' ];

module.exports = DrdRules;

DrdRules.prototype.init = function() {

  this.addRule('elements.move', function(context) {

    var target = context.target,
        shapes = context.shapes,
        position = context.position;

    return canMove(shapes, target, position);
  });

  this.addRule('connection.create', function(context) {
    var source = context.source,
        target = context.target;

    return canConnect(source, target);
  });

  this.addRule('connection.reconnectStart', function(context) {

    var connection = context.connection,
        source = context.hover || context.source,
        target = connection.target;

    return canConnect(source, target, connection);
  });

  this.addRule('connection.reconnectEnd', function(context) {

    var connection = context.connection,
        source = connection.source,
        target = context.hover || context.target;

    return canConnect(source, target, connection);
  });

  this.addRule('connection.updateWaypoints', function(context) {
    // OK! but visually ignore
    return null;
  });

};

DrdRules.prototype.canConnect = canConnect;

DrdRules.prototype.canMove = canMove;

DrdRules.prototype.canDrillDown = canDrillDown;


function canConnect(source, target) {

  if (is(source, 'dmn:Definitions') || is(target, 'dmn:Definitions')) {
    return false;
  }

  if (is(source, 'dmn:Decision') || is(source, 'dmn:InputData')) {
    if (is(target, 'dmn:Decision') ||
       (is(source, 'dmn:Decision') && is(target, 'dmn:InputData'))) {
      return { type: 'dmn:InformationRequirement' };
    }

    if (is(target, 'dmn:KnowledgeSource')) {
      return { type: 'dmn:AuthorityRequirement' };
    }
  }

  if (is(source, 'dmn:BusinessKnowledgeModel') &&
      isAny(target, [ 'dmn:Decision', 'dmn:BusinessKnowledgeModel' ])) {
    return { type: 'dmn:KnowledgeRequirement' };
  }

  if (is(source, 'dmn:KnowledgeSource') &&
      isAny(target, [ 'dmn:Decision', 'dmn:BusinessKnowledgeModel', 'dmn:KnowledgeSource' ])) {
    return { type: 'dmn:AuthorityRequirement' };
  }

  if (is(target, 'dmn:TextAnnotation')) {
    return { type: 'dmn:Association' };
  }

  return false;
}

function canMove(elements, target) {

  // allow default move check to start move operation
  if (!target) {
    return true;
  }

  if (is(target, 'dmn:Definitions')) {
    return true;
  }

  return false;
}

function canDrillDown(element) {
  var businessObject = element.businessObject;

  if (!is(element, 'dmn:Decision')) {
    return false;
  }

  if (businessObject.decisionTable) {
    return 'table';
  } else if (businessObject.literalExpression) {
    return 'literal';
  }

  return false;
}

},{"126":126,"64":64,"94":94}],12:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  __depends__: [
    _dereq_(96)
  ],
  __init__: [ 'drdRules' ],
  drdRules: [ 'type', _dereq_(11) ]
};

},{"11":11,"96":96}],13:[function(_dereq_,module,exports){
'use strict';

var FILTER_REGEX = /^\s*(?:'([^']+)')\s*(?:\|\s*(\w+)\s*)?$/g;
var TEMPLATE_REGEX = /{{([^}]+)}}/g;

/**
 * A parser that processes loaded (HTML) templates
 * before they get used by the app.
 *
 * @param {Function} translate
 *
 * @return {Function} template parser fn
 */
function ParseTemplateFactory(translate) {

  var filters = {
    translate: translate
  };

  function applyFilters(expr) {
    // match expression | filter
    return expr.replace(FILTER_REGEX, function(_, expr, filterName, str) {
      var s = str || applyFilters(expr);
      var cb = filters[filterName];
      if (typeof cb === 'function') {
        return cb(s);
      } else {
        return s;
      }
    });
  }

  return function parseTemplate(templateStr) {
    return templateStr.replace(TEMPLATE_REGEX, function(_, expr) {
      return applyFilters(expr);
    });
  };

}

ParseTemplateFactory.$inject = [ 'translate' ];

module.exports = ParseTemplateFactory;
},{}],14:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  __depends__: [
    _dereq_(101)
  ],
  parseTemplate: [ 'factory', _dereq_(13) ]
};

},{"101":101,"13":13}],15:[function(_dereq_,module,exports){
'use strict';

var assign = _dereq_(250),
    map = _dereq_(138);

var ModelUtil = _dereq_(64),
    is = ModelUtil.is;

function elementData(semantic, attrs) {
  return assign({
    id: semantic.id,
    type: semantic.$type,
    businessObject: semantic
  }, attrs);
}

function getHREF(element) {
  return element && element.href.slice(1);
}

function collectWaypoints(edge) {
  var waypoints = edge.waypoints;

  if (waypoints) {
    return map(waypoints, function(waypoint) {
      var position = { x: waypoint.x, y: waypoint.y };

      return assign({ original: position }, position);
    });
  }
}

function DrdImporter(eventBus, canvas, elementFactory, elementRegistry) {
  this._eventBus = eventBus;
  this._canvas = canvas;
  this._elementRegistry = elementRegistry;
  this._elementFactory = elementFactory;
}

DrdImporter.$inject = [ 'eventBus', 'canvas', 'elementFactory', 'elementRegistry' ];

module.exports = DrdImporter;


DrdImporter.prototype.root = function(diagram) {
  var element = this._elementFactory.createRoot(elementData(diagram));

  this._canvas.setRootElement(element);

  return element;
};

/**
 * Add drd element (semantic) to the canvas.
 */
DrdImporter.prototype.add = function(semantic, di) {
  var elementFactory = this._elementFactory,
      canvas = this._canvas,
      eventBus = this._eventBus;

  var element, waypoints, sourceShape, targetShape, elementDefinition,
      sourceID, targetID;

  if (di.$instanceOf('biodi:Bounds')) {
    elementDefinition = elementData(semantic, {
      x: Math.round(di.x),
      y: Math.round(di.y),
      width: Math.round(di.width),
      height: Math.round(di.height)
    });

    element = elementFactory.createShape(elementDefinition);

    canvas.addShape(element);

    eventBus.fire('drdElement.added', { element: element, di: di });

  } else if (di.$instanceOf('biodi:Edge')) {
    waypoints = collectWaypoints(di);

    sourceID = di.source;
    targetID = semantic.$parent.id;

    if (is(semantic, 'dmn:Association')) {
      targetID = getHREF(semantic.targetRef);
    }

    sourceShape = this._getShape(sourceID);
    targetShape = this._getShape(targetID);

    if (sourceShape && targetShape) {
      elementDefinition = elementData(semantic, {
        hidden: false,
        source: sourceShape,
        target: targetShape,
        waypoints: waypoints
      });

      element = elementFactory.createConnection(elementDefinition);

      canvas.addConnection(element);

      eventBus.fire('drdElement.added', { element: element, di: di });
    }

  } else {
    throw new Error('unknown di for element ' + semantic.id);
  }

  return element;
};

DrdImporter.prototype._getShape = function(id) {
  return this._elementRegistry.get(id);
};

},{"138":138,"250":250,"64":64}],16:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_(136),
    find = _dereq_(135);

var is = _dereq_(64).is;


function parseID(element) {
  return element && element.href.slice(1);
}

function DRDTreeWalker(handler, options) {

  // list of elements to handle deferred to ensure
  // prerequisites are drawn
  var deferred = [];

  function visit(element, di) {

    var gfx = element.gfx;

    // avoid multiple rendering of elements
    if (gfx) {
      throw new Error('already rendered ' + element.id);
    }

    // call handler
    return handler.element(element, di);
  }

  ////// Semantic handling //////////////////////

  function handleDefinitions(definitions) {

    // make sure we walk the correct dmnElement
    handler.root(definitions);

    forEach(['decision', 'drgElements', 'artifacts' ], function(element) {
      if (definitions[element]) {
        forEach(definitions[element], handleElement);
      }
    });

    handleDeferred(deferred);
  }

  function handleDeferred(elements) {
    forEach(elements, function(d) {
      d();
    });
  }

  function handleElement(element) {
    var edges = [];

    handleDI(element, function(extensionElement) {
      if (extensionElement.$parent.$instanceOf('dmn:ExtensionElements')) {

        if (is(extensionElement, 'biodi:Bounds')) {
          visit(element, extensionElement);

        } else if (is(extensionElement, 'biodi:Edge')) {
          edges.push(extensionElement);
        }
      }
    });

    handleConnections(edges, element);
  }



  function handleConnections(edges, element) {

    function deferConnection(semantic, property) {
      var id = parseID(property),
          edge = find(edges, { source: id });

      if (edge) {
        deferred.push(function() {
          visit(semantic, edge);
        });
      }
    }

    if (is(element, 'dmn:Association')) {
      return deferConnection(element, element.sourceRef);
    }

    forEach([
      'informationRequirement',
      'knowledgeRequirement',
      'authorityRequirement'
    ], function(requirements) {
      forEach(element[requirements], function(requirement) {
        var properties = null;

        // get the href
        if (is(requirement, 'dmn:InformationRequirement')) {
          properties = [ 'requiredDecision', 'requiredInput' ];

        } else if (is(requirement, 'dmn:KnowledgeRequirement')) {
          properties = [ 'requiredKnowledge' ];

        } else if (is(requirement, 'dmn:AuthorityRequirement')) {
          properties = [ 'requiredDecision', 'requiredInput', 'requiredAuthority' ];
        }

        if (properties) {
          forEach(properties, function(property) {
            if (requirement[property]) {
              deferConnection(requirement, requirement[property]);
            }
          });
        }
      });
    });
  }

  function handleDI(element, fn) {
    var extensionElements = element.extensionElements,
        values;

    if (!extensionElements) {
      return;
    }

    values = extensionElements.values;

    forEach(values, fn);
  }

  ///// API ////////////////////////////////

  return {
    handleDefinitions: handleDefinitions
  };
}

module.exports = DRDTreeWalker;

},{"135":135,"136":136,"64":64}],17:[function(_dereq_,module,exports){
'use strict';

var DrdTreeWalker = _dereq_(16);


/**
 * Import the definitions into a diagram.
 *
 * Errors and warnings are reported through the specified callback.
 *
 * @param  {Canvas} canvas
 * @param  {ModdleElement} definitions
 * @param  {Function} done the callback, invoked with (err, [ warning ]) once the import is done
 */
function importDRD(canvas, definitions, done) {

  var importer = canvas.get('drdImporter'),
      eventBus = canvas.get('eventBus');

  var error,
      warnings = [];

  function render(definitions) {

    var visitor = {
      root: function(element) {
        return importer.root(element);
      },

      element: function(element, di) {
        return importer.add(element, di);
      },

      error: function(message, context) {
        warnings.push({ message: message, context: context });
      }
    };

    var walker = new DrdTreeWalker(visitor);

    // import
    walker.handleDefinitions(definitions);
  }

  eventBus.fire('import.render.start', { definitions: definitions });

  try {
    render(definitions);
  } catch (e) {
    error = e;
  }

  eventBus.fire('import.render.complete', {
    error: error,
    warnings: warnings
  });


  done(error, warnings);
}

module.exports.importDRD = importDRD;

},{"16":16}],18:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  drdImporter: [ 'type', _dereq_(15) ]
};

},{"15":15}],19:[function(_dereq_,module,exports){
/**
 * The code in the <project-logo></project-logo> area
 * must not be changed.
 *
 * @see http://bpmn.io/license for more information.
 */
'use strict';

var assign = _dereq_(250),
    omit = _dereq_(254),
    isString = _dereq_(247),
    filter = _dereq_(134);

var domify = _dereq_(264),
    domQuery = _dereq_(266),
    domRemove = _dereq_(267);

var Table = _dereq_(284),
    DmnModdle = _dereq_(118);

var inherits = _dereq_(126);

var Importer = _dereq_(59);

var is = _dereq_(64).is;

var ComboBox = _dereq_(294);


function checkValidationError(err) {

  // check if we can help the user by indicating wrong DMN xml
  // (in case he or the exporting tool did not get that right)

  var pattern = /unparsable content <([^>]+)> detected([\s\S]*)$/;
  var match = pattern.exec(err.message);

  if (match) {
    err.message =
      'unparsable content <' + match[1] + '> detected; ' +
      'this may indicate an invalid DMN file' + match[2];
  }

  return err;
}

var DEFAULT_OPTIONS = {
  container: 'body'
};

/**
 * A viewer for DMN tables.
 *
 *
 * ## Extending the Viewer
 *
 * In order to extend the viewer pass extension modules to bootstrap via the
 * `additionalModules` option. An extension module is an object that exposes
 * named services.
 *
 * The following example depicts the integration of a simple
 * logging component that integrates with interaction events:
 *
 *
 * ```javascript
 *
 * // logging component
 * function InteractionLogger(eventBus) {
 *   eventBus.on('element.hover', function(event) {
 *     console.log()
 *   })
 * }
 *
 * InteractionLogger.$inject = [ 'eventBus' ]; // minification save
 *
 * // extension module
 * var extensionModule = {
 *   __init__: [ 'interactionLogger' ],
 *   interactionLogger: [ 'type', InteractionLogger ]
 * };
 *
 * // extend the viewer
 * var dmnViewer = new Viewer({ additionalModules: [ extensionModule ] });
 * dmnViewer.importXML(...);
 * ```
 *
 * @param {Object} [options] configuration options to pass to the viewer
 * @param {DOMElement} [options.container] the container to render the viewer in, defaults to body.
 * @param {String|Number} [options.width] the width of the viewer
 * @param {String|Number} [options.height] the height of the viewer
 * @param {Object} [options.moddleExtensions] extension packages to provide
 * @param {Array<didi.Module>} [options.modules] a list of modules to override the default modules
 * @param {Array<didi.Module>} [options.additionalModules] a list of modules to use with the default modules
 */
function Viewer(options) {

  this.options = options = assign({}, DEFAULT_OPTIONS, options || {});

  this.moddle = options.moddle;

  if (!this.moddle) {
    this.moddle = this._createModdle(options);
  }

  this.container = this._createContainer(options);

  this._init(this.container, this.moddle, options);

  /* <project-logo> */

  addProjectLogo(this.container.firstChild);

  /* </project-logo> */

  this.on([ 'table.destroy', 'table.clear' ], function() {
    if (ComboBox.prototype._openedDropdown) {
      ComboBox.prototype._openedDropdown._closeDropdown();
    }
  }, this);
}

inherits(Viewer, Table);

module.exports = Viewer;

/**
 * Parse and render a DMN 1.1 table.
 *
 * Once finished the viewer reports back the result to the
 * provided callback function with (err, warnings).
 *
 * ## Life-Cycle Events
 *
 * During import the viewer will fire life-cycle events:
 *
 *   * import.parse.start (about to read model from xml)
 *   * import.parse.complete (model read; may have worked or not)
 *   * import.render.start (graphical import start)
 *   * import.render.complete (graphical import finished)
 *   * import.done (everything done)
 *
 * You can use these events to hook into the life-cycle.
 *
 * @param {String} xml the DMN 1.1 xml
 * @param {Function} [done] invoked with (err, warnings=[])
 */
Viewer.prototype.importXML = function(xml, done) {

  // done is optional
  done = done || function() {};

  var self = this;

  // hook in pre-parse listeners +
  // allow xml manipulation
  xml = this._emit('import.parse.start', { xml: xml }) || xml;

  this.moddle.fromXML(xml, 'dmn:Definitions', function(err, definitions, context) {

    // hook in post parse listeners +
    // allow definitions manipulation
    definitions = self._emit('import.parse.complete', {
      error: err,
      definitions: definitions,
      context: context
    }) || definitions;

    if (err) {
      err = checkValidationError(err);

      self._emit('import.done', { error: err });

      return done(err);
    }

    var parseWarnings = context.warnings;

    self.importDefinitions(definitions, function(err, importWarnings) {
      var allWarnings = [].concat(parseWarnings, importWarnings || []);

      self._emit('import.done', { error: err, warnings: allWarnings });

      done(err, allWarnings);
    });
  });
};

Viewer.prototype.getDefinitions = function() {
  return this.definitions;
};

Viewer.prototype.getDecisions = function(definitions) {
  var defs = definitions || this.definitions;

  if (!defs) {
    return;
  }

  return filter(defs.drgElements, function(element) {
    return is(element, 'dmn:Decision');
  });
};

Viewer.prototype.getCurrentDecision = function() {
  return this._decision;
};

Viewer.prototype.showDecision = function(decision, done) {
  var self = this;

  if (!this.definitions) {
    throw new Error('Definitions not parsed yet');
  }

  if (!decision) {
    throw new Error('Unknown decision object');
  }

  if (!done) {
    done = function() {};
  }

  // so we can get it later from the DRD Viewer
  this._decision = decision;

  // import the definition with the given decision
  this.importDefinitions(this.definitions, decision, function(err, importWarnings) {
    var warnings = importWarnings || [];

    self._emit('import.done', { error: err, warnings: warnings });

    done(err, warnings);
  });

};

Viewer.prototype.saveXML = function(options, done) {

  if (!done) {
    done = options;
    options = {};
  }

  var definitions = this.definitions;

  if (!definitions) {
    return done(new Error('no definitions loaded'));
  }

  this.moddle.toXML(definitions, options, done);
};

Viewer.prototype.importDefinitions = function(definitions, decision, done) {
  var decisions;

  // use try/catch to not swallow synchronous exceptions
  // that may be raised during model parsing
  try {
    if (this.definitions) {
      this.clear();
    }

    if (typeof decision === 'function') {
      done = decision;
      decisions = this.getDecisions(definitions);

      decision = decisions && decisions[0];
    }

    this.definitions = definitions;

    // perform graphical import
    Importer.importDmnTable(this, definitions, decision, done);
  } catch (e) {
    done(e);
  }
};

Viewer.prototype._createContainer = function(options) {

  var parent = options.container,
      container;

  // support jquery element
  // unwrap it if passed
  if (parent.get) {
    parent = parent.get(0);
  }

  // support selector
  if (isString(parent)) {
    parent = domQuery(parent);
  }

  this._parentContainer = parent;

  container = domify('<div class="dmn-table"></div>');

  // append to DOM unless explicity defined otherwise
  if (options.isDetached !== true) {
    parent.appendChild(container);
  }

  return container;
};

/**
 * Create a moddle instance.
 *
 * @param {Object} options
 */
Viewer.prototype._createModdle = function(options) {
  var moddleOptions = assign({}, this._moddleExtensions, options.moddleExtensions);

  return new DmnModdle(moddleOptions);
};

Viewer.prototype._init = function(container, moddle, options) {

  var modules = [].concat(options.modules || this.getModules(), options.additionalModules || []);

  // add self as an available service
  modules.unshift({
    dmnjs: [ 'value', this ],
    moddle: [ 'value', moddle ]
  });

  options = omit(options, 'additionalModules');

  options = assign(options, {
    sheet: {
      width: options.width,
      height: options.height,
      container: container
    },
    modules: modules
  });

  // invoke table constructor
  Table.call(this, options);
};


Viewer.prototype.getModules = function() {
  return this._modules;
};


/**
 * Destroy the viewer instance and remove all its
 * remainders from the document tree.
 */
Viewer.prototype.destroy = function() {

  // table destroy
  Table.prototype.destroy.call(this);

  // dom detach
  domRemove(this.container);
};

/**
 * Emit an event on the underlying {@link EventBus}
 *
 * @param  {String} type
 * @param  {Object} event
 *
 * @return {Object} event processing result (if any)
 */
Viewer.prototype._emit = function(type, event) {
  return this.get('eventBus').fire(type, event);
};

/**
 * Register an event listener
 *
 * Remove a previously added listener via {@link #off(event, callback)}.
 *
 * @param {String} event
 * @param {Number} [priority]
 * @param {Function} callback
 * @param {Object} [that]
 */
Viewer.prototype.on = function(event, priority, callback, target) {
  return this.get('eventBus').on(event, priority, callback, target);
};

/**
 * De-register an event listener
 *
 * @param {String} event
 * @param {Function} callback
 */
Viewer.prototype.off = function(event, callback) {
  this.get('eventBus').off(event, callback);
};

// modules the viewer is composed of
Viewer.prototype._modules = [
  _dereq_(20),
  _dereq_(101),
  _dereq_(302),
  _dereq_(42),
  _dereq_(30),
  _dereq_(25),
  _dereq_(49),
  _dereq_(58),
  _dereq_(51),
  _dereq_(38),
  _dereq_(32),
  _dereq_(28),
  _dereq_(54),
  _dereq_(45),

  _dereq_(300),
  _dereq_(298),
  _dereq_(296)
];


/* <project-logo> */

var PoweredBy = _dereq_(65),
    domEvent = _dereq_(265);

/**
 * Adds the project logo to the diagram container as
 * required by the bpmn.io license.
 *
 * @see http://bpmn.io/license
 *
 * @param {Element} container
 */
function addProjectLogo(container) {
  var logoData = PoweredBy.BPMNIO_LOGO;

  var linkMarkup =
    '<a href="http://bpmn.io" ' +
       'target="_blank" ' +
       'class="dmn-js-powered-by" ' +
       'title="Powered by bpmn.io" ' +
       'style="position: absolute; z-index: 100">' +
        '<img src="data:image/png;base64,' + logoData + '">' +
    '</a>';

  var linkElement = domify(linkMarkup);

  container.appendChild(linkElement);

  domEvent.bind(linkElement, 'click', function(event) {
    PoweredBy.open();

    event.preventDefault();
  });
}

/* </project-logo> */

},{"101":101,"118":118,"126":126,"134":134,"20":20,"247":247,"25":25,"250":250,"254":254,"264":264,"265":265,"266":266,"267":267,"28":28,"284":284,"294":294,"296":296,"298":298,"30":30,"300":300,"302":302,"32":32,"38":38,"42":42,"45":45,"49":49,"51":51,"54":54,"58":58,"59":59,"64":64,"65":65}],20:[function(_dereq_,module,exports){
module.exports = {
  __depends__: [
    _dereq_(63),
    _dereq_(22)
  ]
};

},{"22":22,"63":63}],21:[function(_dereq_,module,exports){
'use strict';

var domClasses = _dereq_(261);

var HIGH_PRIORITY = 1500,
    UTILITY_COL_WIDTH = 45;


function DmnRenderer(eventBus, elementRegistry, sheet, config) {

  eventBus.on('sheet.resized', HIGH_PRIORITY, function(event) {
    var context = event.context;

    var container = sheet.getContainer();

    var minColWidth = config.minColWidth;

    var baseWidth = UTILITY_COL_WIDTH,
        numberOfCols = 1,
        utilityColumn,
        firstColumn,
        minTableWidth;

    if (!context) {
      event.context = context = {};
    }

    // get a random cell to figure out the width
    utilityColumn = elementRegistry.filter(function(elem) {
      return elem.id === 'utilityColumn';
    })[0];

    firstColumn = utilityColumn.next;

    if (!firstColumn) {
      return;
    }

    // get the number of cols
    while (!firstColumn.isAnnotationsColumn) {
      firstColumn = firstColumn.next;

      numberOfCols++;
    }

    minTableWidth = baseWidth + numberOfCols * minColWidth;

    sheet.setWidth('auto');

    if (container.clientWidth <= minTableWidth) {
      context.newWidth = minTableWidth;
    }
  });

  eventBus.on('row.render', function(event) {
    if (event.data.isClauseRow) {
      domClasses(event.gfx).add('labels');
    }
  });

  eventBus.on('cell.render', function(event) {
    var data = event.data,
        gfx  = event.gfx;

    if (!data.column.businessObject) {
      return;
    }

    if (data.row.isClauseRow) {
      // clause names
      gfx.childNodes[0].textContent = data.column.businessObject.label;
    } else if (data.content) {
      if (!data.content.tagName && data.row.businessObject) {
        // input and output entries
        gfx.childNodes[0].textContent = data.content.text;
      }
    }
    if (!data.row.isFoot) {
      if (data.column.businessObject.inputExpression) {
        domClasses(gfx).add('input');
      } else {
        domClasses(gfx).add('output');
      }
    }
  });
}

DmnRenderer.$inject = [ 'eventBus', 'elementRegistry', 'sheet', 'config' ];

module.exports = DmnRenderer;

},{"261":261}],22:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'tableRenderer' ],
  tableRenderer: [ 'type', _dereq_(21) ]
};

},{"21":21}],23:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264);

/**
 * Adds an annotation column to the table
 *
 * @param {EventBus} eventBus
 */
function Annotations(eventBus, sheet, elementRegistry, graphicsFactory, translate) {

  this.column = null;

  var labelCell;

  eventBus.on('import.done', function(event) {
    var column;

    if (event.error) {
      return;
    }

    eventBus.fire('annotations.add', event);

    this.column = column = sheet.addColumn({
      id: 'annotations',
      isAnnotationsColumn: true
    });

    labelCell = elementRegistry.filter(function(element) {
      return element._type === 'cell' && element.column === column && element.row.isLabelRow;
    })[0];

    labelCell.rowspan = 4;

    labelCell.content = domify(translate('Annotation'));

    graphicsFactory.update('column', column, elementRegistry.getGraphics(this.column.id));

    eventBus.fire('annotations.added', column);
  }, this);

  eventBus.on([ 'sheet.destroy', 'sheet.clear' ], function(event) {
    var column = this.column;

    eventBus.fire('annotations.destroy', column);

    sheet.removeColumn({
      id: 'annotations'
    });

    eventBus.fire('annotations.destroyed', column);
  }, this);
}

Annotations.$inject = [
  'eventBus', 'sheet', 'elementRegistry',
  'graphicsFactory', 'translate'
];

module.exports = Annotations;

Annotations.prototype.getColumn = function() {
  return this.column;
};

},{"264":264}],24:[function(_dereq_,module,exports){
'use strict';

var domClasses = _dereq_(261);

function AnnotationsRenderer(
    eventBus,
    annotations) {

  eventBus.on('cell.render', function(event) {
    if (event.data.column === annotations.getColumn() && !event.data.row.isFoot) {
      domClasses(event.gfx).add('annotation');
      if (!event.data.row.isHead) {
        // render the description of the rule inside the cell
        event.gfx.childNodes[0].textContent = event.data.row.businessObject.description || '';
      }
    }
  });
}

AnnotationsRenderer.$inject = [
  'eventBus',
  'annotations'
];

module.exports = AnnotationsRenderer;

},{"261":261}],25:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'annotations', 'annotationsRenderer'],
  __depends__: [
    _dereq_(101)
  ],
  annotations: [ 'type', _dereq_(23) ],
  annotationsRenderer: [ 'type', _dereq_(24) ]
};

},{"101":101,"23":23,"24":24}],26:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264),
    utils  = _dereq_(27);

var isDateCell = utils.isDateCell,
    parseDate  = utils.parseDate;

function DateView(eventBus, simpleMode) {
  this._eventBus = eventBus;
  this._simpleMode = simpleMode;

  this._eventBus.on('cell.render', function(evt) {

    // remove potential datafield
    dateGfx = evt.gfx.querySelector('.date-content');
    if (dateGfx) {
      dateGfx.parentNode.removeChild(dateGfx);
    }
    if (evt.gfx.childNodes.length === 1) {
        // make sure the contenteditable field is visible
      evt.gfx.firstChild.style.display = 'inline';
      evt.data.preventAutoUpdate = false;
    }

    if (isDateCell(evt.data)) {
      if (this._simpleMode.isActive()) {
        // make sure the contendeditable field is hidden
        evt.gfx.firstChild.style.display = 'none';
        evt.data.preventAutoUpdate = true;

        // check for the datafield
        var dateGfx = evt.gfx.querySelector('.date-content');
        if (!dateGfx) {
          dateGfx = domify('<span class="date-content">');
          evt.gfx.appendChild(dateGfx);
        }
        this.renderDate(evt.data.content, dateGfx);
      } else {
        // make sure the contenteditable field is visible
        evt.gfx.firstChild.style.display = '';
        evt.data.preventAutoUpdate = false;

        // remove potential datafield
        dateGfx = evt.gfx.querySelector('.date-content');
        
        if (dateGfx) {
          dateGfx.parentNode.removeChild(dateGfx);
        }
      }
    }
  }, this);
}

DateView.prototype.renderDate = function(data, gfx) {
  if (data && data.text) {
    var parsed = parseDate(data.text);
    if (!parsed) {
      if (data.description) {
        gfx.innerHTML = '<span class="expression-hint"><b>[expression]</b> (<i></i>)</span>';
        gfx.querySelector('i').textContent = data.description;
      } else {
        gfx.innerHTML = '<span class="expression-hint"><b>[expression]</b></span>';
      }
    } else {
      var dateString;
      var date1 = new Date(parsed.date1 + '.000Z');
      if (parsed.type === 'exact') {
        dateString = date1.toUTCString().slice(0, -7);
      } else {
        dateString = parsed.type + ' ' + date1.toUTCString().slice(0, -7);

        if (parsed.date2) {
          var date2 = new Date(parsed.date2 + '.000Z');
          dateString += ' and ' + date2.toUTCString().slice(0, -7);
        }
      }

      gfx.textContent = dateString;
    }
  } else {
    gfx.innerHTML = '<span style="display: inline-block; width: 100%; color: #777777; text-align: center;">-</span>';
  }
};

DateView.$inject = ['eventBus', 'simpleMode'];

module.exports = DateView;

},{"264":264,"27":27}],27:[function(_dereq_,module,exports){
'use strict';

var hasDateType = function(column) {
  return column &&
         (column.inputExpression &&
         column.inputExpression.typeRef === 'date' ||
         column.typeRef === 'date');
};
var isBodyRow = function(row) {
  return !row.isHead && !row.isFoot;
};

module.exports = {
  isISODateString: function(dateString) {
    return /\d{4}(?:-\d\d){2}T(?:\d\d:){2}\d\d/.test(dateString);
  },
  getSampleDate: function(endOfDay) {
    var date = new Date();
    if (endOfDay) {
      date.setUTCHours(23, 59, 59, 0);
    } else {
      date.setUTCHours(0, 0, 0, 0);
    }

    return date.toISOString().slice(0,-5);
  },
  isDateCell: function(el) {
    return el._type === 'cell' &&
      hasDateType(el.column.businessObject) &&
      isBodyRow(el.row);
  },
  parseDate: function(dateString) {
    // try empty
    if (dateString.trim() === '') {
      return {
        type: 'exact',
        date1: ''
      };
    }

    // try between
    var info = dateString.match(/^\[date and time\("(\d{4}(?:-\d\d){2}T(?:\d\d:){2}\d\d)"\)..date and time\("(\d{4}(?:-\d\d){2}T(?:\d\d:){2}\d\d)"/);
    if (info) {
      return {
        type: 'between',
        date1: info[1],
        date2: info[2]
      };
    }

    // try before and after
    info = dateString.match(/^(<|>)\s*date and time\("(\d{4}(?:-\d\d){2}T(?:\d\d:){2}\d\d)"\)/);
    if (info) {
      return {
        type: info[1] === '<' ? 'before' : 'after',
        date1: info[2]
      };
    }

    // try exact date
    info = dateString.match(/^date and time\("(\d{4}(?:-\d\d){2}T(?:\d\d:){2}\d\d)"\)$/);
    if (info) {
      return {
        type: 'exact',
        date1: info[1]
      };
    }
  }
};

},{}],28:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'dateView' ],
  __depends__: [],
  dateView: [ 'type', _dereq_(26) ]
};


},{"26":26}],29:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264);

var inherits = _dereq_(126);

var BaseModule = _dereq_(303);

/**
 * View and edit decision properties.
 * Extends TableName by adding a table ID.
 *
 * @param {EventBus} eventBus
 */
function DecisionProperties(eventBus, sheet, tableName) {

  BaseModule.call(this, eventBus, sheet, tableName);

  this.node = domify(
    '<header><h3>' +
    this.tableName +
    '</h3><div class="tjs-table-id mappings"></div></header'
  );

  var self = this;

  eventBus.on('tableName.allowEdit', function(event) {
    if (event.editAllowed) {
      self.node.querySelector('.tjs-table-id').setAttribute('contenteditable', true);

      self.node.querySelector('.tjs-table-id').addEventListener('blur', function(evt) {
        var newId = evt.target.textContent;
        if (newId !== self.getId()) {
          eventBus.fire('tableName.editId', {
            newId: newId
          });
        }
      }, true);
    }
  });

  this.semantic = null;
}

inherits(DecisionProperties, BaseModule);

DecisionProperties.$inject = [ 'eventBus', 'sheet', 'config.tableName' ];

module.exports = DecisionProperties;

DecisionProperties.prototype.setSemantic = function(semantic) {
  this.semantic = semantic;
  this.setName(semantic.name);
  this.setId(semantic.id);
};

DecisionProperties.prototype.setName = function(newName) {
  this.semantic.name = newName;
  this.node.querySelector('h3').textContent = newName || '';
};

DecisionProperties.prototype.getName = function() {
  return this.semantic.name;
};

DecisionProperties.prototype.setId = function(newId) {
  if (newId) {
    this.semantic.id = newId;
  }
  
  this.node.querySelector('div').textContent = this.semantic.id || '';
};

DecisionProperties.prototype.getId = function() {
  return this.semantic.id;
};

},{"126":126,"264":264,"303":303}],30:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'tableName' ],
  tableName: [ 'type', _dereq_(29) ]
};

},{"29":29}],31:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264);

var hasSecondaryModifier = _dereq_(109).hasSecondaryModifier;

var OFFSET_X = 2,
    OFFSET_Y = 2;


function Descriptions(eventBus, elementRegistry, sheet) {
  this._eventBus = eventBus;
  this._elementRegistry = elementRegistry;
  this._sheet = sheet;

  var self = this;

  document.body.addEventListener('click', function(evt) {
    self.closePopover();
  });

  document.body.addEventListener('keydown', function(evt) {
    if (evt.keyCode === 13 && self.openedPopover && !hasSecondaryModifier(evt)) {
      self.closePopover();
    }
  });

  eventBus.on('cell.render', function(event) {
    var data = event.data,
        gfx = event.gfx,
        indicator;

    if (data.content && data.content.description) {
      if (!gfx.querySelector('.description-indicator')) {
        indicator = domify('<div class="description-indicator"></div>');

        indicator.addEventListener('click', function(evt) {
          evt.stopPropagation();

          self.openPopover(data);
        });

        gfx.appendChild(indicator);
      }
    } else {
      indicator = gfx.querySelector('.description-indicator');
      if (indicator) {
        indicator.parentNode.removeChild(indicator);
      }
    }
  });
}

Descriptions.$inject = [ 'eventBus', 'elementRegistry', 'sheet' ];

module.exports = Descriptions;

Descriptions.prototype.closePopover = function() {
  var eventBus = this._eventBus;

  if (this.openedPopover) {
    this.openedPopover.parentNode.removeChild(this.openedPopover);
    this.openedPopover = null;

    eventBus.fire('description.popover.closed');
  }
};

Descriptions.prototype.openPopover = function(context) {
  var sheet = this._sheet,
      eventBus = this._eventBus,
      elementRegistry = this._elementRegistry;

  var container = sheet.getContainer(),
      gfx = elementRegistry.getGraphics(context),
      node = domify('<textarea class="descriptions-textarea"></textarea>');

  this.closePopover();

  eventBus.fire('description.popover.open', context);

  node.style.position = 'absolute';
  node.style.top = gfx.offsetTop + OFFSET_Y + 'px';
  node.style.left = gfx.offsetLeft + gfx.clientWidth + OFFSET_X + 'px';
  node.style.width = '200px';
  node.style.height = '80px';

  // setting textarea to disabled. Editing module will remove disabled attribute
  node.setAttribute('disabled', 'disabled');

  node.addEventListener('click', function(evt) {
    evt.stopPropagation();
  });

  container.appendChild(node);

  this.openedPopover = node;

  eventBus.fire('description.popover.opened', node, context);

  node.focus();

  node.textContent = context.content.description;
};

},{"109":109,"264":264}],32:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'descriptions' ],
  descriptions: [ 'type', _dereq_(31) ]
};

},{"31":31}],33:[function(_dereq_,module,exports){
'use strict';

var inherits = _dereq_(126);

var BaseElementFactory = _dereq_(286);


/**
 * A dmn-aware factory for table-js elements
 */
function ElementFactory(moddle, tableFactory) {
  BaseElementFactory.call(this);

  this._moddle = moddle;
  this._tableFactory = tableFactory;
}

inherits(ElementFactory, BaseElementFactory);


ElementFactory.$inject = [ 'moddle', 'tableFactory' ];

module.exports = ElementFactory;

ElementFactory.prototype.baseCreate = BaseElementFactory.prototype.create;

ElementFactory.prototype.create = function(elementType, attrs) {
  var tableFactory = this._tableFactory;

  attrs = attrs || {};

  var businessObject = attrs.businessObject;
  if (elementType === 'row') {
    attrs.type = 'dmn:DecisionRule';
  } else if (elementType === 'column' && !attrs.type) {
    attrs.type = attrs.isInput ? 'dmn:InputClause' : 'dmn:OutputClause';
  }

  if (!businessObject) {
    if (!attrs.type) {
      throw new Error('no type specified');
    }
    else if (attrs.type === 'dmn:DecisionRule') {
      businessObject = tableFactory.createRule(attrs.id);
    } else if (elementType === 'column') {
      if (attrs.isInput) {
        businessObject = tableFactory.createInputClause(attrs.name);
      } else {
        businessObject = tableFactory.createOutputClause(attrs.name);
      }
    } else {
      businessObject = tableFactory.create(attrs.type);
    }
  }

  attrs.businessObject = businessObject;
  attrs.id = businessObject.id;

  return this.baseCreate(elementType, attrs);

};

},{"126":126,"286":286}],34:[function(_dereq_,module,exports){
'use strict';

function TableFactory(moddle) {
  this._model = moddle;
}

TableFactory.$inject = [ 'moddle' ];


TableFactory.prototype._needsId = function(element) {
  return element.$instanceOf('dmn:DMNElement');
};

TableFactory.prototype._ensureId = function(element) {

  // generate semantic ids for elements
  // bpmn:SequenceFlow -> SequenceFlow_ID
  var prefix = (element.$type || '').replace(/^[^:]*:/g, '') + '_';

  if (!element.id && this._needsId(element)) {
    element.id = this._model.ids.nextPrefixed(prefix, element);
  }
};


TableFactory.prototype.create = function(type, attrs) {
  var element = this._model.create(type, attrs || {});

  this._ensureId(element);

  return element;
};

TableFactory.prototype.createRule = function(id) {
  var attrs = { id: id };
  attrs.inputEntry = attrs.inputEntry || [];
  attrs.outputEntry = attrs.outputEntry || [];

  var element = this.create('dmn:DecisionRule', attrs);

  return element;
};

TableFactory.prototype.createInputEntry = function(text, clause, rule) {
  var element = this.create('dmn:UnaryTests', {
    text: text
  });

  var clauseIdx = clause.$parent.input.indexOf(clause);

  element.$parent = rule;

  if (!rule.inputEntry) {
    rule.inputEntry = [];
  }

  rule.inputEntry.splice(clauseIdx, 0, element);

  return element;
};

TableFactory.prototype.createInputClause = function(name) {
  var element = this.create('dmn:InputClause', {
    label: name
  });

  element.inputExpression = this.create('dmn:LiteralExpression', {});

  element.inputExpression.typeRef = 'string';

  element.inputExpression.$parent = element;

  return element;
};

TableFactory.prototype.createOutputClause = function(name) {
  var element = this.create('dmn:OutputClause', {
    label: name
  });

  element.typeRef = 'string';

  return element;
};

TableFactory.prototype.createOutputEntry = function(text, clause, rule) {
  var element = this.create('dmn:LiteralExpression', {
    text: text
  });

  var clauseIdx = clause.$parent.output.indexOf(clause);

  element.$parent = rule;

  if (!rule.outputEntry) {
    rule.outputEntry = [];
  }

  rule.outputEntry.splice(clauseIdx, 0, element);

  return element;
};

TableFactory.prototype.createInputValues = function(input) {
  var element = this.create('dmn:UnaryTests', {
    text: ''
  });

  input.inputValues = element;
  element.$parent = input;

  return element;
};

TableFactory.prototype.createOutputValues = function(output) {
  var element = this.create('dmn:UnaryTests', {
    text: ''
  });

  output.outputValues = element;
  element.$parent = output;

  return element;
};

module.exports = TableFactory;

},{}],35:[function(_dereq_,module,exports){
module.exports = {
  tableFactory: [ 'type', _dereq_(34) ],
  elementFactory: [ 'type', _dereq_(33) ]
};

},{"33":33,"34":34}],36:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264),
    domClasses = _dereq_(261);

var ComboBox = _dereq_(294);

var OFFSET_X = 36,
    OFFSET_Y = -16;

/**
 * Adds behavior to display and set the hit policy of a table
 *
 * @param {EventBus} eventBus
 */
function HitPolicy(eventBus, utilityColumn, ioLabel, graphicsFactory, elementRegistry, rules, translate) {

  this.table = null;
  this.hitPolicyCell = null;

  var self = this;
  eventBus.on('dmnElement.added', function(event) {
    if (event.element && event.element.businessObject.$instanceOf('dmn:DecisionTable')) {
      self.table = event.element.businessObject;
    }
  });

  eventBus.on('cell.added', function(event) {

    if (event.element.column === utilityColumn.getColumn() &&
       event.element.row.id==='ioLabel') {
      self.hitPolicyCell = event.element;

      self.hitPolicyCell.rowspan = 4;

      var template = domify('<div>');

        // initializing the comboBox
      var comboBox = new ComboBox({
        label: translate('Hit Policy'),
        classNames: ['dmn-combobox', 'hitpolicy'],
        options: ['UNIQUE', 'FIRST', 'PRIORITY', 'ANY', 'COLLECT', 'RULE ORDER', 'OUTPUT ORDER'],
        dropdownClassNames: ['dmn-combobox-suggestions']
      });

      template.insertBefore(
          comboBox.getNode(),
          template.firstChild
        );

      var operatorComboBox = new ComboBox({
        label: translate('Collect Operator'),
        classNames: ['dmn-combobox', 'operator'],
        options: ['LIST', 'SUM', 'MIN', 'MAX', 'COUNT'],
        dropdownClassNames: ['dmn-combobox-suggestions']
      });

      template.appendChild(operatorComboBox.getNode());

        // display and hide the operatorComboBox based on the selected hit policy
      comboBox.addEventListener('valueChanged', function(evt) {
        if (evt.newValue.toLowerCase() === 'collect') {
          operatorComboBox.getNode().style.display = 'table';
        } else {
          operatorComboBox.getNode().style.display = 'none';
        }
      });

      event.element.complex = {
        className: 'dmn-hitpolicy-setter',
        template: template,
        element: event.element,
        comboBox: comboBox,
        operatorComboBox: operatorComboBox,
        type: 'hitPolicy',
        offset: {
          x: OFFSET_X,
          y: OFFSET_Y
        }
      };
    }

  });

  // whenever an type cell is opened, we have to position the template, apply the model value and
  // potentially disable inputs
  eventBus.on('complexCell.open', function(evt) {
    var config = evt.config;

    if (config.type === 'hitPolicy') {

      // feed the values to the template and combobox
      config.comboBox.setValue(self.getHitPolicy());
      config.operatorComboBox.setValue(self.getAggregation());

      var template = config.template;

      // focus the combobox input field
      template.querySelector('.dmn-combobox > input').focus();

      // disable all input fields if editing is not allowed
      if (!rules.allowed('hitPolicy.edit')) {
        var inputs = template.querySelectorAll('input');
        for (var i = 0; i < inputs.length; i++) {
          inputs[i].setAttribute('disabled', 'true');
        }
        config.comboBox.disable();

        // also set a disabled css class on the template
        domClasses(template.parentNode).add('read-only');
      }
    }
  }, this);


  // whenever a datatype cell is closed, apply the changes to the underlying model
  eventBus.on('complexCell.close', function(evt) {
    if (evt.config.type === 'hitPolicy') {
      eventBus.fire('hitPolicy.edit', {
        table: self.table,
        hitPolicy: evt.config.comboBox.getValue(),
        aggregation: evt.config.comboBox.getValue() === 'COLLECT' ? evt.config.operatorComboBox.getValue() : undefined,
        cell: self.getCell()
      });

      graphicsFactory.update('cell', self.getCell(), elementRegistry.getGraphics(self.getCell()));
    }
  });

}

HitPolicy.$inject = [
  'eventBus', 'utilityColumn', 'ioLabel',
  'graphicsFactory', 'elementRegistry', 'rules', 'translate'
];

HitPolicy.prototype.getCell = function() {
  return this.hitPolicyCell;
};

HitPolicy.prototype.getHitPolicy = function() {
  return (this.table && this.table.hitPolicy) || '';
};

HitPolicy.prototype.getAggregation = function() {
  return (this.table && this.table.aggregation) || 'LIST';
};

module.exports = HitPolicy;

},{"261":261,"264":264,"294":294}],37:[function(_dereq_,module,exports){
'use strict';

function convertOperators(operator) {
  switch (operator) {
  case 'LIST': return '';
  case 'SUM': return '+';
  case 'MIN': return '<';
  case 'MAX': return '>';
  case 'COUNT': return '#';
  }
}

function HitPolicyRenderer(
    eventBus,
    hitPolicy) {

  eventBus.on('cell.render', function(event) {
    if (event.data === hitPolicy.getCell()) {
      var policy = hitPolicy.getHitPolicy(),
          aggregation = hitPolicy.getAggregation();

      event.gfx.childNodes[0].textContent = policy.charAt(0) + convertOperators(aggregation);
    }
  });

}

HitPolicyRenderer.$inject = [
  'eventBus',
  'hitPolicy'
];

module.exports = HitPolicyRenderer;

},{}],38:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'hitPolicy', 'hitPolicyRenderer' ],
  __depends__: [
    _dereq_(101),
    _dereq_(307),
    _dereq_(42)
  ],
  hitPolicy: [ 'type', _dereq_(36) ],
  hitPolicyRenderer: [ 'type', _dereq_(37) ]
};

},{"101":101,"307":307,"36":36,"37":37,"42":42}],39:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264),
    forEach = _dereq_(136);

// document wide unique overlay ids
var ids = new (_dereq_(108))('clause');

/**
 * Adds a control to the table to add more columns
 *
 * @param {EventBus} eventBus
 */
function IoLabel(eventBus, sheet, elementRegistry, graphicsFactory, rules, translate) {

  this.row = null;

  var self = this;

  eventBus.on([ 'sheet.init', 'sheet.cleared' ], function(event) {

    eventBus.fire('ioLabel.add', event);

    this.row = sheet.addRow({
      id: 'ioLabel',
      isHead: true,
      isLabelRow: true,
      useTH: true
    });

    eventBus.fire('ioLabel.added', this.row);
  }, this);

  eventBus.on([ 'sheet.destroy', 'sheet.clear' ], function(event) {

    eventBus.fire('ioLabel.destroy', this.row);

    sheet.removeRow({
      id: 'ioLabel'
    });

    eventBus.fire('ioLabel.destroyed', this.row);

    this.row = null;
  }, this);

  function updateColspans(evt) {
    var cells = elementRegistry.filter(function(element) {
      return element._type === 'cell' && element.row === self.row;
    });

    var inputs = cells.filter(function(cell) {
      return cell.column.businessObject && cell.column.businessObject.inputExpression;
    });

    forEach(inputs, function(input) {
      if (!input.column.previous.businessObject) {
        // first cell of the inputs array has the colspan attribute set
        input.colspan = inputs.length;

        var node;
        if (rules.allowed('column.create')) {
          node = domify(translate('Input')+' <a class="dmn-icon-plus"></a>');
          node.querySelector('a').addEventListener('mouseup', function() {
            var col = input.column;
            while (col.next && col.next.businessObject.$type === 'dmn:InputClause') {
              col = col.next;
            }

            var newColumn = {
              id: ids.next(),
              previous: col,
              name: '',
              isInput: true
            };

            eventBus.fire('ioLabel.createColumn', {
              newColumn: newColumn
            });
          });
        } else {
          node = domify(translate('Input'));
        }

        input.content = node;
      } else {
        input.colspan = 1;
      }
    });

    var outputs = cells.filter(function(cell) {
      return cell.column.businessObject && cell.column.businessObject.$instanceOf('dmn:OutputClause');
    });

    forEach(outputs, function(output) {
      if (output.column.previous.businessObject.inputExpression) {
        // first cell of the outputs array has the colspan attribute set
        output.colspan = outputs.length;

        var node;
        if (rules.allowed('column.create')) {
          node = domify(translate('Output')+' <a class="dmn-icon-plus"></a>');
          node.querySelector('a').addEventListener('mouseup', function() {
            var col = output.column;
            while (col.next && col.next.businessObject && col.next.businessObject.$type === 'dmn:OutputClause') {
              col = col.next;
            }

            var newColumn = {
              id: ids.next(),
              previous: col,
              name: '',
              isInput: false
            };

            eventBus.fire('ioLabel.createColumn', {
              newColumn: newColumn
            });
          });
        } else {
          node = domify(translate('Output'));
        }

        output.content = node;
      } else {
        output.colspan = 1;
      }
    });

    if (cells.length > 0) {
      graphicsFactory.update('row', cells[0].row, elementRegistry.getGraphics(cells[0].row.id));
    }
  }
  eventBus.on([ 'cells.added', 'cells.removed' ], function(evt) {
    if (evt._type === 'column') {
      updateColspans();
    }
  });

  eventBus.on([ 'column.move.applied' ], updateColspans);
}

IoLabel.$inject = [ 'eventBus', 'sheet', 'elementRegistry', 'graphicsFactory', 'rules', 'translate' ];

module.exports = IoLabel;

IoLabel.prototype.getRow = function() {
  return this.row;
};

},{"108":108,"136":136,"264":264}],40:[function(_dereq_,module,exports){
'use strict';

function IoLabelRenderer(
    eventBus,
    ioLabel) {

  eventBus.on('cell.render', function(event) {
    if (event.data.row === ioLabel.getRow() &&
        event.data.content &&
        !event.gfx.childNodes[0].firstChild) {
      event.gfx.childNodes[0].appendChild(event.data.content);
    }
  });

}

IoLabelRenderer.$inject = [
  'eventBus',
  'ioLabel'
];

module.exports = IoLabelRenderer;

},{}],41:[function(_dereq_,module,exports){
'use strict';

var inherits = _dereq_(126);

var RuleProvider = _dereq_(94);

/**
 * LineNumber specific modeling rule
 */
function IoLabelRules(eventBus, ioLabel) {
  RuleProvider.call(this, eventBus);

  this._ioLabel = ioLabel;
}

inherits(IoLabelRules, RuleProvider);

IoLabelRules.$inject = [ 'eventBus', 'ioLabel' ];

module.exports = IoLabelRules;

IoLabelRules.prototype.init = function() {
  var self = this;
  this.addRule('cell.edit', function(context) {
    if (context.row === self._ioLabel.row) {
      return false;
    }
  });

};

},{"126":126,"94":94}],42:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'ioLabel', 'ioLabelRules', 'ioLabelRenderer' ],
  __depends__: [
    _dereq_(101)
  ],
  ioLabel: [ 'type', _dereq_(39) ],
  ioLabelRules: [ 'type', _dereq_(41) ],
  ioLabelRenderer: [ 'type', _dereq_(40) ]
};

},{"101":101,"39":39,"40":40,"41":41}],43:[function(_dereq_,module,exports){
module.exports = "<div class=\"literal-expression-editor\">\n  <textarea placeholder=\"return obj.propertyName;\"></textarea>\n\n  <div>\n    <div class=\"literal-expression-field\">\n      <div class=\"dmn-combobox\">\n        <label>Variable Name:</label>\n        <input class=\"variable-name\" placeholder=\"varName\">\n      </div>\n    </div>\n    <div class=\"literal-expression-field variable-type\">\n    </div>\n  </div>\n  <div>\n    <div class=\"literal-expression-field expression-language\">\n    </div>\n  </div>\n</div>\n";

},{}],44:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264);
var template = _dereq_(43);

var ComboBox = _dereq_(294);

function LiteralExpressionEditor(eventBus, sheet, rules) {
  this._eventBus = eventBus;
  this._sheet = sheet;
  this._rules = rules;

  eventBus.on('import.render.start', function() {
    // show table by default
    var container = sheet.getContainer();
    container.querySelector('table').style.display = '';

    // remove literal expression editor if exists
    var literalExpressionEditor = container.querySelector('.literal-expression-editor');
    if (literalExpressionEditor) {
      container.removeChild(literalExpressionEditor);
    }
  });

}

LiteralExpressionEditor.$inject = [ 'eventBus', 'sheet', 'rules' ];

module.exports = LiteralExpressionEditor;

LiteralExpressionEditor.prototype.show = function(decision) {

  var eventBus = this._eventBus;

  // get hide the table
  var container = this._sheet.getContainer();
  container.querySelector('table').style.display = 'none';

  // create the custom editor
  var editor = domify(template);

  // set the literal expression to the textarea
  editor.querySelector('textarea').value = decision.literalExpression.text || '';

  // add variable with name and type information
  var typeBox = new ComboBox({
    label: 'Variable Type',
    classNames: [ 'dmn-combobox', 'datatype' ],
    options: [ 'string', 'boolean', 'integer', 'long', 'double', 'date' ],
    dropdownClassNames: [ 'dmn-combobox-suggestions' ]
  });
  editor.querySelector('.variable-type').appendChild(typeBox.getNode());

  if (decision.variable) {
    editor.querySelector('.variable-name').value = decision.variable.name || '';
    typeBox.setValue(decision.variable.typeRef || '');
  }

  //add expression language combobox
  var languageBox = new ComboBox({
    label: 'Expression Language',
    classNames: [ 'dmn-combobox', 'expression-language' ],
    options: [ 'javascript', 'groovy', 'python', 'jruby', 'juel', 'feel' ],
    dropdownClassNames: [ 'dmn-combobox-suggestions' ]
  });
  editor.querySelector('.expression-language').appendChild(languageBox.getNode());
  languageBox.setValue(decision.literalExpression.expressionLanguage || '');


  var saveExpression = function(evt) {
    eventBus.fire('literalExpression.edit', {
      decision: decision,
      text: editor.querySelector('textarea').value,
      variableName: editor.querySelector('.variable-name').value,
      variableType: typeBox.getValue(),
      language: languageBox.getValue()
    });
  };


  // if editing is not allowed, disable all input fields, otherwise, listen for changes
  var canEdit = this._rules.allowed('literalExpression.edit');

  var inputs = editor.querySelectorAll('input');
  for (var i = 0; i < inputs.length; i++) {
    if (canEdit) {
      inputs[i].addEventListener('input', saveExpression);
    } else {
      inputs[i].setAttribute('disabled', 'true');
    }
  }

  if (canEdit) {
    editor.querySelector('textarea').addEventListener('input', saveExpression);
    typeBox.addEventListener('valueChanged', saveExpression);
    languageBox.addEventListener('valueChanged', saveExpression);
  } else {
    editor.querySelector('textarea').setAttribute('disabled', 'true');
    typeBox.disable();
    languageBox.disable();
  }

  container.appendChild(editor);

};

},{"264":264,"294":294,"43":43}],45:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'literalExpressionEditor' ],
  literalExpressionEditor: [ 'type', _dereq_(44) ]
};

},{"44":44}],46:[function(_dereq_,module,exports){
module.exports = "<div>\n  <div class=\"links\">\n    <div class=\"toggle-type\">\n      <label>{{ 'Use:' | translate }}</label>\n      <a class=\"expression\">{{ 'Expression' | translate }}</a>\n      /\n      <a class=\"script\">{{ 'Script' | translate }}</a>\n    </div>\n    <a class=\"dmn-icon-clear\"></a>\n  </div>\n  <div class=\"expression region\">\n    <div class=\"input-expression\">\n       <label>{{ 'Expression:' | translate }}</label>\n      <input placeholder=\"propertyName\">\n    </div>\n    <div class=\"input-expression\">\n      <label>{{ 'Input Variable Name:' | translate }}</label>\n      <input placeholder=\"cellInput\">\n    </div>\n  </div>\n  <div class=\"script region\">\n    <textarea placeholder=\"return obj.propertyName;\"></textarea>\n    <div class=\"input-expression\">\n      <label>{{ 'Input Variable Name:' | translate }}</label>\n      <input placeholder=\"cellInput\">\n    </div>\n  </div>\n</div>\n";

},{}],47:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264),
    domClasses = _dereq_(261),
    assign = _dereq_(250),
    forEach = _dereq_(136);

var mappingTypeTemplate = _dereq_(46);

var ComboBox = _dereq_(294);

var PROP_NAME = '.expression .input-expression input[placeholder="propertyName"]',
    EXPR_IPT_VAR = '.expression .input-expression input[placeholder="cellInput"]',
    SCRPT_IPT_VAR = '.script .input-expression input[placeholder="cellInput"]',
    SCRPT_TEXT = '.script.region > textarea',
    IPT_VARS = [ EXPR_IPT_VAR, SCRPT_IPT_VAR ];

var OFFSET_X = 1, //20
    OFFSET_Y = -2; //194


function forEachSelector(node, arr, fn) {
  forEach(arr, function(elem) {
    fn(node.querySelector(elem));
  });
}


/**
 * Adds a control to the table to define the input- and output-mappings for clauses
 */
function MappingsRow(
  eventBus, sheet, elementRegistry,
  graphicsFactory, complexCell,
  translate, parseTemplate, config) {

  this.row = null;

  // add row when the sheet is initialized
  eventBus.on([ 'sheet.init', 'sheet.cleared' ], function(event) {

    if (this.row) {
      return;
    }

    eventBus.fire('mappingsRow.add', event);

    this.row = sheet.addRow({
      id: 'mappingsRow',
      isHead: true,
      isMappingsRow: true
    });

    eventBus.fire('mappingsRow.added', this.row);

    graphicsFactory.update('row', this.row, elementRegistry.getGraphics(this.row.id));
  }, this);

  // remove the row when the sheet is destroyed
  eventBus.on([ 'sheet.clear', 'sheet.destroy' ], function(event) {

    eventBus.fire('mappingsRow.destroy', this.row);

    sheet.removeRow({
      id: 'mappingsRow'
    });

    eventBus.fire('mappingsRow.destroyed', this.row);

    this.row = null;
  }, this);

  /**
   * Helper function to position and resize the template. This is needed for the switch between
   * the large format script editor and the small expression editor
   *
   * @param {DOMNode}   node        template root node
   * @param {TableCell} element     cell for which the template is opened
   * @param {boolean}   large       indicating whether to switch to large mode
   */
  var positionTemplate = function(node, element, large) {
    var table = sheet.getRootElement(),
        gfx = elementRegistry.getGraphics(element),
        tableDimensions, gfxDimensions;

    if (large) {
      tableDimensions = table.getBoundingClientRect();

      assign(node.style, {
        top: tableDimensions.top + 'px',
        left: tableDimensions.left + 'px',
        width: table.clientWidth + 'px'
      });

    } else {
      gfxDimensions = gfx.getBoundingClientRect();

      assign(node.style, {
        top: (gfxDimensions.top - node.offsetHeight + OFFSET_Y)  + 'px',
        left: (gfxDimensions.left + OFFSET_X) + 'px',
        width: 'auto',
        height: 'auto'
      });
    }
  };

  // when an input cell on the mappings row is added, setup the complex cell
  eventBus.on('cell.added', function(evt) {
    var element = evt.element,
        column = element.column,
        content = element.content,
        propertyName, parent, inputVariable;

    if (element.row.id === 'mappingsRow' &&
       column.businessObject &&
       column.businessObject.inputExpression) {

      // cell content is the input expression of the clause
      content = element.content = column.businessObject.inputExpression;

      var template = domify(parseTemplate(mappingTypeTemplate));

      // initializing the comboBox
      var comboBox = new ComboBox({
        label: translate('Language'),
        classNames: [ 'dmn-combobox', 'language' ],
        options: [ 'javascript', 'groovy', 'python', 'jruby', 'juel', 'feel' ],
        dropdownClassNames: [ 'dmn-combobox-suggestions' ]
      });

      // When the inputExpression has a defined expressionLanguage, we assume that it is a script
      if (typeof content.expressionLanguage !== 'undefined') {
        template.querySelector(SCRPT_TEXT).value = content.text || '';
        comboBox.setValue(content.expressionLanguage);

      } else {
        propertyName = template.querySelector(PROP_NAME);

        propertyName.value = content.text || '';
      }

      parent = content.$parent;

      if (parent) {
        forEachSelector(template, IPT_VARS, function(elem) {
          elem.value = parent.inputVariable || '';
        });
      }

      // --- setup event listeners ---

      // click on close button closes the template
      template.querySelector('.dmn-icon-clear').addEventListener('click', function() {
        complexCell.close();
      });

      // click on Expression link switches to expression mode
      template.querySelector('.expression').addEventListener('click', function() {
        inputVariable = template.querySelector(SCRPT_IPT_VAR).value;

        domClasses(template.parentNode).remove('use-script');
        positionTemplate(template.parentNode, evt.element, false);

        // focus the script expression input field
        template.querySelector(PROP_NAME).focus();

        // synchronize inputVariable
        template.querySelector(EXPR_IPT_VAR).value = inputVariable;

        evt.element.complex.mappingType = 'expression';
      });

      // click on Script link switches to script mode
      template.querySelector('.script').addEventListener('click', function() {
        inputVariable = template.querySelector(EXPR_IPT_VAR).value;

        domClasses(template.parentNode).add('use-script');
        positionTemplate(template.parentNode, evt.element, true);

        // focus the script area
        template.querySelector(SCRPT_TEXT).focus();

        // synchronize inputVariable
        template.querySelector(SCRPT_IPT_VAR).value = inputVariable;

        evt.element.complex.mappingType = 'script';
      });

      // pressing enter in the input field closes the dialog
      forEachSelector(template, IPT_VARS.concat(PROP_NAME), function(elem) {
        elem.addEventListener('keydown', function(evt) {
          if (evt.keyCode === 13) {
            complexCell.close();
          }
        });
      });

      // add comboBox to the template
      template.querySelector('.script.region').insertBefore(
        comboBox.getNode(),
        template.querySelector('textarea')
      );

      // set the complex property to initialize complex-cell behavior
      evt.element.complex = {
        className: 'dmn-clauseexpression-setter',
        template: template,
        element: evt.element,
        mappingType: typeof content.expressionLanguage !== 'undefined' ? 'script' : 'expression',
        comboBox: comboBox,
        type: 'mapping'
      };

      graphicsFactory.update('cell', evt.element, elementRegistry.getGraphics(evt.element));

    } else if (evt.element.row.id === 'mappingsRow' && column.businessObject) {

      // setup output mappings as simple cells with inline editing
      evt.element.content = column.businessObject;
      graphicsFactory.update('cell', evt.element, elementRegistry.getGraphics(evt.element));
    }

  });

  // whenever an input mapping cell is opened, set the required mode (script vs. Expression)
  // and position the template accordingly
  eventBus.on('complexCell.open', function(evt) {
    var cfg = evt.config,
        container = evt.container,
        content = cfg.element.content,
        template, parent;

    if (cfg.type === 'mapping') {
      template = cfg.template;

      if (typeof content.expressionLanguage !== 'undefined') {
        cfg.mappingType = 'script';

        domClasses(container).add('use-script');
        positionTemplate(container, cfg.element, true);

        container.querySelector(SCRPT_TEXT).focus();

      } else {
        cfg.mappingType = 'expression';

        positionTemplate(container, cfg.element);

        container.querySelector(PROP_NAME).focus();
      }

      parent = content.$parent;

      if (parent) {
        forEachSelector(template, IPT_VARS, function(elem) {
          elem.value = parent.inputVariable || '';
        });
      }

      // disable input fields if inputMapping editing is not allowed
      if (!config.editingAllowed) {
        template.querySelector(PROP_NAME).setAttribute('disabled', 'true');

        forEachSelector(template, IPT_VARS, function(elem) {
          elem.setAttribute('disabled', 'true');
        });

        template.querySelector(SCRPT_TEXT).setAttribute('disabled', 'true');

        cfg.comboBox.disable();

        // also set a disabled css class on the template
        domClasses(template.parentNode).add('read-only');
      }
    }
  });

  // whenever an input mapping cell is closed, apply the changes to the underlying model
  eventBus.on('complexCell.close', function(evt) {
    var cfg = evt.config,
        template, element, expression, language, inputVariable;

    if (cfg.type === 'mapping') {
      template = cfg.template;
      element = cfg.element;

      if (cfg.mappingType === 'expression') {
        expression = template.querySelector(PROP_NAME).value;

        inputVariable = template.querySelector(EXPR_IPT_VAR).value;

      } else if (cfg.mappingType === 'script') {
        language = cfg.comboBox.getValue();

        inputVariable = template.querySelector(SCRPT_IPT_VAR).value;

        expression = template.querySelector(SCRPT_TEXT).value;
      }

      eventBus.fire('mappingsRow.editInputMapping', {
        element: element,
        attrs: {
          expression: expression,
          language: language,
          inputVariable: inputVariable
        }
      });
    }
  });
}

MappingsRow.$inject = [
  'eventBus',
  'sheet',
  'elementRegistry',
  'graphicsFactory',
  'complexCell',
  'translate',
  'parseTemplate',
  'config'
];

module.exports = MappingsRow;

MappingsRow.prototype.getRow = function() {
  return this.row;
};

},{"136":136,"250":250,"261":261,"264":264,"294":294,"46":46}],48:[function(_dereq_,module,exports){
'use strict';

var domClasses = _dereq_(261);

function MappingsRowRenderer(
    eventBus,
    mappingsRow) {

  // row has class 'mappings'
  eventBus.on('row.render', function(event) {
    if (event.data === mappingsRow.getRow()) {
      domClasses(event.gfx).add('mappings');
    }
  });

  eventBus.on('cell.render', function(event) {
    // input cell contains the expression or the expression language for scripts
    if (event.data.row === mappingsRow.getRow() && event.data.content &&
        event.data.column.businessObject.inputExpression) {
      if (event.data.content.expressionLanguage) {
        event.gfx.childNodes[0].textContent = event.data.content.expressionLanguage || '';
      } else {
        event.gfx.childNodes[0].textContent = event.data.content.text || '';
      }
    // output cell contains variable name
    } else if (event.data.row === mappingsRow.getRow() && event.data.content) {
      event.gfx.childNodes[0].textContent = event.data.content.name || '';
    }
  });

}

MappingsRowRenderer.$inject = [
  'eventBus',
  'mappingsRow'
];

module.exports = MappingsRowRenderer;

},{"261":261}],49:[function(_dereq_,module,exports){
module.exports = {
  __depends__: [
    _dereq_(101),
    _dereq_(14),
    _dereq_(296)
  ],
  __init__: [ 'mappingsRow', 'mappingsRowRenderer' ],
  mappingsRow: [ 'type', _dereq_(47) ],
  mappingsRowRenderer: [ 'type', _dereq_(48) ]
};

},{"101":101,"14":14,"296":296,"47":47,"48":48}],50:[function(_dereq_,module,exports){
'use strict';

var domClasses = _dereq_(261),
    domify = _dereq_(264);

function isType(bo, type) {
  return bo.inputExpression &&
         bo.inputExpression.typeRef === type ||
         bo.typeRef === type;
}

function SimpleMode(eventBus, sheet, config, graphicsFactory, translate) {

  this._sheet = sheet;
  this._eventBus = eventBus;
  this._graphicsFactory = graphicsFactory;
  this._translate = translate;

  this.simple = false;

  var self = this;

  eventBus.on('controls.init', function(event) {
    this._node = this.addControlButton(event);
  }, this);

  eventBus.on('import.done', function(event) {
    if (event.error) {
      return;
    }

    if (!config.advancedMode) {
      this.activate(true);
    }
  }, this);

  eventBus.on('cell.render', function(event) {
    var data = event.data,
        gfx = event.gfx,
        row = data.row,
        businessObject = data.column.businessObject;

    var checkbox = gfx.querySelector('.simple-mode-checkbox'),
        expressionHint = gfx.querySelector('.expression-hint'),
        hint,
        content,
        newCheckbox;

    data.preventAutoUpdate = false;

    if (expressionHint) {
      gfx.childNodes[0].style.display = '';
      expressionHint.parentNode.removeChild(expressionHint);
    }

    if (!this.simple && checkbox) {
      gfx.childNodes[0].style.display = '';
      checkbox.parentNode.removeChild(checkbox);
      data.preventAutoUpdate = false;
    }

    if (!businessObject || !this.simple) {
      return;
    }

    if (row.type === 'dmn:DecisionRule' && !row.isHead && businessObject) {
      if (isType(businessObject, 'boolean')) {

        if (this.simple) {
          data.preventAutoUpdate = true;
        }

        content = data.content;

        if (this.simple && content && content.text !== '' && content.text !== 'false' && content.text !== 'true') {
          // in case of a non boolean expression, hint that it cannot be edited
          gfx.childNodes[0].style.display = 'none';

          hint = self.getExpressionNode(data.content);
          data.preventAutoUpdate = true;

          gfx.appendChild(hint);

        } else if (this.simple && !checkbox) {
          // create a dropdown for the booleans
          gfx.childNodes[0].style.display = 'none';
          newCheckbox = domify([
            '<select class="simple-mode-checkbox">',
            '<option value="true">' + translate('Yes') + '</option>',
            '<option value="false">' + translate('No') + '</option>',
            '<option value="">-</option>',
            '</select>'
          ].join(''));

          // we set it readonly. An optional modeling module can make it editable
          newCheckbox.setAttribute('disabled', 'disabled');

          if (content && content.text) {
            newCheckbox.selectedIndex = ['true', 'false', ''].indexOf(content.text);
          } else {
            newCheckbox.selectedIndex = 2;
          }

          eventBus.fire('simpleCheckbox.render', newCheckbox, data);

          gfx.appendChild(newCheckbox);

        } else if (this.simple && checkbox) {

          if (content && content.text) {
            checkbox.selectedIndex = ['true', 'false', ''].indexOf(content.text);
          } else {
            checkbox.selectedIndex = 2;
          }
        }
      }

      if (checkbox) {
        // IF NOT (
        // type is boolean
        // ) THEN { remove checkbox }
        if (!(
          (businessObject.inputExpression &&
           businessObject.inputExpression.typeRef === 'boolean' ||
           businessObject.typeRef === 'boolean')
        )) {
          checkbox.parentNode.removeChild(checkbox);
          gfx.childNodes[0].style.display = '';
        }
      }
    }
  }, this);
}

SimpleMode.$inject = [ 'eventBus', 'sheet', 'config', 'graphicsFactory', 'translate' ];

module.exports = SimpleMode;

SimpleMode.prototype.addControlButton = function(event) {
  var sheet = this._sheet,
      translate = this._translate,
      controls = event.controls;

  var self = this;

  return controls.addControl(translate('Exit Advanced Mode'), function() {

    if (!domClasses(sheet.getContainer().parentNode).contains('simple-mode')) {
      self.activate();
    } else {
      self.deactivate();
    }
  });
};

SimpleMode.prototype.getExpressionNode = function(businessObject) {
  var node;

  if (businessObject.description) {
    node = domify('<span class="expression-hint"><b>[expression]</b> (<i></i>)</span>');

    node.querySelector('i').textContent = businessObject.description;

  } else {
    node = domify('<span class="expression-hint"><b>[expression]</b></span>');
  }
  return node;
};

SimpleMode.prototype.activate = function(isInit) {
  if (!this._node) {
    return;
  }

  domClasses(this._sheet.getContainer().parentNode).add('simple-mode');

  this._node.textContent = this._translate('Enter Advanced Mode');

  this.simple = true;

  this._graphicsFactory.redraw();

  // fire a different event from initializing and activating
  if (isInit) {
    this._eventBus.fire('simpleMode.initialized');
  } else {
    this._eventBus.fire('simpleMode.activated');
  }
};

SimpleMode.prototype.deactivate = function() {
  if (!this._node) {
    return;
  }

  domClasses(this._sheet.getContainer().parentNode).remove('simple-mode');

  this._node.textContent = this._translate('Exit Advanced Mode');

  this.simple = false;

  this._graphicsFactory.redraw();

  this._eventBus.fire('simpleMode.deactivated');
};

SimpleMode.prototype.toggle = function() {
  if (this.simple) {
    this.deactivate();
  } else {
    this.activate();
  }
};

SimpleMode.prototype.isActive = function() {
  return this.simple;
};

SimpleMode.prototype.hasComplexContent = function(context) {
  var businessObject = context.column.businessObject,
      textContent;

  if (!businessObject || !context.content || !context.content.text) {
    return false;
  }

  textContent = context.content.text;

  // boolean
  if (isType(businessObject, 'boolean')) {

    return [ 'true', 'false' ].indexOf(textContent) === -1;
  }

  // string
  if (isType(businessObject, 'string')) {

    return !this.isString(textContent);
  }
};

SimpleMode.prototype.isString = function(textContent) {
  var match = textContent.match(/"/g),
      firstCondition, secondCondition;

  if (textContent.length === 0) {
    return true;
  }

  // check if there are is a even number of quotes
  firstCondition = (match && match.length % 2 === 0);

  // exit early if the number of quotes is odd
  if (!firstCondition) {
    return false;
  }

  // being the number of quotes even, make sure there aren't multiple strings
  secondCondition = textContent.match(/".{0,1},.{0,1}"/);

  return firstCondition && !secondCondition;
};

},{"261":261,"264":264}],51:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'simpleMode' ],
  __depends__: [
    _dereq_(101)
  ],
  simpleMode: [ 'type', _dereq_(50) ]
};

},{"101":101,"50":50}],52:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264),
    utils  = _dereq_(53);

var isStringCell = utils.isStringCell,
    parseString  = utils.parseString;

function StringView(eventBus, simpleMode) {
  this._eventBus = eventBus;
  this._simpleMode = simpleMode;

  this._eventBus.on('cell.render', function(evt) {
    // remove potential datafield
    stringGfx = evt.gfx.querySelector('.string-content');
    if (stringGfx) {
      stringGfx.parentNode.removeChild(stringGfx);
    }
    if (evt.gfx.childNodes.length === 1) {
        // make sure the contenteditable field is visible
      evt.gfx.firstChild.style.display = 'inline';
      evt.data.preventAutoUpdate = false;
    }

    if (isStringCell(evt.data)) {
      if (this._simpleMode.isActive()) {
        // make sure the contendeditable field is hidden
        evt.gfx.firstChild.style.display = 'none';
        evt.data.preventAutoUpdate = true;

        // check for the datafield
        var stringGfx = evt.gfx.querySelector('.string-content');
        if (!stringGfx) {
          stringGfx = domify('<span class="string-content">');
          evt.gfx.appendChild(stringGfx);
        }
        this.renderString(evt.data.content, stringGfx);
      } else {
        // make sure the contenteditable field is visible
        evt.gfx.firstChild.style.display = '';
        evt.data.preventAutoUpdate = false;

        // remove potential datafield
        stringGfx = evt.gfx.querySelector('.string-content');
        if (stringGfx) {
          stringGfx.parentNode.removeChild(stringGfx);
        }
      }
    } else {
      // remove potential datafield
      stringGfx = evt.gfx.querySelector('.string-content');
      if (stringGfx) {
        stringGfx.parentNode.removeChild(stringGfx);
      }

      // if only the inline edit field is remaining, display it
      if (evt.gfx.childNodes.length === 1) {
        evt.gfx.firstChild.style.display = '';
      }
    }
  }, this);
}

StringView.prototype.renderString = function(data, gfx) {
  if (data.text) {
    var parsed = parseString(data.text);
    if (!parsed) {
      if (data.description) {
        gfx.innerHTML = '<span class="expression-hint"><b>[expression]</b> (<i></i>)</span>';
        gfx.querySelector('i').textContent = data.description;
      } else {
        gfx.innerHTML = '<span class="expression-hint"><b>[expression]</b></span>';
      }
    } else {
      gfx.textContent = data.text;
    }
  } else {
    gfx.innerHTML = '<span style="display: inline-block; width: 100%; color: #777777; text-align: center;">-</span>';
  }
};

StringView.$inject = ['eventBus', 'simpleMode'];

module.exports = StringView;

},{"264":264,"53":53}],53:[function(_dereq_,module,exports){
'use strict';

var hasStringType = function(column) {
  return column &&
         (column.inputExpression &&
         column.inputExpression.typeRef === 'string' ||
         column.typeRef === 'string');
};
var isBodyRow = function(row) {
  return !row.isHead && !row.isFoot;
};

var hasTextContent = function(el) {
  return el.content && typeof el.content.text !== 'undefined';
};

module.exports = {
  isStringCell: function(el) {
    return el._type === 'cell' &&
      hasStringType(el.column.businessObject) &&
      hasTextContent(el) &&
      isBodyRow(el.row);
  },
  parseString: function(string) {
    // three cases: empty, disjunction, and negated dijunction

    // try empty
    if (string.trim() === '') {
      return {
        type: 'disjunction',
        values: []
      };
    }

    // try disjunction
    var values = string.split(',');
    var out = {
      type: 'disjunction',
      values: []
    };
    var openString = '';
    values.forEach(function(value) {
      openString += value;
      if (/^"[^"]*"$/.test(openString.trim())) {
        out.values.push(openString.trim().slice(1,-1));
        openString = '';
      } else {
        openString += ',';
      }
    });
    if (!openString) {
      return out;
    }

    // try negation
    out.type = 'negation';
    out.values = [];
    openString = '';
    var info = string.match(/^\s*not\((.*)\)\s*$/);
    if (info) {
      values = info[1].split(',');
      values.forEach(function(value) {
        openString += value;
        if (/^"[^"]*"$/.test(openString.trim())) {
          out.values.push(openString.trim().slice(1,-1));
          openString = '';
        } else {
          openString += ',';
        }
      });
      if (!openString) {
        return out;
      }
    }
  },
  parseAllowedValues: function(el) {
    var bo = el.column.businessObject;
    var values = bo && (bo.inputValues || bo.outputValues);
    if (values && values.text) {
      values = values.text.split(',');
      return values.map(function(value) {
        if (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
          return value.slice(1,-1);
        } else {
          return value;
        }
      });
    }
  }
};

},{}],54:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  __init__: [ 'stringView' ],
  stringView: [ 'type', _dereq_(52) ]
};

},{"52":52}],55:[function(_dereq_,module,exports){
'use strict';

var assign = _dereq_(250);

var domify = _dereq_(264),
    domClasses = _dereq_(261),
    ComboBox = _dereq_(294);

var typeTemplate = _dereq_(57);

var OFFSET_X = -4,
    OFFSET_Y = -17;

/**
 * Adds a control to the table to define the datatypes for clauses
 */
function TypeRow(
  eventBus, sheet, elementRegistry,
  graphicsFactory, complexCell, rules,
  simpleMode, translate, parseTemplate) {

  this._eventBus = eventBus;
  this._graphicsFactory = graphicsFactory;

  this.row = null;

  var self = this;

  // add row when the sheet is initialized
  eventBus.on([ 'sheet.init', 'sheet.cleared' ], function(event) {

    eventBus.fire('typeRow.add', event);

    this.row = sheet.addRow({
      id: 'typeRow',
      isHead: true,
      isTypeRow: true
    });

    eventBus.fire('typeRow.added', this.row);

    graphicsFactory.update('row', this.row, elementRegistry.getGraphics(this.row.id));
  }, this);

  // remove the row when the sheet is destroyed
  eventBus.on([ 'sheet.clear', 'sheet.destroy' ], function(event) {

    eventBus.fire('typeRow.destroy', this.row);

    sheet.removeRow({
      id: 'typeRow'
    });

    eventBus.fire('typeRow.destroyed', this.row);

    this.row = null;
  }, this);

  // when an input cell on the mappings row is added, setup the complex cell
  eventBus.on('cell.added', function(evt) {
    if (evt.element.row.id === 'typeRow' &&
       evt.element.column.businessObject) {

      evt.element.content = evt.element.column.businessObject;

      var template = domify(parseTemplate(typeTemplate));

      var isOutput = evt.element.column.type === 'dmn:OutputClause';
      if (isOutput) {
        template.querySelector('.allowed-values label').textContent = translate('Output Values:');
      }

      // initializing the comboBox
      var comboBox = new ComboBox({
        label: translate('Type'),
        classNames: [ 'dmn-combobox', 'datatype' ],
        options: [ 'string', 'boolean', 'integer', 'long', 'double', 'date' ],
        dropdownClassNames: [ 'dmn-combobox-suggestions' ]
      });

      comboBox.addEventListener('valueChanged', function(valueEvent) {
        if (valueEvent.oldValue !== valueEvent.newValue) {
          eventBus.fire('typeRow.editDataType', {
            element: evt.element,
            dataType: valueEvent.newValue
          });

          self.updateAllowedValues(template, evt.element);

          // force redraw of potential dropdowns by toggling simple mode twice
          simpleMode.toggle();
          simpleMode.toggle();
        }
      });

      // add comboBox to the template
      template.insertBefore(
        comboBox.getNode(),
        template.firstChild
      );

      template.querySelector('.allowed-values input').addEventListener('keydown', function(keyboardEvt) {
        if (keyboardEvt.keyCode === 13) {
          self.handleValuesFromInput(evt.element, template);
        }
      });

      self.updateAllowedValues(template, evt.element);

      // set the complex property to initialize complex-cell behavior
      evt.element.complex = {
        className: 'dmn-clausevalues-setter',
        template: template,
        element: evt.element,
        comboBox: comboBox,
        type: 'type',
        offset: {
          x: 0,
          y: OFFSET_Y
        }
      };

      graphicsFactory.update('cell', evt.element, elementRegistry.getGraphics(evt.element));
    }
  });

  eventBus.on('complexCell.close', function(evt) {
    var config = evt.config,
        template;

    // only if the closed complexCell is a type cell
    if (config.type === 'type') {
      template = config.template;

      // only if it has string type and content in the input field
      if (config.comboBox.getValue() === 'string' && template.querySelector('.allowed-values input').value.trim() !== '') {
        self.handleValuesFromInput(config.element, template);
      }

    }
  });


  // whenever an type cell is opened, we have to position the template, because the x offset changes
  // over time, when columns are added and deleted
  eventBus.on('complexCell.open', function(evt) {
    var config = evt.config,
        template, gfx, content;

    if (config.type === 'type') {
      gfx = elementRegistry.getGraphics(config.element);
      // feed the values to the template and combobox
      content = config.element.content;

      if (content.inputExpression) {
        config.comboBox.setValue(content.inputExpression.typeRef);
      } else {
        config.comboBox.setValue(content.typeRef);
      }

      template = config.template;

      assign(template.parentNode.style, {
        left: (template.parentNode.offsetLeft + gfx.offsetWidth + OFFSET_X) + 'px'
      });

      // disable all input fields if editing is not allowed
      if (!rules.allowed('dataType.edit')) {
        config.comboBox.disable();

        // also set a disabled css class on the template
        domClasses(template.parentNode).add('read-only');
      }
    }
  });

}

TypeRow.prototype.handleValuesFromInput = function(element, template) {
  var inputNode = template.querySelector('.allowed-values input');

  var values = inputNode.value.split(',');
  var self = this;
  values.forEach(function(value) {
    self.addAllowedValue(element, value.trim());
  });
  this.updateAllowedValues(template, element);
  inputNode.value = '';
};

TypeRow.prototype.addAllowedValue = function(businessObject, newValue) {
  this._eventBus.fire('typeRow.addAllowedValue', {
    element: businessObject,
    value: newValue
  });
};

TypeRow.prototype.removeAllowedValue = function(businessObject, value) {
  this._eventBus.fire('typeRow.removeAllowedValue', {
    element: businessObject,
    value: value
  });
};

TypeRow.prototype.updateAllowedValues = function(template, businessObject) {
  var self = this;

  var type = businessObject.content.inputExpression && businessObject.content.inputExpression.typeRef ||
             businessObject.content.typeRef;

  if (type === 'string') {
    template.querySelector('.allowed-values').style.display = 'block';

    // clear the list of current allowed values
    var list = template.querySelector('.allowed-values ul');
    list.innerHTML = '';

    // add a list of allowed values
    if (businessObject.content.inputValues && businessObject.content.inputValues.text ||
       businessObject.content.outputValues && businessObject.content.outputValues.text) {

      var values;
      if (businessObject.content.inputValues) {
        values = businessObject.content.inputValues.text.split(',');
      } else {
        values = businessObject.content.outputValues.text.split(',');
      }

      values.forEach(function(value) {
        var element = domify('<li><span class="value-text">'+value.substr(1, value.length - 2)+'</span><button class="dmn-icon-clear"></button></li>');
        element.querySelector('button').addEventListener('click', function() {
          self.removeAllowedValue(businessObject, value);
          self.updateAllowedValues(template, businessObject);
        });
        list.appendChild(element);
      });
    }
  } else {
    template.querySelector('.allowed-values').style.display = 'none';
  }

  this._eventBus.fire('typeRow.editAllowedValues', {
    element: businessObject,
    values: values
  });

  this._graphicsFactory.redraw();
};

TypeRow.$inject = [
  'eventBus',
  'sheet',
  'elementRegistry',
  'graphicsFactory',
  'complexCell',
  'rules',
  'simpleMode',
  'translate',
  'parseTemplate'
];

module.exports = TypeRow;

TypeRow.prototype.getRow = function() {
  return this.row;
};

},{"250":250,"261":261,"264":264,"294":294,"57":57}],56:[function(_dereq_,module,exports){
'use strict';

var domClasses = _dereq_(261);

function TypeRowRenderer(
    eventBus,
    typeRow) {

  // row has class 'mappings'
  eventBus.on('row.render', function(event) {
    if (event.data === typeRow.getRow()) {
      domClasses(event.gfx).add('values');
    }
  });

  eventBus.on('cell.render', function(event) {

    var content = event.data.content;
    if (event.data.row === typeRow.getRow() && content) {
      if (content.inputExpression) {
        event.gfx.childNodes[0].textContent = content.inputExpression.typeRef || '';
      } else {
        event.gfx.childNodes[0].textContent = content.typeRef || '';
      }
    }
  });

}

TypeRowRenderer.$inject = [
  'eventBus',
  'typeRow'
];

module.exports = TypeRowRenderer;

},{"261":261}],57:[function(_dereq_,module,exports){
module.exports = "<div>\n  <div class=\"allowed-values\">\n    <label>{{ 'Input Values:' | translate }}</label>\n    <ul></ul>\n    <input type=\"text\" placeholder=\"value1, value2, otherValue\">\n  </div>\n</div>\n";

},{}],58:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'typeRow', 'typeRowRenderer' ],
  __depends__: [
    _dereq_(101),
    _dereq_(14),
    _dereq_(296)
  ],
  typeRow: [ 'type', _dereq_(55) ],
  typeRowRenderer: [ 'type', _dereq_(56) ]
};

},{"101":101,"14":14,"296":296,"55":55,"56":56}],59:[function(_dereq_,module,exports){
'use strict';

var TableTreeWalker = _dereq_(61);


/**
 * Import the definitions into a table.
 *
 * Errors and warnings are reported through the specified callback.
 *
 * @param  {Sheet} sheet
 * @param  {ModdleElement} definitions
 * @param  {Function} done the callback, invoked with (err, [ warning ]) once the import is done
 */
function importDmnTable(sheet, definitions, decision, done) {

  var importer = sheet.get('tableImporter'),
      eventBus = sheet.get('eventBus');

  var hasModeling;

  try {
    hasModeling = sheet.get('modeling');
  } catch (e) {
    hasModeling = false;
  }

  var error,
      warnings = [];

  function render(definitions) {

    var visitor = {
      create: function(type, parent, clause, rule) {
        return importer.create(type, parent, clause, rule);
      },

      table: function(element) {
        return importer.add(element);
      },

      element: function(element, parentShape, definitions) {
        return importer.add(element, parentShape, definitions);
      },

      error: function(message, context) {
        warnings.push({ message: message, context: context });
      }
    };

    var walker = new TableTreeWalker(visitor, { canAddMissingEntries: hasModeling });

    // import
    walker.handleDefinitions(definitions, decision);
  }

  eventBus.fire('import.render.start', { definitions: definitions });

  try {
    render(definitions);
  } catch (e) {
    error = e;
  }

  eventBus.fire('import.render.complete', {
    error: error,
    warnings: warnings
  });


  done(error, warnings);
}

module.exports.importDmnTable = importDmnTable;

},{"61":61}],60:[function(_dereq_,module,exports){
'use strict';

var assign = _dereq_(250),
    filter = _dereq_(134),
    union  = _dereq_(128);

var elementToString = _dereq_(62).elementToString;


function elementData(semantic, attrs) {
  return assign({
    id: semantic.id,
    type: semantic.$type,
    businessObject: semantic
  }, attrs);
}


function equals(type, conditions) {
  return filter(conditions, function(condition) {
    return condition === type;
  }).length;
}


/**
 * An importer that adds dmn elements to the sheet
 *
 * @param {EventBus} eventBus
 * @param {Sheet} sheet
 * @param {ElementFactory} elementFactory
 * @param {ElementRegistry} elementRegistry
 */
function TableImporter(eventBus, sheet, elementRegistry, elementFactory, moddle, tableName, ioLabel, tableFactory, literalExpressionEditor, translate) {
  this._eventBus = eventBus;
  this._sheet = sheet;

  this._elementRegistry = elementRegistry;
  this._elementFactory = elementFactory;
  this._tableName = tableName;
  this._tableFactory = tableFactory;

  this._literalExpressionEditor = literalExpressionEditor;
  this._translate = translate;

  this._ioLabel = ioLabel;

  this._moddle = moddle;
}

TableImporter.$inject = [
  'eventBus', 'sheet', 'elementRegistry',
  'elementFactory', 'moddle', 'tableName',
  'ioLabel', 'tableFactory',
  'literalExpressionEditor',
  'translate'
];

module.exports = TableImporter;


TableImporter.prototype._makeCopy = function(semantic) {
  var newSemantic = this._moddle.create(semantic.$type);

  for (var prop in semantic) {
    if (semantic.hasOwnProperty(prop) && prop !== '$type') {
      newSemantic[prop] = semantic[prop];
    }
  }
  newSemantic.$parent = semantic.$parent;

  return newSemantic;
};

TableImporter.prototype.create = function(type, parent, clause, rule) {
  var tableFactory = this._tableFactory,
      translate = this._translate;

  var parentBO = parent.businessObject,
      isInput= equals(type, [ 'dmn:InputClause', 'dmn:UnaryTests' ]) ? translate('Input') : translate('Output'),
      element;

  if (equals(type, [ 'dmn:InputClause', 'dmn:OutputClause' ])) {
    element = tableFactory['create' + isInput + 'Clause']('');

    element.$parent = parentBO;

    parentBO[isInput.toLowerCase()].push(element);
  }

  if (equals(type, [ 'dmn:UnaryTests', 'dmn:LiteralExpression'])) {
    rule = clause;
    clause = parent;
    parent = undefined;

    element = tableFactory['create' + isInput + 'Entry']('', clause, rule);
  }

  return element;
};

/**
 * Add dmn element (semantic) to the sheet onto the
 * parent element.
 */
TableImporter.prototype.add = function(semantic, parentElement, definitions) {

  var element;

  if (semantic.$instanceOf('dmn:DecisionTable')) {
    // Add the header row
    element = this._elementFactory.createRow(elementData(semantic, {
      isHead: true,
      isClauseRow: true,
      previous: this._ioLabel.getRow()
    }));
    this._sheet.addRow(element, parentElement);

    this._tableName.setSemantic(semantic.$parent);
  }

  // LITERAL EXPRESSION
  else if (semantic.$instanceOf('dmn:LiteralExpression') && parentElement.$instanceOf('dmn:Decision')) {
    this._literalExpressionEditor.show(parentElement);

    this._tableName.setSemantic(parentElement);
  }

  // INPUT CLAUSE
  else if (semantic.$instanceOf('dmn:InputClause')) {
    element = this._elementFactory.createColumn(elementData(semantic, {

    }));
    this._sheet.addColumn(element, parentElement);
  }
  // OUTPUT CLAUSE
  else if (semantic.$instanceOf('dmn:OutputClause')) {
    element = this._elementFactory.createColumn(elementData(semantic, {

    }));
    this._sheet.addColumn(element, parentElement);
  }

  // RULE
  else if (semantic.$instanceOf('dmn:DecisionRule')) {
    if (!semantic.inputEntry) {
      semantic.inputEntry = [];
    }
    if (!semantic.outputEntry) {
      semantic.outputEntry = [];
    }
    element = this._elementFactory.createRow(elementData(semantic, {

    }));
    this._sheet.addRow(element, parentElement);

  }

  // CELL
  else if (parentElement.$instanceOf('dmn:DecisionRule')) {

    // we have to find out the column of this cell. This can be done by getting the index of the
    // cell and then using the clause at this index
    var allCellsInRow = union(parentElement.inputEntry, parentElement.outputEntry);

    var allClauses = this._elementRegistry.filter(function(element) {
      if (!element.businessObject) {
        return false;
      }
      var type = element.businessObject.$type;
      return type === 'dmn:InputClause' || type === 'dmn:OutputClause';
    }).sort(function(element1, element2) {
      var bo1 = element1.businessObject;
      var bo2 = element2.businessObject;
      var parent = bo1.$parent;
      var parsedType = bo1.$type === 'dmn:InputClause' ? 'input' : 'output';

      // input entries before output entries
      if (bo1.$type !== bo2.$type) {
        if (bo1.$type === 'dmn:InputClause') {
          return -1;
        }
        return 1;
      }

      // order is relative to appearance in parent array
      return parent[parsedType].indexOf(bo1) - parent[parsedType].indexOf(bo2);
    });

    var column = allClauses[allCellsInRow.indexOf(semantic)].id;

    var row = this._elementRegistry.filter(function(ea) {
      return ea.businessObject === parentElement;
    })[0].id;

    semantic.text = semantic.text || '';

    this._sheet.setCellContent({
      row: row,
      column: column,
      content: semantic
    });

  } else {
    throw new Error('can not render element ' + elementToString(semantic));
  }

  this._eventBus.fire('dmnElement.added', { element: element });

  return element;
};

},{"128":128,"134":134,"250":250,"62":62}],61:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_(136);

var elementToString = _dereq_(62).elementToString;

function TableTreeWalker(handler, options) {

  var canAddMissingEntries = options && options.canAddMissingEntries;

  function visit(element, ctx, definitions) {

    var gfx = element.gfx;

    // avoid multiple rendering of elements
    if (gfx) {
      throw new Error('already rendered ' + elementToString(element));
    }

    // call handler
    return handler.element(element, ctx, definitions);
  }

  function visitTable(element) {
    return handler.table(element);
  }

  ////// Semantic handling //////////////////////

  function handleDefinitions(definitions, decision) {
    // make sure we walk the correct bpmnElement

    var missingEntries = null,
        missingClause;

    // no decision -> nothing to import
    if (!decision) {
      return;
    }

    if (decision.id === '') {
      decision.id = 'decision';
    }

    var table = decision.decisionTable;
    var literalExpression = decision.literalExpression;


    // no decision table -> nothing to import
    if (table) {
      var ctx = visitTable(table);


      if (canAddMissingEntries && !table.input) {
        table.input = [];

        missingEntries = 'input';

        missingClause = handler.create('dmn:InputClause', ctx, definitions);

      } else if (canAddMissingEntries && !table.output) {
        table.output = [];

        missingEntries = 'output';

        missingClause = handler.create('dmn:OutputClause', ctx, definitions);
      }

      handleClauses(table.input, ctx, definitions);
      handleClauses(table.output, ctx, definitions);

      if (table.rule && missingEntries) {
        handleMissingEntries(table.rule, missingEntries, missingClause);
      }

      // if any input or output clauses (columns) were added
      // make sure that for each rule the according input/output entry is created
      handleRules(table.rule, ctx, definitions);
    } else if (literalExpression) {

      visit(literalExpression, decision);

    } else {
      throw new Error('no table for ' + elementToString(decision));
    }

  }

  function handleMissingEntries(rules, missingEntries, missingClause) {
    var isInput = missingEntries === 'input',
        entriesNr = rules[0][(isInput ? 'output' : 'input') + 'Entry'].length,
        entryType = isInput ? 'dmn:UnaryTests' : 'dmn:LiteralExpression';


    forEach(rules, function(rule) {
      var idx = 0;

      for (idx; idx < entriesNr; idx++) {
        handler.create(entryType, missingClause, rule);
      }
    });
  }

  function handleClauses(inputs, context, definitions) {
    forEach(inputs, function(e) {
      visit(e, context, definitions);
    });
  }

  function handleRules(rules, context, definitions) {
    forEach(rules, function(e) {
      visit(e, context, definitions);

      handleEntry(e.inputEntry, e);

      handleEntry(e.outputEntry, e);
    });
  }

  function handleEntry(entry, context, definitions) {
    forEach(entry, function(e) {
      visit(e, context, definitions);
    });
  }

  ///// API ////////////////////////////////

  return {
    handleDefinitions: handleDefinitions
  };
}

module.exports = TableTreeWalker;

},{"136":136,"62":62}],62:[function(_dereq_,module,exports){
'use strict';

module.exports.elementToString = function(e) {
  if (!e) {
    return '<null>';
  }

  return '<' + e.$type + (e.id ? ' id="' + e.id : '') + '" />';
};
},{}],63:[function(_dereq_,module,exports){
module.exports = {
  __depends__: [
    _dereq_(35),
    _dereq_(101)
  ],
  tableImporter: [ 'type', _dereq_(60) ]
};

},{"101":101,"35":35,"60":60}],64:[function(_dereq_,module,exports){
'use strict';

var any = _dereq_(132);

/**
 * Is an element of the given DMN type?
 *
 * @param  {tjs.model.Base|ModdleElement} element
 * @param  {String} type
 *
 * @return {Boolean}
 */
function is(element, type) {
  var bo = getBusinessObject(element);

  return bo && (typeof bo.$instanceOf === 'function') && bo.$instanceOf(type);
}

module.exports.is = is;


/**
 * Return the business object for a given element.
 *
 * @param  {tjs.model.Base|ModdleElement} element
 *
 * @return {ModdleElement}
 */
function getBusinessObject(element) {
  return (element && element.businessObject) || element;
}

module.exports.getBusinessObject = getBusinessObject;


function getName(element) {
  element = getBusinessObject(element);

  var name = element.name;

  return name;
}

module.exports.getName = getName;


/**
 * Return true if element has any of the given types.
 *
 * @param {djs.model.Base} element
 * @param {Array<String>} types
 *
 * @return {Boolean}
 */
function isAny(element, types) {
  return any(types, function(t) {
    return is(element, t);
  });
}

module.exports.isAny = isAny;

},{"132":132}],65:[function(_dereq_,module,exports){
/**
 * This file must not be changed or exchanged.
 *
 * @see http://bpmn.io/license for more information.
 */

'use strict';

var domify = _dereq_(264);

var domDelegate = _dereq_(263);

/* jshint -W101 */

// inlined ../resources/bpmnjs.png
var logoData = module.exports.BPMNIO_LOGO = 'iVBORw0KGgoAAAANSUhEUgAAADQAAAA0CAMAAADypuvZAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAADBQTFRFiMte9PrwldFwfcZPqtqN0+zEyOe1XLgjvuKncsJAZ70y6fXh3vDT////UrQV////G2zN+AAAABB0Uk5T////////////////////AOAjXRkAAAHDSURBVHjavJZJkoUgDEBJmAX8979tM8u3E6x20VlYJfFFMoL4vBDxATxZcakIOJTWSmxvKWVIkJ8jHvlRv1F2LFrVISCZI+tCtQx+XfewgVTfyY3plPiQEAzI3zWy+kR6NBhFBYeBuscJLOUuA2WVLpCjVIaFzrNQZArxAZKUQm6gsj37L9Cb7dnIBUKxENaaMJQqMpDXvSL+ktxdGRm2IsKgJGGPg7atwUG5CcFUEuSv+CwQqizTrvDTNXdMU2bMiDWZd8d7QIySWVRsb2vBBioxOFt4OinPBapL+neAb5KL5IJ8szOza2/DYoipUCx+CjO0Bpsv0V6mktNZ+k8rlABlWG0FrOpKYVo8DT3dBeLEjUBAj7moDogVii7nSS9QzZnFcOVBp1g2PyBQ3Vr5aIapN91VJy33HTJLC1iX2FY6F8gRdaAeIEfVONgtFCzZTmoLEdOjBDfsIOA6128gw3eu1shAajdZNAORxuQDJN5A5PbEG6gNIu24QJD5iNyRMZIr6bsHbCtCU/OaOaSvgkUyDMdDa1BXGf5HJ1To+/Ym6mCKT02Y+/Sa126ZKyd3jxhzpc1r8zVL6YM1Qy/kR4ABAFJ6iQUnivhAAAAAAElFTkSuQmCC';

/* jshint +W101 */


function css(attrs) {
  return attrs.join(';');
}

var LIGHTBOX_STYLES = css([
  'z-index: 1001',
  'position: fixed',
  'top: 0',
  'left: 0',
  'right: 0',
  'bottom: 0'
]);

var BACKDROP_STYLES = css([
  'width: 100%',
  'height: 100%',
  'background: rgba(0,0,0,0.2)'
]);

var NOTICE_STYLES = css([
  'position: absolute',
  'left: 50%',
  'top: 40%',
  'margin: 0 -130px',
  'width: 260px',
  'padding: 10px',
  'background: white',
  'border: solid 1px #AAA',
  'border-radius: 3px',
  'font-family: Helvetica, Arial, sans-serif',
  'font-size: 14px',
  'line-height: 1.2em'
]);

var LIGHTBOX_MARKUP =
  '<div class="bjs-powered-by-lightbox" style="' + LIGHTBOX_STYLES + '">' +
    '<div class="backdrop" style="' + BACKDROP_STYLES + '"></div>' +
    '<div class="notice" style="' + NOTICE_STYLES + '">' +
      '<a href="http://bpmn.io" target="_blank" style="float: left; margin-right: 10px">' +
        '<img src="data:image/png;base64,'+ logoData +'">' +
      '</a>' +
      'Web-based tooling for BPMN, DMN and CMMN diagrams ' +
      'powered by <a href="http://bpmn.io" target="_blank">bpmn.io</a>.' +
    '</div>' +
  '</div>';


var lightbox;

function open() {

  if (!lightbox) {
    lightbox = domify(LIGHTBOX_MARKUP);

    domDelegate.bind(lightbox, '.backdrop', 'click', function(event) {
      document.body.removeChild(lightbox);
    });
  }

  document.body.appendChild(lightbox);
}

module.exports.open = open;

},{"263":263,"264":264}],66:[function(_dereq_,module,exports){
/**
 * Module dependencies.
 */

try {
  var index = _dereq_(70);
} catch (err) {
  var index = _dereq_(70);
}

/**
 * Whitespace regexp.
 */

var re = /\s+/;

/**
 * toString reference.
 */

var toString = Object.prototype.toString;

/**
 * Wrap `el` in a `ClassList`.
 *
 * @param {Element} el
 * @return {ClassList}
 * @api public
 */

module.exports = function(el){
  return new ClassList(el);
};

/**
 * Initialize a new ClassList for `el`.
 *
 * @param {Element} el
 * @api private
 */

function ClassList(el) {
  if (!el || !el.nodeType) {
    throw new Error('A DOM element reference is required');
  }
  this.el = el;
  this.list = el.classList;
}

/**
 * Add class `name` if not already present.
 *
 * @param {String} name
 * @return {ClassList}
 * @api public
 */

ClassList.prototype.add = function(name){
  // classList
  if (this.list) {
    this.list.add(name);
    return this;
  }

  // fallback
  var arr = this.array();
  var i = index(arr, name);
  if (!~i) arr.push(name);
  this.el.className = arr.join(' ');
  return this;
};

/**
 * Remove class `name` when present, or
 * pass a regular expression to remove
 * any which match.
 *
 * @param {String|RegExp} name
 * @return {ClassList}
 * @api public
 */

ClassList.prototype.remove = function(name){
  if ('[object RegExp]' == toString.call(name)) {
    return this.removeMatching(name);
  }

  // classList
  if (this.list) {
    this.list.remove(name);
    return this;
  }

  // fallback
  var arr = this.array();
  var i = index(arr, name);
  if (~i) arr.splice(i, 1);
  this.el.className = arr.join(' ');
  return this;
};

/**
 * Remove all classes matching `re`.
 *
 * @param {RegExp} re
 * @return {ClassList}
 * @api private
 */

ClassList.prototype.removeMatching = function(re){
  var arr = this.array();
  for (var i = 0; i < arr.length; i++) {
    if (re.test(arr[i])) {
      this.remove(arr[i]);
    }
  }
  return this;
};

/**
 * Toggle class `name`, can force state via `force`.
 *
 * For browsers that support classList, but do not support `force` yet,
 * the mistake will be detected and corrected.
 *
 * @param {String} name
 * @param {Boolean} force
 * @return {ClassList}
 * @api public
 */

ClassList.prototype.toggle = function(name, force){
  // classList
  if (this.list) {
    if ("undefined" !== typeof force) {
      if (force !== this.list.toggle(name, force)) {
        this.list.toggle(name); // toggle again to correct
      }
    } else {
      this.list.toggle(name);
    }
    return this;
  }

  // fallback
  if ("undefined" !== typeof force) {
    if (!force) {
      this.remove(name);
    } else {
      this.add(name);
    }
  } else {
    if (this.has(name)) {
      this.remove(name);
    } else {
      this.add(name);
    }
  }

  return this;
};

/**
 * Return an array of classes.
 *
 * @return {Array}
 * @api public
 */

ClassList.prototype.array = function(){
  var className = this.el.getAttribute('class') || '';
  var str = className.replace(/^\s+|\s+$/g, '');
  var arr = str.split(re);
  if ('' === arr[0]) arr.shift();
  return arr;
};

/**
 * Check if class `name` is present.
 *
 * @param {String} name
 * @return {ClassList}
 * @api public
 */

ClassList.prototype.has =
ClassList.prototype.contains = function(name){
  return this.list
    ? this.list.contains(name)
    : !! ~index(this.array(), name);
};

},{"70":70}],67:[function(_dereq_,module,exports){
var matches = _dereq_(71)

module.exports = function (element, selector, checkYoSelf, root) {
  element = checkYoSelf ? {parentNode: element} : element

  root = root || document

  // Make sure `element !== document` and `element != null`
  // otherwise we get an illegal invocation
  while ((element = element.parentNode) && element !== document) {
    if (matches(element, selector))
      return element
    // After `matches` on the edge case that
    // the selector matches the root
    // (when the root is not the document)
    if (element === root)
      return
  }
}

},{"71":71}],68:[function(_dereq_,module,exports){
/**
 * Module dependencies.
 */

try {
  var closest = _dereq_(67);
} catch(err) {
  var closest = _dereq_(67);
}

try {
  var event = _dereq_(69);
} catch(err) {
  var event = _dereq_(69);
}

/**
 * Delegate event `type` to `selector`
 * and invoke `fn(e)`. A callback function
 * is returned which may be passed to `.unbind()`.
 *
 * @param {Element} el
 * @param {String} selector
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @return {Function}
 * @api public
 */

exports.bind = function(el, selector, type, fn, capture){
  return event.bind(el, type, function(e){
    var target = e.target || e.srcElement;
    e.delegateTarget = closest(target, selector, true, el);
    if (e.delegateTarget) fn.call(el, e);
  }, capture);
};

/**
 * Unbind event `type`'s callback `fn`.
 *
 * @param {Element} el
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @api public
 */

exports.unbind = function(el, type, fn, capture){
  event.unbind(el, type, fn, capture);
};

},{"67":67,"69":69}],69:[function(_dereq_,module,exports){
var bind = window.addEventListener ? 'addEventListener' : 'attachEvent',
    unbind = window.removeEventListener ? 'removeEventListener' : 'detachEvent',
    prefix = bind !== 'addEventListener' ? 'on' : '';

/**
 * Bind `el` event `type` to `fn`.
 *
 * @param {Element} el
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @return {Function}
 * @api public
 */

exports.bind = function(el, type, fn, capture){
  el[bind](prefix + type, fn, capture || false);
  return fn;
};

/**
 * Unbind `el` event `type`'s callback `fn`.
 *
 * @param {Element} el
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @return {Function}
 * @api public
 */

exports.unbind = function(el, type, fn, capture){
  el[unbind](prefix + type, fn, capture || false);
  return fn;
};
},{}],70:[function(_dereq_,module,exports){
module.exports = function(arr, obj){
  if (arr.indexOf) return arr.indexOf(obj);
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) return i;
  }
  return -1;
};
},{}],71:[function(_dereq_,module,exports){
/**
 * Module dependencies.
 */

try {
  var query = _dereq_(72);
} catch (err) {
  var query = _dereq_(72);
}

/**
 * Element prototype.
 */

var proto = Element.prototype;

/**
 * Vendor function.
 */

var vendor = proto.matches
  || proto.webkitMatchesSelector
  || proto.mozMatchesSelector
  || proto.msMatchesSelector
  || proto.oMatchesSelector;

/**
 * Expose `match()`.
 */

module.exports = match;

/**
 * Match `el` to `selector`.
 *
 * @param {Element} el
 * @param {String} selector
 * @return {Boolean}
 * @api public
 */

function match(el, selector) {
  if (!el || el.nodeType !== 1) return false;
  if (vendor) return vendor.call(el, selector);
  var nodes = query.all(selector, el.parentNode);
  for (var i = 0; i < nodes.length; ++i) {
    if (nodes[i] == el) return true;
  }
  return false;
}

},{"72":72}],72:[function(_dereq_,module,exports){
function one(selector, el) {
  return el.querySelector(selector);
}

exports = module.exports = function(selector, el){
  el = el || document;
  return one(selector, el);
};

exports.all = function(selector, el){
  el = el || document;
  return el.querySelectorAll(selector);
};

exports.engine = function(obj){
  if (!obj.one) throw new Error('.one callback required');
  if (!obj.all) throw new Error('.all callback required');
  one = obj.one;
  exports.all = obj.all;
  return exports;
};

},{}],73:[function(_dereq_,module,exports){
module.exports = _dereq_(74);
},{"74":74}],74:[function(_dereq_,module,exports){
'use strict';

var di = _dereq_(115);


/**
 * Bootstrap an injector from a list of modules, instantiating a number of default components
 *
 * @ignore
 * @param {Array<didi.Module>} bootstrapModules
 *
 * @return {didi.Injector} a injector to use to access the components
 */
function bootstrap(bootstrapModules) {

  var modules = [],
      components = [];

  function hasModule(m) {
    return modules.indexOf(m) >= 0;
  }

  function addModule(m) {
    modules.push(m);
  }

  function visit(m) {
    if (hasModule(m)) {
      return;
    }

    (m.__depends__ || []).forEach(visit);

    if (hasModule(m)) {
      return;
    }

    addModule(m);

    (m.__init__ || []).forEach(function(c) {
      components.push(c);
    });
  }

  bootstrapModules.forEach(visit);

  var injector = new di.Injector(modules);

  components.forEach(function(c) {

    try {
      // eagerly resolve component (fn or string)
      injector[typeof c === 'string' ? 'get' : 'invoke'](c);
    } catch (e) {
      console.error('Failed to instantiate component');
      console.error(e.stack);

      throw e;
    }
  });

  return injector;
}

/**
 * Creates an injector from passed options.
 *
 * @ignore
 * @param  {Object} options
 * @return {didi.Injector}
 */
function createInjector(options) {

  options = options || {};

  var configModule = {
    'config': ['value', options]
  };

  var coreModule = _dereq_(81);

  var modules = [ configModule, coreModule ].concat(options.modules || []);

  return bootstrap(modules);
}


/**
 * The main diagram-js entry point that bootstraps the diagram with the given
 * configuration.
 *
 * To register extensions with the diagram, pass them as Array<didi.Module> to the constructor.
 *
 * @class djs.Diagram
 * @memberOf djs
 * @constructor
 *
 * @example
 *
 * <caption>Creating a plug-in that logs whenever a shape is added to the canvas.</caption>
 *
 * // plug-in implemenentation
 * function MyLoggingPlugin(eventBus) {
 *   eventBus.on('shape.added', function(event) {
 *     console.log('shape ', event.shape, ' was added to the diagram');
 *   });
 * }
 *
 * // export as module
 * module.exports = {
 *   __init__: [ 'myLoggingPlugin' ],
 *     myLoggingPlugin: [ 'type', MyLoggingPlugin ]
 * };
 *
 *
 * // instantiate the diagram with the new plug-in
 *
 * var diagram = new Diagram({ modules: [ require('path-to-my-logging-plugin') ] });
 *
 * diagram.invoke([ 'canvas', function(canvas) {
 *   // add shape to drawing canvas
 *   canvas.addShape({ x: 10, y: 10 });
 * });
 *
 * // 'shape ... was added to the diagram' logged to console
 *
 * @param {Object} options
 * @param {Array<didi.Module>} [options.modules] external modules to instantiate with the diagram
 * @param {didi.Injector} [injector] an (optional) injector to bootstrap the diagram with
 */
function Diagram(options, injector) {

  // create injector unless explicitly specified
  this.injector = injector = injector || createInjector(options);

  // API

  /**
   * Resolves a diagram service
   *
   * @method Diagram#get
   *
   * @param {String} name the name of the diagram service to be retrieved
   * @param {Boolean} [strict=true] if false, resolve missing services to null
   */
  this.get = injector.get;

  /**
   * Executes a function into which diagram services are injected
   *
   * @method Diagram#invoke
   *
   * @param {Function|Object[]} fn the function to resolve
   * @param {Object} locals a number of locals to use to resolve certain dependencies
   */
  this.invoke = injector.invoke;

  // init

  // indicate via event


  /**
   * An event indicating that all plug-ins are loaded.
   *
   * Use this event to fire other events to interested plug-ins
   *
   * @memberOf Diagram
   *
   * @event diagram.init
   *
   * @example
   *
   * eventBus.on('diagram.init', function() {
   *   eventBus.fire('my-custom-event', { foo: 'BAR' });
   * });
   *
   * @type {Object}
   */
  this.get('eventBus').fire('diagram.init');
}

module.exports = Diagram;


/**
 * Destroys the diagram
 *
 * @method  Diagram#destroy
 */
Diagram.prototype.destroy = function() {
  this.get('eventBus').fire('diagram.destroy');
};

/**
 * Clear the diagram, removing all contents.
 */
Diagram.prototype.clear = function() {
  this.get('eventBus').fire('diagram.clear');
};

},{"115":115,"81":81}],75:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_(136),
    isFunction = _dereq_(242),
    isArray = _dereq_(241),
    isNumber = _dereq_(244);


var DEFAULT_PRIORITY = 1000;


function isObject(element) {
  return typeof element === 'object';
}

/**
 * A utility that can be used to plug-in into the command execution for
 * extension and/or validation.
 *
 * @param {EventBus} eventBus
 *
 * @example
 *
 * var inherits = require('inherits');
 *
 * var CommandInterceptor = require('diagram-js/lib/command/CommandInterceptor');
 *
 * function CommandLogger(eventBus) {
 *   CommandInterceptor.call(this, eventBus);
 *
 *   this.preExecute(function(event) {
 *     console.log('command pre-execute', event);
 *   });
 * }
 *
 * inherits(CommandLogger, CommandInterceptor);
 *
 */
function CommandInterceptor(eventBus) {
  this._eventBus = eventBus;
}

CommandInterceptor.$inject = [ 'eventBus' ];

module.exports = CommandInterceptor;

function unwrapEvent(fn, that) {
  return function(event) {
    return fn.call(that || null, event.context, event.command, event);
  };
}

/**
 * Register an interceptor for a command execution
 *
 * @param {String|Array<String>} [events] list of commands to register on
 * @param {String} [hook] command hook, i.e. preExecute, executed to listen on
 * @param {Number} [priority] the priority on which to hook into the execution
 * @param {Function} handlerFn interceptor to be invoked with (event)
 * @param {Boolean} unwrap if true, unwrap the event and pass (context, command, event) to the
 *                          listener instead
 * @param {Object} [that] Pass context (`this`) to the handler function
 */
CommandInterceptor.prototype.on = function(events, hook, priority, handlerFn, unwrap, that) {

  if (isFunction(hook) || isNumber(hook)) {
    that = unwrap;
    unwrap = handlerFn;
    handlerFn = priority;
    priority = hook;
    hook = null;
  }

  if (isFunction(priority)) {
    that = unwrap;
    unwrap = handlerFn;
    handlerFn = priority;
    priority = DEFAULT_PRIORITY;
  }

  if (isObject(unwrap)) {
    that = unwrap;
    unwrap = false;
  }

  if (!isFunction(handlerFn)) {
    throw new Error('handlerFn must be a function');
  }

  if (!isArray(events)) {
    events = [ events ];
  }

  var eventBus = this._eventBus;

  forEach(events, function(event) {
    // concat commandStack(.event)?(.hook)?
    var fullEvent = [ 'commandStack', event, hook ].filter(function(e) { return e; }).join('.');

    eventBus.on(fullEvent, priority, unwrap ? unwrapEvent(handlerFn, that) : handlerFn, that);
  });
};


var hooks = [
  'canExecute',
  'preExecute',
  'preExecuted',
  'execute',
  'executed',
  'postExecute',
  'postExecuted',
  'revert',
  'reverted'
];

/*
 * Install hook shortcuts
 *
 * This will generate the CommandInterceptor#(preExecute|...|reverted) methods
 * which will in term forward to CommandInterceptor#on.
 */
forEach(hooks, function(hook) {

  /**
   * {canExecute|preExecute|preExecuted|execute|executed|postExecute|postExecuted|revert|reverted}
   *
   * A named hook for plugging into the command execution
   *
   * @param {String|Array<String>} [events] list of commands to register on
   * @param {Number} [priority] the priority on which to hook into the execution
   * @param {Function} handlerFn interceptor to be invoked with (event)
   * @param {Boolean} [unwrap=false] if true, unwrap the event and pass (context, command, event) to the
   *                          listener instead
   * @param {Object} [that] Pass context (`this`) to the handler function
   */
  CommandInterceptor.prototype[hook] = function(events, priority, handlerFn, unwrap, that) {

    if (isFunction(events) || isNumber(events)) {
      that = unwrap;
      unwrap = handlerFn;
      handlerFn = priority;
      priority = events;
      events = null;
    }

    this.on(events, hook, priority, handlerFn, unwrap, that);
  };
});

},{"136":136,"241":241,"242":242,"244":244}],76:[function(_dereq_,module,exports){
'use strict';

var isNumber = _dereq_(244),
    assign = _dereq_(250),
    forEach = _dereq_(136),
    every = _dereq_(133),
    debounce = _dereq_(143);

var Collections = _dereq_(104),
    Elements = _dereq_(105);

var svgAppend = _dereq_(320),
    svgAttr = _dereq_(322),
    svgClasses = _dereq_(323),
    svgCreate = _dereq_(325),
    svgTransform = _dereq_(329);

var createMatrix = _dereq_(326).createMatrix;


function round(number, resolution) {
  return Math.round(number * resolution) / resolution;
}

function ensurePx(number) {
  return isNumber(number) ? number + 'px' : number;
}

/**
 * Creates a HTML container element for a SVG element with
 * the given configuration
 *
 * @param  {Object} options
 * @return {HTMLElement} the container element
 */
function createContainer(options) {

  options = assign({}, { width: '100%', height: '100%' }, options);

  var container = options.container || document.body;

  // create a <div> around the svg element with the respective size
  // this way we can always get the correct container size
  // (this is impossible for <svg> elements at the moment)
  var parent = document.createElement('div');
  parent.setAttribute('class', 'djs-container');

  assign(parent.style, {
    position: 'relative',
    overflow: 'hidden',
    width: ensurePx(options.width),
    height: ensurePx(options.height)
  });

  container.appendChild(parent);

  return parent;
}

function createGroup(parent, cls) {
  var group = svgCreate('g');
  svgClasses(group).add(cls);

  svgAppend(parent, group);

  return group;
}

var BASE_LAYER = 'base';


var REQUIRED_MODEL_ATTRS = {
  shape: [ 'x', 'y', 'width', 'height' ],
  connection: [ 'waypoints' ]
};

/**
 * The main drawing canvas.
 *
 * @class
 * @constructor
 *
 * @emits Canvas#canvas.init
 *
 * @param {Object} config
 * @param {EventBus} eventBus
 * @param {GraphicsFactory} graphicsFactory
 * @param {ElementRegistry} elementRegistry
 */
function Canvas(config, eventBus, graphicsFactory, elementRegistry) {

  this._eventBus = eventBus;
  this._elementRegistry = elementRegistry;
  this._graphicsFactory = graphicsFactory;

  this._init(config || {});
}

Canvas.$inject = [ 'config.canvas', 'eventBus', 'graphicsFactory', 'elementRegistry' ];

module.exports = Canvas;


Canvas.prototype._init = function(config) {

  var eventBus = this._eventBus;

  // Creates a <svg> element that is wrapped into a <div>.
  // This way we are always able to correctly figure out the size of the svg element
  // by querying the parent node.
  //
  // (It is not possible to get the size of a svg element cross browser @ 2014-04-01)
  //
  // <div class="djs-container" style="width: {desired-width}, height: {desired-height}">
  //   <svg width="100%" height="100%">
  //    ...
  //   </svg>
  // </div>

  // html container
  var container = this._container = createContainer(config);

  var svg = this._svg = svgCreate('svg');
  svgAttr(svg, { width: '100%', height: '100%' });

  svgAppend(container, svg);

  var viewport = this._viewport = createGroup(svg, 'viewport');

  this._layers = {};

  // debounce canvas.viewbox.changed events
  // for smoother diagram interaction
  if (config.deferUpdate !== false) {
    this._viewboxChanged = debounce(this._viewboxChanged, 300);
  }

  eventBus.on('diagram.init', function() {

    /**
     * An event indicating that the canvas is ready to be drawn on.
     *
     * @memberOf Canvas
     *
     * @event canvas.init
     *
     * @type {Object}
     * @property {Snap<SVGSVGElement>} svg the created svg element
     * @property {Snap<SVGGroup>} viewport the direct parent of diagram elements and shapes
     */
    eventBus.fire('canvas.init', {
      svg: svg,
      viewport: viewport
    });

    // fire this in order for certain components to check
    // if they need to be adjusted due the canvas size
    this.resized();

  }, this);

  eventBus.on('diagram.destroy', 500, this._destroy, this);
  eventBus.on('diagram.clear', 500, this._clear, this);
};

Canvas.prototype._destroy = function(emit) {
  this._eventBus.fire('canvas.destroy', {
    svg: this._svg,
    viewport: this._viewport
  });

  var parent = this._container.parentNode;

  if (parent) {
    parent.removeChild(this._container);
  }

  delete this._svg;
  delete this._container;
  delete this._layers;
  delete this._rootElement;
  delete this._viewport;
};

Canvas.prototype._clear = function() {

  var self = this;

  var allElements = this._elementRegistry.getAll();

  // remove all elements
  allElements.forEach(function(element) {
    var type = Elements.getType(element);

    if (type === 'root') {
      self.setRootElement(null, true);
    } else {
      self._removeElement(element, type);
    }
  });

  // force recomputation of view box
  delete this._cachedViewbox;
};

/**
 * Returns the default layer on which
 * all elements are drawn.
 *
 * @returns {Snap<SVGGroup>}
 */
Canvas.prototype.getDefaultLayer = function() {
  return this.getLayer(BASE_LAYER);
};

/**
 * Returns a layer that is used to draw elements
 * or annotations on it.
 *
 * @param  {String} name
 *
 * @returns {Snap<SVGGroup>}
 */
Canvas.prototype.getLayer = function(name) {

  if (!name) {
    throw new Error('must specify a name');
  }

  var layer = this._layers[name];
  if (!layer) {
    layer = this._layers[name] = createGroup(this._viewport, 'layer-' + name);
  }

  return layer;
};


/**
 * Returns the html element that encloses the
 * drawing canvas.
 *
 * @return {DOMNode}
 */
Canvas.prototype.getContainer = function() {
  return this._container;
};


/////////////// markers ///////////////////////////////////

Canvas.prototype._updateMarker = function(element, marker, add) {
  var container;

  if (!element.id) {
    element = this._elementRegistry.get(element);
  }

  // we need to access all
  container = this._elementRegistry._elements[element.id];

  if (!container) {
    return;
  }

  forEach([ container.gfx, container.secondaryGfx ], function(gfx) {
    if (gfx) {
      // invoke either addClass or removeClass based on mode
      if (add) {
        svgClasses(gfx).add(marker);
      } else {
        svgClasses(gfx).remove(marker);
      }
    }
  });

  /**
   * An event indicating that a marker has been updated for an element
   *
   * @event element.marker.update
   * @type {Object}
   * @property {djs.model.Element} element the shape
   * @property {Object} gfx the graphical representation of the shape
   * @property {String} marker
   * @property {Boolean} add true if the marker was added, false if it got removed
   */
  this._eventBus.fire('element.marker.update', { element: element, gfx: container.gfx, marker: marker, add: !!add });
};


/**
 * Adds a marker to an element (basically a css class).
 *
 * Fires the element.marker.update event, making it possible to
 * integrate extension into the marker life-cycle, too.
 *
 * @example
 * canvas.addMarker('foo', 'some-marker');
 *
 * var fooGfx = canvas.getGraphics('foo');
 *
 * fooGfx; // <g class="... some-marker"> ... </g>
 *
 * @param {String|djs.model.Base} element
 * @param {String} marker
 */
Canvas.prototype.addMarker = function(element, marker) {
  this._updateMarker(element, marker, true);
};


/**
 * Remove a marker from an element.
 *
 * Fires the element.marker.update event, making it possible to
 * integrate extension into the marker life-cycle, too.
 *
 * @param  {String|djs.model.Base} element
 * @param  {String} marker
 */
Canvas.prototype.removeMarker = function(element, marker) {
  this._updateMarker(element, marker, false);
};

/**
 * Check the existence of a marker on element.
 *
 * @param  {String|djs.model.Base} element
 * @param  {String} marker
 */
Canvas.prototype.hasMarker = function(element, marker) {
  if (!element.id) {
    element = this._elementRegistry.get(element);
  }

  var gfx = this.getGraphics(element);

  return svgClasses(gfx).has(marker);
};

/**
 * Toggles a marker on an element.
 *
 * Fires the element.marker.update event, making it possible to
 * integrate extension into the marker life-cycle, too.
 *
 * @param  {String|djs.model.Base} element
 * @param  {String} marker
 */
Canvas.prototype.toggleMarker = function(element, marker) {
  if (this.hasMarker(element, marker)) {
    this.removeMarker(element, marker);
  } else {
    this.addMarker(element, marker);
  }
};

Canvas.prototype.getRootElement = function() {
  if (!this._rootElement) {
    this.setRootElement({ id: '__implicitroot', children: [] });
  }

  return this._rootElement;
};



//////////////// root element handling ///////////////////////////

/**
 * Sets a given element as the new root element for the canvas
 * and returns the new root element.
 *
 * @param {Object|djs.model.Root} element
 * @param {Boolean} [override] whether to override the current root element, if any
 *
 * @return {Object|djs.model.Root} new root element
 */
Canvas.prototype.setRootElement = function(element, override) {

  if (element) {
    this._ensureValid('root', element);
  }

  var currentRoot = this._rootElement,
      elementRegistry = this._elementRegistry,
      eventBus = this._eventBus;

  if (currentRoot) {
    if (!override) {
      throw new Error('rootElement already set, need to specify override');
    }

    // simulate element remove event sequence
    eventBus.fire('root.remove', { element: currentRoot });
    eventBus.fire('root.removed', { element: currentRoot });

    elementRegistry.remove(currentRoot);
  }

  if (element) {
    var gfx = this.getDefaultLayer();

    // resemble element add event sequence
    eventBus.fire('root.add', { element: element });

    elementRegistry.add(element, gfx, this._svg);

    eventBus.fire('root.added', { element: element, gfx: gfx });
  }

  this._rootElement = element;

  return element;
};



///////////// add functionality ///////////////////////////////

Canvas.prototype._ensureValid = function(type, element) {
  if (!element.id) {
    throw new Error('element must have an id');
  }

  if (this._elementRegistry.get(element.id)) {
    throw new Error('element with id ' + element.id + ' already exists');
  }

  var requiredAttrs = REQUIRED_MODEL_ATTRS[type];

  var valid = every(requiredAttrs, function(attr) {
    return typeof element[attr] !== 'undefined';
  });

  if (!valid) {
    throw new Error(
      'must supply { ' + requiredAttrs.join(', ') + ' } with ' + type);
  }
};

Canvas.prototype._setParent = function(element, parent, parentIndex) {
  Collections.add(parent.children, element, parentIndex);
  element.parent = parent;
};

/**
 * Adds an element to the canvas.
 *
 * This wires the parent <-> child relationship between the element and
 * a explicitly specified parent or an implicit root element.
 *
 * During add it emits the events
 *
 *  * <{type}.add> (element, parent)
 *  * <{type}.added> (element, gfx)
 *
 * Extensions may hook into these events to perform their magic.
 *
 * @param {String} type
 * @param {Object|djs.model.Base} element
 * @param {Object|djs.model.Base} [parent]
 * @param {Number} [parentIndex]
 *
 * @return {Object|djs.model.Base} the added element
 */
Canvas.prototype._addElement = function(type, element, parent, parentIndex) {

  parent = parent || this.getRootElement();

  var eventBus = this._eventBus,
      graphicsFactory = this._graphicsFactory;

  this._ensureValid(type, element);

  eventBus.fire(type + '.add', { element: element, parent: parent });

  this._setParent(element, parent, parentIndex);

  // create graphics
  var gfx = graphicsFactory.create(type, element);

  this._elementRegistry.add(element, gfx);

  // update its visual
  graphicsFactory.update(type, element, gfx);

  eventBus.fire(type + '.added', { element: element, gfx: gfx });

  return element;
};

/**
 * Adds a shape to the canvas
 *
 * @param {Object|djs.model.Shape} shape to add to the diagram
 * @param {djs.model.Base} [parent]
 * @param {Number} [parentIndex]
 *
 * @return {djs.model.Shape} the added shape
 */
Canvas.prototype.addShape = function(shape, parent, parentIndex) {
  return this._addElement('shape', shape, parent, parentIndex);
};

/**
 * Adds a connection to the canvas
 *
 * @param {Object|djs.model.Connection} connection to add to the diagram
 * @param {djs.model.Base} [parent]
 * @param {Number} [parentIndex]
 *
 * @return {djs.model.Connection} the added connection
 */
Canvas.prototype.addConnection = function(connection, parent, parentIndex) {
  return this._addElement('connection', connection, parent, parentIndex);
};


/**
 * Internal remove element
 */
Canvas.prototype._removeElement = function(element, type) {

  var elementRegistry = this._elementRegistry,
      graphicsFactory = this._graphicsFactory,
      eventBus = this._eventBus;

  element = elementRegistry.get(element.id || element);

  if (!element) {
    // element was removed already
    return;
  }

  eventBus.fire(type + '.remove', { element: element });

  graphicsFactory.remove(element);

  // unset parent <-> child relationship
  Collections.remove(element.parent && element.parent.children, element);
  element.parent = null;

  eventBus.fire(type + '.removed', { element: element });

  elementRegistry.remove(element);

  return element;
};


/**
 * Removes a shape from the canvas
 *
 * @param {String|djs.model.Shape} shape or shape id to be removed
 *
 * @return {djs.model.Shape} the removed shape
 */
Canvas.prototype.removeShape = function(shape) {

  /**
   * An event indicating that a shape is about to be removed from the canvas.
   *
   * @memberOf Canvas
   *
   * @event shape.remove
   * @type {Object}
   * @property {djs.model.Shape} element the shape descriptor
   * @property {Object} gfx the graphical representation of the shape
   */

  /**
   * An event indicating that a shape has been removed from the canvas.
   *
   * @memberOf Canvas
   *
   * @event shape.removed
   * @type {Object}
   * @property {djs.model.Shape} element the shape descriptor
   * @property {Object} gfx the graphical representation of the shape
   */
  return this._removeElement(shape, 'shape');
};


/**
 * Removes a connection from the canvas
 *
 * @param {String|djs.model.Connection} connection or connection id to be removed
 *
 * @return {djs.model.Connection} the removed connection
 */
Canvas.prototype.removeConnection = function(connection) {

  /**
   * An event indicating that a connection is about to be removed from the canvas.
   *
   * @memberOf Canvas
   *
   * @event connection.remove
   * @type {Object}
   * @property {djs.model.Connection} element the connection descriptor
   * @property {Object} gfx the graphical representation of the connection
   */

  /**
   * An event indicating that a connection has been removed from the canvas.
   *
   * @memberOf Canvas
   *
   * @event connection.removed
   * @type {Object}
   * @property {djs.model.Connection} element the connection descriptor
   * @property {Object} gfx the graphical representation of the connection
   */
  return this._removeElement(connection, 'connection');
};


/**
 * Return the graphical object underlaying a certain diagram element
 *
 * @param {String|djs.model.Base} element descriptor of the element
 * @param {Boolean} [secondary=false] whether to return the secondary connected element
 *
 * @return {SVGElement}
 */
Canvas.prototype.getGraphics = function(element, secondary) {
  return this._elementRegistry.getGraphics(element, secondary);
};


/**
 * Perform a viewbox update via a given change function.
 *
 * @param {Function} changeFn
 */
Canvas.prototype._changeViewbox = function(changeFn) {

  // notify others of the upcoming viewbox change
  this._eventBus.fire('canvas.viewbox.changing');

  // perform actual change
  changeFn.apply(this);

  // reset the cached viewbox so that
  // a new get operation on viewbox or zoom
  // triggers a viewbox re-computation
  this._cachedViewbox = null;

  // notify others of the change; this step
  // may or may not be debounced
  this._viewboxChanged();
};

Canvas.prototype._viewboxChanged = function() {
  this._eventBus.fire('canvas.viewbox.changed', { viewbox: this.viewbox() });
};


/**
 * Gets or sets the view box of the canvas, i.e. the
 * area that is currently displayed.
 *
 * The getter may return a cached viewbox (if it is currently
 * changing). To force a recomputation, pass `false` as the first argument.
 *
 * @example
 *
 * canvas.viewbox({ x: 100, y: 100, width: 500, height: 500 })
 *
 * // sets the visible area of the diagram to (100|100) -> (600|100)
 * // and and scales it according to the diagram width
 *
 * var viewbox = canvas.viewbox(); // pass `false` to force recomputing the box.
 *
 * console.log(viewbox);
 * // {
 * //   inner: Dimensions,
 * //   outer: Dimensions,
 * //   scale,
 * //   x, y,
 * //   width, height
 * // }
 *
 * // if the current diagram is zoomed and scrolled, you may reset it to the
 * // default zoom via this method, too:
 *
 * var zoomedAndScrolledViewbox = canvas.viewbox();
 *
 * canvas.viewbox({
 *   x: 0,
 *   y: 0,
 *   width: zoomedAndScrolledViewbox.outer.width,
 *   height: zoomedAndScrolledViewbox.outer.height
 * });
 *
 * @param  {Object} [box] the new view box to set
 * @param  {Number} box.x the top left X coordinate of the canvas visible in view box
 * @param  {Number} box.y the top left Y coordinate of the canvas visible in view box
 * @param  {Number} box.width the visible width
 * @param  {Number} box.height
 *
 * @return {Object} the current view box
 */
Canvas.prototype.viewbox = function(box) {

  if (box === undefined && this._cachedViewbox) {
    return this._cachedViewbox;
  }

  var viewport = this._viewport,
      innerBox,
      outerBox = this.getSize(),
      matrix,
      scale,
      x, y;

  if (!box) {
    // compute the inner box based on the
    // diagrams default layer. This allows us to exclude
    // external components, such as overlays
    innerBox = this.getDefaultLayer().getBBox();

    var transform = svgTransform(viewport);
    matrix = transform ? transform.matrix : createMatrix();
    scale = round(matrix.a, 1000);

    x = round(-matrix.e || 0, 1000);
    y = round(-matrix.f || 0, 1000);

    box = this._cachedViewbox = {
      x: x ? x / scale : 0,
      y: y ? y / scale : 0,
      width: outerBox.width / scale,
      height: outerBox.height / scale,
      scale: scale,
      inner: {
        width: innerBox.width,
        height: innerBox.height,
        x: innerBox.x,
        y: innerBox.y
      },
      outer: outerBox
    };

    return box;
  } else {

    this._changeViewbox(function() {
      scale = Math.min(outerBox.width / box.width, outerBox.height / box.height);

      var matrix = this._svg.createSVGMatrix()
        .scale(scale)
        .translate(-box.x, -box.y);

      svgTransform(viewport, matrix);
    });
  }

  return box;
};


/**
 * Gets or sets the scroll of the canvas.
 *
 * @param {Object} [delta] the new scroll to apply.
 *
 * @param {Number} [delta.dx]
 * @param {Number} [delta.dy]
 */
Canvas.prototype.scroll = function(delta) {

  var node = this._viewport;
  var matrix = node.getCTM();

  if (delta) {
    this._changeViewbox(function() {
      delta = assign({ dx: 0, dy: 0 }, delta || {});

      matrix = this._svg.createSVGMatrix().translate(delta.dx, delta.dy).multiply(matrix);

      setCTM(node, matrix);
    });
  }

  return { x: matrix.e, y: matrix.f };
};


/**
 * Gets or sets the current zoom of the canvas, optionally zooming
 * to the specified position.
 *
 * The getter may return a cached zoom level. Call it with `false` as
 * the first argument to force recomputation of the current level.
 *
 * @param {String|Number} [newScale] the new zoom level, either a number, i.e. 0.9,
 *                                   or `fit-viewport` to adjust the size to fit the current viewport
 * @param {String|Point} [center] the reference point { x: .., y: ..} to zoom to, 'auto' to zoom into mid or null
 *
 * @return {Number} the current scale
 */
Canvas.prototype.zoom = function(newScale, center) {

  if (!newScale) {
    return this.viewbox(newScale).scale;
  }

  if (newScale === 'fit-viewport') {
    return this._fitViewport(center);
  }

  var outer,
      matrix;

  this._changeViewbox(function() {

    if (typeof center !== 'object') {
      outer = this.viewbox().outer;

      center = {
        x: outer.width / 2,
        y: outer.height / 2
      };
    }

    matrix = this._setZoom(newScale, center);
  });

  return round(matrix.a, 1000);
};

function setCTM(node, m) {
  var mstr = 'matrix(' + m.a + ',' + m.b + ',' + m.c + ',' + m.d + ',' + m.e + ',' + m.f + ')';
  node.setAttribute('transform', mstr);
}

Canvas.prototype._fitViewport = function(center) {

  var vbox = this.viewbox(),
      outer = vbox.outer,
      inner = vbox.inner,
      newScale,
      newViewbox;

  // display the complete diagram without zooming in.
  // instead of relying on internal zoom, we perform a
  // hard reset on the canvas viewbox to realize this
  //
  // if diagram does not need to be zoomed in, we focus it around
  // the diagram origin instead

  if (inner.x >= 0 &&
      inner.y >= 0 &&
      inner.x + inner.width <= outer.width &&
      inner.y + inner.height <= outer.height &&
      !center) {

    newViewbox = {
      x: 0,
      y: 0,
      width: Math.max(inner.width + inner.x, outer.width),
      height: Math.max(inner.height + inner.y, outer.height)
    };
  } else {

    newScale = Math.min(1, outer.width / inner.width, outer.height / inner.height);
    newViewbox = {
      x: inner.x + (center ? inner.width / 2 - outer.width / newScale / 2 : 0),
      y: inner.y + (center ? inner.height / 2 - outer.height / newScale / 2 : 0),
      width: outer.width / newScale,
      height: outer.height / newScale
    };
  }

  this.viewbox(newViewbox);

  return this.viewbox(false).scale;
};


Canvas.prototype._setZoom = function(scale, center) {

  var svg = this._svg,
      viewport = this._viewport;

  var matrix = svg.createSVGMatrix();
  var point = svg.createSVGPoint();

  var centerPoint,
      originalPoint,
      currentMatrix,
      scaleMatrix,
      newMatrix;

  currentMatrix = viewport.getCTM();

  var currentScale = currentMatrix.a;

  if (center) {
    centerPoint = assign(point, center);

    // revert applied viewport transformations
    originalPoint = centerPoint.matrixTransform(currentMatrix.inverse());

    // create scale matrix
    scaleMatrix = matrix
                    .translate(originalPoint.x, originalPoint.y)
                    .scale(1 / currentScale * scale)
                    .translate(-originalPoint.x, -originalPoint.y);

    newMatrix = currentMatrix.multiply(scaleMatrix);
  } else {
    newMatrix = matrix.scale(scale);
  }

  setCTM(this._viewport, newMatrix);

  return newMatrix;
};


/**
 * Returns the size of the canvas
 *
 * @return {Dimensions}
 */
Canvas.prototype.getSize = function() {
  return {
    width: this._container.clientWidth,
    height: this._container.clientHeight
  };
};


/**
 * Return the absolute bounding box for the given element
 *
 * The absolute bounding box may be used to display overlays in the
 * callers (browser) coordinate system rather than the zoomed in/out
 * canvas coordinates.
 *
 * @param  {ElementDescriptor} element
 * @return {Bounds} the absolute bounding box
 */
Canvas.prototype.getAbsoluteBBox = function(element) {
  var vbox = this.viewbox();
  var bbox;

  // connection
  // use svg bbox
  if (element.waypoints) {
    var gfx = this.getGraphics(element);

    bbox = gfx.getBBox();
  }
  // shapes
  // use data
  else {
    bbox = element;
  }

  var x = bbox.x * vbox.scale - vbox.x * vbox.scale;
  var y = bbox.y * vbox.scale - vbox.y * vbox.scale;

  var width = bbox.width * vbox.scale;
  var height = bbox.height * vbox.scale;

  return {
    x: x,
    y: y,
    width: width,
    height: height
  };
};

/**
 * Fires an event in order other modules can react to the
 * canvas resizing
 */
Canvas.prototype.resized = function() {

  // force recomputation of view box
  delete this._cachedViewbox;

  this._eventBus.fire('canvas.resized');
};

},{"104":104,"105":105,"133":133,"136":136,"143":143,"244":244,"250":250,"320":320,"322":322,"323":323,"325":325,"326":326,"329":329}],77:[function(_dereq_,module,exports){
'use strict';

var Model = _dereq_(103);

var assign = _dereq_(250);

/**
 * A factory for diagram-js shapes
 */
function ElementFactory() {
  this._uid = 12;
}

module.exports = ElementFactory;


ElementFactory.prototype.createRoot = function(attrs) {
  return this.create('root', attrs);
};

ElementFactory.prototype.createLabel = function(attrs) {
  return this.create('label', attrs);
};

ElementFactory.prototype.createShape = function(attrs) {
  return this.create('shape', attrs);
};

ElementFactory.prototype.createConnection = function(attrs) {
  return this.create('connection', attrs);
};

/**
 * Create a model element with the given type and
 * a number of pre-set attributes.
 *
 * @param  {String} type
 * @param  {Object} attrs
 * @return {djs.model.Base} the newly created model instance
 */
ElementFactory.prototype.create = function(type, attrs) {

  attrs = assign({}, attrs || {});

  if (!attrs.id) {
    attrs.id = type + '_' + (this._uid++);
  }

  return Model.create(type, attrs);
};
},{"103":103,"250":250}],78:[function(_dereq_,module,exports){
'use strict';

var ELEMENT_ID = 'data-element-id';

var svgAttr = _dereq_(322);


/**
 * @class
 *
 * A registry that keeps track of all shapes in the diagram.
 */
function ElementRegistry(eventBus) {
  this._elements = {};

  this._eventBus = eventBus;
}

ElementRegistry.$inject = [ 'eventBus' ];

module.exports = ElementRegistry;

/**
 * Register a pair of (element, gfx, (secondaryGfx)).
 *
 * @param {djs.model.Base} element
 * @param {SVGElement} gfx
 * @param {SVGElement} [secondaryGfx] optional other element to register, too
 */
ElementRegistry.prototype.add = function(element, gfx, secondaryGfx) {

  var id = element.id;

  this._validateId(id);

  // associate dom node with element
  svgAttr(gfx, ELEMENT_ID, id);

  if (secondaryGfx) {
    svgAttr(secondaryGfx, ELEMENT_ID, id);
  }

  this._elements[id] = { element: element, gfx: gfx, secondaryGfx: secondaryGfx };
};

/**
 * Removes an element from the registry.
 *
 * @param {djs.model.Base} element
 */
ElementRegistry.prototype.remove = function(element) {
  var elements = this._elements,
      id = element.id || element,
      container = id && elements[id];

  if (container) {

    // unset element id on gfx
    svgAttr(container.gfx, ELEMENT_ID, '');

    if (container.secondaryGfx) {
      svgAttr(container.secondaryGfx, ELEMENT_ID, '');
    }

    delete elements[id];
  }
};

/**
 * Update the id of an element
 *
 * @param {djs.model.Base} element
 * @param {String} newId
 */
ElementRegistry.prototype.updateId = function(element, newId) {

  this._validateId(newId);

  if (typeof element === 'string') {
    element = this.get(element);
  }

  this._eventBus.fire('element.updateId', {
    element: element,
    newId: newId
  });

  var gfx = this.getGraphics(element),
      secondaryGfx = this.getGraphics(element, true);

  this.remove(element);

  element.id = newId;

  this.add(element, gfx, secondaryGfx);
};

/**
 * Return the model element for a given id or graphics.
 *
 * @example
 *
 * elementRegistry.get('SomeElementId_1');
 * elementRegistry.get(gfx);
 *
 *
 * @param {String|SVGElement} filter for selecting the element
 *
 * @return {djs.model.Base}
 */
ElementRegistry.prototype.get = function(filter) {
  var id;

  if (typeof filter === 'string') {
    id = filter;
  } else {
    id = filter && svgAttr(filter, ELEMENT_ID);
  }

  var container = this._elements[id];
  return container && container.element;
};

/**
 * Return all elements that match a given filter function.
 *
 * @param {Function} fn
 *
 * @return {Array<djs.model.Base>}
 */
ElementRegistry.prototype.filter = function(fn) {

  var filtered = [];

  this.forEach(function(element, gfx) {
    if (fn(element, gfx)) {
      filtered.push(element);
    }
  });

  return filtered;
};

/**
 * Return all rendered model elements.
 *
 * @return {Array<djs.model.Base>}
 */
ElementRegistry.prototype.getAll = function() {
  return this.filter(function(e) { return e; });
};

/**
 * Iterate over all diagram elements.
 *
 * @param {Function} fn
 */
ElementRegistry.prototype.forEach = function(fn) {

  var map = this._elements;

  Object.keys(map).forEach(function(id) {
    var container = map[id],
        element = container.element,
        gfx = container.gfx;

    return fn(element, gfx);
  });
};

/**
 * Return the graphical representation of an element or its id.
 *
 * @example
 * elementRegistry.getGraphics('SomeElementId_1');
 * elementRegistry.getGraphics(rootElement); // <g ...>
 *
 * elementRegistry.getGraphics(rootElement, true); // <svg ...>
 *
 *
 * @param {String|djs.model.Base} filter
 * @param {Boolean} [secondary=false] whether to return the secondary connected element
 *
 * @return {SVGElement}
 */
ElementRegistry.prototype.getGraphics = function(filter, secondary) {
  var id = filter.id || filter;

  var container = this._elements[id];
  return container && (secondary ? container.secondaryGfx : container.gfx);
};

/**
 * Validate the suitability of the given id and signals a problem
 * with an exception.
 *
 * @param {String} id
 *
 * @throws {Error} if id is empty or already assigned
 */
ElementRegistry.prototype._validateId = function(id) {
  if (!id) {
    throw new Error('element must have an id');
  }

  if (this._elements[id]) {
    throw new Error('element with id ' + id + ' already added');
  }
};

},{"322":322}],79:[function(_dereq_,module,exports){
'use strict';

var isFunction = _dereq_(242),
    isArray = _dereq_(241),
    isNumber = _dereq_(244),
    bind = _dereq_(142),
    assign = _dereq_(250);

var FN_REF = '__fn';

var DEFAULT_PRIORITY = 1000;

var slice = Array.prototype.slice;

/**
 * A general purpose event bus.
 *
 * This component is used to communicate across a diagram instance.
 * Other parts of a diagram can use it to listen to and broadcast events.
 *
 *
 * ## Registering for Events
 *
 * The event bus provides the {@link EventBus#on} and {@link EventBus#once}
 * methods to register for events. {@link EventBus#off} can be used to
 * remove event registrations. Listeners receive an instance of {@link Event}
 * as the first argument. It allows them to hook into the event execution.
 *
 * ```javascript
 *
 * // listen for event
 * eventBus.on('foo', function(event) {
 *
 *   // access event type
 *   event.type; // 'foo'
 *
 *   // stop propagation to other listeners
 *   event.stopPropagation();
 *
 *   // prevent event default
 *   event.preventDefault();
 * });
 *
 * // listen for event with custom payload
 * eventBus.on('bar', function(event, payload) {
 *   console.log(payload);
 * });
 *
 * // listen for event returning value
 * eventBus.on('foobar', function(event) {
 *
 *   // stop event propagation + prevent default
 *   return false;
 *
 *   // stop event propagation + return custom result
 *   return {
 *     complex: 'listening result'
 *   };
 * });
 *
 *
 * // listen with custom priority (default=1000, higher is better)
 * eventBus.on('priorityfoo', 1500, function(event) {
 *   console.log('invoked first!');
 * });
 *
 *
 * // listen for event and pass the context (`this`)
 * eventBus.on('foobar', function(event) {
 *   this.foo();
 * }, this);
 * ```
 *
 *
 * ## Emitting Events
 *
 * Events can be emitted via the event bus using {@link EventBus#fire}.
 *
 * ```javascript
 *
 * // false indicates that the default action
 * // was prevented by listeners
 * if (eventBus.fire('foo') === false) {
 *   console.log('default has been prevented!');
 * };
 *
 *
 * // custom args + return value listener
 * eventBus.on('sum', function(event, a, b) {
 *   return a + b;
 * });
 *
 * // you can pass custom arguments + retrieve result values.
 * var sum = eventBus.fire('sum', 1, 2);
 * console.log(sum); // 3
 * ```
 */
function EventBus() {
  this._listeners = {};

  // cleanup on destroy on lowest priority to allow
  // message passing until the bitter end
  this.on('diagram.destroy', 1, this._destroy, this);
}

module.exports = EventBus;


/**
 * Register an event listener for events with the given name.
 *
 * The callback will be invoked with `event, ...additionalArguments`
 * that have been passed to {@link EventBus#fire}.
 *
 * Returning false from a listener will prevent the events default action
 * (if any is specified). To stop an event from being processed further in
 * other listeners execute {@link Event#stopPropagation}.
 *
 * Returning anything but `undefined` from a listener will stop the listener propagation.
 *
 * @param {String|Array<String>} events
 * @param {Number} [priority=1000] the priority in which this listener is called, larger is higher
 * @param {Function} callback
 * @param {Object} [that] Pass context (`this`) to the callback
 */
EventBus.prototype.on = function(events, priority, callback, that) {

  events = isArray(events) ? events : [ events ];

  if (isFunction(priority)) {
    that = callback;
    callback = priority;
    priority = DEFAULT_PRIORITY;
  }

  if (!isNumber(priority)) {
    throw new Error('priority must be a number');
  }

  var actualCallback = callback;

  if (that) {
    actualCallback = bind(callback, that);

    // make sure we remember and are able to remove
    // bound callbacks via {@link #off} using the original
    // callback
    actualCallback[FN_REF] = callback[FN_REF] || callback;
  }

  var self = this,
      listener = { priority: priority, callback: actualCallback };

  events.forEach(function(e) {
    self._addListener(e, listener);
  });
};


/**
 * Register an event listener that is executed only once.
 *
 * @param {String} event the event name to register for
 * @param {Function} callback the callback to execute
 * @param {Object} [that] Pass context (`this`) to the callback
 */
EventBus.prototype.once = function(event, priority, callback, that) {
  var self = this;

  if (isFunction(priority)) {
    that = callback;
    callback = priority;
    priority = DEFAULT_PRIORITY;
  }

  if (!isNumber(priority)) {
    throw new Error('priority must be a number');
  }

  function wrappedCallback() {
    self.off(event, wrappedCallback);
    return callback.apply(that, arguments);
  }

  // make sure we remember and are able to remove
  // bound callbacks via {@link #off} using the original
  // callback
  wrappedCallback[FN_REF] = callback;

  this.on(event, priority, wrappedCallback);
};


/**
 * Removes event listeners by event and callback.
 *
 * If no callback is given, all listeners for a given event name are being removed.
 *
 * @param {String} event
 * @param {Function} [callback]
 */
EventBus.prototype.off = function(event, callback) {
  var listeners = this._getListeners(event),
      listener,
      listenerCallback,
      idx;

  if (callback) {

    // move through listeners from back to front
    // and remove matching listeners
    for (idx = listeners.length - 1; (listener = listeners[idx]); idx--) {
      listenerCallback = listener.callback;

      if (listenerCallback === callback || listenerCallback[FN_REF] === callback) {
        listeners.splice(idx, 1);
      }
    }
  } else {
    // clear listeners
    listeners.length = 0;
  }
};


/**
 * Fires a named event.
 *
 * @example
 *
 * // fire event by name
 * events.fire('foo');
 *
 * // fire event object with nested type
 * var event = { type: 'foo' };
 * events.fire(event);
 *
 * // fire event with explicit type
 * var event = { x: 10, y: 20 };
 * events.fire('element.moved', event);
 *
 * // pass additional arguments to the event
 * events.on('foo', function(event, bar) {
 *   alert(bar);
 * });
 *
 * events.fire({ type: 'foo' }, 'I am bar!');
 *
 * @param {String} [name] the optional event name
 * @param {Object} [event] the event object
 * @param {...Object} additional arguments to be passed to the callback functions
 *
 * @return {Boolean} the events return value, if specified or false if the
 *                   default action was prevented by listeners
 */
EventBus.prototype.fire = function(type, data) {

  var event,
      listeners,
      returnValue,
      args;

  args = slice.call(arguments);

  if (typeof type === 'object') {
    event = type;
    type = event.type;
  }

  if (!type) {
    throw new Error('no event type specified');
  }

  listeners = this._listeners[type];

  if (!listeners) {
    return;
  }

  // we make sure we fire instances of our home made
  // events here. We wrap them only once, though
  if (data instanceof Event) {
    // we are fine, we alread have an event
    event = data;
  } else {
    event = new Event();
    event.init(data);
  }

  // ensure we pass the event as the first parameter
  args[0] = event;

  // original event type (in case we delegate)
  var originalType = event.type;

  // update event type before delegation
  if (type !== originalType) {
    event.type = type;
  }

  try {
    returnValue = this._invokeListeners(event, args, listeners);
  } finally {
    // reset event type after delegation
    if (type !== originalType) {
      event.type = originalType;
    }
  }

  // set the return value to false if the event default
  // got prevented and no other return value exists
  if (returnValue === undefined && event.defaultPrevented) {
    returnValue = false;
  }

  return returnValue;
};


EventBus.prototype.handleError = function(error) {
  return this.fire('error', { error: error }) === false;
};


EventBus.prototype._destroy = function() {
  this._listeners = {};
};

EventBus.prototype._invokeListeners = function(event, args, listeners) {

  var idx,
      listener,
      returnValue;

  for (idx = 0; (listener = listeners[idx]); idx++) {

    // handle stopped propagation
    if (event.cancelBubble) {
      break;
    }

    returnValue = this._invokeListener(event, args, listener);
  }

  return returnValue;
};

EventBus.prototype._invokeListener = function(event, args, listener) {

  var returnValue;

  try {
    // returning false prevents the default action
    returnValue = invokeFunction(listener.callback, args);

    // stop propagation on return value
    if (returnValue !== undefined) {
      event.returnValue = returnValue;
      event.stopPropagation();
    }

    // prevent default on return false
    if (returnValue === false) {
      event.preventDefault();
    }
  } catch (e) {
    if (!this.handleError(e)) {
      console.error('unhandled error in event listener');
      console.error(e.stack);

      throw e;
    }
  }

  return returnValue;
};

/*
 * Add new listener with a certain priority to the list
 * of listeners (for the given event).
 *
 * The semantics of listener registration / listener execution are
 * first register, first serve: New listeners will always be inserted
 * after existing listeners with the same priority.
 *
 * Example: Inserting two listeners with priority 1000 and 1300
 *
 *    * before: [ 1500, 1500, 1000, 1000 ]
 *    * after: [ 1500, 1500, (new=1300), 1000, 1000, (new=1000) ]
 *
 * @param {String} event
 * @param {Object} listener { priority, callback }
 */
EventBus.prototype._addListener = function(event, newListener) {

  var listeners = this._getListeners(event),
      existingListener,
      idx;

  // ensure we order listeners by priority from
  // 0 (high) to n > 0 (low)
  for (idx = 0; (existingListener = listeners[idx]); idx++) {
    if (existingListener.priority < newListener.priority) {

      // prepend newListener at before existingListener
      listeners.splice(idx, 0, newListener);
      return;
    }
  }

  listeners.push(newListener);
};


EventBus.prototype._getListeners = function(name) {
  var listeners = this._listeners[name];

  if (!listeners) {
    this._listeners[name] = listeners = [];
  }

  return listeners;
};


/**
 * A event that is emitted via the event bus.
 */
function Event() { }

module.exports.Event = Event;

Event.prototype.stopPropagation = function() {
  this.cancelBubble = true;
};

Event.prototype.preventDefault = function() {
  this.defaultPrevented = true;
};

Event.prototype.init = function(data) {
  assign(this, data || {});
};


/**
 * Invoke function. Be fast...
 *
 * @param {Function} fn
 * @param {Array<Object>} args
 *
 * @return {Any}
 */
function invokeFunction(fn, args) {
  return fn.apply(null, args);
}

},{"142":142,"241":241,"242":242,"244":244,"250":250}],80:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_(136),
    reduce = _dereq_(139);

var GraphicsUtil = _dereq_(107);

var translate = _dereq_(112).translate;

var domClear = _dereq_(262);

var svgAppend = _dereq_(320),
    svgAttr = _dereq_(322),
    svgClasses = _dereq_(323),
    svgCreate = _dereq_(325),
    svgRemove = _dereq_(328);


/**
 * A factory that creates graphical elements
 *
 * @param {EventBus} eventBus
 * @param {ElementRegistry} elementRegistry
 */
function GraphicsFactory(eventBus, elementRegistry) {
  this._eventBus = eventBus;
  this._elementRegistry = elementRegistry;
}

GraphicsFactory.$inject = [ 'eventBus' , 'elementRegistry' ];

module.exports = GraphicsFactory;


GraphicsFactory.prototype._getChildren = function(element) {

  var gfx = this._elementRegistry.getGraphics(element);

  var childrenGfx;

  // root element
  if (!element.parent) {
    childrenGfx = gfx;
  } else {
    childrenGfx = GraphicsUtil.getChildren(gfx);
    if (!childrenGfx) {
      childrenGfx = svgCreate('g');
      svgClasses(childrenGfx).add('djs-children');

      svgAppend(gfx.parentNode, childrenGfx);
    }
  }

  return childrenGfx;
};

/**
 * Clears the graphical representation of the element and returns the
 * cleared visual (the <g class="djs-visual" /> element).
 */
GraphicsFactory.prototype._clear = function(gfx) {
  var visual = GraphicsUtil.getVisual(gfx);

  domClear(visual);

  return visual;
};

/**
 * Creates a gfx container for shapes and connections
 *
 * The layout is as follows:
 *
 * <g class="djs-group">
 *
 *   <!-- the gfx -->
 *   <g class="djs-element djs-(shape|connection)">
 *     <g class="djs-visual">
 *       <!-- the renderer draws in here -->
 *     </g>
 *
 *     <!-- extensions (overlays, click box, ...) goes here
 *   </g>
 *
 *   <!-- the gfx child nodes -->
 *   <g class="djs-children"></g>
 * </g>
 *
 * @param {Object} parent
 * @param {String} type the type of the element, i.e. shape | connection
 */
GraphicsFactory.prototype._createContainer = function(type, parentGfx) {
  var outerGfx = svgCreate('g');
  svgClasses(outerGfx).add('djs-group');

  svgAppend(parentGfx, outerGfx);

  var gfx = svgCreate('g');
  svgClasses(gfx).add('djs-element');
  svgClasses(gfx).add('djs-' + type);

  svgAppend(outerGfx, gfx);

  // create visual
  var visual = svgCreate('g');
  svgClasses(visual).add('djs-visual');

  svgAppend(gfx, visual);

  return gfx;
};

GraphicsFactory.prototype.create = function(type, element) {
  var childrenGfx = this._getChildren(element.parent);
  return this._createContainer(type, childrenGfx);
};

GraphicsFactory.prototype.updateContainments = function(elements) {

  var self = this,
      elementRegistry = this._elementRegistry,
      parents;

  parents = reduce(elements, function(map, e) {

    if (e.parent) {
      map[e.parent.id] = e.parent;
    }

    return map;
  }, {});

  // update all parents of changed and reorganized their children
  // in the correct order (as indicated in our model)
  forEach(parents, function(parent) {

    var childGfx = self._getChildren(parent),
        children = parent.children;

    if (!children) {
      return;
    }

    forEach(children.slice().reverse(), function(c) {
      var gfx = elementRegistry.getGraphics(c);

      prependTo(gfx.parentNode, childGfx);
    });
  });
};

GraphicsFactory.prototype.drawShape = function(visual, element) {
  var eventBus = this._eventBus;

  return eventBus.fire('render.shape', { gfx: visual, element: element });
};

GraphicsFactory.prototype.getShapePath = function(element) {
  var eventBus = this._eventBus;

  return eventBus.fire('render.getShapePath', element);
};

GraphicsFactory.prototype.drawConnection = function(visual, element) {
  var eventBus = this._eventBus;

  return eventBus.fire('render.connection', { gfx: visual, element: element });
};

GraphicsFactory.prototype.getConnectionPath = function(waypoints) {
  var eventBus = this._eventBus;

  return eventBus.fire('render.getConnectionPath', waypoints);
};

GraphicsFactory.prototype.update = function(type, element, gfx) {
  // Do not update root element
  if (!element.parent) {
    return;
  }

  var visual = this._clear(gfx);

  // redraw
  if (type === 'shape') {
    this.drawShape(visual, element);

    // update positioning
    translate(gfx, element.x, element.y);
  } else
  if (type === 'connection') {
    this.drawConnection(visual, element);
  } else {
    throw new Error('unknown type: ' + type);
  }

  if (element.hidden) {
    svgAttr(gfx, 'display', 'none');
  } else {
    svgAttr(gfx, 'display', 'block');
  }
};

GraphicsFactory.prototype.remove = function(element) {
  var gfx = this._elementRegistry.getGraphics(element);

  // remove
  svgRemove(gfx.parentNode);
};

////////// helpers ///////////

function prependTo(newNode, parentNode) {
  parentNode.insertBefore(newNode, parentNode.firstChild);
}

},{"107":107,"112":112,"136":136,"139":139,"262":262,"320":320,"322":322,"323":323,"325":325,"328":328}],81:[function(_dereq_,module,exports){
module.exports = {
  __depends__: [ _dereq_(85) ],
  __init__: [ 'canvas' ],
  canvas: [ 'type', _dereq_(76) ],
  elementRegistry: [ 'type', _dereq_(78) ],
  elementFactory: [ 'type', _dereq_(77) ],
  eventBus: [ 'type', _dereq_(79) ],
  graphicsFactory: [ 'type', _dereq_(80) ]
};
},{"76":76,"77":77,"78":78,"79":79,"80":80,"85":85}],82:[function(_dereq_,module,exports){
'use strict';

var DEFAULT_RENDER_PRIORITY = 1000;

/**
 * The base implementation of shape and connection renderers.
 *
 * @param {EventBus} eventBus
 * @param {Number} [renderPriority=1000]
 */
function BaseRenderer(eventBus, renderPriority) {
  var self = this;

  renderPriority = renderPriority || DEFAULT_RENDER_PRIORITY;

  eventBus.on([ 'render.shape', 'render.connection' ], renderPriority, function(evt, context) {
    var type = evt.type,
        element = context.element,
        visuals = context.gfx;

    if (self.canRender(element)) {
      if (type === 'render.shape') {
        return self.drawShape(visuals, element);
      } else {
        return self.drawConnection(visuals, element);
      }
    }
  });

  eventBus.on([ 'render.getShapePath', 'render.getConnectionPath'], renderPriority, function(evt, element) {
    if (self.canRender(element)) {
      if (evt.type === 'render.getShapePath') {
        return self.getShapePath(element);
      } else {
        return self.getConnectionPath(element);
      }
    }
  });
}

/**
 * Should check whether *this* renderer can render
 * the element/connection.
 *
 * @param {element} element
 *
 * @returns {Boolean}
 */
BaseRenderer.prototype.canRender = function() {};

/**
 * Provides the shape's snap svg element to be drawn on the `canvas`.
 *
 * @param {djs.Graphics} visuals
 * @param {Shape} shape
 *
 * @returns {Snap.svg} [returns a Snap.svg paper element ]
 */
BaseRenderer.prototype.drawShape = function() {};

/**
 * Provides the shape's snap svg element to be drawn on the `canvas`.
 *
 * @param {djs.Graphics} visuals
 * @param {Connection} connection
 *
 * @returns {Snap.svg} [returns a Snap.svg paper element ]
 */
BaseRenderer.prototype.drawConnection = function() {};

/**
 * Gets the SVG path of a shape that represents it's visual bounds.
 *
 * @param {Shape} shape
 *
 * @return {string} svg path
 */
BaseRenderer.prototype.getShapePath = function() {};

/**
 * Gets the SVG path of a connection that represents it's visual bounds.
 *
 * @param {Connection} connection
 *
 * @return {string} svg path
 */
BaseRenderer.prototype.getConnectionPath = function() {};

module.exports = BaseRenderer;

},{}],83:[function(_dereq_,module,exports){
'use strict';

var inherits = _dereq_(126);

var BaseRenderer = _dereq_(82);

var renderUtil = _dereq_(111);

var componentsToPath = renderUtil.componentsToPath,
    createLine = renderUtil.createLine;

var svgAppend = _dereq_(320),
    svgAttr = _dereq_(322),
    svgCreate = _dereq_(325);

// apply default renderer with lowest possible priority
// so that it only kicks in if noone else could render
var DEFAULT_RENDER_PRIORITY = 1;

/**
 * The default renderer used for shapes and connections.
 *
 * @param {EventBus} eventBus
 * @param {Styles} styles
 */
function DefaultRenderer(eventBus, styles) {
  //
  BaseRenderer.call(this, eventBus, DEFAULT_RENDER_PRIORITY);

  this.CONNECTION_STYLE = styles.style([ 'no-fill' ], { strokeWidth: 5, stroke: 'fuchsia' });
  this.SHAPE_STYLE = styles.style({ fill: 'white', stroke: 'fuchsia', strokeWidth: 2 });
}

inherits(DefaultRenderer, BaseRenderer);


DefaultRenderer.prototype.canRender = function() {
  return true;
};

DefaultRenderer.prototype.drawShape = function drawShape(visuals, element) {

  var rect = svgCreate('rect');
  svgAttr(rect, {
    x: 0,
    y: 0,
    width: element.width || 0,
    height: element.height || 0
  });
  svgAttr(rect, this.SHAPE_STYLE);

  svgAppend(visuals, rect);

  return rect;
};

DefaultRenderer.prototype.drawConnection = function drawConnection(visuals, connection) {

  var line = createLine(connection.waypoints, this.CONNECTION_STYLE);
  svgAppend(visuals, line);

  return line;
};

DefaultRenderer.prototype.getShapePath = function getShapePath(shape) {

  var x = shape.x,
      y = shape.y,
      width = shape.width,
      height = shape.height;

  var shapePath = [
    ['M', x, y],
    ['l', width, 0],
    ['l', 0, height],
    ['l', -width, 0],
    ['z']
  ];

  return componentsToPath(shapePath);
};

DefaultRenderer.prototype.getConnectionPath = function getConnectionPath(connection) {
  var waypoints = connection.waypoints;

  var idx, point, connectionPath = [];

  for (idx = 0; (point = waypoints[idx]); idx++) {

    // take invisible docking into account
    // when creating the path
    point = point.original || point;

    connectionPath.push([ idx === 0 ? 'M' : 'L', point.x, point.y ]);
  }

  return componentsToPath(connectionPath);
};


DefaultRenderer.$inject = [ 'eventBus', 'styles' ];

module.exports = DefaultRenderer;

},{"111":111,"126":126,"320":320,"322":322,"325":325,"82":82}],84:[function(_dereq_,module,exports){
'use strict';

var isArray = _dereq_(241),
    assign = _dereq_(250),
    reduce = _dereq_(139);


/**
 * A component that manages shape styles
 */
function Styles() {

  var defaultTraits = {

    'no-fill': {
      fill: 'none'
    },
    'no-border': {
      strokeOpacity: 0.0
    },
    'no-events': {
      pointerEvents: 'none'
    }
  };

  var self = this;

  /**
   * Builds a style definition from a className, a list of traits and an object of additional attributes.
   *
   * @param  {String} className
   * @param  {Array<String>} traits
   * @param  {Object} additionalAttrs
   *
   * @return {Object} the style defintion
   */
  this.cls = function(className, traits, additionalAttrs) {
    var attrs = this.style(traits, additionalAttrs);

    return assign(attrs, { 'class': className });
  };

  /**
   * Builds a style definition from a list of traits and an object of additional attributes.
   *
   * @param  {Array<String>} traits
   * @param  {Object} additionalAttrs
   *
   * @return {Object} the style defintion
   */
  this.style = function(traits, additionalAttrs) {

    if (!isArray(traits) && !additionalAttrs) {
      additionalAttrs = traits;
      traits = [];
    }

    var attrs = reduce(traits, function(attrs, t) {
      return assign(attrs, defaultTraits[t] || {});
    }, {});

    return additionalAttrs ? assign(attrs, additionalAttrs) : attrs;
  };

  this.computeStyle = function(custom, traits, defaultStyles) {
    if (!isArray(traits)) {
      defaultStyles = traits;
      traits = [];
    }

    return self.style(traits || [], assign({}, defaultStyles, custom || {}));
  };
}

module.exports = Styles;

},{"139":139,"241":241,"250":250}],85:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'defaultRenderer' ],
  defaultRenderer: [ 'type', _dereq_(83) ],
  styles: [ 'type', _dereq_(84) ]
};

},{"83":83,"84":84}],86:[function(_dereq_,module,exports){
'use strict';

var isFunction = _dereq_(242),
    isArray = _dereq_(241),
    forEach = _dereq_(136),

    domDelegate = _dereq_(263),
    domEvent = _dereq_(265),
    domAttr = _dereq_(260),
    domQuery = _dereq_(266),
    domClasses = _dereq_(261),
    domify = _dereq_(264);


var entrySelector = '.entry';


/**
 * A context pad that displays element specific, contextual actions next
 * to a diagram element.
 *
 * @param {EventBus} eventBus
 * @param {Overlays} overlays
 */
function ContextPad(eventBus, overlays) {

  this._providers = [];

  this._eventBus = eventBus;
  this._overlays = overlays;

  this._current = null;

  this._init();
}

ContextPad.$inject = [ 'eventBus', 'overlays' ];

module.exports = ContextPad;


/**
 * Registers events needed for interaction with other components
 */
ContextPad.prototype._init = function() {

  var eventBus = this._eventBus;

  var self = this;

  eventBus.on('selection.changed', function(e) {

    var selection = e.newSelection;

    if (selection.length === 1) {
      self.open(selection[0]);
    } else {
      self.close();
    }
  });

  eventBus.on('elements.delete', function(event) {
    var elements = event.elements;

    forEach(elements, function(e) {
      if (self.isOpen(e)) {
        self.close();
      }
    });
  });

  eventBus.on('element.changed', function(event) {
    var element = event.element,
        current = self._current;

    // force reopen if element for which we are currently opened changed
    if (current && current.element === element) {
      self.open(element, true);
    }
  });
};


/**
 * Register a provider with the context pad
 *
 * @param  {ContextPadProvider} provider
 */
ContextPad.prototype.registerProvider = function(provider) {
  this._providers.push(provider);
};


/**
 * Returns the context pad entries for a given element
 *
 * @param {djs.element.Base} element
 *
 * @return {Array<ContextPadEntryDescriptor>} list of entries
 */
ContextPad.prototype.getEntries = function(element) {
  var entries = {};

  // loop through all providers and their entries.
  // group entries by id so that overriding an entry is possible
  forEach(this._providers, function(provider) {
    var e = provider.getContextPadEntries(element);

    forEach(e, function(entry, id) {
      entries[id] = entry;
    });
  });

  return entries;
};


/**
 * Trigger an action available on the opened context pad
 *
 * @param  {String} action
 * @param  {Event} event
 * @param  {Boolean} [autoActivate=false]
 */
ContextPad.prototype.trigger = function(action, event, autoActivate) {

  var element = this._current.element,
      entries = this._current.entries,
      entry,
      handler,
      originalEvent,
      button = event.delegateTarget || event.target;

  if (!button) {
    return event.preventDefault();
  }

  entry = entries[domAttr(button, 'data-action')];
  handler = entry.action;

  originalEvent = event.originalEvent || event;

  // simple action (via callback function)
  if (isFunction(handler)) {
    if (action === 'click') {
      return handler(originalEvent, element, autoActivate);
    }
  } else {
    if (handler[action]) {
      return handler[action](originalEvent, element, autoActivate);
    }
  }

  // silence other actions
  event.preventDefault();
};


/**
 * Open the context pad for the given element
 *
 * @param {djs.model.Base} element
 * @param {Boolean} force if true, force reopening the context pad
 */
ContextPad.prototype.open = function(element, force) {
  if (!force && this.isOpen(element)) {
    return;
  }

  this.close();
  this._updateAndOpen(element);
};


ContextPad.prototype._updateAndOpen = function(element) {

  var entries = this.getEntries(element),
      pad = this.getPad(element),
      html = pad.html;

  forEach(entries, function(entry, id) {
    var grouping = entry.group || 'default',
        control = domify(entry.html || '<div class="entry" draggable="true"></div>'),
        container;

    domAttr(control, 'data-action', id);

    container = domQuery('[data-group=' + grouping + ']', html);
    if (!container) {
      container = domify('<div class="group" data-group="' + grouping + '"></div>');
      html.appendChild(container);
    }

    container.appendChild(control);

    if (entry.className) {
      addClasses(control, entry.className);
    }

    if (entry.title) {
      domAttr(control, 'title', entry.title);
    }

    if (entry.imageUrl) {
      control.appendChild(domify('<img src="' + entry.imageUrl + '">'));
    }
  });

  domClasses(html).add('open');

  this._current = {
    element: element,
    pad: pad,
    entries: entries
  };

  this._eventBus.fire('contextPad.open', { current: this._current });
};


ContextPad.prototype.getPad = function(element) {
  if (this.isOpen()) {
    return this._current.pad;
  }

  var self = this;

  var overlays = this._overlays;

  var html = domify('<div class="djs-context-pad"></div>');

  domDelegate.bind(html, entrySelector, 'click', function(event) {
    self.trigger('click', event);
  });

  domDelegate.bind(html, entrySelector, 'dragstart', function(event) {
    self.trigger('dragstart', event);
  });

  // stop propagation of mouse events
  domEvent.bind(html, 'mousedown', function(event) {
    event.stopPropagation();
  });

  this._overlayId = overlays.add(element, 'context-pad', {
    position: {
      right: -9,
      top: -6
    },
    html: html
  });

  var pad = overlays.get(this._overlayId);

  this._eventBus.fire('contextPad.create', { element: element, pad: pad });

  return pad;
};


/**
 * Close the context pad
 */
ContextPad.prototype.close = function() {
  if (!this.isOpen()) {
    return;
  }

  this._overlays.remove(this._overlayId);

  this._overlayId = null;

  this._eventBus.fire('contextPad.close', { current: this._current });

  this._current = null;
};

/**
 * Check if pad is open. If element is given, will check
 * if pad is opened with given element.
 *
 * @param {Element} element
 * @return {Boolean}
 */
ContextPad.prototype.isOpen = function(element) {
  return !!this._current && (!element ? true : this._current.element === element);
};




////////// helpers /////////////////////////////

function addClasses(element, classNames) {

  var classes = domClasses(element);

  var actualClassNames = isArray(classNames) ? classNames : classNames.split(/\s+/g);
  actualClassNames.forEach(function(cls) {
    classes.add(cls);
  });
}
},{"136":136,"241":241,"242":242,"260":260,"261":261,"263":263,"264":264,"265":265,"266":266}],87:[function(_dereq_,module,exports){
module.exports = {
  __depends__: [
    _dereq_(89),
    _dereq_(93)
  ],
  contextPad: [ 'type', _dereq_(86) ]
};
},{"86":86,"89":89,"93":93}],88:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_(136),
    domDelegate = _dereq_(263);

var isPrimaryButton = _dereq_(109).isPrimaryButton;

var svgAppend = _dereq_(320),
    svgAttr = _dereq_(322),
    svgCreate = _dereq_(325);

var domQuery = _dereq_(266);

var renderUtil = _dereq_(111);

var createLine = renderUtil.createLine,
    updateLine = renderUtil.updateLine;

var LOW_PRIORITY = 500;

/**
 * A plugin that provides interaction events for diagram elements.
 *
 * It emits the following events:
 *
 *   * element.hover
 *   * element.out
 *   * element.click
 *   * element.dblclick
 *   * element.mousedown
 *
 * Each event is a tuple { element, gfx, originalEvent }.
 *
 * Canceling the event via Event#preventDefault() prevents the original DOM operation.
 *
 * @param {EventBus} eventBus
 */
function InteractionEvents(eventBus, elementRegistry, styles) {

  var HIT_STYLE = styles.cls('djs-hit', [ 'no-fill', 'no-border' ], {
    stroke: 'white',
    strokeWidth: 15
  });

  /**
   * Fire an interaction event.
   *
   * @param {String} type local event name, e.g. element.click.
   * @param {DOMEvent} event native event
   * @param {djs.model.Base} [element] the diagram element to emit the event on;
   *                                   defaults to the event target
   */
  function fire(type, event, element) {

    // only react on left mouse button interactions
    // for interaction events
    if (!isPrimaryButton(event)) {
      return;
    }

    var target, gfx, returnValue;

    if (!element) {
      target = event.delegateTarget || event.target;

      if (target) {
        gfx = target;
        element = elementRegistry.get(gfx);
      }
    } else {
      gfx = elementRegistry.getGraphics(element);
    }

    if (!gfx || !element) {
      return;
    }

    returnValue = eventBus.fire(type, { element: element, gfx: gfx, originalEvent: event });

    if (returnValue === false) {
      event.stopPropagation();
      event.preventDefault();
    }
  }

  // TODO(nikku): document this
  var handlers = {};

  function mouseHandler(type) {

    var fn = handlers[type];

    if (!fn) {
      fn = handlers[type] = function(event) {
        fire(type, event);
      };
    }

    return fn;
  }

  var bindings = {
    mouseover: 'element.hover',
    mouseout: 'element.out',
    click: 'element.click',
    dblclick: 'element.dblclick',
    mousedown: 'element.mousedown',
    mouseup: 'element.mouseup'
  };


  ///// manual event trigger

  /**
   * Trigger an interaction event (based on a native dom event)
   * on the target shape or connection.
   *
   * @param {String} eventName the name of the triggered DOM event
   * @param {MouseEvent} event
   * @param {djs.model.Base} targetElement
   */
  function triggerMouseEvent(eventName, event, targetElement) {

    // i.e. element.mousedown...
    var localEventName = bindings[eventName];

    if (!localEventName) {
      throw new Error('unmapped DOM event name <' + eventName + '>');
    }

    return fire(localEventName, event, targetElement);
  }


  var elementSelector = 'svg, .djs-element';

  ///// event registration

  function registerEvent(node, event, localEvent) {
    var handler = mouseHandler(localEvent);
    handler.$delegate = domDelegate.bind(node, elementSelector, event, handler);
  }

  function unregisterEvent(node, event, localEvent) {
    domDelegate.unbind(node, event, mouseHandler(localEvent).$delegate);
  }

  function registerEvents(svg) {
    forEach(bindings, function(val, key) {
      registerEvent(svg, key, val);
    });
  }

  function unregisterEvents(svg) {
    forEach(bindings, function(val, key) {
      unregisterEvent(svg, key, val);
    });
  }

  eventBus.on('canvas.destroy', function(event) {
    unregisterEvents(event.svg);
  });

  eventBus.on('canvas.init', function(event) {
    registerEvents(event.svg);
  });


  eventBus.on([ 'shape.added', 'connection.added' ], function(event) {
    var element = event.element,
        gfx = event.gfx,
        hit;

    if (element.waypoints) {
      hit = createLine(element.waypoints);
    } else {
      hit = svgCreate('rect');
      svgAttr(hit, {
        x: 0,
        y: 0,
        width: element.width,
        height: element.height
      });
    }

    svgAttr(hit, HIT_STYLE);

    svgAppend(gfx, hit);
  });

  // Update djs-hit on change.
  // A low priortity is necessary, because djs-hit of labels has to be updated
  // after the label bounds have been updated in the renderer.
  eventBus.on('shape.changed', LOW_PRIORITY, function(event) {

    var element = event.element,
        gfx = event.gfx,
        hit = domQuery('.djs-hit', gfx);

    svgAttr(hit, {
      width: element.width,
      height: element.height
    });
  });

  eventBus.on('connection.changed', function(event) {

    var element = event.element,
        gfx = event.gfx,
        hit = domQuery('.djs-hit', gfx);

    updateLine(hit, element.waypoints);
  });


  // API

  this.fire = fire;

  this.triggerMouseEvent = triggerMouseEvent;

  this.mouseHandler = mouseHandler;

  this.registerEvent = registerEvent;
  this.unregisterEvent = unregisterEvent;
}


InteractionEvents.$inject = [ 'eventBus', 'elementRegistry', 'styles' ];

module.exports = InteractionEvents;


/**
 * An event indicating that the mouse hovered over an element
 *
 * @event element.hover
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {SVGElement} gfx
 * @property {Event} originalEvent
 */

/**
 * An event indicating that the mouse has left an element
 *
 * @event element.out
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {SVGElement} gfx
 * @property {Event} originalEvent
 */

/**
 * An event indicating that the mouse has clicked an element
 *
 * @event element.click
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {SVGElement} gfx
 * @property {Event} originalEvent
 */

/**
 * An event indicating that the mouse has double clicked an element
 *
 * @event element.dblclick
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {SVGElement} gfx
 * @property {Event} originalEvent
 */

/**
 * An event indicating that the mouse has gone down on an element.
 *
 * @event element.mousedown
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {SVGElement} gfx
 * @property {Event} originalEvent
 */

/**
 * An event indicating that the mouse has gone up on an element.
 *
 * @event element.mouseup
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {SVGElement} gfx
 * @property {Event} originalEvent
 */

},{"109":109,"111":111,"136":136,"263":263,"266":266,"320":320,"322":322,"325":325}],89:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'interactionEvents' ],
  interactionEvents: [ 'type', _dereq_(88) ]
};
},{"88":88}],90:[function(_dereq_,module,exports){
'use strict';

var getBBox = _dereq_(105).getBBox;

var LOW_PRIORITY = 500;

var svgAppend = _dereq_(320),
    svgAttr = _dereq_(322),
    svgCreate = _dereq_(325);

var domQuery = _dereq_(266);

var assign = _dereq_(250);


/**
 * @class
 *
 * A plugin that adds an outline to shapes and connections that may be activated and styled
 * via CSS classes.
 *
 * @param {EventBus} eventBus
 * @param {Styles} styles
 * @param {ElementRegistry} elementRegistry
 */
function Outline(eventBus, styles, elementRegistry) {

  this.offset = 6;

  var OUTLINE_STYLE = styles.cls('djs-outline', [ 'no-fill' ]);

  var self = this;

  function createOutline(gfx, bounds) {
    var outline = svgCreate('rect');

    svgAttr(outline, assign({
      x: 10,
      y: 10,
      width: 100,
      height: 100
    }, OUTLINE_STYLE));

    svgAppend(gfx, outline);

    return outline;
  }

  // A low priortity is necessary, because outlines of labels have to be updated
  // after the label bounds have been updated in the renderer.
  eventBus.on([ 'shape.added', 'shape.changed' ], LOW_PRIORITY, function(event) {
    var element = event.element,
        gfx     = event.gfx;

    var outline = domQuery('.djs-outline', gfx);

    if (!outline) {
      outline = createOutline(gfx, element);
    }

    self.updateShapeOutline(outline, element);
  });

  eventBus.on([ 'connection.added', 'connection.changed' ], function(event) {
    var element = event.element,
        gfx     = event.gfx;

    var outline = domQuery('.djs-outline', gfx);

    if (!outline) {
      outline = createOutline(gfx, element);
    }

    self.updateConnectionOutline(outline, element);
  });
}


/**
 * Updates the outline of a shape respecting the dimension of the
 * element and an outline offset.
 *
 * @param  {SVGElement} outline
 * @param  {djs.model.Base} element
 */
Outline.prototype.updateShapeOutline = function(outline, element) {

  svgAttr(outline, {
    x: -this.offset,
    y: -this.offset,
    width: element.width + this.offset * 2,
    height: element.height + this.offset * 2
  });

};


/**
 * Updates the outline of a connection respecting the bounding box of
 * the connection and an outline offset.
 *
 * @param  {SVGElement} outline
 * @param  {djs.model.Base} element
 */
Outline.prototype.updateConnectionOutline = function(outline, connection) {

  var bbox = getBBox(connection);

  svgAttr(outline, {
    x: bbox.x - this.offset,
    y: bbox.y - this.offset,
    width: bbox.width + this.offset * 2,
    height: bbox.height + this.offset * 2
  });

};


Outline.$inject = ['eventBus', 'styles', 'elementRegistry'];

module.exports = Outline;

},{"105":105,"250":250,"266":266,"320":320,"322":322,"325":325}],91:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  __init__: [ 'outline' ],
  outline: [ 'type', _dereq_(90) ]
};
},{"90":90}],92:[function(_dereq_,module,exports){
'use strict';

var isArray = _dereq_(241),
    isString = _dereq_(247),
    isObject = _dereq_(245),
    assign = _dereq_(250),
    forEach = _dereq_(136),
    find = _dereq_(135),
    filter = _dereq_(134);

var domify = _dereq_(264),
    domClasses = _dereq_(261),
    domAttr = _dereq_(260),
    domRemove = _dereq_(267),
    domClear = _dereq_(262);

var getBBox = _dereq_(105).getBBox;

// document wide unique overlay ids
var ids = new (_dereq_(108))('ov');

var LOW_PRIORITY = 500;


function createRoot(parent) {
  var root = domify('<div class="djs-overlay-container" style="position: absolute; width: 0; height: 0;" />');
  parent.insertBefore(root, parent.firstChild);

  return root;
}


function setPosition(el, x, y) {
  assign(el.style, { left: x + 'px', top: y + 'px' });
}

function setVisible(el, visible) {
  el.style.display = visible === false ? 'none' : '';
}

/**
 * A service that allows users to attach overlays to diagram elements.
 *
 * The overlay service will take care of overlay positioning during updates.
 *
 * @example
 *
 * // add a pink badge on the top left of the shape
 * overlays.add(someShape, {
 *   position: {
 *     top: -5,
 *     left: -5
 *   },
 *   html: '<div style="width: 10px; background: fuchsia; color: white;">0</div>'
 * });
 *
 * // or add via shape id
 *
 * overlays.add('some-element-id', {
 *   position: {
 *     top: -5,
 *     left: -5
 *   }
 *   html: '<div style="width: 10px; background: fuchsia; color: white;">0</div>'
 * });
 *
 * // or add with optional type
 *
 * overlays.add(someShape, 'badge', {
 *   position: {
 *     top: -5,
 *     left: -5
 *   }
 *   html: '<div style="width: 10px; background: fuchsia; color: white;">0</div>'
 * });
 *
 *
 * // remove an overlay
 *
 * var id = overlays.add(...);
 * overlays.remove(id);
 *
 * @param {EventBus} eventBus
 * @param {Canvas} canvas
 * @param {ElementRegistry} elementRegistry
 */
function Overlays(eventBus, canvas, elementRegistry) {

  this._eventBus = eventBus;
  this._canvas = canvas;
  this._elementRegistry = elementRegistry;

  this._ids = ids;

  this._overlayDefaults = {
    show: {
      minZoom: 0.7,
      maxZoom: 5.0
    }
  };

  /**
   * Mapping overlayId -> overlay
   */
  this._overlays = {};

  /**
   * Mapping elementId -> overlay container
   */
  this._overlayContainers = [];

  // root html element for all overlays
  this._overlayRoot = createRoot(canvas.getContainer());

  this._init();
}


Overlays.$inject = [ 'eventBus', 'canvas', 'elementRegistry' ];

module.exports = Overlays;


/**
 * Returns the overlay with the specified id or a list of overlays
 * for an element with a given type.
 *
 * @example
 *
 * // return the single overlay with the given id
 * overlays.get('some-id');
 *
 * // return all overlays for the shape
 * overlays.get({ element: someShape });
 *
 * // return all overlays on shape with type 'badge'
 * overlays.get({ element: someShape, type: 'badge' });
 *
 * // shape can also be specified as id
 * overlays.get({ element: 'element-id', type: 'badge' });
 *
 *
 * @param {Object} search
 * @param {String} [search.id]
 * @param {String|djs.model.Base} [search.element]
 * @param {String} [search.type]
 *
 * @return {Object|Array<Object>} the overlay(s)
 */
Overlays.prototype.get = function(search) {

  if (isString(search)) {
    search = { id: search };
  }

  if (isString(search.element)) {
    search.element = this._elementRegistry.get(search.element);
  }

  if (search.element) {
    var container = this._getOverlayContainer(search.element, true);

    // return a list of overlays when searching by element (+type)
    if (container) {
      return search.type ? filter(container.overlays, { type: search.type }) : container.overlays.slice();
    } else {
      return [];
    }
  } else
  if (search.type) {
    return filter(this._overlays, { type: search.type });
  } else {
    // return single element when searching by id
    return search.id ? this._overlays[search.id] : null;
  }
};

/**
 * Adds a HTML overlay to an element.
 *
 * @param {String|djs.model.Base}   element   attach overlay to this shape
 * @param {String}                  [type]    optional type to assign to the overlay
 * @param {Object}                  overlay   the overlay configuration
 *
 * @param {String|DOMElement}       overlay.html                 html element to use as an overlay
 * @param {Object}                  [overlay.show]               show configuration
 * @param {Number}                  [overlay.show.minZoom]       minimal zoom level to show the overlay
 * @param {Number}                  [overlay.show.maxZoom]       maximum zoom level to show the overlay
 * @param {Object}                  overlay.position             where to attach the overlay
 * @param {Number}                  [overlay.position.left]      relative to element bbox left attachment
 * @param {Number}                  [overlay.position.top]       relative to element bbox top attachment
 * @param {Number}                  [overlay.position.bottom]    relative to element bbox bottom attachment
 * @param {Number}                  [overlay.position.right]     relative to element bbox right attachment
 *
 * @return {String}                 id that may be used to reference the overlay for update or removal
 */
Overlays.prototype.add = function(element, type, overlay) {

  if (isObject(type)) {
    overlay = type;
    type = null;
  }

  if (!element.id) {
    element = this._elementRegistry.get(element);
  }

  if (!overlay.position) {
    throw new Error('must specifiy overlay position');
  }

  if (!overlay.html) {
    throw new Error('must specifiy overlay html');
  }

  if (!element) {
    throw new Error('invalid element specified');
  }

  var id = this._ids.next();

  overlay = assign({}, this._overlayDefaults, overlay, {
    id: id,
    type: type,
    element: element,
    html: overlay.html
  });

  this._addOverlay(overlay);

  return id;
};


/**
 * Remove an overlay with the given id or all overlays matching the given filter.
 *
 * @see Overlays#get for filter options.
 *
 * @param {String} [id]
 * @param {Object} [filter]
 */
Overlays.prototype.remove = function(filter) {

  var overlays = this.get(filter) || [];

  if (!isArray(overlays)) {
    overlays = [ overlays ];
  }

  var self = this;

  forEach(overlays, function(overlay) {

    var container = self._getOverlayContainer(overlay.element, true);

    if (overlay) {
      domRemove(overlay.html);
      domRemove(overlay.htmlContainer);

      delete overlay.htmlContainer;
      delete overlay.element;

      delete self._overlays[overlay.id];
    }

    if (container) {
      var idx = container.overlays.indexOf(overlay);
      if (idx !== -1) {
        container.overlays.splice(idx, 1);
      }
    }
  });

};


Overlays.prototype.show = function() {
  setVisible(this._overlayRoot);
};


Overlays.prototype.hide = function() {
  setVisible(this._overlayRoot, false);
};

Overlays.prototype.clear = function() {
  this._overlays = {};

  this._overlayContainers = [];

  domClear(this._overlayRoot);
};

Overlays.prototype._updateOverlayContainer = function(container) {
  var element = container.element,
      html = container.html;

  // update container left,top according to the elements x,y coordinates
  // this ensures we can attach child elements relative to this container

  var x = element.x,
      y = element.y;

  if (element.waypoints) {
    var bbox = getBBox(element);
    x = bbox.x;
    y = bbox.y;
  }

  setPosition(html, x, y);

  domAttr(container.html, 'data-container-id', element.id);
};


Overlays.prototype._updateOverlay = function(overlay) {

  var position = overlay.position,
      htmlContainer = overlay.htmlContainer,
      element = overlay.element;

  // update overlay html relative to shape because
  // it is already positioned on the element

  // update relative
  var left = position.left,
      top = position.top;

  if (position.right !== undefined) {

    var width;

    if (element.waypoints) {
      width = getBBox(element).width;
    } else {
      width = element.width;
    }

    left = position.right * -1 + width;
  }

  if (position.bottom !== undefined) {

    var height;

    if (element.waypoints) {
      height = getBBox(element).height;
    } else {
      height = element.height;
    }

    top = position.bottom * -1 + height;
  }

  setPosition(htmlContainer, left || 0, top || 0);
};

Overlays.prototype._createOverlayContainer = function(element) {
  var html = domify('<div class="djs-overlays" style="position: absolute" />');

  this._overlayRoot.appendChild(html);

  var container = {
    html: html,
    element: element,
    overlays: []
  };

  this._updateOverlayContainer(container);

  this._overlayContainers.push(container);

  return container;
};


Overlays.prototype._updateRoot = function(viewbox) {
  var a = viewbox.scale || 1;
  var d = viewbox.scale || 1;

  var matrix = 'matrix(' + a + ',0,0,' + d + ',' + (-1 * viewbox.x * a) + ',' + (-1 * viewbox.y * d) + ')';

  this._overlayRoot.style.transform = matrix;
  this._overlayRoot.style['-ms-transform'] = matrix;
  this._overlayRoot.style['-webkit-transform'] = matrix;
};


Overlays.prototype._getOverlayContainer = function(element, raw) {
  var container = find(this._overlayContainers, function(c) {
    return c.element === element;
  });


  if (!container && !raw) {
    return this._createOverlayContainer(element);
  }

  return container;
};





Overlays.prototype._addOverlay = function(overlay) {

  var id = overlay.id,
      element = overlay.element,
      html = overlay.html,
      htmlContainer,
      overlayContainer;

  // unwrap jquery (for those who need it)
  if (html.get && html.constructor.prototype.jquery) {
    html = html.get(0);
  }

  // create proper html elements from
  // overlay HTML strings
  if (isString(html)) {
    html = domify(html);
  }

  overlayContainer = this._getOverlayContainer(element);

  htmlContainer = domify('<div class="djs-overlay" data-overlay-id="' + id + '" style="position: absolute">');

  htmlContainer.appendChild(html);

  if (overlay.type) {
    domClasses(htmlContainer).add('djs-overlay-' + overlay.type);
  }

  overlay.htmlContainer = htmlContainer;

  overlayContainer.overlays.push(overlay);
  overlayContainer.html.appendChild(htmlContainer);

  this._overlays[id] = overlay;

  this._updateOverlay(overlay);
  this._updateOverlayVisibilty(overlay, this._canvas.viewbox());
};

Overlays.prototype._updateOverlayVisibilty = function(overlay, viewbox) {
  var show = overlay.show,
      htmlContainer = overlay.htmlContainer,
      visible = true;

  if (show) {
    if (show.minZoom > viewbox.scale ||
        show.maxZoom < viewbox.scale) {
      visible = false;
    }

    setVisible(htmlContainer, visible);
  }
};

Overlays.prototype._updateOverlaysVisibilty = function(viewbox) {

  var self = this;

  forEach(this._overlays, function(overlay) {
    self._updateOverlayVisibilty(overlay, viewbox);
  });
};


Overlays.prototype._init = function() {

  var eventBus = this._eventBus;

  var self = this;


  // scroll/zoom integration

  function updateViewbox(viewbox) {
    self._updateRoot(viewbox);
    self._updateOverlaysVisibilty(viewbox);

    self.show();
  }

  eventBus.on('canvas.viewbox.changing', function(event) {
    self.hide();
  });

  eventBus.on('canvas.viewbox.changed', function(event) {
    updateViewbox(event.viewbox);
  });


  // remove integration

  eventBus.on([ 'shape.remove', 'connection.remove' ], function(e) {
    var element = e.element;
    var overlays = self.get({ element: element });

    forEach(overlays, function(o) {
      self.remove(o.id);
    });

    var container = self._getOverlayContainer(element);

    if (container) {
      domRemove(container.html);
      var i = self._overlayContainers.indexOf(container);
      if (i !== -1) {
        self._overlayContainers.splice(i, 1);
      }
    }
  });


  // move integration

  eventBus.on('element.changed', LOW_PRIORITY, function(e) {
    var element = e.element;

    var container = self._getOverlayContainer(element, true);

    if (container) {
      forEach(container.overlays, function(overlay) {
        self._updateOverlay(overlay);
      });

      self._updateOverlayContainer(container);
    }
  });


  // marker integration, simply add them on the overlays as classes, too.

  eventBus.on('element.marker.update', function(e) {
    var container = self._getOverlayContainer(e.element, true);
    if (container) {
      domClasses(container.html)[e.add ? 'add' : 'remove'](e.marker);
    }
  });


  // clear overlays with diagram

  eventBus.on('diagram.clear', this.clear, this);
};

},{"105":105,"108":108,"134":134,"135":135,"136":136,"241":241,"245":245,"247":247,"250":250,"260":260,"261":261,"262":262,"264":264,"267":267}],93:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'overlays' ],
  overlays: [ 'type', _dereq_(92) ]
};
},{"92":92}],94:[function(_dereq_,module,exports){

'use strict';

var inherits = _dereq_(126);

var CommandInterceptor = _dereq_(75);

/**
 * A basic provider that may be extended to implement modeling rules.
 *
 * Extensions should implement the init method to actually add their custom
 * modeling checks. Checks may be added via the #addRule(action, fn) method.
 *
 * @param {EventBus} eventBus
 */
function RuleProvider(eventBus) {
  CommandInterceptor.call(this, eventBus);

  this.init();
}

RuleProvider.$inject = [ 'eventBus' ];

inherits(RuleProvider, CommandInterceptor);

module.exports = RuleProvider;


/**
 * Adds a modeling rule for the given action, implemented through
 * a callback function.
 *
 * The function will receive the modeling specific action context
 * to perform its check. It must return `false` to disallow the
 * action from happening or `true` to allow the action.
 *
 * A rule provider may pass over the evaluation to lower priority
 * rules by returning return nothing (or <code>undefined</code>).
 *
 * @example
 *
 * ResizableRules.prototype.init = function() {
 *
 *   \/**
 *    * Return `true`, `false` or nothing to denote
 *    * _allowed_, _not allowed_ and _continue evaluating_.
 *    *\/
 *   this.addRule('shape.resize', function(context) {
 *
 *     var shape = context.shape;
 *
 *     if (!context.newBounds) {
 *       // check general resizability
 *       if (!shape.resizable) {
 *         return false;
 *       }
 *
 *       // not returning anything (read: undefined)
 *       // will continue the evaluation of other rules
 *       // (with lower priority)
 *       return;
 *     } else {
 *       // element must have minimum size of 10*10 points
 *       return context.newBounds.width > 10 && context.newBounds.height > 10;
 *     }
 *   });
 * };
 *
 * @param {String|Array<String>} actions the identifier for the modeling action to check
 * @param {Number} [priority] the priority at which this rule is being applied
 * @param {Function} fn the callback function that performs the actual check
 */
RuleProvider.prototype.addRule = function(actions, priority, fn) {

  var self = this;

  if (typeof actions === 'string') {
    actions = [ actions ];
  }

  actions.forEach(function(action) {

    self.canExecute(action, priority, function(context, action, event) {
      return fn(context);
    }, true);
  });
};

/**
 * Implement this method to add new rules during provider initialization.
 */
RuleProvider.prototype.init = function() {};
},{"126":126,"75":75}],95:[function(_dereq_,module,exports){
'use strict';

/**
 * A service that provides rules for certain diagram actions.
 *
 * The default implementation will hook into the {@link CommandStack}
 * to perform the actual rule evaluation. Make sure to provide the
 * `commandStack` service with this module if you plan to use it.
 *
 * Together with this implementation you may use the {@link RuleProvider}
 * to implement your own rule checkers.
 *
 * This module is ment to be easily replaced, thus the tiny foot print.
 *
 * @param {Injector} injector
 */
function Rules(injector) {
  this._commandStack = injector.get('commandStack', false);
}

Rules.$inject = [ 'injector' ];

module.exports = Rules;


/**
 * Returns whether or not a given modeling action can be executed
 * in the specified context.
 *
 * This implementation will respond with allow unless anyone
 * objects.
 *
 * @param {String} action the action to be checked
 * @param {Object} [context] the context to check the action in
 *
 * @return {Boolean} returns true, false or null depending on whether the
 *                   operation is allowed, not allowed or should be ignored.
 */
Rules.prototype.allowed = function(action, context) {
  var allowed = true;

  var commandStack = this._commandStack;

  if (commandStack) {
    allowed = commandStack.canExecute(action, context);
  }

  // map undefined to true, i.e. no rules
  return allowed === undefined ? true : allowed;
};
},{}],96:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'rules' ],
  rules: [ 'type', _dereq_(95) ]
};

},{"95":95}],97:[function(_dereq_,module,exports){
'use strict';

var isArray = _dereq_(241),
    forEach = _dereq_(136);


/**
 * A service that offers the current selection in a diagram.
 * Offers the api to control the selection, too.
 *
 * @class
 *
 * @param {EventBus} eventBus the event bus
 */
function Selection(eventBus) {

  this._eventBus = eventBus;

  this._selectedElements = [];

  var self = this;

  eventBus.on([ 'shape.remove', 'connection.remove' ], function(e) {
    var element = e.element;
    self.deselect(element);
  });

  eventBus.on([ 'diagram.clear' ], function(e) {
    self.select(null);
  });
}

Selection.$inject = [ 'eventBus' ];

module.exports = Selection;


Selection.prototype.deselect = function(element) {
  var selectedElements = this._selectedElements;

  var idx = selectedElements.indexOf(element);

  if (idx !== -1) {
    var oldSelection = selectedElements.slice();

    selectedElements.splice(idx, 1);

    this._eventBus.fire('selection.changed', { oldSelection: oldSelection, newSelection: selectedElements });
  }
};


Selection.prototype.get = function() {
  return this._selectedElements;
};

Selection.prototype.isSelected = function(element) {
  return this._selectedElements.indexOf(element) !== -1;
};


/**
 * This method selects one or more elements on the diagram.
 *
 * By passing an additional add parameter you can decide whether or not the element(s)
 * should be added to the already existing selection or not.
 *
 * @method Selection#select
 *
 * @param  {Object|Object[]} elements element or array of elements to be selected
 * @param  {boolean} [add] whether the element(s) should be appended to the current selection, defaults to false
 */
Selection.prototype.select = function(elements, add) {
  var selectedElements = this._selectedElements,
      oldSelection = selectedElements.slice();

  if (!isArray(elements)) {
    elements = elements ? [ elements ] : [];
  }

  // selection may be cleared by passing an empty array or null
  // to the method
  if (add) {
    forEach(elements, function(element) {
      if (selectedElements.indexOf(element) !== -1) {
        // already selected
        return;
      } else {
        selectedElements.push(element);
      }
    });
  } else {
    this._selectedElements = selectedElements = elements.slice();
  }

  this._eventBus.fire('selection.changed', { oldSelection: oldSelection, newSelection: selectedElements });
};

},{"136":136,"241":241}],98:[function(_dereq_,module,exports){
'use strict';

var hasPrimaryModifier = _dereq_(109).hasPrimaryModifier;

var find = _dereq_(135);


function SelectionBehavior(eventBus, selection, canvas, elementRegistry) {

  eventBus.on('create.end', 500, function(e) {

    // select the created shape after a
    // successful create operation
    if (e.context.canExecute) {
      selection.select(e.context.shape);
    }
  });

  eventBus.on('connect.end', 500, function(e) {

    // select the connect end target
    // after a connect operation
    if (e.context.canExecute && e.context.target) {
      selection.select(e.context.target);
    }
  });

  eventBus.on('shape.move.end', 500, function(e) {
    var previousSelection = e.previousSelection || [];

    var shape = elementRegistry.get(e.context.shape.id);

    // make sure at least the main moved element is being
    // selected after a move operation
    var inSelection = find(previousSelection, function(selectedShape) {
      return shape.id === selectedShape.id;
    });

    if (!inSelection) {
      selection.select(shape);
    }
  });

  // Shift + click selection
  eventBus.on('element.click', function(event) {

    var element = event.element;

    // do not select the root element
    // or connections
    if (element === canvas.getRootElement()) {
      element = null;
    }

    var isSelected = selection.isSelected(element),
        isMultiSelect = selection.get().length > 1;

    // mouse-event: SELECTION_KEY
    var add = hasPrimaryModifier(event);

    // select OR deselect element in multi selection
    if (isSelected && isMultiSelect) {
      if (add) {
        return selection.deselect(element);
      } else {
        return selection.select(element);
      }
    } else
    if (!isSelected) {
      selection.select(element, add);
    } else {
      selection.deselect(element);
    }
  });
}

SelectionBehavior.$inject = [ 'eventBus', 'selection', 'canvas', 'elementRegistry' ];
module.exports = SelectionBehavior;

},{"109":109,"135":135}],99:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_(136);

var MARKER_HOVER = 'hover',
    MARKER_SELECTED = 'selected';


/**
 * A plugin that adds a visible selection UI to shapes and connections
 * by appending the <code>hover</code> and <code>selected</code> classes to them.
 *
 * @class
 *
 * Makes elements selectable, too.
 *
 * @param {EventBus} events
 * @param {SelectionService} selection
 * @param {Canvas} canvas
 */
function SelectionVisuals(events, canvas, selection, styles) {

  this._multiSelectionBox = null;

  function addMarker(e, cls) {
    canvas.addMarker(e, cls);
  }

  function removeMarker(e, cls) {
    canvas.removeMarker(e, cls);
  }

  events.on('element.hover', function(event) {
    addMarker(event.element, MARKER_HOVER);
  });

  events.on('element.out', function(event) {
    removeMarker(event.element, MARKER_HOVER);
  });

  events.on('selection.changed', function(event) {

    function deselect(s) {
      removeMarker(s, MARKER_SELECTED);
    }

    function select(s) {
      addMarker(s, MARKER_SELECTED);
    }

    var oldSelection = event.oldSelection,
        newSelection = event.newSelection;

    forEach(oldSelection, function(e) {
      if (newSelection.indexOf(e) === -1) {
        deselect(e);
      }
    });

    forEach(newSelection, function(e) {
      if (oldSelection.indexOf(e) === -1) {
        select(e);
      }
    });
  });
}

SelectionVisuals.$inject = [
  'eventBus',
  'canvas',
  'selection',
  'styles'
];

module.exports = SelectionVisuals;

},{"136":136}],100:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'selectionVisuals', 'selectionBehavior' ],
  __depends__: [
    _dereq_(89),
    _dereq_(91)
  ],
  selection: [ 'type', _dereq_(97) ],
  selectionVisuals: [ 'type', _dereq_(99) ],
  selectionBehavior: [ 'type', _dereq_(98) ]
};

},{"89":89,"91":91,"97":97,"98":98,"99":99}],101:[function(_dereq_,module,exports){
module.exports = {
  translate: [ 'value', _dereq_(102) ]
};
},{"102":102}],102:[function(_dereq_,module,exports){
'use strict';

/**
 * A simple translation stub to be used for multi-language support
 * in diagrams. Can be easily replaced with a more sophisticated
 * solution.
 *
 * @example
 *
 * // use it inside any diagram component by injecting `translate`.
 *
 * function MyService(translate) {
 *   alert(translate('HELLO {you}', { you: 'You!' }));
 * }
 *
 * @param {String} template to interpolate
 * @param {Object} [replacements] a map with substitutes
 *
 * @return {String} the translated string
 */
module.exports = function translate(template, replacements) {

  replacements = replacements || {};

  return template.replace(/{([^}]+)}/g, function(_, key) {
    return replacements[key] || '{' + key + '}';
  });
};
},{}],103:[function(_dereq_,module,exports){
'use strict';

var assign = _dereq_(250),
    inherits = _dereq_(126);

var Refs = _dereq_(280);

var parentRefs = new Refs({ name: 'children', enumerable: true, collection: true }, { name: 'parent' }),
    labelRefs = new Refs({ name: 'label', enumerable: true }, { name: 'labelTarget' }),
    attacherRefs = new Refs({ name: 'attachers', collection: true }, { name: 'host' }),
    outgoingRefs = new Refs({ name: 'outgoing', collection: true }, { name: 'source' }),
    incomingRefs = new Refs({ name: 'incoming', collection: true }, { name: 'target' });

/**
 * @namespace djs.model
 */

/**
 * @memberOf djs.model
 */

/**
 * The basic graphical representation
 *
 * @class
 *
 * @abstract
 */
function Base() {

  /**
   * The object that backs up the shape
   *
   * @name Base#businessObject
   * @type Object
   */
  Object.defineProperty(this, 'businessObject', {
    writable: true
  });

  /**
   * The parent shape
   *
   * @name Base#parent
   * @type Shape
   */
  parentRefs.bind(this, 'parent');

  /**
   * @name Base#label
   * @type Label
   */
  labelRefs.bind(this, 'label');

  /**
   * The list of outgoing connections
   *
   * @name Base#outgoing
   * @type Array<Connection>
   */
  outgoingRefs.bind(this, 'outgoing');

  /**
   * The list of incoming connections
   *
   * @name Base#incoming
   * @type Array<Connection>
   */
  incomingRefs.bind(this, 'incoming');
}


/**
 * A graphical object
 *
 * @class
 * @constructor
 *
 * @extends Base
 */
function Shape() {
  Base.call(this);

  /**
   * The list of children
   *
   * @name Shape#children
   * @type Array<Base>
   */
  parentRefs.bind(this, 'children');

  /**
   * @name Shape#host
   * @type Shape
   */
  attacherRefs.bind(this, 'host');

  /**
   * @name Shape#attachers
   * @type Shape
   */
  attacherRefs.bind(this, 'attachers');
}

inherits(Shape, Base);


/**
 * A root graphical object
 *
 * @class
 * @constructor
 *
 * @extends Shape
 */
function Root() {
  Shape.call(this);
}

inherits(Root, Shape);


/**
 * A label for an element
 *
 * @class
 * @constructor
 *
 * @extends Shape
 */
function Label() {
  Shape.call(this);

  /**
   * The labeled element
   *
   * @name Label#labelTarget
   * @type Base
   */
  labelRefs.bind(this, 'labelTarget');
}

inherits(Label, Shape);


/**
 * A connection between two elements
 *
 * @class
 * @constructor
 *
 * @extends Base
 */
function Connection() {
  Base.call(this);

  /**
   * The element this connection originates from
   *
   * @name Connection#source
   * @type Base
   */
  outgoingRefs.bind(this, 'source');

  /**
   * The element this connection points to
   *
   * @name Connection#target
   * @type Base
   */
  incomingRefs.bind(this, 'target');
}

inherits(Connection, Base);


var types = {
  connection: Connection,
  shape: Shape,
  label: Label,
  root: Root
};

/**
 * Creates a new model element of the specified type
 *
 * @method create
 *
 * @example
 *
 * var shape1 = Model.create('shape', { x: 10, y: 10, width: 100, height: 100 });
 * var shape2 = Model.create('shape', { x: 210, y: 210, width: 100, height: 100 });
 *
 * var connection = Model.create('connection', { waypoints: [ { x: 110, y: 55 }, {x: 210, y: 55 } ] });
 *
 * @param  {String} type lower-cased model name
 * @param  {Object} attrs attributes to initialize the new model instance with
 *
 * @return {Base} the new model instance
 */
module.exports.create = function(type, attrs) {
  var Type = types[type];
  if (!Type) {
    throw new Error('unknown type: <' + type + '>');
  }
  return assign(new Type(), attrs);
};


module.exports.Base = Base;
module.exports.Root = Root;
module.exports.Shape = Shape;
module.exports.Connection = Connection;
module.exports.Label = Label;

},{"126":126,"250":250,"280":280}],104:[function(_dereq_,module,exports){
'use strict';

/**
 * Failsafe remove an element from a collection
 *
 * @param  {Array<Object>} [collection]
 * @param  {Object} [element]
 *
 * @return {Number} the previous index of the element
 */
module.exports.remove = function(collection, element) {

  if (!collection || !element) {
    return -1;
  }

  var idx = collection.indexOf(element);

  if (idx !== -1) {
    collection.splice(idx, 1);
  }

  return idx;
};

/**
 * Fail save add an element to the given connection, ensuring
 * it does not yet exist.
 *
 * @param {Array<Object>} collection
 * @param {Object} element
 * @param {Number} idx
 */
module.exports.add = function(collection, element, idx) {

  if (!collection || !element) {
    return;
  }

  if (typeof idx !== 'number') {
    idx = -1;
  }

  var currentIdx = collection.indexOf(element);

  if (currentIdx !== -1) {

    if (currentIdx === idx) {
      // nothing to do, position has not changed
      return;
    } else {

      if (idx !== -1) {
        // remove from current position
        collection.splice(currentIdx, 1);
      } else {
        // already exists in collection
        return;
      }
    }
  }

  if (idx !== -1) {
    // insert at specified position
    collection.splice(idx, 0, element);
  } else {
    // push to end
    collection.push(element);
  }
};


/**
 * Fail save get the index of an element in a collection.
 *
 * @param {Array<Object>} collection
 * @param {Object} element
 *
 * @return {Number} the index or -1 if collection or element do
 *                  not exist or the element is not contained.
 */
module.exports.indexOf = function(collection, element) {

  if (!collection || !element) {
    return -1;
  }

  return collection.indexOf(element);
};

},{}],105:[function(_dereq_,module,exports){
'use strict';

var isArray = _dereq_(241),
    isNumber = _dereq_(244),
    groupBy = _dereq_(137),
    forEach = _dereq_(136);

/**
 * Adds an element to a collection and returns true if the
 * element was added.
 *
 * @param {Array<Object>} elements
 * @param {Object} e
 * @param {Boolean} unique
 */
function add(elements, e, unique) {
  var canAdd = !unique || elements.indexOf(e) === -1;

  if (canAdd) {
    elements.push(e);
  }

  return canAdd;
}

/**
 * Iterate over each element in a collection, calling the iterator function `fn`
 * with (element, index, recursionDepth).
 *
 * Recurse into all elements that are returned by `fn`.
 *
 * @param  {Object|Array<Object>} elements
 * @param  {Function} fn iterator function called with (element, index, recursionDepth)
 * @param  {Number} [depth] maximum recursion depth
 */
function eachElement(elements, fn, depth) {

  depth = depth || 0;

  if (!isArray(elements)) {
    elements = [ elements ];
  }

  forEach(elements, function(s, i) {
    var filter = fn(s, i, depth);

    if (isArray(filter) && filter.length) {
      eachElement(filter, fn, depth + 1);
    }
  });
}

/**
 * Collects self + child elements up to a given depth from a list of elements.
 *
 * @param  {djs.model.Base|Array<djs.model.Base>} elements the elements to select the children from
 * @param  {Boolean} unique whether to return a unique result set (no duplicates)
 * @param  {Number} maxDepth the depth to search through or -1 for infinite
 *
 * @return {Array<djs.model.Base>} found elements
 */
function selfAndChildren(elements, unique, maxDepth) {
  var result = [],
      processedChildren = [];

  eachElement(elements, function(element, i, depth) {
    add(result, element, unique);

    var children = element.children;

    // max traversal depth not reached yet
    if (maxDepth === -1 || depth < maxDepth) {

      // children exist && children not yet processed
      if (children && add(processedChildren, children, unique)) {
        return children;
      }
    }
  });

  return result;
}

/**
 * Return self + direct children for a number of elements
 *
 * @param  {Array<djs.model.Base>} elements to query
 * @param  {Boolean} allowDuplicates to allow duplicates in the result set
 *
 * @return {Array<djs.model.Base>} the collected elements
 */
function selfAndDirectChildren(elements, allowDuplicates) {
  return selfAndChildren(elements, !allowDuplicates, 1);
}

/**
 * Return self + ALL children for a number of elements
 *
 * @param  {Array<djs.model.Base>} elements to query
 * @param  {Boolean} allowDuplicates to allow duplicates in the result set
 *
 * @return {Array<djs.model.Base>} the collected elements
 */
function selfAndAllChildren(elements, allowDuplicates) {
  return selfAndChildren(elements, !allowDuplicates, -1);
}

/**
 * Gets the the closure for all selected elements,
 * their connections and their attachment's connections
 *
 * @param {Array<djs.model.Base>} elements
 * @return {Object} enclosure
 */
function getClosure(elements) {

  // original elements passed to this function
  var topLevel = groupBy(elements, function(e) { return e.id; });

  var allShapes = {},
      allConnections = {},
      enclosedElements = {},
      enclosedConnections = {};

  function handleConnection(c) {
    if (topLevel[c.source.id] && topLevel[c.target.id]) {
      topLevel[c.id] = c;
    }

    // not enclosed as a child, but maybe logically
    // (connecting two moved elements?)
    if (allShapes[c.source.id] && allShapes[c.target.id]) {
      enclosedConnections[c.id] = enclosedElements[c.id] = c;
    }

    allConnections[c.id] = c;
  }

  function handleElement(element) {

    enclosedElements[element.id] = element;

    if (element.waypoints) {
      // remember connection
      enclosedConnections[element.id] = allConnections[element.id] = element;
    } else {
      // remember shape
      allShapes[element.id] = element;

      // remember all connections
      forEach(element.incoming, handleConnection);

      forEach(element.outgoing, handleConnection);

      // recurse into children
      return element.children;
    }
  }

  eachElement(elements, handleElement);

  return {
    allShapes: allShapes,
    allConnections: allConnections,
    topLevel: topLevel,
    enclosedConnections: enclosedConnections,
    enclosedElements: enclosedElements
  };
}

/**
 * Returns the surrounding bbox for all elements in
 * the array or the element primitive.
 *
 * @param {Array<djs.model.Shape>|djs.model.Shape} elements
 * @param {Boolean} stopRecursion
 */
function getBBox(elements, stopRecursion) {

  stopRecursion = !!stopRecursion;
  if (!isArray(elements)) {
    elements = [elements];
  }

  var minX,
      minY,
      maxX,
      maxY;

  forEach(elements, function(element) {

    // If element is a connection the bbox must be computed first
    var bbox = element;
    if (element.waypoints && !stopRecursion) {
      bbox = getBBox(element.waypoints, true);
    }

    var x = bbox.x,
        y = bbox.y,
        height = bbox.height || 0,
        width  = bbox.width  || 0;

    if (x < minX || minX === undefined) {
      minX = x;
    }
    if (y < minY || minY === undefined) {
      minY = y;
    }

    if ((x + width) > maxX || maxX === undefined) {
      maxX = x + width;
    }
    if ((y + height) > maxY || maxY === undefined) {
      maxY = y + height;
    }
  });

  return {
    x: minX,
    y: minY,
    height: maxY - minY,
    width: maxX - minX
  };
}


/**
 * Returns all elements that are enclosed from the bounding box.
 *
 *   * If bbox.(width|height) is not specified the method returns
 *     all elements with element.x/y > bbox.x/y
 *   * If only bbox.x or bbox.y is specified, method return all elements with
 *     e.x > bbox.x or e.y > bbox.y
 *
 * @param {Array<djs.model.Shape>} elements List of Elements to search through
 * @param {djs.model.Shape} bbox the enclosing bbox.
 *
 * @return {Array<djs.model.Shape>} enclosed elements
 */
function getEnclosedElements(elements, bbox) {

  var filteredElements = {};

  forEach(elements, function(element) {

    var e = element;

    if (e.waypoints) {
      e = getBBox(e);
    }

    if (!isNumber(bbox.y) && (e.x > bbox.x)) {
      filteredElements[element.id] = element;
    }
    if (!isNumber(bbox.x) && (e.y > bbox.y)) {
      filteredElements[element.id] = element;
    }
    if (e.x > bbox.x && e.y > bbox.y) {
      if (isNumber(bbox.width) && isNumber(bbox.height) &&
          e.width  + e.x < bbox.width  + bbox.x &&
          e.height + e.y < bbox.height + bbox.y) {

        filteredElements[element.id] = element;
      } else if (!isNumber(bbox.width) || !isNumber(bbox.height)) {
        filteredElements[element.id] = element;
      }
    }
  });

  return filteredElements;
}


module.exports.add = add;
module.exports.eachElement = eachElement;
module.exports.selfAndDirectChildren = selfAndDirectChildren;
module.exports.selfAndAllChildren = selfAndAllChildren;
module.exports.getBBox = getBBox;
module.exports.getEnclosedElements = getEnclosedElements;

module.exports.getClosure = getClosure;


function getElementType(element) {

  if ('waypoints' in element) {
    return 'connection';
  }

  if ('x' in element) {
    return 'shape';
  }

  return 'root';
}

module.exports.getType = getElementType;
},{"136":136,"137":137,"241":241,"244":244}],106:[function(_dereq_,module,exports){
'use strict';

function __preventDefault(event) {
  return event && event.preventDefault();
}

function __stopPropagation(event, immediate) {
  if (!event) {
    return;
  }

  if (event.stopPropagation) {
    event.stopPropagation();
  }

  if (immediate && event.stopImmediatePropagation) {
    event.stopImmediatePropagation();
  }
}


function getOriginal(event) {
  return event.originalEvent || event.srcEvent;
}

module.exports.getOriginal = getOriginal;


function stopEvent(event, immediate) {
  stopPropagation(event, immediate);
  preventDefault(event);
}

module.exports.stopEvent = stopEvent;


function preventDefault(event) {
  __preventDefault(event);
  __preventDefault(getOriginal(event));
}

module.exports.preventDefault = preventDefault;


function stopPropagation(event, immediate) {
  __stopPropagation(event, immediate);
  __stopPropagation(getOriginal(event), immediate);
}

module.exports.stopPropagation = stopPropagation;


function toPoint(event) {

  if (event.pointers && event.pointers.length) {
    event = event.pointers[0];
  }

  if (event.touches && event.touches.length) {
    event = event.touches[0];
  }

  return event ? {
    x: event.clientX,
    y: event.clientY
  } : null;
}

module.exports.toPoint = toPoint;

},{}],107:[function(_dereq_,module,exports){
'use strict';

var domQuery = _dereq_(266);

/**
 * SVGs for elements are generated by the {@link GraphicsFactory}.
 *
 * This utility gives quick access to the important semantic
 * parts of an element.
 */

/**
 * Returns the visual part of a diagram element
 *
 * @param {Snap<SVGElement>} gfx
 *
 * @return {Snap<SVGElement>}
 */
function getVisual(gfx) {
  return domQuery('.djs-visual', gfx);
}

/**
 * Returns the children for a given diagram element.
 *
 * @param {Snap<SVGElement>} gfx
 * @return {Snap<SVGElement>}
 */
function getChildren(gfx) {
  return gfx.parentNode.childNodes[1];
}

module.exports.getVisual = getVisual;
module.exports.getChildren = getChildren;

},{"266":266}],108:[function(_dereq_,module,exports){
'use strict';

/**
 * Util that provides unique IDs.
 *
 * @class djs.util.IdGenerator
 * @constructor
 * @memberOf djs.util
 *
 * The ids can be customized via a given prefix and contain a random value to avoid collisions.
 *
 * @param {String} prefix a prefix to prepend to generated ids (for better readability)
 */
function IdGenerator(prefix) {

  this._counter = 0;
  this._prefix = (prefix ? prefix + '-' : '') + Math.floor(Math.random() * 1000000000) + '-';
}

module.exports = IdGenerator;

/**
 * Returns a next unique ID.
 *
 * @method djs.util.IdGenerator#next
 *
 * @returns {String} the id
 */
IdGenerator.prototype.next = function() {
  return this._prefix + (++this._counter);
};

},{}],109:[function(_dereq_,module,exports){
'use strict';

var getOriginalEvent = _dereq_(106).getOriginal;

var isMac = _dereq_(110).isMac;


function isPrimaryButton(event) {
  // button === 0 -> left áka primary mouse button
  return !(getOriginalEvent(event) || event).button;
}

module.exports.isPrimaryButton = isPrimaryButton;

module.exports.isMac = isMac;

module.exports.hasPrimaryModifier = function(event) {
  var originalEvent = getOriginalEvent(event) || event;

  if (!isPrimaryButton(event)) {
    return false;
  }

  // Use alt as primary modifier key for mac OS
  if (isMac()) {
    return originalEvent.metaKey;
  } else {
    return originalEvent.ctrlKey;
  }
};


module.exports.hasSecondaryModifier = function(event) {
  var originalEvent = getOriginalEvent(event) || event;

  return isPrimaryButton(event) && originalEvent.shiftKey;
};

},{"106":106,"110":110}],110:[function(_dereq_,module,exports){
'use strict';

module.exports.isMac = function isMac() {
  return (/mac/i).test(navigator.platform);
};
},{}],111:[function(_dereq_,module,exports){
'use strict';

var svgAttr = _dereq_(322),
    svgCreate = _dereq_(325);


module.exports.componentsToPath = function(elements) {
  return elements.join(',').replace(/,?([A-z]),?/g, '$1');
};

function toSVGPoints(points) {
  var result = '';

  for (var i = 0, p; (p = points[i]); i++) {
    result += p.x + ',' + p.y + ' ';
  }

  return result;
}

module.exports.toSVGPoints = toSVGPoints;

module.exports.createLine = function(points, attrs) {

  var line = svgCreate('polyline');
  svgAttr(line, { points: toSVGPoints(points) });

  if (attrs) {
    svgAttr(line, attrs);
  }

  return line;
};

module.exports.updateLine = function(gfx, points) {
  svgAttr(gfx, { points: toSVGPoints(points) });

  return gfx;
};

},{"322":322,"325":325}],112:[function(_dereq_,module,exports){
'use strict';

var svgTransform = _dereq_(329);

var createTransform = _dereq_(326).createTransform;


/**
 * @param {<SVGElement>} element
 * @param {Number} x
 * @param {Number} y
 * @param {Number} angle
 * @param {Number} amount
 */
module.exports.transform = function(gfx, x, y, angle, amount) {
  var translate = createTransform();
  translate.setTranslate(x, y);

  var rotate = createTransform();
  rotate.setRotate(angle, 0, 0);

  var scale = createTransform();
  scale.setScale(amount || 1, amount || 1);

  svgTransform(gfx, [ translate, rotate, scale ]);
};


/**
 * @param {SVGElement} element
 * @param {Number} x
 * @param {Number} y
 */
module.exports.translate = function(gfx, x, y) {
  var translate = createTransform();
  translate.setTranslate(x, y);

  svgTransform(gfx, translate);
};


/**
 * @param {SVGElement} element
 * @param {Number} angle
 */
module.exports.rotate = function(gfx, angle) {
  var rotate = createTransform();
  rotate.setRotate(angle, 0, 0);

  svgTransform(gfx, rotate);
};


/**
 * @param {SVGElement} element
 * @param {Number} amount
 */
module.exports.scale = function(gfx, amount) {
  var scale = createTransform();
  scale.setScale(amount, amount);

  svgTransform(gfx, scale);
};

},{"326":326,"329":329}],113:[function(_dereq_,module,exports){
'use strict';

var isObject = _dereq_(245),
    assign = _dereq_(250),
    pick = _dereq_(256),
    forEach = _dereq_(136),
    reduce = _dereq_(139),
    merge = _dereq_(253);

var svgAppend = _dereq_(320),
    svgAttr = _dereq_(322),
    svgCreate = _dereq_(325),
    svgRemove = _dereq_(328);

var DEFAULT_BOX_PADDING = 0;

var DEFAULT_LABEL_SIZE = {
  width: 150,
  height: 50
};


function parseAlign(align) {

  var parts = align.split('-');

  return {
    horizontal: parts[0] || 'center',
    vertical: parts[1] || 'top'
  };
}

function parsePadding(padding) {

  if (isObject(padding)) {
    return assign({ top: 0, left: 0, right: 0, bottom: 0 }, padding);
  } else {
    return {
      top: padding,
      left: padding,
      right: padding,
      bottom: padding
    };
  }
}

function getTextBBox(text, fakeText) {

  fakeText.textContent = text;

  try {
    var bbox,
        emptyLine = text === '';

    // add dummy text, when line is empty to determine correct height
    fakeText.textContent = emptyLine ? 'dummy' : text;

    bbox = pick(fakeText.getBBox(), [ 'width', 'height' ]);

    if (emptyLine) {
      // correct width
      bbox.width = 0;
    }

    return bbox;
  } catch (e) {
    return { width: 0, height: 0 };
  }
}


/**
 * Layout the next line and return the layouted element.
 *
 * Alters the lines passed.
 *
 * @param  {Array<String>} lines
 * @return {Object} the line descriptor, an object { width, height, text }
 */
function layoutNext(lines, maxWidth, fakeText) {

  var originalLine = lines.shift(),
      fitLine = originalLine;

  var textBBox;

  for (;;) {
    textBBox = getTextBBox(fitLine, fakeText);

    textBBox.width = fitLine ? textBBox.width : 0;

    // try to fit
    if (fitLine === ' ' || fitLine === '' || textBBox.width < Math.round(maxWidth) || fitLine.length < 2) {
      return fit(lines, fitLine, originalLine, textBBox);
    }

    fitLine = shortenLine(fitLine, textBBox.width, maxWidth);
  }
}

function fit(lines, fitLine, originalLine, textBBox) {
  if (fitLine.length < originalLine.length) {
    var remainder = originalLine.slice(fitLine.length).trim();

    lines.unshift(remainder);
  }
  return { width: textBBox.width, height: textBBox.height, text: fitLine };
}


/**
 * Shortens a line based on spacing and hyphens.
 * Returns the shortened result on success.
 *
 * @param  {String} line
 * @param  {Number} maxLength the maximum characters of the string
 * @return {String} the shortened string
 */
function semanticShorten(line, maxLength) {
  var parts = line.split(/(\s|-)/g),
      part,
      shortenedParts = [],
      length = 0;

  // try to shorten via spaces + hyphens
  if (parts.length > 1) {
    while ((part = parts.shift())) {
      if (part.length + length < maxLength) {
        shortenedParts.push(part);
        length += part.length;
      } else {
        // remove previous part, too if hyphen does not fit anymore
        if (part === '-') {
          shortenedParts.pop();
        }

        break;
      }
    }
  }

  return shortenedParts.join('');
}


function shortenLine(line, width, maxWidth) {
  var length = Math.max(line.length * (maxWidth / width), 1);

  // try to shorten semantically (i.e. based on spaces and hyphens)
  var shortenedLine = semanticShorten(line, length);

  if (!shortenedLine) {

    // force shorten by cutting the long word
    shortenedLine = line.slice(0, Math.max(Math.round(length - 1), 1));
  }

  return shortenedLine;
}


function getHelperSvg() {
  var helperSvg = document.getElementById('helper-svg');

  if (!helperSvg) {
    helperSvg = svgCreate('svg');

    svgAttr(helperSvg, {
      id: 'helper-svg',
      width: 0,
      height: 0,
      style: 'visibility: hidden; position: fixed'
    });

    document.body.appendChild(helperSvg);
  }

  return helperSvg;
}


/**
 * Creates a new label utility
 *
 * @param {Object} config
 * @param {Dimensions} config.size
 * @param {Number} config.padding
 * @param {Object} config.style
 * @param {String} config.align
 */
function Text(config) {

  this._config = assign({}, {
    size: DEFAULT_LABEL_SIZE,
    padding: DEFAULT_BOX_PADDING,
    style: {},
    align: 'center-top'
  }, config || {});
}

/**
 * Returns the layouted text as an SVG element.
 *
 * @param {String} text
 * @param {Object} options
 *
 * @return {SVGText}
 */
Text.prototype.createText = function(text, options) {
  return this.layoutText(text, options).element;
};

/**
 * Returns a labels layouted dimensions.
 *
 * @param {String} text to layout
 * @param {Object} options
 *
 * @return {Dimensions}
 */
Text.prototype.getDimensions = function(text, options) {
  return this.layoutText(text, options).dimensions;
};

/**
 * Creates and returns a label and its bounding box.
 *
 * @method Text#createText
 *
 * @param {String} text the text to render on the label
 * @param {Object} options
 * @param {String} options.align how to align in the bounding box.
 *                               Any of { 'center-middle', 'center-top' },
 *                               defaults to 'center-top'.
 * @param {String} options.style style to be applied to the text
 * @param {boolean} options.fitBox indicates if box will be recalculated to
 *                                 fit text
 *
 * @return {Object} { element, dimensions }
 */
Text.prototype.layoutText = function(text, options) {
  var box = merge({}, this._config.size, options.box || {}),
      style = merge({}, this._config.style, options.style || {}),
      align = parseAlign(options.align || this._config.align),
      padding = parsePadding(options.padding !== undefined ? options.padding : this._config.padding),
      fitBox = options.fitBox || false;

  var lines = text.split(/\r?\n/g),
      layouted = [];

  var maxWidth = box.width - padding.left - padding.right;

  // ensure correct rendering by attaching helper text node to invisible SVG
  var helperText = svgCreate('text');
  svgAttr(helperText, { x: 0, y: 0 });
  svgAttr(helperText, style);

  var helperSvg = getHelperSvg();

  svgAppend(helperSvg, helperText);

  while (lines.length) {
    layouted.push(layoutNext(lines, maxWidth, helperText));
  }

  var totalHeight = reduce(layouted, function(sum, line, idx) {
    return sum + line.height;
  }, 0);

  var maxLineWidth = reduce(layouted, function(sum, line, idx) {
    return line.width > sum ? line.width : sum;
  }, 0);

  // the y position of the next line
  var y, x;

  switch (align.vertical) {
  case 'middle':
    y = (box.height - totalHeight) / 2 - layouted[0].height / 4;
    break;

  default:
    y = padding.top;
  }

  var textElement = svgCreate('text');

  svgAttr(textElement, style);

  // layout each line taking into account that parent
  // shape might resize to fit text size
  forEach(layouted, function(line) {
    y += line.height;

    switch (align.horizontal) {
    case 'left':
      x = padding.left;
      break;

    case 'right':
      x = ((fitBox ? maxLineWidth : maxWidth)
        - padding.right - line.width);
      break;

    default:
      // aka center
      x = Math.max((((fitBox ? maxLineWidth : maxWidth)
        - line.width) / 2 + padding.left), 0);
    }

    var tspan = svgCreate('tspan');
    svgAttr(tspan, { x: x, y: y });

    tspan.textContent = line.text;

    svgAppend(textElement, tspan);
  });

  svgRemove(helperText);

  var dimensions = {
    width: maxLineWidth,
    height: totalHeight
  };

  return {
    dimensions: dimensions,
    element: textElement
  };
};

module.exports = Text;

},{"136":136,"139":139,"245":245,"250":250,"253":253,"256":256,"320":320,"322":322,"325":325,"328":328}],114:[function(_dereq_,module,exports){

var isArray = function(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]';
};

var annotate = function() {
  var args = Array.prototype.slice.call(arguments);
  
  if (args.length === 1 && isArray(args[0])) {
    args = args[0];
  }

  var fn = args.pop();

  fn.$inject = args;

  return fn;
};


// Current limitations:
// - can't put into "function arg" comments
// function /* (no parenthesis like this) */ (){}
// function abc( /* xx (no parenthesis like this) */ a, b) {}
//
// Just put the comment before function or inside:
// /* (((this is fine))) */ function(a, b) {}
// function abc(a) { /* (((this is fine))) */}

var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
var FN_ARG = /\/\*([^\*]*)\*\//m;

var parse = function(fn) {
  if (typeof fn !== 'function') {
    throw new Error('Cannot annotate "' + fn + '". Expected a function!');
  }

  var match = fn.toString().match(FN_ARGS);
  return match[1] && match[1].split(',').map(function(arg) {
    match = arg.match(FN_ARG);
    return match ? match[1].trim() : arg.trim();
  }) || [];
};


exports.annotate = annotate;
exports.parse = parse;
exports.isArray = isArray;

},{}],115:[function(_dereq_,module,exports){
module.exports = {
  annotate: _dereq_(114).annotate,
  Module: _dereq_(117),
  Injector: _dereq_(116)
};

},{"114":114,"116":116,"117":117}],116:[function(_dereq_,module,exports){
var Module = _dereq_(117);
var autoAnnotate = _dereq_(114).parse;
var annotate = _dereq_(114).annotate;
var isArray = _dereq_(114).isArray;


var Injector = function(modules, parent) {
  parent = parent || {
    get: function(name, strict) {
      currentlyResolving.push(name);

      if (strict === false) {
        return null;
      } else {
        throw error('No provider for "' + name + '"!');
      }
    }
  };

  var currentlyResolving = [];
  var providers = this._providers = Object.create(parent._providers || null);
  var instances = this._instances = Object.create(null);

  var self = instances.injector = this;

  var error = function(msg) {
    var stack = currentlyResolving.join(' -> ');
    currentlyResolving.length = 0;
    return new Error(stack ? msg + ' (Resolving: ' + stack + ')' : msg);
  };

  /**
   * Return a named service.
   *
   * @param {String} name
   * @param {Boolean} [strict=true] if false, resolve missing services to null
   *
   * @return {Object}
   */
  var get = function(name, strict) {
    if (!providers[name] && name.indexOf('.') !== -1) {
      var parts = name.split('.');
      var pivot = get(parts.shift());

      while(parts.length) {
        pivot = pivot[parts.shift()];
      }

      return pivot;
    }

    if (Object.hasOwnProperty.call(instances, name)) {
      return instances[name];
    }

    if (Object.hasOwnProperty.call(providers, name)) {
      if (currentlyResolving.indexOf(name) !== -1) {
        currentlyResolving.push(name);
        throw error('Cannot resolve circular dependency!');
      }

      currentlyResolving.push(name);
      instances[name] = providers[name][0](providers[name][1]);
      currentlyResolving.pop();

      return instances[name];
    }

    return parent.get(name, strict);
  };

  var instantiate = function(Type) {
    var instance = Object.create(Type.prototype);
    var returned = invoke(Type, instance);

    return typeof returned === 'object' ? returned : instance;
  };

  var invoke = function(fn, context) {
    if (typeof fn !== 'function') {
      if (isArray(fn)) {
        fn = annotate(fn.slice());
      } else {
        throw new Error('Cannot invoke "' + fn + '". Expected a function!');
      }
    }

    var inject = fn.$inject && fn.$inject || autoAnnotate(fn);
    var dependencies = inject.map(function(dep) {
      return get(dep);
    });

    // TODO(vojta): optimize without apply
    return fn.apply(context, dependencies);
  };


  var createPrivateInjectorFactory = function(privateChildInjector) {
    return annotate(function(key) {
      return privateChildInjector.get(key);
    });
  };

  var createChild = function(modules, forceNewInstances) {
    if (forceNewInstances && forceNewInstances.length) {
      var fromParentModule = Object.create(null);
      var matchedScopes = Object.create(null);

      var privateInjectorsCache = [];
      var privateChildInjectors = [];
      var privateChildFactories = [];

      var provider;
      var cacheIdx;
      var privateChildInjector;
      var privateChildInjectorFactory;
      for (var name in providers) {
        provider = providers[name];

        if (forceNewInstances.indexOf(name) !== -1) {
          if (provider[2] === 'private') {
            cacheIdx = privateInjectorsCache.indexOf(provider[3]);
            if (cacheIdx === -1) {
              privateChildInjector = provider[3].createChild([], forceNewInstances);
              privateChildInjectorFactory = createPrivateInjectorFactory(privateChildInjector);
              privateInjectorsCache.push(provider[3]);
              privateChildInjectors.push(privateChildInjector);
              privateChildFactories.push(privateChildInjectorFactory);
              fromParentModule[name] = [privateChildInjectorFactory, name, 'private', privateChildInjector];
            } else {
              fromParentModule[name] = [privateChildFactories[cacheIdx], name, 'private', privateChildInjectors[cacheIdx]];
            }
          } else {
            fromParentModule[name] = [provider[2], provider[1]];
          }
          matchedScopes[name] = true;
        }

        if ((provider[2] === 'factory' || provider[2] === 'type') && provider[1].$scope) {
          /*jshint -W083 */
          forceNewInstances.forEach(function(scope) {
            if (provider[1].$scope.indexOf(scope) !== -1) {
              fromParentModule[name] = [provider[2], provider[1]];
              matchedScopes[scope] = true;
            }
          });
        }
      }

      forceNewInstances.forEach(function(scope) {
        if (!matchedScopes[scope]) {
          throw new Error('No provider for "' + scope + '". Cannot use provider from the parent!');
        }
      });

      modules.unshift(fromParentModule);
    }

    return new Injector(modules, self);
  };

  var factoryMap = {
    factory: invoke,
    type: instantiate,
    value: function(value) {
      return value;
    }
  };

  modules.forEach(function(module) {

    function arrayUnwrap(type, value) {
      if (type !== 'value' && isArray(value)) {
        value = annotate(value.slice());
      }

      return value;
    }

    // TODO(vojta): handle wrong inputs (modules)
    if (module instanceof Module) {
      module.forEach(function(provider) {
        var name = provider[0];
        var type = provider[1];
        var value = provider[2];

        providers[name] = [factoryMap[type], arrayUnwrap(type, value), type];
      });
    } else if (typeof module === 'object') {
      if (module.__exports__) {
        var clonedModule = Object.keys(module).reduce(function(m, key) {
          if (key.substring(0, 2) !== '__') {
            m[key] = module[key];
          }
          return m;
        }, Object.create(null));

        var privateInjector = new Injector((module.__modules__ || []).concat([clonedModule]), self);
        var getFromPrivateInjector = annotate(function(key) {
          return privateInjector.get(key);
        });
        module.__exports__.forEach(function(key) {
          providers[key] = [getFromPrivateInjector, key, 'private', privateInjector];
        });
      } else {
        Object.keys(module).forEach(function(name) {
          if (module[name][2] === 'private') {
            providers[name] = module[name];
            return;
          }

          var type = module[name][0];
          var value = module[name][1];

          providers[name] = [factoryMap[type], arrayUnwrap(type, value), type];
        });
      }
    }
  });

  // public API
  this.get = get;
  this.invoke = invoke;
  this.instantiate = instantiate;
  this.createChild = createChild;
};

module.exports = Injector;

},{"114":114,"117":117}],117:[function(_dereq_,module,exports){
var Module = function() {
  var providers = [];

  this.factory = function(name, factory) {
    providers.push([name, 'factory', factory]);
    return this;
  };

  this.value = function(name, value) {
    providers.push([name, 'value', value]);
    return this;
  };

  this.type = function(name, type) {
    providers.push([name, 'type', type]);
    return this;
  };

  this.forEach = function(iterator) {
    providers.forEach(iterator);
  };
};

module.exports = Module;

},{}],118:[function(_dereq_,module,exports){
module.exports = _dereq_(120);
},{"120":120}],119:[function(_dereq_,module,exports){
'use strict';

var isString = _dereq_(247),
    isFunction = _dereq_(242),
    assign = _dereq_(250);

var Moddle = _dereq_(271),
    XmlReader = _dereq_(269),
    XmlWriter = _dereq_(270);

/**
 * A sub class of {@link Moddle} with support for import and export of DMN xml files.
 *
 * @class DmnModdle
 * @extends Moddle
 *
 * @param {Object|Array} packages to use for instantiating the model
 * @param {Object} [options] additional options to pass over
 */
function DmnModdle(packages, options) {
  Moddle.call(this, packages, options);
}

DmnModdle.prototype = Object.create(Moddle.prototype);

module.exports = DmnModdle;


/**
 * Instantiates a DMN model tree from a given xml string.
 *
 * @param {String}   xmlStr
 * @param {String}   [typeName='dmn:Definitions'] name of the root element
 * @param {Object}   [options]  options to pass to the underlying reader
 * @param {Function} done       callback that is invoked with (err, result, parseContext)
 *                              once the import completes
 */
DmnModdle.prototype.fromXML = function(xmlStr, typeName, options, done) {

  if (!isString(typeName)) {
    done = options;
    options = typeName;
    typeName = 'dmn:Definitions';
  }

  if (isFunction(options)) {
    done = options;
    options = {};
  }

  var reader = new XmlReader(assign({ model: this, lax: true }, options));
  var rootHandler = reader.handler(typeName);

  reader.fromXML(xmlStr, rootHandler, done);
};


/**
 * Serializes a DMN object tree to XML.
 *
 * @param {String}   element    the root element, typically an instance of `Definitions`
 * @param {Object}   [options]  to pass to the underlying writer
 * @param {Function} done       callback invoked with (err, xmlStr) once the import completes
 */
DmnModdle.prototype.toXML = function(element, options, done) {

  if (isFunction(options)) {
    done = options;
    options = {};
  }

  var writer = new XmlWriter(options);
  try {
    var result = writer.toXML(element);
    done(null, result);
  } catch (e) {
    done(e);
  }
};

},{"242":242,"247":247,"250":250,"269":269,"270":270,"271":271}],120:[function(_dereq_,module,exports){
'use strict';

var assign = _dereq_(250);

var DmnModdle = _dereq_(119);

var packages = {
  dmn: _dereq_(124),
  camunda: _dereq_(123),
  dc: _dereq_(122),
  biodi: _dereq_(121)
};

module.exports = function(additionalPackages, options) {
  return new DmnModdle(assign({}, packages, additionalPackages), options);
};

},{"119":119,"121":121,"122":122,"123":123,"124":124,"250":250}],121:[function(_dereq_,module,exports){
module.exports={
  "name": "bpmn.io DI for DMN",
  "uri": "http://bpmn.io/schema/dmn/biodi/1.0",
  "prefix": "biodi",
  "xml": {
    "tagAlias": "lowerCase"
  },
  "types": [
    {
      "name": "Edge",
      "superClass": [
        "Element"
      ],
      "properties": [
        { "name": "source",
          "type": "String",
          "isAttr": true
        },
        { "name": "waypoints",
          "type": "Waypoint",
          "isMany": true,
          "xml": { "serialize": "property" }
        }
      ]
    },
    {
      "name": "Bounds",
      "superClass": [
        "dc:Bounds",
        "Element"
      ]
    },
    {
      "name": "Waypoint",
      "superClass": [
        "dc:Point"
      ]
    }
  ]
}

},{}],122:[function(_dereq_,module,exports){
module.exports={
  "name": "DC",
  "uri": "http://www.omg.org/spec/DD/20100524/DC",
  "types": [
    {
      "name": "Boolean"
    },
    {
      "name": "Integer"
    },
    {
      "name": "Real"
    },
    {
      "name": "String"
    },
    {
      "name": "Font",
      "properties": [
        {
          "name": "name",
          "type": "String",
          "isAttr": true
        },
        {
          "name": "size",
          "type": "Real",
          "isAttr": true
        },
        {
          "name": "isBold",
          "type": "Boolean",
          "isAttr": true
        },
        {
          "name": "isItalic",
          "type": "Boolean",
          "isAttr": true
        },
        {
          "name": "isUnderline",
          "type": "Boolean",
          "isAttr": true
        },
        {
          "name": "isStrikeThrough",
          "type": "Boolean",
          "isAttr": true
        }
      ]
    },
    {
      "name": "Point",
      "properties": [
        {
          "name": "x",
          "type": "Real",
          "default": "0",
          "isAttr": true
        },
        {
          "name": "y",
          "type": "Real",
          "default": "0",
          "isAttr": true
        }
      ]
    },
    {
      "name": "Bounds",
      "properties": [
        {
          "name": "x",
          "type": "Real",
          "default": "0",
          "isAttr": true
        },
        {
          "name": "y",
          "type": "Real",
          "default": "0",
          "isAttr": true
        },
        {
          "name": "width",
          "type": "Real",
          "isAttr": true
        },
        {
          "name": "height",
          "type": "Real",
          "isAttr": true
        }
      ]
    }
  ],
  "prefix": "dc",
  "associations": []
}

},{}],123:[function(_dereq_,module,exports){
module.exports={
  "name": "Camunda",
  "uri": "http://camunda.org/schema/1.0/dmn",
  "prefix": "camunda",
  "xml": {
    "tagAlias": "lowerCase"
  },
  "types": [
    {
      "name": "InputVariable",
      "extends": [
        "dmn:InputClause"
      ],
      "properties": [
        {
          "name": "inputVariable",
          "isAttr": true,
          "type": "String"
        }
      ]
    }
  ]
}

},{}],124:[function(_dereq_,module,exports){
module.exports={
  "name": "DMN",
  "uri": "http://www.omg.org/spec/DMN/20151101/dmn.xsd",
  "xml": {
    "tagAlias": "lowerCase"
  },
  "prefix": "dmn",
  "types": [
    {
      "name": "DMNElement",
      "isAbstract": true,
      "properties": [
        { "name": "description", "type": "String" },
        { "name": "id", "type": "String", "isAttr": true, "isId": true },
        { "name": "label", "type": "String", "isAttr": true },
        { "name": "extensionElements", "type": "ExtensionElements" }
      ]
    },
    {
      "name": "NamedElement",
      "isAbstract": true,
      "superClass": [ "DMNElement" ],
      "properties": [
        { "name": "name", "type": "String", "isAttr": true }
      ]
    },
    {
      "name": "DMNElementReference",
      "properties": [
        { "name": "href", "type": "String", "isAttr": true }
      ]
    },
    {
      "name": "ExtensionElements",
      "properties": [
        {
          "name": "values",
          "type": "Element",
          "isMany": true
        }
      ]
    },
    {
      "name": "Definitions",
      "superClass": [ "NamedElement" ],
      "properties": [
        { "name": "namespace", "type": "String", "isAttr": true },
        { "name": "typeLanguage", "type": "String", "isAttr": true, "default": "http://www.omg.org/spec/FEEL/20140401" },
        { "name": "expressionLanguage", "type": "String", "isAttr": true, "default": "http://www.omg.org/spec/FEEL/20140401" },
        { "name": "exporter", "type": "String", "isAttr": true },
        { "name": "exporterVersion", "type": "String", "isAttr": true },
        { "name": "itemDefinition", "type": "ItemDefinition", "isMany": true, "xml": { "serialize": "property" } },
        { "name": "drgElements", "type": "DRGElement", "isMany": true },
        { "name": "artifacts", "type": "Artifact", "isMany": true }
      ]
    },
    {
      "name": "Import",
      "properties": [
        { "name": "namespace", "type": "String", "isAttr": true },
        { "name": "locationURI", "type": "String", "isAttr": true },
        { "name": "importType", "type": "String", "isAttr": true }
      ]
    },
    {
      "name": "DRGElement",
      "isAbstract": true,
      "superClass": [ "NamedElement" ]
    },
    {
      "name": "Decision",
      "superClass": [ "DRGElement" ],
      "properties": [
        { "name": "question", "type": "String" },
        { "name": "allowedAnswers", "type": "String" },
        { "name": "variable", "type": "InformationItem", "xml": { "serialize": "property" }  },
        { "name": "informationRequirement", "type": "InformationRequirement", "isMany": true, "xml": { "serialize": "property" } },
        { "name": "knowledgeRequirement", "type": "KnowledgeRequirement", "isMany": true, "xml": { "serialize": "property" } },
        { "name": "authorityRequirement", "type": "AuthorityRequirement", "isMany": true, "xml": { "serialize": "property" } },
        { "name": "decisionTable", "type": "DecisionTable", "xml": { "serialize": "property" } },
        { "name": "literalExpression", "type": "LiteralExpression", "xml": { "serialize": "property" } }
      ]
    },
    {
      "name": "BusinessKnowledgeModel",
      "superClass": [ "DRGElement" ],
      "properties": [
        { "name": "encapsulatedLogic", "type": "FunctionDefinition" },
        { "name": "variable", "type": "InformationItem", "xml": { "serialize": "property" } },
        { "name": "knowledgeRequirement", "type": "KnowledgeRequirement", "isMany": true, "xml": { "serialize": "property" } },
        { "name": "authorityRequirement", "type": "AuthorityRequirement", "isMany": true, "xml": { "serialize": "property" } }
      ]
    },
    {
      "name": "InputData",
      "superClass": [ "DRGElement" ],
      "properties": [
        { "name": "variable", "type": "InformationItem", "xml": { "serialize": "property" } }
      ]
    },
    {
      "name": "KnowledgeSource",
      "superClass": [ "DRGElement" ],
      "properties": [
        { "name": "authorityRequirement", "type": "AuthorityRequirement", "isMany": true, "xml": { "serialize": "property" } },
        { "name": "type", "type": "String", "isAttr": true },
        { "name": "owner", "type": "DMNElementReference", "isAttr": true },
        { "name": "locationURI", "type": "String", "isAttr": true }
      ]
    },
    {
      "name": "InformationRequirement",
      "properties": [
        { "name": "requiredDecision", "type": "DMNElementReference", "xml": { "serialize": "property" } },
        { "name": "requiredInput", "type": "DMNElementReference", "xml": { "serialize": "property" } }
      ]
    },
    {
      "name": "KnowledgeRequirement",
      "properties": [
        { "name": "requiredKnowledge", "type": "DMNElementReference", "isUnique": true, "xml": { "serialize": "property" } }
      ]
    },
    {
      "name": "AuthorityRequirement",
      "properties": [
        { "name": "requiredDecision", "type": "DMNElementReference", "xml": { "serialize": "property" } },
        { "name": "requiredInput", "type": "DMNElementReference", "xml": { "serialize": "property" } },
        { "name": "requiredAuthority", "type": "DMNElementReference", "xml": { "serialize": "property" } }
      ]
    },
    {
      "name": "Expression",
      "isAbstract": true,
      "superClass": [ "DMNElement" ],
      "properties": [
        { "name": "typeRef", "type": "String", "isAttr": true }
      ]
    },
    {
      "name": "ItemDefinition",
      "superClass": [ "NamedElement" ],
      "properties": [
        { "name": "typeLanguage", "type": "String", "isAttr": true },
        { "name": "isCollection", "type": "Boolean", "isAttr": true, "default": false },
        { "name": "typeRef", "type": "String" },
        { "name": "allowedValues", "type": "UnaryTests", "isMany": true, "xml": { "serialize": "property" } }
      ]
    },
    {
      "name": "LiteralExpression",
      "superClass": [ "Expression" ],
      "properties": [
        { "name": "expressionLanguage", "type": "String", "isAttr": true },
        { "name": "importedValues", "type": "ImportedValues" },
        { "name": "text", "type": "String" }
      ]
    },
    {
      "name": "InformationItem",
      "superClass": [ "NamedElement" ],
      "properties": [
        { "name": "typeRef", "type": "String", "isAttr": true }
      ]
    },
    {
      "name": "DecisionTable",
      "superClass": [ "Expression" ],
      "properties": [
        { "name": "input", "type": "InputClause", "isMany": true, "xml": { "serialize": "property" } },
        { "name": "output", "type": "OutputClause", "isMany": true, "xml": { "serialize": "property" } },
        { "name": "rule", "type": "DecisionRule", "isMany": true, "xml": { "serialize": "property" } },
        { "name": "hitPolicy", "type": "HitPolicy", "isAttr": true , "default": "UNIQUE" },
        { "name": "aggregation", "type": "BuiltinAggregator", "isAttr": true },
        { "name": "preferredOrientation", "type": "DecisionTableOrientation", "isAttr": true, "default": "Rule-as-Row" },
        { "name": "outputLabel", "type": "String", "isAttr": true }
      ]
    },
    {
      "name": "DecisionRule",
      "superClass": [ "DMNElement" ],
      "properties": [
        { "name": "inputEntry", "type": "UnaryTests", "isMany": true, "xml": { "serialize": "property" } },
        { "name": "outputEntry", "type": "LiteralExpression", "isMany": true, "xml": { "serialize": "property" } }
      ]
    },
    {
      "name": "ImportedValues",
      "superClass": [ "Import" ],
      "properties": [
        { "name": "importedElement", "type": "String", "isMany": true, "xml": { "serialize": "property" } },
        { "name": "expressionLanguage", "type": "String", "isAttr": true }
      ]
    },
    {
      "name": "Artifact",
      "isAbstract": true,
      "superClass": [ "DMNElement" ]
    },
    {
      "name": "TextAnnotation",
      "superClass": [ "Artifact" ],
      "properties": [
        { "name": "text", "type": "String", "xml": { "serialize": "property" } },
        { "name": "textFormat", "type": "String", "isAttr": true }
      ]
    },
    {
      "name": "Association",
      "superClass": [ "Artifact" ],
      "properties": [
        { "name": "sourceRef", "type": "DMNElementReference", "xml": { "serialize": "property" } },
        { "name": "targetRef", "type": "DMNElementReference" , "xml": { "serialize": "property" } },
        { "name": "associationDirection", "type": "AssociationDirection", "isAttr": true, "default": "None" }
      ]
    },
    {
      "name": "InputClause",
      "superClass": [ "DMNElement" ],
      "properties": [
        { "name": "inputExpression", "type": "LiteralExpression", "xml": { "serialize": "property" } },
        { "name": "inputValues", "type": "UnaryTests", "xml": { "serialize": "property" } }
      ]
    },
    {
      "name": "OutputClause",
      "superClass": [ "DMNElement" ],
      "properties": [
        { "name": "outputValues", "type": "UnaryTests", "xml": { "serialize": "property" } },
        { "name": "defaultOutputEntry", "type": "LiteralExpression", "xml": { "serialize": "property" } },
        { "name": "name", "type": "String", "isAttr": true },
        { "name": "typeRef", "type": "String", "isAttr": true }
      ]
    },
    {
      "name": "UnaryTests",
      "superClass": [ "DMNElement" ],
      "properties": [
        { "name": "text", "type": "String" },
        { "name": "expressionLanguage", "type": "String", "isAttr": true }
      ]
    },
    {
      "name": "FunctionDefinition",
      "superClass": [ "Expression" ],
      "properties": [
        { "name": "formalParameter", "type": "InformationItem", "isMany": true, "xml": { "serialize": "property" } },
        { "name": "expression", "type": "String", "isReference": true, "xml": { "serialize": "property" } }
      ]
    }
  ],
  "emumerations": [
    {
      "name": "AssociationDirection",
      "literalValues": [
        {
          "name": "None"
        },
        {
          "name": "One"
        },
        {
          "name": "Both"
        }
      ]
    },
    {
      "name": "HitPolicy",
      "literalValues": [
        {
          "name": "UNIQUE"
        },
        {
          "name": "FIRST"
        },
        {
          "name": "PRIORITY"
        },
        {
          "name": "ANY"
        },
        {
          "name": "COLLECT"
        },
        {
          "name": "RULE ORDER"
        },
        {
          "name": "OUTPUT ORDER"
        }
      ]
    },
    {
      "name": "BuiltinAggregator",
      "literalValues": [
        {
          "name": "SUM"
        },
        {
          "name": "COUNT"
        },
        {
          "name": "MIN"
        },
        {
          "name": "MAX"
        }
      ]
    },
    {
      "name": "DecisionTableOrientation",
      "literalValues": [
        {
          "name": "Rule-as-Row"
        },
        {
          "name": "Rule-as-Column"
        },
        {
          "name": "CrossTable"
        }
      ]
    }
  ]
}

},{}],125:[function(_dereq_,module,exports){

/**
 * Expose `parse`.
 */

module.exports = parse;

/**
 * Tests for browser support.
 */

var innerHTMLBug = false;
var bugTestDiv;
if (typeof document !== 'undefined') {
  bugTestDiv = document.createElement('div');
  // Setup
  bugTestDiv.innerHTML = '  <link/><table></table><a href="/a">a</a><input type="checkbox"/>';
  // Make sure that link elements get serialized correctly by innerHTML
  // This requires a wrapper element in IE
  innerHTMLBug = !bugTestDiv.getElementsByTagName('link').length;
  bugTestDiv = undefined;
}

/**
 * Wrap map from jquery.
 */

var map = {
  legend: [1, '<fieldset>', '</fieldset>'],
  tr: [2, '<table><tbody>', '</tbody></table>'],
  col: [2, '<table><tbody></tbody><colgroup>', '</colgroup></table>'],
  // for script/link/style tags to work in IE6-8, you have to wrap
  // in a div with a non-whitespace character in front, ha!
  _default: innerHTMLBug ? [1, 'X<div>', '</div>'] : [0, '', '']
};

map.td =
map.th = [3, '<table><tbody><tr>', '</tr></tbody></table>'];

map.option =
map.optgroup = [1, '<select multiple="multiple">', '</select>'];

map.thead =
map.tbody =
map.colgroup =
map.caption =
map.tfoot = [1, '<table>', '</table>'];

map.polyline =
map.ellipse =
map.polygon =
map.circle =
map.text =
map.line =
map.path =
map.rect =
map.g = [1, '<svg xmlns="http://www.w3.org/2000/svg" version="1.1">','</svg>'];

/**
 * Parse `html` and return a DOM Node instance, which could be a TextNode,
 * HTML DOM Node of some kind (<div> for example), or a DocumentFragment
 * instance, depending on the contents of the `html` string.
 *
 * @param {String} html - HTML string to "domify"
 * @param {Document} doc - The `document` instance to create the Node for
 * @return {DOMNode} the TextNode, DOM Node, or DocumentFragment instance
 * @api private
 */

function parse(html, doc) {
  if ('string' != typeof html) throw new TypeError('String expected');

  // default to the global `document` object
  if (!doc) doc = document;

  // tag name
  var m = /<([\w:]+)/.exec(html);
  if (!m) return doc.createTextNode(html);

  html = html.replace(/^\s+|\s+$/g, ''); // Remove leading/trailing whitespace

  var tag = m[1];

  // body support
  if (tag == 'body') {
    var el = doc.createElement('html');
    el.innerHTML = html;
    return el.removeChild(el.lastChild);
  }

  // wrap map
  var wrap = map[tag] || map._default;
  var depth = wrap[0];
  var prefix = wrap[1];
  var suffix = wrap[2];
  var el = doc.createElement('div');
  el.innerHTML = prefix + html + suffix;
  while (depth--) el = el.lastChild;

  // one element
  if (el.firstChild == el.lastChild) {
    return el.removeChild(el.firstChild);
  }

  // several elements
  var fragment = doc.createDocumentFragment();
  while (el.firstChild) {
    fragment.appendChild(el.removeChild(el.firstChild));
  }

  return fragment;
}

},{}],126:[function(_dereq_,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],127:[function(_dereq_,module,exports){
/**
 * Gets the last element of `array`.
 *
 * @static
 * @memberOf _
 * @category Array
 * @param {Array} array The array to query.
 * @returns {*} Returns the last element of `array`.
 * @example
 *
 * _.last([1, 2, 3]);
 * // => 3
 */
function last(array) {
  var length = array ? array.length : 0;
  return length ? array[length - 1] : undefined;
}

module.exports = last;

},{}],128:[function(_dereq_,module,exports){
var baseFlatten = _dereq_(169),
    baseUniq = _dereq_(191),
    restParam = _dereq_(145);

/**
 * Creates an array of unique values, in order, from all of the provided arrays
 * using [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * for equality comparisons.
 *
 * @static
 * @memberOf _
 * @category Array
 * @param {...Array} [arrays] The arrays to inspect.
 * @returns {Array} Returns the new array of combined values.
 * @example
 *
 * _.union([1, 2], [4, 2], [2, 1]);
 * // => [1, 2, 4]
 */
var union = restParam(function(arrays) {
  return baseUniq(baseFlatten(arrays, false, true));
});

module.exports = union;

},{"145":145,"169":169,"191":191}],129:[function(_dereq_,module,exports){
var baseCallback = _dereq_(159),
    baseUniq = _dereq_(191),
    isIterateeCall = _dereq_(221),
    sortedUniq = _dereq_(236);

/**
 * Creates a duplicate-free version of an array, using
 * [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * for equality comparisons, in which only the first occurence of each element
 * is kept. Providing `true` for `isSorted` performs a faster search algorithm
 * for sorted arrays. If an iteratee function is provided it's invoked for
 * each element in the array to generate the criterion by which uniqueness
 * is computed. The `iteratee` is bound to `thisArg` and invoked with three
 * arguments: (value, index, array).
 *
 * If a property name is provided for `iteratee` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `iteratee` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @alias unique
 * @category Array
 * @param {Array} array The array to inspect.
 * @param {boolean} [isSorted] Specify the array is sorted.
 * @param {Function|Object|string} [iteratee] The function invoked per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Array} Returns the new duplicate-value-free array.
 * @example
 *
 * _.uniq([2, 1, 2]);
 * // => [2, 1]
 *
 * // using `isSorted`
 * _.uniq([1, 1, 2], true);
 * // => [1, 2]
 *
 * // using an iteratee function
 * _.uniq([1, 2.5, 1.5, 2], function(n) {
 *   return this.floor(n);
 * }, Math);
 * // => [1, 2.5]
 *
 * // using the `_.property` callback shorthand
 * _.uniq([{ 'x': 1 }, { 'x': 2 }, { 'x': 1 }], 'x');
 * // => [{ 'x': 1 }, { 'x': 2 }]
 */
function uniq(array, isSorted, iteratee, thisArg) {
  var length = array ? array.length : 0;
  if (!length) {
    return [];
  }
  if (isSorted != null && typeof isSorted != 'boolean') {
    thisArg = iteratee;
    iteratee = isIterateeCall(array, isSorted, thisArg) ? undefined : isSorted;
    isSorted = false;
  }
  iteratee = iteratee == null ? iteratee : baseCallback(iteratee, thisArg, 3);
  return (isSorted)
    ? sortedUniq(array, iteratee)
    : baseUniq(array, iteratee);
}

module.exports = uniq;

},{"159":159,"191":191,"221":221,"236":236}],130:[function(_dereq_,module,exports){
module.exports = _dereq_(129);

},{"129":129}],131:[function(_dereq_,module,exports){
var LazyWrapper = _dereq_(146),
    LodashWrapper = _dereq_(147),
    baseLodash = _dereq_(178),
    isArray = _dereq_(241),
    isObjectLike = _dereq_(225),
    wrapperClone = _dereq_(239);

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Creates a `lodash` object which wraps `value` to enable implicit chaining.
 * Methods that operate on and return arrays, collections, and functions can
 * be chained together. Methods that retrieve a single value or may return a
 * primitive value will automatically end the chain returning the unwrapped
 * value. Explicit chaining may be enabled using `_.chain`. The execution of
 * chained methods is lazy, that is, execution is deferred until `_#value`
 * is implicitly or explicitly called.
 *
 * Lazy evaluation allows several methods to support shortcut fusion. Shortcut
 * fusion is an optimization strategy which merge iteratee calls; this can help
 * to avoid the creation of intermediate data structures and greatly reduce the
 * number of iteratee executions.
 *
 * Chaining is supported in custom builds as long as the `_#value` method is
 * directly or indirectly included in the build.
 *
 * In addition to lodash methods, wrappers have `Array` and `String` methods.
 *
 * The wrapper `Array` methods are:
 * `concat`, `join`, `pop`, `push`, `reverse`, `shift`, `slice`, `sort`,
 * `splice`, and `unshift`
 *
 * The wrapper `String` methods are:
 * `replace` and `split`
 *
 * The wrapper methods that support shortcut fusion are:
 * `compact`, `drop`, `dropRight`, `dropRightWhile`, `dropWhile`, `filter`,
 * `first`, `initial`, `last`, `map`, `pluck`, `reject`, `rest`, `reverse`,
 * `slice`, `take`, `takeRight`, `takeRightWhile`, `takeWhile`, `toArray`,
 * and `where`
 *
 * The chainable wrapper methods are:
 * `after`, `ary`, `assign`, `at`, `before`, `bind`, `bindAll`, `bindKey`,
 * `callback`, `chain`, `chunk`, `commit`, `compact`, `concat`, `constant`,
 * `countBy`, `create`, `curry`, `debounce`, `defaults`, `defaultsDeep`,
 * `defer`, `delay`, `difference`, `drop`, `dropRight`, `dropRightWhile`,
 * `dropWhile`, `fill`, `filter`, `flatten`, `flattenDeep`, `flow`, `flowRight`,
 * `forEach`, `forEachRight`, `forIn`, `forInRight`, `forOwn`, `forOwnRight`,
 * `functions`, `groupBy`, `indexBy`, `initial`, `intersection`, `invert`,
 * `invoke`, `keys`, `keysIn`, `map`, `mapKeys`, `mapValues`, `matches`,
 * `matchesProperty`, `memoize`, `merge`, `method`, `methodOf`, `mixin`,
 * `modArgs`, `negate`, `omit`, `once`, `pairs`, `partial`, `partialRight`,
 * `partition`, `pick`, `plant`, `pluck`, `property`, `propertyOf`, `pull`,
 * `pullAt`, `push`, `range`, `rearg`, `reject`, `remove`, `rest`, `restParam`,
 * `reverse`, `set`, `shuffle`, `slice`, `sort`, `sortBy`, `sortByAll`,
 * `sortByOrder`, `splice`, `spread`, `take`, `takeRight`, `takeRightWhile`,
 * `takeWhile`, `tap`, `throttle`, `thru`, `times`, `toArray`, `toPlainObject`,
 * `transform`, `union`, `uniq`, `unshift`, `unzip`, `unzipWith`, `values`,
 * `valuesIn`, `where`, `without`, `wrap`, `xor`, `zip`, `zipObject`, `zipWith`
 *
 * The wrapper methods that are **not** chainable by default are:
 * `add`, `attempt`, `camelCase`, `capitalize`, `ceil`, `clone`, `cloneDeep`,
 * `deburr`, `endsWith`, `escape`, `escapeRegExp`, `every`, `find`, `findIndex`,
 * `findKey`, `findLast`, `findLastIndex`, `findLastKey`, `findWhere`, `first`,
 * `floor`, `get`, `gt`, `gte`, `has`, `identity`, `includes`, `indexOf`,
 * `inRange`, `isArguments`, `isArray`, `isBoolean`, `isDate`, `isElement`,
 * `isEmpty`, `isEqual`, `isError`, `isFinite` `isFunction`, `isMatch`,
 * `isNative`, `isNaN`, `isNull`, `isNumber`, `isObject`, `isPlainObject`,
 * `isRegExp`, `isString`, `isUndefined`, `isTypedArray`, `join`, `kebabCase`,
 * `last`, `lastIndexOf`, `lt`, `lte`, `max`, `min`, `noConflict`, `noop`,
 * `now`, `pad`, `padLeft`, `padRight`, `parseInt`, `pop`, `random`, `reduce`,
 * `reduceRight`, `repeat`, `result`, `round`, `runInContext`, `shift`, `size`,
 * `snakeCase`, `some`, `sortedIndex`, `sortedLastIndex`, `startCase`,
 * `startsWith`, `sum`, `template`, `trim`, `trimLeft`, `trimRight`, `trunc`,
 * `unescape`, `uniqueId`, `value`, and `words`
 *
 * The wrapper method `sample` will return a wrapped value when `n` is provided,
 * otherwise an unwrapped value is returned.
 *
 * @name _
 * @constructor
 * @category Chain
 * @param {*} value The value to wrap in a `lodash` instance.
 * @returns {Object} Returns the new `lodash` wrapper instance.
 * @example
 *
 * var wrapped = _([1, 2, 3]);
 *
 * // returns an unwrapped value
 * wrapped.reduce(function(total, n) {
 *   return total + n;
 * });
 * // => 6
 *
 * // returns a wrapped value
 * var squares = wrapped.map(function(n) {
 *   return n * n;
 * });
 *
 * _.isArray(squares);
 * // => false
 *
 * _.isArray(squares.value());
 * // => true
 */
function lodash(value) {
  if (isObjectLike(value) && !isArray(value) && !(value instanceof LazyWrapper)) {
    if (value instanceof LodashWrapper) {
      return value;
    }
    if (hasOwnProperty.call(value, '__chain__') && hasOwnProperty.call(value, '__wrapped__')) {
      return wrapperClone(value);
    }
  }
  return new LodashWrapper(value);
}

// Ensure wrappers are instances of `baseLodash`.
lodash.prototype = baseLodash.prototype;

module.exports = lodash;

},{"146":146,"147":147,"178":178,"225":225,"239":239,"241":241}],132:[function(_dereq_,module,exports){
module.exports = _dereq_(140);

},{"140":140}],133:[function(_dereq_,module,exports){
var arrayEvery = _dereq_(151),
    baseCallback = _dereq_(159),
    baseEvery = _dereq_(165),
    isArray = _dereq_(241),
    isIterateeCall = _dereq_(221);

/**
 * Checks if `predicate` returns truthy for **all** elements of `collection`.
 * The predicate is bound to `thisArg` and invoked with three arguments:
 * (value, index|key, collection).
 *
 * If a property name is provided for `predicate` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `predicate` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @alias all
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [predicate=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `predicate`.
 * @returns {boolean} Returns `true` if all elements pass the predicate check,
 *  else `false`.
 * @example
 *
 * _.every([true, 1, null, 'yes'], Boolean);
 * // => false
 *
 * var users = [
 *   { 'user': 'barney', 'active': false },
 *   { 'user': 'fred',   'active': false }
 * ];
 *
 * // using the `_.matches` callback shorthand
 * _.every(users, { 'user': 'barney', 'active': false });
 * // => false
 *
 * // using the `_.matchesProperty` callback shorthand
 * _.every(users, 'active', false);
 * // => true
 *
 * // using the `_.property` callback shorthand
 * _.every(users, 'active');
 * // => false
 */
function every(collection, predicate, thisArg) {
  var func = isArray(collection) ? arrayEvery : baseEvery;
  if (thisArg && isIterateeCall(collection, predicate, thisArg)) {
    predicate = undefined;
  }
  if (typeof predicate != 'function' || thisArg !== undefined) {
    predicate = baseCallback(predicate, thisArg, 3);
  }
  return func(collection, predicate);
}

module.exports = every;

},{"151":151,"159":159,"165":165,"221":221,"241":241}],134:[function(_dereq_,module,exports){
var arrayFilter = _dereq_(152),
    baseCallback = _dereq_(159),
    baseFilter = _dereq_(166),
    isArray = _dereq_(241);

/**
 * Iterates over elements of `collection`, returning an array of all elements
 * `predicate` returns truthy for. The predicate is bound to `thisArg` and
 * invoked with three arguments: (value, index|key, collection).
 *
 * If a property name is provided for `predicate` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `predicate` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @alias select
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [predicate=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `predicate`.
 * @returns {Array} Returns the new filtered array.
 * @example
 *
 * _.filter([4, 5, 6], function(n) {
 *   return n % 2 == 0;
 * });
 * // => [4, 6]
 *
 * var users = [
 *   { 'user': 'barney', 'age': 36, 'active': true },
 *   { 'user': 'fred',   'age': 40, 'active': false }
 * ];
 *
 * // using the `_.matches` callback shorthand
 * _.pluck(_.filter(users, { 'age': 36, 'active': true }), 'user');
 * // => ['barney']
 *
 * // using the `_.matchesProperty` callback shorthand
 * _.pluck(_.filter(users, 'active', false), 'user');
 * // => ['fred']
 *
 * // using the `_.property` callback shorthand
 * _.pluck(_.filter(users, 'active'), 'user');
 * // => ['barney']
 */
function filter(collection, predicate, thisArg) {
  var func = isArray(collection) ? arrayFilter : baseFilter;
  predicate = baseCallback(predicate, thisArg, 3);
  return func(collection, predicate);
}

module.exports = filter;

},{"152":152,"159":159,"166":166,"241":241}],135:[function(_dereq_,module,exports){
var baseEach = _dereq_(164),
    createFind = _dereq_(204);

/**
 * Iterates over elements of `collection`, returning the first element
 * `predicate` returns truthy for. The predicate is bound to `thisArg` and
 * invoked with three arguments: (value, index|key, collection).
 *
 * If a property name is provided for `predicate` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `predicate` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @alias detect
 * @category Collection
 * @param {Array|Object|string} collection The collection to search.
 * @param {Function|Object|string} [predicate=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `predicate`.
 * @returns {*} Returns the matched element, else `undefined`.
 * @example
 *
 * var users = [
 *   { 'user': 'barney',  'age': 36, 'active': true },
 *   { 'user': 'fred',    'age': 40, 'active': false },
 *   { 'user': 'pebbles', 'age': 1,  'active': true }
 * ];
 *
 * _.result(_.find(users, function(chr) {
 *   return chr.age < 40;
 * }), 'user');
 * // => 'barney'
 *
 * // using the `_.matches` callback shorthand
 * _.result(_.find(users, { 'age': 1, 'active': true }), 'user');
 * // => 'pebbles'
 *
 * // using the `_.matchesProperty` callback shorthand
 * _.result(_.find(users, 'active', false), 'user');
 * // => 'fred'
 *
 * // using the `_.property` callback shorthand
 * _.result(_.find(users, 'active'), 'user');
 * // => 'barney'
 */
var find = createFind(baseEach);

module.exports = find;

},{"164":164,"204":204}],136:[function(_dereq_,module,exports){
var arrayEach = _dereq_(150),
    baseEach = _dereq_(164),
    createForEach = _dereq_(205);

/**
 * Iterates over elements of `collection` invoking `iteratee` for each element.
 * The `iteratee` is bound to `thisArg` and invoked with three arguments:
 * (value, index|key, collection). Iteratee functions may exit iteration early
 * by explicitly returning `false`.
 *
 * **Note:** As with other "Collections" methods, objects with a "length" property
 * are iterated like arrays. To avoid this behavior `_.forIn` or `_.forOwn`
 * may be used for object iteration.
 *
 * @static
 * @memberOf _
 * @alias each
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Array|Object|string} Returns `collection`.
 * @example
 *
 * _([1, 2]).forEach(function(n) {
 *   console.log(n);
 * }).value();
 * // => logs each value from left to right and returns the array
 *
 * _.forEach({ 'a': 1, 'b': 2 }, function(n, key) {
 *   console.log(n, key);
 * });
 * // => logs each value-key pair and returns the object (iteration order is not guaranteed)
 */
var forEach = createForEach(arrayEach, baseEach);

module.exports = forEach;

},{"150":150,"164":164,"205":205}],137:[function(_dereq_,module,exports){
var createAggregator = _dereq_(197);

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Creates an object composed of keys generated from the results of running
 * each element of `collection` through `iteratee`. The corresponding value
 * of each key is an array of the elements responsible for generating the key.
 * The `iteratee` is bound to `thisArg` and invoked with three arguments:
 * (value, index|key, collection).
 *
 * If a property name is provided for `iteratee` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `iteratee` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [iteratee=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Object} Returns the composed aggregate object.
 * @example
 *
 * _.groupBy([4.2, 6.1, 6.4], function(n) {
 *   return Math.floor(n);
 * });
 * // => { '4': [4.2], '6': [6.1, 6.4] }
 *
 * _.groupBy([4.2, 6.1, 6.4], function(n) {
 *   return this.floor(n);
 * }, Math);
 * // => { '4': [4.2], '6': [6.1, 6.4] }
 *
 * // using the `_.property` callback shorthand
 * _.groupBy(['one', 'two', 'three'], 'length');
 * // => { '3': ['one', 'two'], '5': ['three'] }
 */
var groupBy = createAggregator(function(result, value, key) {
  if (hasOwnProperty.call(result, key)) {
    result[key].push(value);
  } else {
    result[key] = [value];
  }
});

module.exports = groupBy;

},{"197":197}],138:[function(_dereq_,module,exports){
var arrayMap = _dereq_(153),
    baseCallback = _dereq_(159),
    baseMap = _dereq_(179),
    isArray = _dereq_(241);

/**
 * Creates an array of values by running each element in `collection` through
 * `iteratee`. The `iteratee` is bound to `thisArg` and invoked with three
 * arguments: (value, index|key, collection).
 *
 * If a property name is provided for `iteratee` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `iteratee` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * Many lodash methods are guarded to work as iteratees for methods like
 * `_.every`, `_.filter`, `_.map`, `_.mapValues`, `_.reject`, and `_.some`.
 *
 * The guarded methods are:
 * `ary`, `callback`, `chunk`, `clone`, `create`, `curry`, `curryRight`,
 * `drop`, `dropRight`, `every`, `fill`, `flatten`, `invert`, `max`, `min`,
 * `parseInt`, `slice`, `sortBy`, `take`, `takeRight`, `template`, `trim`,
 * `trimLeft`, `trimRight`, `trunc`, `random`, `range`, `sample`, `some`,
 * `sum`, `uniq`, and `words`
 *
 * @static
 * @memberOf _
 * @alias collect
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [iteratee=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Array} Returns the new mapped array.
 * @example
 *
 * function timesThree(n) {
 *   return n * 3;
 * }
 *
 * _.map([1, 2], timesThree);
 * // => [3, 6]
 *
 * _.map({ 'a': 1, 'b': 2 }, timesThree);
 * // => [3, 6] (iteration order is not guaranteed)
 *
 * var users = [
 *   { 'user': 'barney' },
 *   { 'user': 'fred' }
 * ];
 *
 * // using the `_.property` callback shorthand
 * _.map(users, 'user');
 * // => ['barney', 'fred']
 */
function map(collection, iteratee, thisArg) {
  var func = isArray(collection) ? arrayMap : baseMap;
  iteratee = baseCallback(iteratee, thisArg, 3);
  return func(collection, iteratee);
}

module.exports = map;

},{"153":153,"159":159,"179":179,"241":241}],139:[function(_dereq_,module,exports){
var arrayReduce = _dereq_(155),
    baseEach = _dereq_(164),
    createReduce = _dereq_(208);

/**
 * Reduces `collection` to a value which is the accumulated result of running
 * each element in `collection` through `iteratee`, where each successive
 * invocation is supplied the return value of the previous. If `accumulator`
 * is not provided the first element of `collection` is used as the initial
 * value. The `iteratee` is bound to `thisArg` and invoked with four arguments:
 * (accumulator, value, index|key, collection).
 *
 * Many lodash methods are guarded to work as iteratees for methods like
 * `_.reduce`, `_.reduceRight`, and `_.transform`.
 *
 * The guarded methods are:
 * `assign`, `defaults`, `defaultsDeep`, `includes`, `merge`, `sortByAll`,
 * and `sortByOrder`
 *
 * @static
 * @memberOf _
 * @alias foldl, inject
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @param {*} [accumulator] The initial value.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {*} Returns the accumulated value.
 * @example
 *
 * _.reduce([1, 2], function(total, n) {
 *   return total + n;
 * });
 * // => 3
 *
 * _.reduce({ 'a': 1, 'b': 2 }, function(result, n, key) {
 *   result[key] = n * 3;
 *   return result;
 * }, {});
 * // => { 'a': 3, 'b': 6 } (iteration order is not guaranteed)
 */
var reduce = createReduce(arrayReduce, baseEach);

module.exports = reduce;

},{"155":155,"164":164,"208":208}],140:[function(_dereq_,module,exports){
var arraySome = _dereq_(156),
    baseCallback = _dereq_(159),
    baseSome = _dereq_(189),
    isArray = _dereq_(241),
    isIterateeCall = _dereq_(221);

/**
 * Checks if `predicate` returns truthy for **any** element of `collection`.
 * The function returns as soon as it finds a passing value and does not iterate
 * over the entire collection. The predicate is bound to `thisArg` and invoked
 * with three arguments: (value, index|key, collection).
 *
 * If a property name is provided for `predicate` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `predicate` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @alias any
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [predicate=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `predicate`.
 * @returns {boolean} Returns `true` if any element passes the predicate check,
 *  else `false`.
 * @example
 *
 * _.some([null, 0, 'yes', false], Boolean);
 * // => true
 *
 * var users = [
 *   { 'user': 'barney', 'active': true },
 *   { 'user': 'fred',   'active': false }
 * ];
 *
 * // using the `_.matches` callback shorthand
 * _.some(users, { 'user': 'barney', 'active': false });
 * // => false
 *
 * // using the `_.matchesProperty` callback shorthand
 * _.some(users, 'active', false);
 * // => true
 *
 * // using the `_.property` callback shorthand
 * _.some(users, 'active');
 * // => true
 */
function some(collection, predicate, thisArg) {
  var func = isArray(collection) ? arraySome : baseSome;
  if (thisArg && isIterateeCall(collection, predicate, thisArg)) {
    predicate = undefined;
  }
  if (typeof predicate != 'function' || thisArg !== undefined) {
    predicate = baseCallback(predicate, thisArg, 3);
  }
  return func(collection, predicate);
}

module.exports = some;

},{"156":156,"159":159,"189":189,"221":221,"241":241}],141:[function(_dereq_,module,exports){
var getNative = _dereq_(217);

/* Native method references for those with the same name as other `lodash` methods. */
var nativeNow = getNative(Date, 'now');

/**
 * Gets the number of milliseconds that have elapsed since the Unix epoch
 * (1 January 1970 00:00:00 UTC).
 *
 * @static
 * @memberOf _
 * @category Date
 * @example
 *
 * _.defer(function(stamp) {
 *   console.log(_.now() - stamp);
 * }, _.now());
 * // => logs the number of milliseconds it took for the deferred function to be invoked
 */
var now = nativeNow || function() {
  return new Date().getTime();
};

module.exports = now;

},{"217":217}],142:[function(_dereq_,module,exports){
var createWrapper = _dereq_(209),
    replaceHolders = _dereq_(233),
    restParam = _dereq_(145);

/** Used to compose bitmasks for wrapper metadata. */
var BIND_FLAG = 1,
    PARTIAL_FLAG = 32;

/**
 * Creates a function that invokes `func` with the `this` binding of `thisArg`
 * and prepends any additional `_.bind` arguments to those provided to the
 * bound function.
 *
 * The `_.bind.placeholder` value, which defaults to `_` in monolithic builds,
 * may be used as a placeholder for partially applied arguments.
 *
 * **Note:** Unlike native `Function#bind` this method does not set the "length"
 * property of bound functions.
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to bind.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {...*} [partials] The arguments to be partially applied.
 * @returns {Function} Returns the new bound function.
 * @example
 *
 * var greet = function(greeting, punctuation) {
 *   return greeting + ' ' + this.user + punctuation;
 * };
 *
 * var object = { 'user': 'fred' };
 *
 * var bound = _.bind(greet, object, 'hi');
 * bound('!');
 * // => 'hi fred!'
 *
 * // using placeholders
 * var bound = _.bind(greet, object, _, '!');
 * bound('hi');
 * // => 'hi fred!'
 */
var bind = restParam(function(func, thisArg, partials) {
  var bitmask = BIND_FLAG;
  if (partials.length) {
    var holders = replaceHolders(partials, bind.placeholder);
    bitmask |= PARTIAL_FLAG;
  }
  return createWrapper(func, bitmask, thisArg, partials, holders);
});

// Assign default placeholders.
bind.placeholder = {};

module.exports = bind;

},{"145":145,"209":209,"233":233}],143:[function(_dereq_,module,exports){
var isObject = _dereq_(245),
    now = _dereq_(141);

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. The debounced function comes with a `cancel` method to cancel
 * delayed invocations. Provide an options object to indicate that `func`
 * should be invoked on the leading and/or trailing edge of the `wait` timeout.
 * Subsequent calls to the debounced function return the result of the last
 * `func` invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is invoked
 * on the trailing edge of the timeout only if the the debounced function is
 * invoked more than once during the `wait` timeout.
 *
 * See [David Corbacho's article](http://drupalmotion.com/article/debounce-and-throttle-visual-explanation)
 * for details over the differences between `_.debounce` and `_.throttle`.
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to debounce.
 * @param {number} [wait=0] The number of milliseconds to delay.
 * @param {Object} [options] The options object.
 * @param {boolean} [options.leading=false] Specify invoking on the leading
 *  edge of the timeout.
 * @param {number} [options.maxWait] The maximum time `func` is allowed to be
 *  delayed before it's invoked.
 * @param {boolean} [options.trailing=true] Specify invoking on the trailing
 *  edge of the timeout.
 * @returns {Function} Returns the new debounced function.
 * @example
 *
 * // avoid costly calculations while the window size is in flux
 * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
 *
 * // invoke `sendMail` when the click event is fired, debouncing subsequent calls
 * jQuery('#postbox').on('click', _.debounce(sendMail, 300, {
 *   'leading': true,
 *   'trailing': false
 * }));
 *
 * // ensure `batchLog` is invoked once after 1 second of debounced calls
 * var source = new EventSource('/stream');
 * jQuery(source).on('message', _.debounce(batchLog, 250, {
 *   'maxWait': 1000
 * }));
 *
 * // cancel a debounced call
 * var todoChanges = _.debounce(batchLog, 1000);
 * Object.observe(models.todo, todoChanges);
 *
 * Object.observe(models, function(changes) {
 *   if (_.find(changes, { 'user': 'todo', 'type': 'delete'})) {
 *     todoChanges.cancel();
 *   }
 * }, ['delete']);
 *
 * // ...at some point `models.todo` is changed
 * models.todo.completed = true;
 *
 * // ...before 1 second has passed `models.todo` is deleted
 * // which cancels the debounced `todoChanges` call
 * delete models.todo;
 */
function debounce(func, wait, options) {
  var args,
      maxTimeoutId,
      result,
      stamp,
      thisArg,
      timeoutId,
      trailingCall,
      lastCalled = 0,
      maxWait = false,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  wait = wait < 0 ? 0 : (+wait || 0);
  if (options === true) {
    var leading = true;
    trailing = false;
  } else if (isObject(options)) {
    leading = !!options.leading;
    maxWait = 'maxWait' in options && nativeMax(+options.maxWait || 0, wait);
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }

  function cancel() {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (maxTimeoutId) {
      clearTimeout(maxTimeoutId);
    }
    lastCalled = 0;
    maxTimeoutId = timeoutId = trailingCall = undefined;
  }

  function complete(isCalled, id) {
    if (id) {
      clearTimeout(id);
    }
    maxTimeoutId = timeoutId = trailingCall = undefined;
    if (isCalled) {
      lastCalled = now();
      result = func.apply(thisArg, args);
      if (!timeoutId && !maxTimeoutId) {
        args = thisArg = undefined;
      }
    }
  }

  function delayed() {
    var remaining = wait - (now() - stamp);
    if (remaining <= 0 || remaining > wait) {
      complete(trailingCall, maxTimeoutId);
    } else {
      timeoutId = setTimeout(delayed, remaining);
    }
  }

  function maxDelayed() {
    complete(trailing, timeoutId);
  }

  function debounced() {
    args = arguments;
    stamp = now();
    thisArg = this;
    trailingCall = trailing && (timeoutId || !leading);

    if (maxWait === false) {
      var leadingCall = leading && !timeoutId;
    } else {
      if (!maxTimeoutId && !leading) {
        lastCalled = stamp;
      }
      var remaining = maxWait - (stamp - lastCalled),
          isCalled = remaining <= 0 || remaining > maxWait;

      if (isCalled) {
        if (maxTimeoutId) {
          maxTimeoutId = clearTimeout(maxTimeoutId);
        }
        lastCalled = stamp;
        result = func.apply(thisArg, args);
      }
      else if (!maxTimeoutId) {
        maxTimeoutId = setTimeout(maxDelayed, remaining);
      }
    }
    if (isCalled && timeoutId) {
      timeoutId = clearTimeout(timeoutId);
    }
    else if (!timeoutId && wait !== maxWait) {
      timeoutId = setTimeout(delayed, wait);
    }
    if (leadingCall) {
      isCalled = true;
      result = func.apply(thisArg, args);
    }
    if (isCalled && !timeoutId && !maxTimeoutId) {
      args = thisArg = undefined;
    }
    return result;
  }
  debounced.cancel = cancel;
  return debounced;
}

module.exports = debounce;

},{"141":141,"245":245}],144:[function(_dereq_,module,exports){
var baseDelay = _dereq_(162),
    restParam = _dereq_(145);

/**
 * Defers invoking the `func` until the current call stack has cleared. Any
 * additional arguments are provided to `func` when it's invoked.
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to defer.
 * @param {...*} [args] The arguments to invoke the function with.
 * @returns {number} Returns the timer id.
 * @example
 *
 * _.defer(function(text) {
 *   console.log(text);
 * }, 'deferred');
 * // logs 'deferred' after one or more milliseconds
 */
var defer = restParam(function(func, args) {
  return baseDelay(func, 1, args);
});

module.exports = defer;

},{"145":145,"162":162}],145:[function(_dereq_,module,exports){
/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates a function that invokes `func` with the `this` binding of the
 * created function and arguments from `start` and beyond provided as an array.
 *
 * **Note:** This method is based on the [rest parameter](https://developer.mozilla.org/Web/JavaScript/Reference/Functions/rest_parameters).
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to apply a rest parameter to.
 * @param {number} [start=func.length-1] The start position of the rest parameter.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var say = _.restParam(function(what, names) {
 *   return what + ' ' + _.initial(names).join(', ') +
 *     (_.size(names) > 1 ? ', & ' : '') + _.last(names);
 * });
 *
 * say('hello', 'fred', 'barney', 'pebbles');
 * // => 'hello fred, barney, & pebbles'
 */
function restParam(func, start) {
  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  start = nativeMax(start === undefined ? (func.length - 1) : (+start || 0), 0);
  return function() {
    var args = arguments,
        index = -1,
        length = nativeMax(args.length - start, 0),
        rest = Array(length);

    while (++index < length) {
      rest[index] = args[start + index];
    }
    switch (start) {
      case 0: return func.call(this, rest);
      case 1: return func.call(this, args[0], rest);
      case 2: return func.call(this, args[0], args[1], rest);
    }
    var otherArgs = Array(start + 1);
    index = -1;
    while (++index < start) {
      otherArgs[index] = args[index];
    }
    otherArgs[start] = rest;
    return func.apply(this, otherArgs);
  };
}

module.exports = restParam;

},{}],146:[function(_dereq_,module,exports){
var baseCreate = _dereq_(161),
    baseLodash = _dereq_(178);

/** Used as references for `-Infinity` and `Infinity`. */
var POSITIVE_INFINITY = Number.POSITIVE_INFINITY;

/**
 * Creates a lazy wrapper object which wraps `value` to enable lazy evaluation.
 *
 * @private
 * @param {*} value The value to wrap.
 */
function LazyWrapper(value) {
  this.__wrapped__ = value;
  this.__actions__ = [];
  this.__dir__ = 1;
  this.__filtered__ = false;
  this.__iteratees__ = [];
  this.__takeCount__ = POSITIVE_INFINITY;
  this.__views__ = [];
}

LazyWrapper.prototype = baseCreate(baseLodash.prototype);
LazyWrapper.prototype.constructor = LazyWrapper;

module.exports = LazyWrapper;

},{"161":161,"178":178}],147:[function(_dereq_,module,exports){
var baseCreate = _dereq_(161),
    baseLodash = _dereq_(178);

/**
 * The base constructor for creating `lodash` wrapper objects.
 *
 * @private
 * @param {*} value The value to wrap.
 * @param {boolean} [chainAll] Enable chaining for all wrapper methods.
 * @param {Array} [actions=[]] Actions to peform to resolve the unwrapped value.
 */
function LodashWrapper(value, chainAll, actions) {
  this.__wrapped__ = value;
  this.__actions__ = actions || [];
  this.__chain__ = !!chainAll;
}

LodashWrapper.prototype = baseCreate(baseLodash.prototype);
LodashWrapper.prototype.constructor = LodashWrapper;

module.exports = LodashWrapper;

},{"161":161,"178":178}],148:[function(_dereq_,module,exports){
(function (global){
var cachePush = _dereq_(194),
    getNative = _dereq_(217);

/** Native method references. */
var Set = getNative(global, 'Set');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeCreate = getNative(Object, 'create');

/**
 *
 * Creates a cache object to store unique values.
 *
 * @private
 * @param {Array} [values] The values to cache.
 */
function SetCache(values) {
  var length = values ? values.length : 0;

  this.data = { 'hash': nativeCreate(null), 'set': new Set };
  while (length--) {
    this.push(values[length]);
  }
}

// Add functions to the `Set` cache.
SetCache.prototype.push = cachePush;

module.exports = SetCache;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"194":194,"217":217}],149:[function(_dereq_,module,exports){
/**
 * Copies the values of `source` to `array`.
 *
 * @private
 * @param {Array} source The array to copy values from.
 * @param {Array} [array=[]] The array to copy values to.
 * @returns {Array} Returns `array`.
 */
function arrayCopy(source, array) {
  var index = -1,
      length = source.length;

  array || (array = Array(length));
  while (++index < length) {
    array[index] = source[index];
  }
  return array;
}

module.exports = arrayCopy;

},{}],150:[function(_dereq_,module,exports){
/**
 * A specialized version of `_.forEach` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns `array`.
 */
function arrayEach(array, iteratee) {
  var index = -1,
      length = array.length;

  while (++index < length) {
    if (iteratee(array[index], index, array) === false) {
      break;
    }
  }
  return array;
}

module.exports = arrayEach;

},{}],151:[function(_dereq_,module,exports){
/**
 * A specialized version of `_.every` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {boolean} Returns `true` if all elements pass the predicate check,
 *  else `false`.
 */
function arrayEvery(array, predicate) {
  var index = -1,
      length = array.length;

  while (++index < length) {
    if (!predicate(array[index], index, array)) {
      return false;
    }
  }
  return true;
}

module.exports = arrayEvery;

},{}],152:[function(_dereq_,module,exports){
/**
 * A specialized version of `_.filter` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {Array} Returns the new filtered array.
 */
function arrayFilter(array, predicate) {
  var index = -1,
      length = array.length,
      resIndex = -1,
      result = [];

  while (++index < length) {
    var value = array[index];
    if (predicate(value, index, array)) {
      result[++resIndex] = value;
    }
  }
  return result;
}

module.exports = arrayFilter;

},{}],153:[function(_dereq_,module,exports){
/**
 * A specialized version of `_.map` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function arrayMap(array, iteratee) {
  var index = -1,
      length = array.length,
      result = Array(length);

  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}

module.exports = arrayMap;

},{}],154:[function(_dereq_,module,exports){
/**
 * Appends the elements of `values` to `array`.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {Array} values The values to append.
 * @returns {Array} Returns `array`.
 */
function arrayPush(array, values) {
  var index = -1,
      length = values.length,
      offset = array.length;

  while (++index < length) {
    array[offset + index] = values[index];
  }
  return array;
}

module.exports = arrayPush;

},{}],155:[function(_dereq_,module,exports){
/**
 * A specialized version of `_.reduce` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {*} [accumulator] The initial value.
 * @param {boolean} [initFromArray] Specify using the first element of `array`
 *  as the initial value.
 * @returns {*} Returns the accumulated value.
 */
function arrayReduce(array, iteratee, accumulator, initFromArray) {
  var index = -1,
      length = array.length;

  if (initFromArray && length) {
    accumulator = array[++index];
  }
  while (++index < length) {
    accumulator = iteratee(accumulator, array[index], index, array);
  }
  return accumulator;
}

module.exports = arrayReduce;

},{}],156:[function(_dereq_,module,exports){
/**
 * A specialized version of `_.some` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {boolean} Returns `true` if any element passes the predicate check,
 *  else `false`.
 */
function arraySome(array, predicate) {
  var index = -1,
      length = array.length;

  while (++index < length) {
    if (predicate(array[index], index, array)) {
      return true;
    }
  }
  return false;
}

module.exports = arraySome;

},{}],157:[function(_dereq_,module,exports){
var keys = _dereq_(251);

/**
 * A specialized version of `_.assign` for customizing assigned values without
 * support for argument juggling, multiple sources, and `this` binding `customizer`
 * functions.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @param {Function} customizer The function to customize assigned values.
 * @returns {Object} Returns `object`.
 */
function assignWith(object, source, customizer) {
  var index = -1,
      props = keys(source),
      length = props.length;

  while (++index < length) {
    var key = props[index],
        value = object[key],
        result = customizer(value, source[key], key, object, source);

    if ((result === result ? (result !== value) : (value === value)) ||
        (value === undefined && !(key in object))) {
      object[key] = result;
    }
  }
  return object;
}

module.exports = assignWith;

},{"251":251}],158:[function(_dereq_,module,exports){
var baseCopy = _dereq_(160),
    keys = _dereq_(251);

/**
 * The base implementation of `_.assign` without support for argument juggling,
 * multiple sources, and `customizer` functions.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @returns {Object} Returns `object`.
 */
function baseAssign(object, source) {
  return source == null
    ? object
    : baseCopy(source, keys(source), object);
}

module.exports = baseAssign;

},{"160":160,"251":251}],159:[function(_dereq_,module,exports){
var baseMatches = _dereq_(180),
    baseMatchesProperty = _dereq_(181),
    bindCallback = _dereq_(192),
    identity = _dereq_(257),
    property = _dereq_(259);

/**
 * The base implementation of `_.callback` which supports specifying the
 * number of arguments to provide to `func`.
 *
 * @private
 * @param {*} [func=_.identity] The value to convert to a callback.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function baseCallback(func, thisArg, argCount) {
  var type = typeof func;
  if (type == 'function') {
    return thisArg === undefined
      ? func
      : bindCallback(func, thisArg, argCount);
  }
  if (func == null) {
    return identity;
  }
  if (type == 'object') {
    return baseMatches(func);
  }
  return thisArg === undefined
    ? property(func)
    : baseMatchesProperty(func, thisArg);
}

module.exports = baseCallback;

},{"180":180,"181":181,"192":192,"257":257,"259":259}],160:[function(_dereq_,module,exports){
/**
 * Copies properties of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy properties from.
 * @param {Array} props The property names to copy.
 * @param {Object} [object={}] The object to copy properties to.
 * @returns {Object} Returns `object`.
 */
function baseCopy(source, props, object) {
  object || (object = {});

  var index = -1,
      length = props.length;

  while (++index < length) {
    var key = props[index];
    object[key] = source[key];
  }
  return object;
}

module.exports = baseCopy;

},{}],161:[function(_dereq_,module,exports){
var isObject = _dereq_(245);

/**
 * The base implementation of `_.create` without support for assigning
 * properties to the created object.
 *
 * @private
 * @param {Object} prototype The object to inherit from.
 * @returns {Object} Returns the new object.
 */
var baseCreate = (function() {
  function object() {}
  return function(prototype) {
    if (isObject(prototype)) {
      object.prototype = prototype;
      var result = new object;
      object.prototype = undefined;
    }
    return result || {};
  };
}());

module.exports = baseCreate;

},{"245":245}],162:[function(_dereq_,module,exports){
/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/**
 * The base implementation of `_.delay` and `_.defer` which accepts an index
 * of where to slice the arguments to provide to `func`.
 *
 * @private
 * @param {Function} func The function to delay.
 * @param {number} wait The number of milliseconds to delay invocation.
 * @param {Object} args The arguments provide to `func`.
 * @returns {number} Returns the timer id.
 */
function baseDelay(func, wait, args) {
  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  return setTimeout(function() { func.apply(undefined, args); }, wait);
}

module.exports = baseDelay;

},{}],163:[function(_dereq_,module,exports){
var baseIndexOf = _dereq_(174),
    cacheIndexOf = _dereq_(193),
    createCache = _dereq_(202);

/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;

/**
 * The base implementation of `_.difference` which accepts a single array
 * of values to exclude.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {Array} values The values to exclude.
 * @returns {Array} Returns the new array of filtered values.
 */
function baseDifference(array, values) {
  var length = array ? array.length : 0,
      result = [];

  if (!length) {
    return result;
  }
  var index = -1,
      indexOf = baseIndexOf,
      isCommon = true,
      cache = (isCommon && values.length >= LARGE_ARRAY_SIZE) ? createCache(values) : null,
      valuesLength = values.length;

  if (cache) {
    indexOf = cacheIndexOf;
    isCommon = false;
    values = cache;
  }
  outer:
  while (++index < length) {
    var value = array[index];

    if (isCommon && value === value) {
      var valuesIndex = valuesLength;
      while (valuesIndex--) {
        if (values[valuesIndex] === value) {
          continue outer;
        }
      }
      result.push(value);
    }
    else if (indexOf(values, value, 0) < 0) {
      result.push(value);
    }
  }
  return result;
}

module.exports = baseDifference;

},{"174":174,"193":193,"202":202}],164:[function(_dereq_,module,exports){
var baseForOwn = _dereq_(172),
    createBaseEach = _dereq_(199);

/**
 * The base implementation of `_.forEach` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array|Object|string} Returns `collection`.
 */
var baseEach = createBaseEach(baseForOwn);

module.exports = baseEach;

},{"172":172,"199":199}],165:[function(_dereq_,module,exports){
var baseEach = _dereq_(164);

/**
 * The base implementation of `_.every` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {boolean} Returns `true` if all elements pass the predicate check,
 *  else `false`
 */
function baseEvery(collection, predicate) {
  var result = true;
  baseEach(collection, function(value, index, collection) {
    result = !!predicate(value, index, collection);
    return result;
  });
  return result;
}

module.exports = baseEvery;

},{"164":164}],166:[function(_dereq_,module,exports){
var baseEach = _dereq_(164);

/**
 * The base implementation of `_.filter` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {Array} Returns the new filtered array.
 */
function baseFilter(collection, predicate) {
  var result = [];
  baseEach(collection, function(value, index, collection) {
    if (predicate(value, index, collection)) {
      result.push(value);
    }
  });
  return result;
}

module.exports = baseFilter;

},{"164":164}],167:[function(_dereq_,module,exports){
/**
 * The base implementation of `_.find`, `_.findLast`, `_.findKey`, and `_.findLastKey`,
 * without support for callback shorthands and `this` binding, which iterates
 * over `collection` using the provided `eachFunc`.
 *
 * @private
 * @param {Array|Object|string} collection The collection to search.
 * @param {Function} predicate The function invoked per iteration.
 * @param {Function} eachFunc The function to iterate over `collection`.
 * @param {boolean} [retKey] Specify returning the key of the found element
 *  instead of the element itself.
 * @returns {*} Returns the found element or its key, else `undefined`.
 */
function baseFind(collection, predicate, eachFunc, retKey) {
  var result;
  eachFunc(collection, function(value, key, collection) {
    if (predicate(value, key, collection)) {
      result = retKey ? key : value;
      return false;
    }
  });
  return result;
}

module.exports = baseFind;

},{}],168:[function(_dereq_,module,exports){
/**
 * The base implementation of `_.findIndex` and `_.findLastIndex` without
 * support for callback shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {Function} predicate The function invoked per iteration.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseFindIndex(array, predicate, fromRight) {
  var length = array.length,
      index = fromRight ? length : -1;

  while ((fromRight ? index-- : ++index < length)) {
    if (predicate(array[index], index, array)) {
      return index;
    }
  }
  return -1;
}

module.exports = baseFindIndex;

},{}],169:[function(_dereq_,module,exports){
var arrayPush = _dereq_(154),
    isArguments = _dereq_(240),
    isArray = _dereq_(241),
    isArrayLike = _dereq_(219),
    isObjectLike = _dereq_(225);

/**
 * The base implementation of `_.flatten` with added support for restricting
 * flattening and specifying the start index.
 *
 * @private
 * @param {Array} array The array to flatten.
 * @param {boolean} [isDeep] Specify a deep flatten.
 * @param {boolean} [isStrict] Restrict flattening to arrays-like objects.
 * @param {Array} [result=[]] The initial result value.
 * @returns {Array} Returns the new flattened array.
 */
function baseFlatten(array, isDeep, isStrict, result) {
  result || (result = []);

  var index = -1,
      length = array.length;

  while (++index < length) {
    var value = array[index];
    if (isObjectLike(value) && isArrayLike(value) &&
        (isStrict || isArray(value) || isArguments(value))) {
      if (isDeep) {
        // Recursively flatten arrays (susceptible to call stack limits).
        baseFlatten(value, isDeep, isStrict, result);
      } else {
        arrayPush(result, value);
      }
    } else if (!isStrict) {
      result[result.length] = value;
    }
  }
  return result;
}

module.exports = baseFlatten;

},{"154":154,"219":219,"225":225,"240":240,"241":241}],170:[function(_dereq_,module,exports){
var createBaseFor = _dereq_(200);

/**
 * The base implementation of `baseForIn` and `baseForOwn` which iterates
 * over `object` properties returned by `keysFunc` invoking `iteratee` for
 * each property. Iteratee functions may exit iteration early by explicitly
 * returning `false`.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @returns {Object} Returns `object`.
 */
var baseFor = createBaseFor();

module.exports = baseFor;

},{"200":200}],171:[function(_dereq_,module,exports){
var baseFor = _dereq_(170),
    keysIn = _dereq_(252);

/**
 * The base implementation of `_.forIn` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Object} Returns `object`.
 */
function baseForIn(object, iteratee) {
  return baseFor(object, iteratee, keysIn);
}

module.exports = baseForIn;

},{"170":170,"252":252}],172:[function(_dereq_,module,exports){
var baseFor = _dereq_(170),
    keys = _dereq_(251);

/**
 * The base implementation of `_.forOwn` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Object} Returns `object`.
 */
function baseForOwn(object, iteratee) {
  return baseFor(object, iteratee, keys);
}

module.exports = baseForOwn;

},{"170":170,"251":251}],173:[function(_dereq_,module,exports){
var toObject = _dereq_(237);

/**
 * The base implementation of `get` without support for string paths
 * and default values.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array} path The path of the property to get.
 * @param {string} [pathKey] The key representation of path.
 * @returns {*} Returns the resolved value.
 */
function baseGet(object, path, pathKey) {
  if (object == null) {
    return;
  }
  if (pathKey !== undefined && pathKey in toObject(object)) {
    path = [pathKey];
  }
  var index = 0,
      length = path.length;

  while (object != null && index < length) {
    object = object[path[index++]];
  }
  return (index && index == length) ? object : undefined;
}

module.exports = baseGet;

},{"237":237}],174:[function(_dereq_,module,exports){
var indexOfNaN = _dereq_(218);

/**
 * The base implementation of `_.indexOf` without support for binary searches.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {*} value The value to search for.
 * @param {number} fromIndex The index to search from.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseIndexOf(array, value, fromIndex) {
  if (value !== value) {
    return indexOfNaN(array, fromIndex);
  }
  var index = fromIndex - 1,
      length = array.length;

  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}

module.exports = baseIndexOf;

},{"218":218}],175:[function(_dereq_,module,exports){
var baseIsEqualDeep = _dereq_(176),
    isObject = _dereq_(245),
    isObjectLike = _dereq_(225);

/**
 * The base implementation of `_.isEqual` without support for `this` binding
 * `customizer` functions.
 *
 * @private
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @param {Function} [customizer] The function to customize comparing values.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 */
function baseIsEqual(value, other, customizer, isLoose, stackA, stackB) {
  if (value === other) {
    return true;
  }
  if (value == null || other == null || (!isObject(value) && !isObjectLike(other))) {
    return value !== value && other !== other;
  }
  return baseIsEqualDeep(value, other, baseIsEqual, customizer, isLoose, stackA, stackB);
}

module.exports = baseIsEqual;

},{"176":176,"225":225,"245":245}],176:[function(_dereq_,module,exports){
var equalArrays = _dereq_(210),
    equalByTag = _dereq_(211),
    equalObjects = _dereq_(212),
    isArray = _dereq_(241),
    isTypedArray = _dereq_(248);

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    objectTag = '[object Object]';

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * A specialized version of `baseIsEqual` for arrays and objects which performs
 * deep comparisons and tracks traversed objects enabling objects with circular
 * references to be compared.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing objects.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA=[]] Tracks traversed `value` objects.
 * @param {Array} [stackB=[]] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function baseIsEqualDeep(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var objIsArr = isArray(object),
      othIsArr = isArray(other),
      objTag = arrayTag,
      othTag = arrayTag;

  if (!objIsArr) {
    objTag = objToString.call(object);
    if (objTag == argsTag) {
      objTag = objectTag;
    } else if (objTag != objectTag) {
      objIsArr = isTypedArray(object);
    }
  }
  if (!othIsArr) {
    othTag = objToString.call(other);
    if (othTag == argsTag) {
      othTag = objectTag;
    } else if (othTag != objectTag) {
      othIsArr = isTypedArray(other);
    }
  }
  var objIsObj = objTag == objectTag,
      othIsObj = othTag == objectTag,
      isSameTag = objTag == othTag;

  if (isSameTag && !(objIsArr || objIsObj)) {
    return equalByTag(object, other, objTag);
  }
  if (!isLoose) {
    var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
        othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

    if (objIsWrapped || othIsWrapped) {
      return equalFunc(objIsWrapped ? object.value() : object, othIsWrapped ? other.value() : other, customizer, isLoose, stackA, stackB);
    }
  }
  if (!isSameTag) {
    return false;
  }
  // Assume cyclic values are equal.
  // For more information on detecting circular references see https://es5.github.io/#JO.
  stackA || (stackA = []);
  stackB || (stackB = []);

  var length = stackA.length;
  while (length--) {
    if (stackA[length] == object) {
      return stackB[length] == other;
    }
  }
  // Add `object` and `other` to the stack of traversed objects.
  stackA.push(object);
  stackB.push(other);

  var result = (objIsArr ? equalArrays : equalObjects)(object, other, equalFunc, customizer, isLoose, stackA, stackB);

  stackA.pop();
  stackB.pop();

  return result;
}

module.exports = baseIsEqualDeep;

},{"210":210,"211":211,"212":212,"241":241,"248":248}],177:[function(_dereq_,module,exports){
var baseIsEqual = _dereq_(175),
    toObject = _dereq_(237);

/**
 * The base implementation of `_.isMatch` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to inspect.
 * @param {Array} matchData The propery names, values, and compare flags to match.
 * @param {Function} [customizer] The function to customize comparing objects.
 * @returns {boolean} Returns `true` if `object` is a match, else `false`.
 */
function baseIsMatch(object, matchData, customizer) {
  var index = matchData.length,
      length = index,
      noCustomizer = !customizer;

  if (object == null) {
    return !length;
  }
  object = toObject(object);
  while (index--) {
    var data = matchData[index];
    if ((noCustomizer && data[2])
          ? data[1] !== object[data[0]]
          : !(data[0] in object)
        ) {
      return false;
    }
  }
  while (++index < length) {
    data = matchData[index];
    var key = data[0],
        objValue = object[key],
        srcValue = data[1];

    if (noCustomizer && data[2]) {
      if (objValue === undefined && !(key in object)) {
        return false;
      }
    } else {
      var result = customizer ? customizer(objValue, srcValue, key) : undefined;
      if (!(result === undefined ? baseIsEqual(srcValue, objValue, customizer, true) : result)) {
        return false;
      }
    }
  }
  return true;
}

module.exports = baseIsMatch;

},{"175":175,"237":237}],178:[function(_dereq_,module,exports){
/**
 * The function whose prototype all chaining wrappers inherit from.
 *
 * @private
 */
function baseLodash() {
  // No operation performed.
}

module.exports = baseLodash;

},{}],179:[function(_dereq_,module,exports){
var baseEach = _dereq_(164),
    isArrayLike = _dereq_(219);

/**
 * The base implementation of `_.map` without support for callback shorthands
 * and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function baseMap(collection, iteratee) {
  var index = -1,
      result = isArrayLike(collection) ? Array(collection.length) : [];

  baseEach(collection, function(value, key, collection) {
    result[++index] = iteratee(value, key, collection);
  });
  return result;
}

module.exports = baseMap;

},{"164":164,"219":219}],180:[function(_dereq_,module,exports){
var baseIsMatch = _dereq_(177),
    getMatchData = _dereq_(216),
    toObject = _dereq_(237);

/**
 * The base implementation of `_.matches` which does not clone `source`.
 *
 * @private
 * @param {Object} source The object of property values to match.
 * @returns {Function} Returns the new function.
 */
function baseMatches(source) {
  var matchData = getMatchData(source);
  if (matchData.length == 1 && matchData[0][2]) {
    var key = matchData[0][0],
        value = matchData[0][1];

    return function(object) {
      if (object == null) {
        return false;
      }
      return object[key] === value && (value !== undefined || (key in toObject(object)));
    };
  }
  return function(object) {
    return baseIsMatch(object, matchData);
  };
}

module.exports = baseMatches;

},{"177":177,"216":216,"237":237}],181:[function(_dereq_,module,exports){
var baseGet = _dereq_(173),
    baseIsEqual = _dereq_(175),
    baseSlice = _dereq_(188),
    isArray = _dereq_(241),
    isKey = _dereq_(222),
    isStrictComparable = _dereq_(226),
    last = _dereq_(127),
    toObject = _dereq_(237),
    toPath = _dereq_(238);

/**
 * The base implementation of `_.matchesProperty` which does not clone `srcValue`.
 *
 * @private
 * @param {string} path The path of the property to get.
 * @param {*} srcValue The value to compare.
 * @returns {Function} Returns the new function.
 */
function baseMatchesProperty(path, srcValue) {
  var isArr = isArray(path),
      isCommon = isKey(path) && isStrictComparable(srcValue),
      pathKey = (path + '');

  path = toPath(path);
  return function(object) {
    if (object == null) {
      return false;
    }
    var key = pathKey;
    object = toObject(object);
    if ((isArr || !isCommon) && !(key in object)) {
      object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
      if (object == null) {
        return false;
      }
      key = last(path);
      object = toObject(object);
    }
    return object[key] === srcValue
      ? (srcValue !== undefined || (key in object))
      : baseIsEqual(srcValue, object[key], undefined, true);
  };
}

module.exports = baseMatchesProperty;

},{"127":127,"173":173,"175":175,"188":188,"222":222,"226":226,"237":237,"238":238,"241":241}],182:[function(_dereq_,module,exports){
var arrayEach = _dereq_(150),
    baseMergeDeep = _dereq_(183),
    isArray = _dereq_(241),
    isArrayLike = _dereq_(219),
    isObject = _dereq_(245),
    isObjectLike = _dereq_(225),
    isTypedArray = _dereq_(248),
    keys = _dereq_(251);

/**
 * The base implementation of `_.merge` without support for argument juggling,
 * multiple sources, and `this` binding `customizer` functions.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @param {Function} [customizer] The function to customize merged values.
 * @param {Array} [stackA=[]] Tracks traversed source objects.
 * @param {Array} [stackB=[]] Associates values with source counterparts.
 * @returns {Object} Returns `object`.
 */
function baseMerge(object, source, customizer, stackA, stackB) {
  if (!isObject(object)) {
    return object;
  }
  var isSrcArr = isArrayLike(source) && (isArray(source) || isTypedArray(source)),
      props = isSrcArr ? undefined : keys(source);

  arrayEach(props || source, function(srcValue, key) {
    if (props) {
      key = srcValue;
      srcValue = source[key];
    }
    if (isObjectLike(srcValue)) {
      stackA || (stackA = []);
      stackB || (stackB = []);
      baseMergeDeep(object, source, key, baseMerge, customizer, stackA, stackB);
    }
    else {
      var value = object[key],
          result = customizer ? customizer(value, srcValue, key, object, source) : undefined,
          isCommon = result === undefined;

      if (isCommon) {
        result = srcValue;
      }
      if ((result !== undefined || (isSrcArr && !(key in object))) &&
          (isCommon || (result === result ? (result !== value) : (value === value)))) {
        object[key] = result;
      }
    }
  });
  return object;
}

module.exports = baseMerge;

},{"150":150,"183":183,"219":219,"225":225,"241":241,"245":245,"248":248,"251":251}],183:[function(_dereq_,module,exports){
var arrayCopy = _dereq_(149),
    isArguments = _dereq_(240),
    isArray = _dereq_(241),
    isArrayLike = _dereq_(219),
    isPlainObject = _dereq_(246),
    isTypedArray = _dereq_(248),
    toPlainObject = _dereq_(249);

/**
 * A specialized version of `baseMerge` for arrays and objects which performs
 * deep merges and tracks traversed objects enabling objects with circular
 * references to be merged.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @param {string} key The key of the value to merge.
 * @param {Function} mergeFunc The function to merge values.
 * @param {Function} [customizer] The function to customize merged values.
 * @param {Array} [stackA=[]] Tracks traversed source objects.
 * @param {Array} [stackB=[]] Associates values with source counterparts.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function baseMergeDeep(object, source, key, mergeFunc, customizer, stackA, stackB) {
  var length = stackA.length,
      srcValue = source[key];

  while (length--) {
    if (stackA[length] == srcValue) {
      object[key] = stackB[length];
      return;
    }
  }
  var value = object[key],
      result = customizer ? customizer(value, srcValue, key, object, source) : undefined,
      isCommon = result === undefined;

  if (isCommon) {
    result = srcValue;
    if (isArrayLike(srcValue) && (isArray(srcValue) || isTypedArray(srcValue))) {
      result = isArray(value)
        ? value
        : (isArrayLike(value) ? arrayCopy(value) : []);
    }
    else if (isPlainObject(srcValue) || isArguments(srcValue)) {
      result = isArguments(value)
        ? toPlainObject(value)
        : (isPlainObject(value) ? value : {});
    }
    else {
      isCommon = false;
    }
  }
  // Add the source value to the stack of traversed objects and associate
  // it with its merged value.
  stackA.push(srcValue);
  stackB.push(result);

  if (isCommon) {
    // Recursively merge objects and arrays (susceptible to call stack limits).
    object[key] = mergeFunc(result, srcValue, customizer, stackA, stackB);
  } else if (result === result ? (result !== value) : (value === value)) {
    object[key] = result;
  }
}

module.exports = baseMergeDeep;

},{"149":149,"219":219,"240":240,"241":241,"246":246,"248":248,"249":249}],184:[function(_dereq_,module,exports){
/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}

module.exports = baseProperty;

},{}],185:[function(_dereq_,module,exports){
var baseGet = _dereq_(173),
    toPath = _dereq_(238);

/**
 * A specialized version of `baseProperty` which supports deep paths.
 *
 * @private
 * @param {Array|string} path The path of the property to get.
 * @returns {Function} Returns the new function.
 */
function basePropertyDeep(path) {
  var pathKey = (path + '');
  path = toPath(path);
  return function(object) {
    return baseGet(object, path, pathKey);
  };
}

module.exports = basePropertyDeep;

},{"173":173,"238":238}],186:[function(_dereq_,module,exports){
/**
 * The base implementation of `_.reduce` and `_.reduceRight` without support
 * for callback shorthands and `this` binding, which iterates over `collection`
 * using the provided `eachFunc`.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {*} accumulator The initial value.
 * @param {boolean} initFromCollection Specify using the first or last element
 *  of `collection` as the initial value.
 * @param {Function} eachFunc The function to iterate over `collection`.
 * @returns {*} Returns the accumulated value.
 */
function baseReduce(collection, iteratee, accumulator, initFromCollection, eachFunc) {
  eachFunc(collection, function(value, index, collection) {
    accumulator = initFromCollection
      ? (initFromCollection = false, value)
      : iteratee(accumulator, value, index, collection);
  });
  return accumulator;
}

module.exports = baseReduce;

},{}],187:[function(_dereq_,module,exports){
var identity = _dereq_(257),
    metaMap = _dereq_(228);

/**
 * The base implementation of `setData` without support for hot loop detection.
 *
 * @private
 * @param {Function} func The function to associate metadata with.
 * @param {*} data The metadata.
 * @returns {Function} Returns `func`.
 */
var baseSetData = !metaMap ? identity : function(func, data) {
  metaMap.set(func, data);
  return func;
};

module.exports = baseSetData;

},{"228":228,"257":257}],188:[function(_dereq_,module,exports){
/**
 * The base implementation of `_.slice` without an iteratee call guard.
 *
 * @private
 * @param {Array} array The array to slice.
 * @param {number} [start=0] The start position.
 * @param {number} [end=array.length] The end position.
 * @returns {Array} Returns the slice of `array`.
 */
function baseSlice(array, start, end) {
  var index = -1,
      length = array.length;

  start = start == null ? 0 : (+start || 0);
  if (start < 0) {
    start = -start > length ? 0 : (length + start);
  }
  end = (end === undefined || end > length) ? length : (+end || 0);
  if (end < 0) {
    end += length;
  }
  length = start > end ? 0 : ((end - start) >>> 0);
  start >>>= 0;

  var result = Array(length);
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

module.exports = baseSlice;

},{}],189:[function(_dereq_,module,exports){
var baseEach = _dereq_(164);

/**
 * The base implementation of `_.some` without support for callback shorthands
 * and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {boolean} Returns `true` if any element passes the predicate check,
 *  else `false`.
 */
function baseSome(collection, predicate) {
  var result;

  baseEach(collection, function(value, index, collection) {
    result = predicate(value, index, collection);
    return !result;
  });
  return !!result;
}

module.exports = baseSome;

},{"164":164}],190:[function(_dereq_,module,exports){
/**
 * Converts `value` to a string if it's not one. An empty string is returned
 * for `null` or `undefined` values.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  return value == null ? '' : (value + '');
}

module.exports = baseToString;

},{}],191:[function(_dereq_,module,exports){
var baseIndexOf = _dereq_(174),
    cacheIndexOf = _dereq_(193),
    createCache = _dereq_(202);

/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;

/**
 * The base implementation of `_.uniq` without support for callback shorthands
 * and `this` binding.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {Function} [iteratee] The function invoked per iteration.
 * @returns {Array} Returns the new duplicate free array.
 */
function baseUniq(array, iteratee) {
  var index = -1,
      indexOf = baseIndexOf,
      length = array.length,
      isCommon = true,
      isLarge = isCommon && length >= LARGE_ARRAY_SIZE,
      seen = isLarge ? createCache() : null,
      result = [];

  if (seen) {
    indexOf = cacheIndexOf;
    isCommon = false;
  } else {
    isLarge = false;
    seen = iteratee ? [] : result;
  }
  outer:
  while (++index < length) {
    var value = array[index],
        computed = iteratee ? iteratee(value, index, array) : value;

    if (isCommon && value === value) {
      var seenIndex = seen.length;
      while (seenIndex--) {
        if (seen[seenIndex] === computed) {
          continue outer;
        }
      }
      if (iteratee) {
        seen.push(computed);
      }
      result.push(value);
    }
    else if (indexOf(seen, computed, 0) < 0) {
      if (iteratee || isLarge) {
        seen.push(computed);
      }
      result.push(value);
    }
  }
  return result;
}

module.exports = baseUniq;

},{"174":174,"193":193,"202":202}],192:[function(_dereq_,module,exports){
var identity = _dereq_(257);

/**
 * A specialized version of `baseCallback` which only supports `this` binding
 * and specifying the number of arguments to provide to `func`.
 *
 * @private
 * @param {Function} func The function to bind.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function bindCallback(func, thisArg, argCount) {
  if (typeof func != 'function') {
    return identity;
  }
  if (thisArg === undefined) {
    return func;
  }
  switch (argCount) {
    case 1: return function(value) {
      return func.call(thisArg, value);
    };
    case 3: return function(value, index, collection) {
      return func.call(thisArg, value, index, collection);
    };
    case 4: return function(accumulator, value, index, collection) {
      return func.call(thisArg, accumulator, value, index, collection);
    };
    case 5: return function(value, other, key, object, source) {
      return func.call(thisArg, value, other, key, object, source);
    };
  }
  return function() {
    return func.apply(thisArg, arguments);
  };
}

module.exports = bindCallback;

},{"257":257}],193:[function(_dereq_,module,exports){
var isObject = _dereq_(245);

/**
 * Checks if `value` is in `cache` mimicking the return signature of
 * `_.indexOf` by returning `0` if the value is found, else `-1`.
 *
 * @private
 * @param {Object} cache The cache to search.
 * @param {*} value The value to search for.
 * @returns {number} Returns `0` if `value` is found, else `-1`.
 */
function cacheIndexOf(cache, value) {
  var data = cache.data,
      result = (typeof value == 'string' || isObject(value)) ? data.set.has(value) : data.hash[value];

  return result ? 0 : -1;
}

module.exports = cacheIndexOf;

},{"245":245}],194:[function(_dereq_,module,exports){
var isObject = _dereq_(245);

/**
 * Adds `value` to the cache.
 *
 * @private
 * @name push
 * @memberOf SetCache
 * @param {*} value The value to cache.
 */
function cachePush(value) {
  var data = this.data;
  if (typeof value == 'string' || isObject(value)) {
    data.set.add(value);
  } else {
    data.hash[value] = true;
  }
}

module.exports = cachePush;

},{"245":245}],195:[function(_dereq_,module,exports){
/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates an array that is the composition of partially applied arguments,
 * placeholders, and provided arguments into a single array of arguments.
 *
 * @private
 * @param {Array|Object} args The provided arguments.
 * @param {Array} partials The arguments to prepend to those provided.
 * @param {Array} holders The `partials` placeholder indexes.
 * @returns {Array} Returns the new array of composed arguments.
 */
function composeArgs(args, partials, holders) {
  var holdersLength = holders.length,
      argsIndex = -1,
      argsLength = nativeMax(args.length - holdersLength, 0),
      leftIndex = -1,
      leftLength = partials.length,
      result = Array(leftLength + argsLength);

  while (++leftIndex < leftLength) {
    result[leftIndex] = partials[leftIndex];
  }
  while (++argsIndex < holdersLength) {
    result[holders[argsIndex]] = args[argsIndex];
  }
  while (argsLength--) {
    result[leftIndex++] = args[argsIndex++];
  }
  return result;
}

module.exports = composeArgs;

},{}],196:[function(_dereq_,module,exports){
/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * This function is like `composeArgs` except that the arguments composition
 * is tailored for `_.partialRight`.
 *
 * @private
 * @param {Array|Object} args The provided arguments.
 * @param {Array} partials The arguments to append to those provided.
 * @param {Array} holders The `partials` placeholder indexes.
 * @returns {Array} Returns the new array of composed arguments.
 */
function composeArgsRight(args, partials, holders) {
  var holdersIndex = -1,
      holdersLength = holders.length,
      argsIndex = -1,
      argsLength = nativeMax(args.length - holdersLength, 0),
      rightIndex = -1,
      rightLength = partials.length,
      result = Array(argsLength + rightLength);

  while (++argsIndex < argsLength) {
    result[argsIndex] = args[argsIndex];
  }
  var offset = argsIndex;
  while (++rightIndex < rightLength) {
    result[offset + rightIndex] = partials[rightIndex];
  }
  while (++holdersIndex < holdersLength) {
    result[offset + holders[holdersIndex]] = args[argsIndex++];
  }
  return result;
}

module.exports = composeArgsRight;

},{}],197:[function(_dereq_,module,exports){
var baseCallback = _dereq_(159),
    baseEach = _dereq_(164),
    isArray = _dereq_(241);

/**
 * Creates a `_.countBy`, `_.groupBy`, `_.indexBy`, or `_.partition` function.
 *
 * @private
 * @param {Function} setter The function to set keys and values of the accumulator object.
 * @param {Function} [initializer] The function to initialize the accumulator object.
 * @returns {Function} Returns the new aggregator function.
 */
function createAggregator(setter, initializer) {
  return function(collection, iteratee, thisArg) {
    var result = initializer ? initializer() : {};
    iteratee = baseCallback(iteratee, thisArg, 3);

    if (isArray(collection)) {
      var index = -1,
          length = collection.length;

      while (++index < length) {
        var value = collection[index];
        setter(result, value, iteratee(value, index, collection), collection);
      }
    } else {
      baseEach(collection, function(value, key, collection) {
        setter(result, value, iteratee(value, key, collection), collection);
      });
    }
    return result;
  };
}

module.exports = createAggregator;

},{"159":159,"164":164,"241":241}],198:[function(_dereq_,module,exports){
var bindCallback = _dereq_(192),
    isIterateeCall = _dereq_(221),
    restParam = _dereq_(145);

/**
 * Creates a `_.assign`, `_.defaults`, or `_.merge` function.
 *
 * @private
 * @param {Function} assigner The function to assign values.
 * @returns {Function} Returns the new assigner function.
 */
function createAssigner(assigner) {
  return restParam(function(object, sources) {
    var index = -1,
        length = object == null ? 0 : sources.length,
        customizer = length > 2 ? sources[length - 2] : undefined,
        guard = length > 2 ? sources[2] : undefined,
        thisArg = length > 1 ? sources[length - 1] : undefined;

    if (typeof customizer == 'function') {
      customizer = bindCallback(customizer, thisArg, 5);
      length -= 2;
    } else {
      customizer = typeof thisArg == 'function' ? thisArg : undefined;
      length -= (customizer ? 1 : 0);
    }
    if (guard && isIterateeCall(sources[0], sources[1], guard)) {
      customizer = length < 3 ? undefined : customizer;
      length = 1;
    }
    while (++index < length) {
      var source = sources[index];
      if (source) {
        assigner(object, source, customizer);
      }
    }
    return object;
  });
}

module.exports = createAssigner;

},{"145":145,"192":192,"221":221}],199:[function(_dereq_,module,exports){
var getLength = _dereq_(215),
    isLength = _dereq_(224),
    toObject = _dereq_(237);

/**
 * Creates a `baseEach` or `baseEachRight` function.
 *
 * @private
 * @param {Function} eachFunc The function to iterate over a collection.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new base function.
 */
function createBaseEach(eachFunc, fromRight) {
  return function(collection, iteratee) {
    var length = collection ? getLength(collection) : 0;
    if (!isLength(length)) {
      return eachFunc(collection, iteratee);
    }
    var index = fromRight ? length : -1,
        iterable = toObject(collection);

    while ((fromRight ? index-- : ++index < length)) {
      if (iteratee(iterable[index], index, iterable) === false) {
        break;
      }
    }
    return collection;
  };
}

module.exports = createBaseEach;

},{"215":215,"224":224,"237":237}],200:[function(_dereq_,module,exports){
var toObject = _dereq_(237);

/**
 * Creates a base function for `_.forIn` or `_.forInRight`.
 *
 * @private
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new base function.
 */
function createBaseFor(fromRight) {
  return function(object, iteratee, keysFunc) {
    var iterable = toObject(object),
        props = keysFunc(object),
        length = props.length,
        index = fromRight ? length : -1;

    while ((fromRight ? index-- : ++index < length)) {
      var key = props[index];
      if (iteratee(iterable[key], key, iterable) === false) {
        break;
      }
    }
    return object;
  };
}

module.exports = createBaseFor;

},{"237":237}],201:[function(_dereq_,module,exports){
(function (global){
var createCtorWrapper = _dereq_(203);

/**
 * Creates a function that wraps `func` and invokes it with the `this`
 * binding of `thisArg`.
 *
 * @private
 * @param {Function} func The function to bind.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @returns {Function} Returns the new bound function.
 */
function createBindWrapper(func, thisArg) {
  var Ctor = createCtorWrapper(func);

  function wrapper() {
    var fn = (this && this !== global && this instanceof wrapper) ? Ctor : func;
    return fn.apply(thisArg, arguments);
  }
  return wrapper;
}

module.exports = createBindWrapper;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"203":203}],202:[function(_dereq_,module,exports){
(function (global){
var SetCache = _dereq_(148),
    getNative = _dereq_(217);

/** Native method references. */
var Set = getNative(global, 'Set');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeCreate = getNative(Object, 'create');

/**
 * Creates a `Set` cache object to optimize linear searches of large arrays.
 *
 * @private
 * @param {Array} [values] The values to cache.
 * @returns {null|Object} Returns the new cache object if `Set` is supported, else `null`.
 */
function createCache(values) {
  return (nativeCreate && Set) ? new SetCache(values) : null;
}

module.exports = createCache;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"148":148,"217":217}],203:[function(_dereq_,module,exports){
var baseCreate = _dereq_(161),
    isObject = _dereq_(245);

/**
 * Creates a function that produces an instance of `Ctor` regardless of
 * whether it was invoked as part of a `new` expression or by `call` or `apply`.
 *
 * @private
 * @param {Function} Ctor The constructor to wrap.
 * @returns {Function} Returns the new wrapped function.
 */
function createCtorWrapper(Ctor) {
  return function() {
    // Use a `switch` statement to work with class constructors.
    // See http://ecma-international.org/ecma-262/6.0/#sec-ecmascript-function-objects-call-thisargument-argumentslist
    // for more details.
    var args = arguments;
    switch (args.length) {
      case 0: return new Ctor;
      case 1: return new Ctor(args[0]);
      case 2: return new Ctor(args[0], args[1]);
      case 3: return new Ctor(args[0], args[1], args[2]);
      case 4: return new Ctor(args[0], args[1], args[2], args[3]);
      case 5: return new Ctor(args[0], args[1], args[2], args[3], args[4]);
      case 6: return new Ctor(args[0], args[1], args[2], args[3], args[4], args[5]);
      case 7: return new Ctor(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
    }
    var thisBinding = baseCreate(Ctor.prototype),
        result = Ctor.apply(thisBinding, args);

    // Mimic the constructor's `return` behavior.
    // See https://es5.github.io/#x13.2.2 for more details.
    return isObject(result) ? result : thisBinding;
  };
}

module.exports = createCtorWrapper;

},{"161":161,"245":245}],204:[function(_dereq_,module,exports){
var baseCallback = _dereq_(159),
    baseFind = _dereq_(167),
    baseFindIndex = _dereq_(168),
    isArray = _dereq_(241);

/**
 * Creates a `_.find` or `_.findLast` function.
 *
 * @private
 * @param {Function} eachFunc The function to iterate over a collection.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new find function.
 */
function createFind(eachFunc, fromRight) {
  return function(collection, predicate, thisArg) {
    predicate = baseCallback(predicate, thisArg, 3);
    if (isArray(collection)) {
      var index = baseFindIndex(collection, predicate, fromRight);
      return index > -1 ? collection[index] : undefined;
    }
    return baseFind(collection, predicate, eachFunc);
  };
}

module.exports = createFind;

},{"159":159,"167":167,"168":168,"241":241}],205:[function(_dereq_,module,exports){
var bindCallback = _dereq_(192),
    isArray = _dereq_(241);

/**
 * Creates a function for `_.forEach` or `_.forEachRight`.
 *
 * @private
 * @param {Function} arrayFunc The function to iterate over an array.
 * @param {Function} eachFunc The function to iterate over a collection.
 * @returns {Function} Returns the new each function.
 */
function createForEach(arrayFunc, eachFunc) {
  return function(collection, iteratee, thisArg) {
    return (typeof iteratee == 'function' && thisArg === undefined && isArray(collection))
      ? arrayFunc(collection, iteratee)
      : eachFunc(collection, bindCallback(iteratee, thisArg, 3));
  };
}

module.exports = createForEach;

},{"192":192,"241":241}],206:[function(_dereq_,module,exports){
(function (global){
var arrayCopy = _dereq_(149),
    composeArgs = _dereq_(195),
    composeArgsRight = _dereq_(196),
    createCtorWrapper = _dereq_(203),
    isLaziable = _dereq_(223),
    reorder = _dereq_(232),
    replaceHolders = _dereq_(233),
    setData = _dereq_(234);

/** Used to compose bitmasks for wrapper metadata. */
var BIND_FLAG = 1,
    BIND_KEY_FLAG = 2,
    CURRY_BOUND_FLAG = 4,
    CURRY_FLAG = 8,
    CURRY_RIGHT_FLAG = 16,
    PARTIAL_FLAG = 32,
    PARTIAL_RIGHT_FLAG = 64,
    ARY_FLAG = 128;

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates a function that wraps `func` and invokes it with optional `this`
 * binding of, partial application, and currying.
 *
 * @private
 * @param {Function|string} func The function or method name to reference.
 * @param {number} bitmask The bitmask of flags. See `createWrapper` for more details.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {Array} [partials] The arguments to prepend to those provided to the new function.
 * @param {Array} [holders] The `partials` placeholder indexes.
 * @param {Array} [partialsRight] The arguments to append to those provided to the new function.
 * @param {Array} [holdersRight] The `partialsRight` placeholder indexes.
 * @param {Array} [argPos] The argument positions of the new function.
 * @param {number} [ary] The arity cap of `func`.
 * @param {number} [arity] The arity of `func`.
 * @returns {Function} Returns the new wrapped function.
 */
function createHybridWrapper(func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity) {
  var isAry = bitmask & ARY_FLAG,
      isBind = bitmask & BIND_FLAG,
      isBindKey = bitmask & BIND_KEY_FLAG,
      isCurry = bitmask & CURRY_FLAG,
      isCurryBound = bitmask & CURRY_BOUND_FLAG,
      isCurryRight = bitmask & CURRY_RIGHT_FLAG,
      Ctor = isBindKey ? undefined : createCtorWrapper(func);

  function wrapper() {
    // Avoid `arguments` object use disqualifying optimizations by
    // converting it to an array before providing it to other functions.
    var length = arguments.length,
        index = length,
        args = Array(length);

    while (index--) {
      args[index] = arguments[index];
    }
    if (partials) {
      args = composeArgs(args, partials, holders);
    }
    if (partialsRight) {
      args = composeArgsRight(args, partialsRight, holdersRight);
    }
    if (isCurry || isCurryRight) {
      var placeholder = wrapper.placeholder,
          argsHolders = replaceHolders(args, placeholder);

      length -= argsHolders.length;
      if (length < arity) {
        var newArgPos = argPos ? arrayCopy(argPos) : undefined,
            newArity = nativeMax(arity - length, 0),
            newsHolders = isCurry ? argsHolders : undefined,
            newHoldersRight = isCurry ? undefined : argsHolders,
            newPartials = isCurry ? args : undefined,
            newPartialsRight = isCurry ? undefined : args;

        bitmask |= (isCurry ? PARTIAL_FLAG : PARTIAL_RIGHT_FLAG);
        bitmask &= ~(isCurry ? PARTIAL_RIGHT_FLAG : PARTIAL_FLAG);

        if (!isCurryBound) {
          bitmask &= ~(BIND_FLAG | BIND_KEY_FLAG);
        }
        var newData = [func, bitmask, thisArg, newPartials, newsHolders, newPartialsRight, newHoldersRight, newArgPos, ary, newArity],
            result = createHybridWrapper.apply(undefined, newData);

        if (isLaziable(func)) {
          setData(result, newData);
        }
        result.placeholder = placeholder;
        return result;
      }
    }
    var thisBinding = isBind ? thisArg : this,
        fn = isBindKey ? thisBinding[func] : func;

    if (argPos) {
      args = reorder(args, argPos);
    }
    if (isAry && ary < args.length) {
      args.length = ary;
    }
    if (this && this !== global && this instanceof wrapper) {
      fn = Ctor || createCtorWrapper(func);
    }
    return fn.apply(thisBinding, args);
  }
  return wrapper;
}

module.exports = createHybridWrapper;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"149":149,"195":195,"196":196,"203":203,"223":223,"232":232,"233":233,"234":234}],207:[function(_dereq_,module,exports){
(function (global){
var createCtorWrapper = _dereq_(203);

/** Used to compose bitmasks for wrapper metadata. */
var BIND_FLAG = 1;

/**
 * Creates a function that wraps `func` and invokes it with the optional `this`
 * binding of `thisArg` and the `partials` prepended to those provided to
 * the wrapper.
 *
 * @private
 * @param {Function} func The function to partially apply arguments to.
 * @param {number} bitmask The bitmask of flags. See `createWrapper` for more details.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {Array} partials The arguments to prepend to those provided to the new function.
 * @returns {Function} Returns the new bound function.
 */
function createPartialWrapper(func, bitmask, thisArg, partials) {
  var isBind = bitmask & BIND_FLAG,
      Ctor = createCtorWrapper(func);

  function wrapper() {
    // Avoid `arguments` object use disqualifying optimizations by
    // converting it to an array before providing it `func`.
    var argsIndex = -1,
        argsLength = arguments.length,
        leftIndex = -1,
        leftLength = partials.length,
        args = Array(leftLength + argsLength);

    while (++leftIndex < leftLength) {
      args[leftIndex] = partials[leftIndex];
    }
    while (argsLength--) {
      args[leftIndex++] = arguments[++argsIndex];
    }
    var fn = (this && this !== global && this instanceof wrapper) ? Ctor : func;
    return fn.apply(isBind ? thisArg : this, args);
  }
  return wrapper;
}

module.exports = createPartialWrapper;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"203":203}],208:[function(_dereq_,module,exports){
var baseCallback = _dereq_(159),
    baseReduce = _dereq_(186),
    isArray = _dereq_(241);

/**
 * Creates a function for `_.reduce` or `_.reduceRight`.
 *
 * @private
 * @param {Function} arrayFunc The function to iterate over an array.
 * @param {Function} eachFunc The function to iterate over a collection.
 * @returns {Function} Returns the new each function.
 */
function createReduce(arrayFunc, eachFunc) {
  return function(collection, iteratee, accumulator, thisArg) {
    var initFromArray = arguments.length < 3;
    return (typeof iteratee == 'function' && thisArg === undefined && isArray(collection))
      ? arrayFunc(collection, iteratee, accumulator, initFromArray)
      : baseReduce(collection, baseCallback(iteratee, thisArg, 4), accumulator, initFromArray, eachFunc);
  };
}

module.exports = createReduce;

},{"159":159,"186":186,"241":241}],209:[function(_dereq_,module,exports){
var baseSetData = _dereq_(187),
    createBindWrapper = _dereq_(201),
    createHybridWrapper = _dereq_(206),
    createPartialWrapper = _dereq_(207),
    getData = _dereq_(213),
    mergeData = _dereq_(227),
    setData = _dereq_(234);

/** Used to compose bitmasks for wrapper metadata. */
var BIND_FLAG = 1,
    BIND_KEY_FLAG = 2,
    PARTIAL_FLAG = 32,
    PARTIAL_RIGHT_FLAG = 64;

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates a function that either curries or invokes `func` with optional
 * `this` binding and partially applied arguments.
 *
 * @private
 * @param {Function|string} func The function or method name to reference.
 * @param {number} bitmask The bitmask of flags.
 *  The bitmask may be composed of the following flags:
 *     1 - `_.bind`
 *     2 - `_.bindKey`
 *     4 - `_.curry` or `_.curryRight` of a bound function
 *     8 - `_.curry`
 *    16 - `_.curryRight`
 *    32 - `_.partial`
 *    64 - `_.partialRight`
 *   128 - `_.rearg`
 *   256 - `_.ary`
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {Array} [partials] The arguments to be partially applied.
 * @param {Array} [holders] The `partials` placeholder indexes.
 * @param {Array} [argPos] The argument positions of the new function.
 * @param {number} [ary] The arity cap of `func`.
 * @param {number} [arity] The arity of `func`.
 * @returns {Function} Returns the new wrapped function.
 */
function createWrapper(func, bitmask, thisArg, partials, holders, argPos, ary, arity) {
  var isBindKey = bitmask & BIND_KEY_FLAG;
  if (!isBindKey && typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var length = partials ? partials.length : 0;
  if (!length) {
    bitmask &= ~(PARTIAL_FLAG | PARTIAL_RIGHT_FLAG);
    partials = holders = undefined;
  }
  length -= (holders ? holders.length : 0);
  if (bitmask & PARTIAL_RIGHT_FLAG) {
    var partialsRight = partials,
        holdersRight = holders;

    partials = holders = undefined;
  }
  var data = isBindKey ? undefined : getData(func),
      newData = [func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity];

  if (data) {
    mergeData(newData, data);
    bitmask = newData[1];
    arity = newData[9];
  }
  newData[9] = arity == null
    ? (isBindKey ? 0 : func.length)
    : (nativeMax(arity - length, 0) || 0);

  if (bitmask == BIND_FLAG) {
    var result = createBindWrapper(newData[0], newData[2]);
  } else if ((bitmask == PARTIAL_FLAG || bitmask == (BIND_FLAG | PARTIAL_FLAG)) && !newData[4].length) {
    result = createPartialWrapper.apply(undefined, newData);
  } else {
    result = createHybridWrapper.apply(undefined, newData);
  }
  var setter = data ? baseSetData : setData;
  return setter(result, newData);
}

module.exports = createWrapper;

},{"187":187,"201":201,"206":206,"207":207,"213":213,"227":227,"234":234}],210:[function(_dereq_,module,exports){
var arraySome = _dereq_(156);

/**
 * A specialized version of `baseIsEqualDeep` for arrays with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Array} array The array to compare.
 * @param {Array} other The other array to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing arrays.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
 */
function equalArrays(array, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var index = -1,
      arrLength = array.length,
      othLength = other.length;

  if (arrLength != othLength && !(isLoose && othLength > arrLength)) {
    return false;
  }
  // Ignore non-index properties.
  while (++index < arrLength) {
    var arrValue = array[index],
        othValue = other[index],
        result = customizer ? customizer(isLoose ? othValue : arrValue, isLoose ? arrValue : othValue, index) : undefined;

    if (result !== undefined) {
      if (result) {
        continue;
      }
      return false;
    }
    // Recursively compare arrays (susceptible to call stack limits).
    if (isLoose) {
      if (!arraySome(other, function(othValue) {
            return arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB);
          })) {
        return false;
      }
    } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB))) {
      return false;
    }
  }
  return true;
}

module.exports = equalArrays;

},{"156":156}],211:[function(_dereq_,module,exports){
/** `Object#toString` result references. */
var boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    numberTag = '[object Number]',
    regexpTag = '[object RegExp]',
    stringTag = '[object String]';

/**
 * A specialized version of `baseIsEqualDeep` for comparing objects of
 * the same `toStringTag`.
 *
 * **Note:** This function only supports comparing values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {string} tag The `toStringTag` of the objects to compare.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalByTag(object, other, tag) {
  switch (tag) {
    case boolTag:
    case dateTag:
      // Coerce dates and booleans to numbers, dates to milliseconds and booleans
      // to `1` or `0` treating invalid dates coerced to `NaN` as not equal.
      return +object == +other;

    case errorTag:
      return object.name == other.name && object.message == other.message;

    case numberTag:
      // Treat `NaN` vs. `NaN` as equal.
      return (object != +object)
        ? other != +other
        : object == +other;

    case regexpTag:
    case stringTag:
      // Coerce regexes to strings and treat strings primitives and string
      // objects as equal. See https://es5.github.io/#x15.10.6.4 for more details.
      return object == (other + '');
  }
  return false;
}

module.exports = equalByTag;

},{}],212:[function(_dereq_,module,exports){
var keys = _dereq_(251);

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A specialized version of `baseIsEqualDeep` for objects with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing values.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalObjects(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var objProps = keys(object),
      objLength = objProps.length,
      othProps = keys(other),
      othLength = othProps.length;

  if (objLength != othLength && !isLoose) {
    return false;
  }
  var index = objLength;
  while (index--) {
    var key = objProps[index];
    if (!(isLoose ? key in other : hasOwnProperty.call(other, key))) {
      return false;
    }
  }
  var skipCtor = isLoose;
  while (++index < objLength) {
    key = objProps[index];
    var objValue = object[key],
        othValue = other[key],
        result = customizer ? customizer(isLoose ? othValue : objValue, isLoose? objValue : othValue, key) : undefined;

    // Recursively compare objects (susceptible to call stack limits).
    if (!(result === undefined ? equalFunc(objValue, othValue, customizer, isLoose, stackA, stackB) : result)) {
      return false;
    }
    skipCtor || (skipCtor = key == 'constructor');
  }
  if (!skipCtor) {
    var objCtor = object.constructor,
        othCtor = other.constructor;

    // Non `Object` object instances with different constructors are not equal.
    if (objCtor != othCtor &&
        ('constructor' in object && 'constructor' in other) &&
        !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
          typeof othCtor == 'function' && othCtor instanceof othCtor)) {
      return false;
    }
  }
  return true;
}

module.exports = equalObjects;

},{"251":251}],213:[function(_dereq_,module,exports){
var metaMap = _dereq_(228),
    noop = _dereq_(258);

/**
 * Gets metadata for `func`.
 *
 * @private
 * @param {Function} func The function to query.
 * @returns {*} Returns the metadata for `func`.
 */
var getData = !metaMap ? noop : function(func) {
  return metaMap.get(func);
};

module.exports = getData;

},{"228":228,"258":258}],214:[function(_dereq_,module,exports){
var realNames = _dereq_(231);

/**
 * Gets the name of `func`.
 *
 * @private
 * @param {Function} func The function to query.
 * @returns {string} Returns the function name.
 */
function getFuncName(func) {
  var result = (func.name + ''),
      array = realNames[result],
      length = array ? array.length : 0;

  while (length--) {
    var data = array[length],
        otherFunc = data.func;
    if (otherFunc == null || otherFunc == func) {
      return data.name;
    }
  }
  return result;
}

module.exports = getFuncName;

},{"231":231}],215:[function(_dereq_,module,exports){
var baseProperty = _dereq_(184);

/**
 * Gets the "length" property value of `object`.
 *
 * **Note:** This function is used to avoid a [JIT bug](https://bugs.webkit.org/show_bug.cgi?id=142792)
 * that affects Safari on at least iOS 8.1-8.3 ARM64.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {*} Returns the "length" value.
 */
var getLength = baseProperty('length');

module.exports = getLength;

},{"184":184}],216:[function(_dereq_,module,exports){
var isStrictComparable = _dereq_(226),
    pairs = _dereq_(255);

/**
 * Gets the propery names, values, and compare flags of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the match data of `object`.
 */
function getMatchData(object) {
  var result = pairs(object),
      length = result.length;

  while (length--) {
    result[length][2] = isStrictComparable(result[length][1]);
  }
  return result;
}

module.exports = getMatchData;

},{"226":226,"255":255}],217:[function(_dereq_,module,exports){
var isNative = _dereq_(243);

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = object == null ? undefined : object[key];
  return isNative(value) ? value : undefined;
}

module.exports = getNative;

},{"243":243}],218:[function(_dereq_,module,exports){
/**
 * Gets the index at which the first occurrence of `NaN` is found in `array`.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {number} fromIndex The index to search from.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {number} Returns the index of the matched `NaN`, else `-1`.
 */
function indexOfNaN(array, fromIndex, fromRight) {
  var length = array.length,
      index = fromIndex + (fromRight ? 0 : -1);

  while ((fromRight ? index-- : ++index < length)) {
    var other = array[index];
    if (other !== other) {
      return index;
    }
  }
  return -1;
}

module.exports = indexOfNaN;

},{}],219:[function(_dereq_,module,exports){
var getLength = _dereq_(215),
    isLength = _dereq_(224);

/**
 * Checks if `value` is array-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 */
function isArrayLike(value) {
  return value != null && isLength(getLength(value));
}

module.exports = isArrayLike;

},{"215":215,"224":224}],220:[function(_dereq_,module,exports){
/** Used to detect unsigned integer values. */
var reIsUint = /^\d+$/;

/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  value = (typeof value == 'number' || reIsUint.test(value)) ? +value : -1;
  length = length == null ? MAX_SAFE_INTEGER : length;
  return value > -1 && value % 1 == 0 && value < length;
}

module.exports = isIndex;

},{}],221:[function(_dereq_,module,exports){
var isArrayLike = _dereq_(219),
    isIndex = _dereq_(220),
    isObject = _dereq_(245);

/**
 * Checks if the provided arguments are from an iteratee call.
 *
 * @private
 * @param {*} value The potential iteratee value argument.
 * @param {*} index The potential iteratee index or key argument.
 * @param {*} object The potential iteratee object argument.
 * @returns {boolean} Returns `true` if the arguments are from an iteratee call, else `false`.
 */
function isIterateeCall(value, index, object) {
  if (!isObject(object)) {
    return false;
  }
  var type = typeof index;
  if (type == 'number'
      ? (isArrayLike(object) && isIndex(index, object.length))
      : (type == 'string' && index in object)) {
    var other = object[index];
    return value === value ? (value === other) : (other !== other);
  }
  return false;
}

module.exports = isIterateeCall;

},{"219":219,"220":220,"245":245}],222:[function(_dereq_,module,exports){
var isArray = _dereq_(241),
    toObject = _dereq_(237);

/** Used to match property names within property paths. */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\n\\]|\\.)*?\1)\]/,
    reIsPlainProp = /^\w*$/;

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey(value, object) {
  var type = typeof value;
  if ((type == 'string' && reIsPlainProp.test(value)) || type == 'number') {
    return true;
  }
  if (isArray(value)) {
    return false;
  }
  var result = !reIsDeepProp.test(value);
  return result || (object != null && value in toObject(object));
}

module.exports = isKey;

},{"237":237,"241":241}],223:[function(_dereq_,module,exports){
var LazyWrapper = _dereq_(146),
    getData = _dereq_(213),
    getFuncName = _dereq_(214),
    lodash = _dereq_(131);

/**
 * Checks if `func` has a lazy counterpart.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` has a lazy counterpart, else `false`.
 */
function isLaziable(func) {
  var funcName = getFuncName(func),
      other = lodash[funcName];

  if (typeof other != 'function' || !(funcName in LazyWrapper.prototype)) {
    return false;
  }
  if (func === other) {
    return true;
  }
  var data = getData(other);
  return !!data && func === data[0];
}

module.exports = isLaziable;

},{"131":131,"146":146,"213":213,"214":214}],224:[function(_dereq_,module,exports){
/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

module.exports = isLength;

},{}],225:[function(_dereq_,module,exports){
/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

module.exports = isObjectLike;

},{}],226:[function(_dereq_,module,exports){
var isObject = _dereq_(245);

/**
 * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` if suitable for strict
 *  equality comparisons, else `false`.
 */
function isStrictComparable(value) {
  return value === value && !isObject(value);
}

module.exports = isStrictComparable;

},{"245":245}],227:[function(_dereq_,module,exports){
var arrayCopy = _dereq_(149),
    composeArgs = _dereq_(195),
    composeArgsRight = _dereq_(196),
    replaceHolders = _dereq_(233);

/** Used to compose bitmasks for wrapper metadata. */
var BIND_FLAG = 1,
    CURRY_BOUND_FLAG = 4,
    CURRY_FLAG = 8,
    ARY_FLAG = 128,
    REARG_FLAG = 256;

/** Used as the internal argument placeholder. */
var PLACEHOLDER = '__lodash_placeholder__';

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMin = Math.min;

/**
 * Merges the function metadata of `source` into `data`.
 *
 * Merging metadata reduces the number of wrappers required to invoke a function.
 * This is possible because methods like `_.bind`, `_.curry`, and `_.partial`
 * may be applied regardless of execution order. Methods like `_.ary` and `_.rearg`
 * augment function arguments, making the order in which they are executed important,
 * preventing the merging of metadata. However, we make an exception for a safe
 * common case where curried functions have `_.ary` and or `_.rearg` applied.
 *
 * @private
 * @param {Array} data The destination metadata.
 * @param {Array} source The source metadata.
 * @returns {Array} Returns `data`.
 */
function mergeData(data, source) {
  var bitmask = data[1],
      srcBitmask = source[1],
      newBitmask = bitmask | srcBitmask,
      isCommon = newBitmask < ARY_FLAG;

  var isCombo =
    (srcBitmask == ARY_FLAG && bitmask == CURRY_FLAG) ||
    (srcBitmask == ARY_FLAG && bitmask == REARG_FLAG && data[7].length <= source[8]) ||
    (srcBitmask == (ARY_FLAG | REARG_FLAG) && bitmask == CURRY_FLAG);

  // Exit early if metadata can't be merged.
  if (!(isCommon || isCombo)) {
    return data;
  }
  // Use source `thisArg` if available.
  if (srcBitmask & BIND_FLAG) {
    data[2] = source[2];
    // Set when currying a bound function.
    newBitmask |= (bitmask & BIND_FLAG) ? 0 : CURRY_BOUND_FLAG;
  }
  // Compose partial arguments.
  var value = source[3];
  if (value) {
    var partials = data[3];
    data[3] = partials ? composeArgs(partials, value, source[4]) : arrayCopy(value);
    data[4] = partials ? replaceHolders(data[3], PLACEHOLDER) : arrayCopy(source[4]);
  }
  // Compose partial right arguments.
  value = source[5];
  if (value) {
    partials = data[5];
    data[5] = partials ? composeArgsRight(partials, value, source[6]) : arrayCopy(value);
    data[6] = partials ? replaceHolders(data[5], PLACEHOLDER) : arrayCopy(source[6]);
  }
  // Use source `argPos` if available.
  value = source[7];
  if (value) {
    data[7] = arrayCopy(value);
  }
  // Use source `ary` if it's smaller.
  if (srcBitmask & ARY_FLAG) {
    data[8] = data[8] == null ? source[8] : nativeMin(data[8], source[8]);
  }
  // Use source `arity` if one is not provided.
  if (data[9] == null) {
    data[9] = source[9];
  }
  // Use source `func` and merge bitmasks.
  data[0] = source[0];
  data[1] = newBitmask;

  return data;
}

module.exports = mergeData;

},{"149":149,"195":195,"196":196,"233":233}],228:[function(_dereq_,module,exports){
(function (global){
var getNative = _dereq_(217);

/** Native method references. */
var WeakMap = getNative(global, 'WeakMap');

/** Used to store function metadata. */
var metaMap = WeakMap && new WeakMap;

module.exports = metaMap;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"217":217}],229:[function(_dereq_,module,exports){
var toObject = _dereq_(237);

/**
 * A specialized version of `_.pick` which picks `object` properties specified
 * by `props`.
 *
 * @private
 * @param {Object} object The source object.
 * @param {string[]} props The property names to pick.
 * @returns {Object} Returns the new object.
 */
function pickByArray(object, props) {
  object = toObject(object);

  var index = -1,
      length = props.length,
      result = {};

  while (++index < length) {
    var key = props[index];
    if (key in object) {
      result[key] = object[key];
    }
  }
  return result;
}

module.exports = pickByArray;

},{"237":237}],230:[function(_dereq_,module,exports){
var baseForIn = _dereq_(171);

/**
 * A specialized version of `_.pick` which picks `object` properties `predicate`
 * returns truthy for.
 *
 * @private
 * @param {Object} object The source object.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {Object} Returns the new object.
 */
function pickByCallback(object, predicate) {
  var result = {};
  baseForIn(object, function(value, key, object) {
    if (predicate(value, key, object)) {
      result[key] = value;
    }
  });
  return result;
}

module.exports = pickByCallback;

},{"171":171}],231:[function(_dereq_,module,exports){
/** Used to lookup unminified function names. */
var realNames = {};

module.exports = realNames;

},{}],232:[function(_dereq_,module,exports){
var arrayCopy = _dereq_(149),
    isIndex = _dereq_(220);

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMin = Math.min;

/**
 * Reorder `array` according to the specified indexes where the element at
 * the first index is assigned as the first element, the element at
 * the second index is assigned as the second element, and so on.
 *
 * @private
 * @param {Array} array The array to reorder.
 * @param {Array} indexes The arranged array indexes.
 * @returns {Array} Returns `array`.
 */
function reorder(array, indexes) {
  var arrLength = array.length,
      length = nativeMin(indexes.length, arrLength),
      oldArray = arrayCopy(array);

  while (length--) {
    var index = indexes[length];
    array[length] = isIndex(index, arrLength) ? oldArray[index] : undefined;
  }
  return array;
}

module.exports = reorder;

},{"149":149,"220":220}],233:[function(_dereq_,module,exports){
/** Used as the internal argument placeholder. */
var PLACEHOLDER = '__lodash_placeholder__';

/**
 * Replaces all `placeholder` elements in `array` with an internal placeholder
 * and returns an array of their indexes.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {*} placeholder The placeholder to replace.
 * @returns {Array} Returns the new array of placeholder indexes.
 */
function replaceHolders(array, placeholder) {
  var index = -1,
      length = array.length,
      resIndex = -1,
      result = [];

  while (++index < length) {
    if (array[index] === placeholder) {
      array[index] = PLACEHOLDER;
      result[++resIndex] = index;
    }
  }
  return result;
}

module.exports = replaceHolders;

},{}],234:[function(_dereq_,module,exports){
var baseSetData = _dereq_(187),
    now = _dereq_(141);

/** Used to detect when a function becomes hot. */
var HOT_COUNT = 150,
    HOT_SPAN = 16;

/**
 * Sets metadata for `func`.
 *
 * **Note:** If this function becomes hot, i.e. is invoked a lot in a short
 * period of time, it will trip its breaker and transition to an identity function
 * to avoid garbage collection pauses in V8. See [V8 issue 2070](https://code.google.com/p/v8/issues/detail?id=2070)
 * for more details.
 *
 * @private
 * @param {Function} func The function to associate metadata with.
 * @param {*} data The metadata.
 * @returns {Function} Returns `func`.
 */
var setData = (function() {
  var count = 0,
      lastCalled = 0;

  return function(key, value) {
    var stamp = now(),
        remaining = HOT_SPAN - (stamp - lastCalled);

    lastCalled = stamp;
    if (remaining > 0) {
      if (++count >= HOT_COUNT) {
        return key;
      }
    } else {
      count = 0;
    }
    return baseSetData(key, value);
  };
}());

module.exports = setData;

},{"141":141,"187":187}],235:[function(_dereq_,module,exports){
var isArguments = _dereq_(240),
    isArray = _dereq_(241),
    isIndex = _dereq_(220),
    isLength = _dereq_(224),
    keysIn = _dereq_(252);

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A fallback implementation of `Object.keys` which creates an array of the
 * own enumerable property names of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function shimKeys(object) {
  var props = keysIn(object),
      propsLength = props.length,
      length = propsLength && object.length;

  var allowIndexes = !!length && isLength(length) &&
    (isArray(object) || isArguments(object));

  var index = -1,
      result = [];

  while (++index < propsLength) {
    var key = props[index];
    if ((allowIndexes && isIndex(key, length)) || hasOwnProperty.call(object, key)) {
      result.push(key);
    }
  }
  return result;
}

module.exports = shimKeys;

},{"220":220,"224":224,"240":240,"241":241,"252":252}],236:[function(_dereq_,module,exports){
/**
 * An implementation of `_.uniq` optimized for sorted arrays without support
 * for callback shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {Function} [iteratee] The function invoked per iteration.
 * @returns {Array} Returns the new duplicate free array.
 */
function sortedUniq(array, iteratee) {
  var seen,
      index = -1,
      length = array.length,
      resIndex = -1,
      result = [];

  while (++index < length) {
    var value = array[index],
        computed = iteratee ? iteratee(value, index, array) : value;

    if (!index || seen !== computed) {
      seen = computed;
      result[++resIndex] = value;
    }
  }
  return result;
}

module.exports = sortedUniq;

},{}],237:[function(_dereq_,module,exports){
var isObject = _dereq_(245);

/**
 * Converts `value` to an object if it's not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Object} Returns the object.
 */
function toObject(value) {
  return isObject(value) ? value : Object(value);
}

module.exports = toObject;

},{"245":245}],238:[function(_dereq_,module,exports){
var baseToString = _dereq_(190),
    isArray = _dereq_(241);

/** Used to match property names within property paths. */
var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;

/**
 * Converts `value` to property path array if it's not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Array} Returns the property path array.
 */
function toPath(value) {
  if (isArray(value)) {
    return value;
  }
  var result = [];
  baseToString(value).replace(rePropName, function(match, number, quote, string) {
    result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
}

module.exports = toPath;

},{"190":190,"241":241}],239:[function(_dereq_,module,exports){
var LazyWrapper = _dereq_(146),
    LodashWrapper = _dereq_(147),
    arrayCopy = _dereq_(149);

/**
 * Creates a clone of `wrapper`.
 *
 * @private
 * @param {Object} wrapper The wrapper to clone.
 * @returns {Object} Returns the cloned wrapper.
 */
function wrapperClone(wrapper) {
  return wrapper instanceof LazyWrapper
    ? wrapper.clone()
    : new LodashWrapper(wrapper.__wrapped__, wrapper.__chain__, arrayCopy(wrapper.__actions__));
}

module.exports = wrapperClone;

},{"146":146,"147":147,"149":149}],240:[function(_dereq_,module,exports){
var isArrayLike = _dereq_(219),
    isObjectLike = _dereq_(225);

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Native method references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/**
 * Checks if `value` is classified as an `arguments` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  return isObjectLike(value) && isArrayLike(value) &&
    hasOwnProperty.call(value, 'callee') && !propertyIsEnumerable.call(value, 'callee');
}

module.exports = isArguments;

},{"219":219,"225":225}],241:[function(_dereq_,module,exports){
var getNative = _dereq_(217),
    isLength = _dereq_(224),
    isObjectLike = _dereq_(225);

/** `Object#toString` result references. */
var arrayTag = '[object Array]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/* Native method references for those with the same name as other `lodash` methods. */
var nativeIsArray = getNative(Array, 'isArray');

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(function() { return arguments; }());
 * // => false
 */
var isArray = nativeIsArray || function(value) {
  return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag;
};

module.exports = isArray;

},{"217":217,"224":224,"225":225}],242:[function(_dereq_,module,exports){
var isObject = _dereq_(245);

/** `Object#toString` result references. */
var funcTag = '[object Function]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in older versions of Chrome and Safari which return 'function' for regexes
  // and Safari 8 which returns 'object' for typed array constructors.
  return isObject(value) && objToString.call(value) == funcTag;
}

module.exports = isFunction;

},{"245":245}],243:[function(_dereq_,module,exports){
var isFunction = _dereq_(242),
    isObjectLike = _dereq_(225);

/** Used to detect host constructors (Safari > 5). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/**
 * Checks if `value` is a native function.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function, else `false`.
 * @example
 *
 * _.isNative(Array.prototype.push);
 * // => true
 *
 * _.isNative(_);
 * // => false
 */
function isNative(value) {
  if (value == null) {
    return false;
  }
  if (isFunction(value)) {
    return reIsNative.test(fnToString.call(value));
  }
  return isObjectLike(value) && reIsHostCtor.test(value);
}

module.exports = isNative;

},{"225":225,"242":242}],244:[function(_dereq_,module,exports){
var isObjectLike = _dereq_(225);

/** `Object#toString` result references. */
var numberTag = '[object Number]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a `Number` primitive or object.
 *
 * **Note:** To exclude `Infinity`, `-Infinity`, and `NaN`, which are classified
 * as numbers, use the `_.isFinite` method.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isNumber(8.4);
 * // => true
 *
 * _.isNumber(NaN);
 * // => true
 *
 * _.isNumber('8.4');
 * // => false
 */
function isNumber(value) {
  return typeof value == 'number' || (isObjectLike(value) && objToString.call(value) == numberTag);
}

module.exports = isNumber;

},{"225":225}],245:[function(_dereq_,module,exports){
/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

module.exports = isObject;

},{}],246:[function(_dereq_,module,exports){
var baseForIn = _dereq_(171),
    isArguments = _dereq_(240),
    isObjectLike = _dereq_(225);

/** `Object#toString` result references. */
var objectTag = '[object Object]';

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is a plain object, that is, an object created by the
 * `Object` constructor or one with a `[[Prototype]]` of `null`.
 *
 * **Note:** This method assumes objects created by the `Object` constructor
 * have no inherited enumerable properties.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 * }
 *
 * _.isPlainObject(new Foo);
 * // => false
 *
 * _.isPlainObject([1, 2, 3]);
 * // => false
 *
 * _.isPlainObject({ 'x': 0, 'y': 0 });
 * // => true
 *
 * _.isPlainObject(Object.create(null));
 * // => true
 */
function isPlainObject(value) {
  var Ctor;

  // Exit early for non `Object` objects.
  if (!(isObjectLike(value) && objToString.call(value) == objectTag && !isArguments(value)) ||
      (!hasOwnProperty.call(value, 'constructor') && (Ctor = value.constructor, typeof Ctor == 'function' && !(Ctor instanceof Ctor)))) {
    return false;
  }
  // IE < 9 iterates inherited properties before own properties. If the first
  // iterated property is an object's own property then there are no inherited
  // enumerable properties.
  var result;
  // In most environments an object's own properties are iterated before
  // its inherited properties. If the last iterated property is an object's
  // own property then there are no inherited enumerable properties.
  baseForIn(value, function(subValue, key) {
    result = key;
  });
  return result === undefined || hasOwnProperty.call(value, result);
}

module.exports = isPlainObject;

},{"171":171,"225":225,"240":240}],247:[function(_dereq_,module,exports){
var isObjectLike = _dereq_(225);

/** `Object#toString` result references. */
var stringTag = '[object String]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a `String` primitive or object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isString('abc');
 * // => true
 *
 * _.isString(1);
 * // => false
 */
function isString(value) {
  return typeof value == 'string' || (isObjectLike(value) && objToString.call(value) == stringTag);
}

module.exports = isString;

},{"225":225}],248:[function(_dereq_,module,exports){
var isLength = _dereq_(224),
    isObjectLike = _dereq_(225);

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values of typed arrays. */
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
typedArrayTags[dateTag] = typedArrayTags[errorTag] =
typedArrayTags[funcTag] = typedArrayTags[mapTag] =
typedArrayTags[numberTag] = typedArrayTags[objectTag] =
typedArrayTags[regexpTag] = typedArrayTags[setTag] =
typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a typed array.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isTypedArray(new Uint8Array);
 * // => true
 *
 * _.isTypedArray([]);
 * // => false
 */
function isTypedArray(value) {
  return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[objToString.call(value)];
}

module.exports = isTypedArray;

},{"224":224,"225":225}],249:[function(_dereq_,module,exports){
var baseCopy = _dereq_(160),
    keysIn = _dereq_(252);

/**
 * Converts `value` to a plain object flattening inherited enumerable
 * properties of `value` to own properties of the plain object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {Object} Returns the converted plain object.
 * @example
 *
 * function Foo() {
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.assign({ 'a': 1 }, new Foo);
 * // => { 'a': 1, 'b': 2 }
 *
 * _.assign({ 'a': 1 }, _.toPlainObject(new Foo));
 * // => { 'a': 1, 'b': 2, 'c': 3 }
 */
function toPlainObject(value) {
  return baseCopy(value, keysIn(value));
}

module.exports = toPlainObject;

},{"160":160,"252":252}],250:[function(_dereq_,module,exports){
var assignWith = _dereq_(157),
    baseAssign = _dereq_(158),
    createAssigner = _dereq_(198);

/**
 * Assigns own enumerable properties of source object(s) to the destination
 * object. Subsequent sources overwrite property assignments of previous sources.
 * If `customizer` is provided it's invoked to produce the assigned values.
 * The `customizer` is bound to `thisArg` and invoked with five arguments:
 * (objectValue, sourceValue, key, object, source).
 *
 * **Note:** This method mutates `object` and is based on
 * [`Object.assign`](http://ecma-international.org/ecma-262/6.0/#sec-object.assign).
 *
 * @static
 * @memberOf _
 * @alias extend
 * @category Object
 * @param {Object} object The destination object.
 * @param {...Object} [sources] The source objects.
 * @param {Function} [customizer] The function to customize assigned values.
 * @param {*} [thisArg] The `this` binding of `customizer`.
 * @returns {Object} Returns `object`.
 * @example
 *
 * _.assign({ 'user': 'barney' }, { 'age': 40 }, { 'user': 'fred' });
 * // => { 'user': 'fred', 'age': 40 }
 *
 * // using a customizer callback
 * var defaults = _.partialRight(_.assign, function(value, other) {
 *   return _.isUndefined(value) ? other : value;
 * });
 *
 * defaults({ 'user': 'barney' }, { 'age': 36 }, { 'user': 'fred' });
 * // => { 'user': 'barney', 'age': 36 }
 */
var assign = createAssigner(function(object, source, customizer) {
  return customizer
    ? assignWith(object, source, customizer)
    : baseAssign(object, source);
});

module.exports = assign;

},{"157":157,"158":158,"198":198}],251:[function(_dereq_,module,exports){
var getNative = _dereq_(217),
    isArrayLike = _dereq_(219),
    isObject = _dereq_(245),
    shimKeys = _dereq_(235);

/* Native method references for those with the same name as other `lodash` methods. */
var nativeKeys = getNative(Object, 'keys');

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/6.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
var keys = !nativeKeys ? shimKeys : function(object) {
  var Ctor = object == null ? undefined : object.constructor;
  if ((typeof Ctor == 'function' && Ctor.prototype === object) ||
      (typeof object != 'function' && isArrayLike(object))) {
    return shimKeys(object);
  }
  return isObject(object) ? nativeKeys(object) : [];
};

module.exports = keys;

},{"217":217,"219":219,"235":235,"245":245}],252:[function(_dereq_,module,exports){
var isArguments = _dereq_(240),
    isArray = _dereq_(241),
    isIndex = _dereq_(220),
    isLength = _dereq_(224),
    isObject = _dereq_(245);

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Creates an array of the own and inherited enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keysIn(new Foo);
 * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
 */
function keysIn(object) {
  if (object == null) {
    return [];
  }
  if (!isObject(object)) {
    object = Object(object);
  }
  var length = object.length;
  length = (length && isLength(length) &&
    (isArray(object) || isArguments(object)) && length) || 0;

  var Ctor = object.constructor,
      index = -1,
      isProto = typeof Ctor == 'function' && Ctor.prototype === object,
      result = Array(length),
      skipIndexes = length > 0;

  while (++index < length) {
    result[index] = (index + '');
  }
  for (var key in object) {
    if (!(skipIndexes && isIndex(key, length)) &&
        !(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
      result.push(key);
    }
  }
  return result;
}

module.exports = keysIn;

},{"220":220,"224":224,"240":240,"241":241,"245":245}],253:[function(_dereq_,module,exports){
var baseMerge = _dereq_(182),
    createAssigner = _dereq_(198);

/**
 * Recursively merges own enumerable properties of the source object(s), that
 * don't resolve to `undefined` into the destination object. Subsequent sources
 * overwrite property assignments of previous sources. If `customizer` is
 * provided it's invoked to produce the merged values of the destination and
 * source properties. If `customizer` returns `undefined` merging is handled
 * by the method instead. The `customizer` is bound to `thisArg` and invoked
 * with five arguments: (objectValue, sourceValue, key, object, source).
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The destination object.
 * @param {...Object} [sources] The source objects.
 * @param {Function} [customizer] The function to customize assigned values.
 * @param {*} [thisArg] The `this` binding of `customizer`.
 * @returns {Object} Returns `object`.
 * @example
 *
 * var users = {
 *   'data': [{ 'user': 'barney' }, { 'user': 'fred' }]
 * };
 *
 * var ages = {
 *   'data': [{ 'age': 36 }, { 'age': 40 }]
 * };
 *
 * _.merge(users, ages);
 * // => { 'data': [{ 'user': 'barney', 'age': 36 }, { 'user': 'fred', 'age': 40 }] }
 *
 * // using a customizer callback
 * var object = {
 *   'fruits': ['apple'],
 *   'vegetables': ['beet']
 * };
 *
 * var other = {
 *   'fruits': ['banana'],
 *   'vegetables': ['carrot']
 * };
 *
 * _.merge(object, other, function(a, b) {
 *   if (_.isArray(a)) {
 *     return a.concat(b);
 *   }
 * });
 * // => { 'fruits': ['apple', 'banana'], 'vegetables': ['beet', 'carrot'] }
 */
var merge = createAssigner(baseMerge);

module.exports = merge;

},{"182":182,"198":198}],254:[function(_dereq_,module,exports){
var arrayMap = _dereq_(153),
    baseDifference = _dereq_(163),
    baseFlatten = _dereq_(169),
    bindCallback = _dereq_(192),
    keysIn = _dereq_(252),
    pickByArray = _dereq_(229),
    pickByCallback = _dereq_(230),
    restParam = _dereq_(145);

/**
 * The opposite of `_.pick`; this method creates an object composed of the
 * own and inherited enumerable properties of `object` that are not omitted.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The source object.
 * @param {Function|...(string|string[])} [predicate] The function invoked per
 *  iteration or property names to omit, specified as individual property
 *  names or arrays of property names.
 * @param {*} [thisArg] The `this` binding of `predicate`.
 * @returns {Object} Returns the new object.
 * @example
 *
 * var object = { 'user': 'fred', 'age': 40 };
 *
 * _.omit(object, 'age');
 * // => { 'user': 'fred' }
 *
 * _.omit(object, _.isNumber);
 * // => { 'user': 'fred' }
 */
var omit = restParam(function(object, props) {
  if (object == null) {
    return {};
  }
  if (typeof props[0] != 'function') {
    var props = arrayMap(baseFlatten(props), String);
    return pickByArray(object, baseDifference(keysIn(object), props));
  }
  var predicate = bindCallback(props[0], props[1], 3);
  return pickByCallback(object, function(value, key, object) {
    return !predicate(value, key, object);
  });
});

module.exports = omit;

},{"145":145,"153":153,"163":163,"169":169,"192":192,"229":229,"230":230,"252":252}],255:[function(_dereq_,module,exports){
var keys = _dereq_(251),
    toObject = _dereq_(237);

/**
 * Creates a two dimensional array of the key-value pairs for `object`,
 * e.g. `[[key1, value1], [key2, value2]]`.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the new array of key-value pairs.
 * @example
 *
 * _.pairs({ 'barney': 36, 'fred': 40 });
 * // => [['barney', 36], ['fred', 40]] (iteration order is not guaranteed)
 */
function pairs(object) {
  object = toObject(object);

  var index = -1,
      props = keys(object),
      length = props.length,
      result = Array(length);

  while (++index < length) {
    var key = props[index];
    result[index] = [key, object[key]];
  }
  return result;
}

module.exports = pairs;

},{"237":237,"251":251}],256:[function(_dereq_,module,exports){
var baseFlatten = _dereq_(169),
    bindCallback = _dereq_(192),
    pickByArray = _dereq_(229),
    pickByCallback = _dereq_(230),
    restParam = _dereq_(145);

/**
 * Creates an object composed of the picked `object` properties. Property
 * names may be specified as individual arguments or as arrays of property
 * names. If `predicate` is provided it's invoked for each property of `object`
 * picking the properties `predicate` returns truthy for. The predicate is
 * bound to `thisArg` and invoked with three arguments: (value, key, object).
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The source object.
 * @param {Function|...(string|string[])} [predicate] The function invoked per
 *  iteration or property names to pick, specified as individual property
 *  names or arrays of property names.
 * @param {*} [thisArg] The `this` binding of `predicate`.
 * @returns {Object} Returns the new object.
 * @example
 *
 * var object = { 'user': 'fred', 'age': 40 };
 *
 * _.pick(object, 'user');
 * // => { 'user': 'fred' }
 *
 * _.pick(object, _.isString);
 * // => { 'user': 'fred' }
 */
var pick = restParam(function(object, props) {
  if (object == null) {
    return {};
  }
  return typeof props[0] == 'function'
    ? pickByCallback(object, bindCallback(props[0], props[1], 3))
    : pickByArray(object, baseFlatten(props));
});

module.exports = pick;

},{"145":145,"169":169,"192":192,"229":229,"230":230}],257:[function(_dereq_,module,exports){
/**
 * This method returns the first argument provided to it.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {*} value Any value.
 * @returns {*} Returns `value`.
 * @example
 *
 * var object = { 'user': 'fred' };
 *
 * _.identity(object) === object;
 * // => true
 */
function identity(value) {
  return value;
}

module.exports = identity;

},{}],258:[function(_dereq_,module,exports){
/**
 * A no-operation function that returns `undefined` regardless of the
 * arguments it receives.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @example
 *
 * var object = { 'user': 'fred' };
 *
 * _.noop(object) === undefined;
 * // => true
 */
function noop() {
  // No operation performed.
}

module.exports = noop;

},{}],259:[function(_dereq_,module,exports){
var baseProperty = _dereq_(184),
    basePropertyDeep = _dereq_(185),
    isKey = _dereq_(222);

/**
 * Creates a function that returns the property value at `path` on a
 * given object.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {Array|string} path The path of the property to get.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var objects = [
 *   { 'a': { 'b': { 'c': 2 } } },
 *   { 'a': { 'b': { 'c': 1 } } }
 * ];
 *
 * _.map(objects, _.property('a.b.c'));
 * // => [2, 1]
 *
 * _.pluck(_.sortBy(objects, _.property(['a', 'b', 'c'])), 'a.b.c');
 * // => [1, 2]
 */
function property(path) {
  return isKey(path) ? baseProperty(path) : basePropertyDeep(path);
}

module.exports = property;

},{"184":184,"185":185,"222":222}],260:[function(_dereq_,module,exports){
/**
 * Set attribute `name` to `val`, or get attr `name`.
 *
 * @param {Element} el
 * @param {String} name
 * @param {String} [val]
 * @api public
 */

module.exports = function(el, name, val) {
  // get
  if (arguments.length == 2) {
    return el.getAttribute(name);
  }

  // remove
  if (val === null) {
    return el.removeAttribute(name);
  }

  // set
  el.setAttribute(name, val);

  return el;
};
},{}],261:[function(_dereq_,module,exports){
module.exports = _dereq_(66);
},{"66":66}],262:[function(_dereq_,module,exports){
module.exports = function(el) {

  var c;

  while (el.childNodes.length) {
    c = el.childNodes[0];
    el.removeChild(c);
  }

  return el;
};
},{}],263:[function(_dereq_,module,exports){
module.exports = _dereq_(68);
},{"68":68}],264:[function(_dereq_,module,exports){
module.exports = _dereq_(125);
},{"125":125}],265:[function(_dereq_,module,exports){
module.exports = _dereq_(69);
},{"69":69}],266:[function(_dereq_,module,exports){
module.exports = _dereq_(72);
},{"72":72}],267:[function(_dereq_,module,exports){
module.exports = function(el) {
  el.parentNode && el.parentNode.removeChild(el);
};
},{}],268:[function(_dereq_,module,exports){
'use strict';

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function lower(string) {
  return string.charAt(0).toLowerCase() + string.slice(1);
}

function hasLowerCaseAlias(pkg) {
  return pkg.xml && pkg.xml.tagAlias === 'lowerCase';
}


module.exports.aliasToName = function(alias, pkg) {
  if (hasLowerCaseAlias(pkg)) {
    return capitalize(alias);
  } else {
    return alias;
  }
};

module.exports.nameToAlias = function(name, pkg) {
  if (hasLowerCaseAlias(pkg)) {
    return lower(name);
  } else {
    return name;
  }
};

module.exports.DEFAULT_NS_MAP = {
  'xsi': 'http://www.w3.org/2001/XMLSchema-instance'
};

var XSI_TYPE = module.exports.XSI_TYPE = 'xsi:type';

function serializeFormat(element) {
  return element.xml && element.xml.serialize;
}

module.exports.serializeAsType = function(element) {
  return serializeFormat(element) === XSI_TYPE;
};

module.exports.serializeAsProperty = function(element) {
  return serializeFormat(element) === 'property';
};
},{}],269:[function(_dereq_,module,exports){
'use strict';

var reduce = _dereq_(139),
    forEach = _dereq_(136),
    find = _dereq_(135),
    assign = _dereq_(250),
    defer = _dereq_(144);

var Stack = _dereq_(319),
    SaxParser = _dereq_(283).parser,
    Moddle = _dereq_(271),
    parseNameNs = _dereq_(276).parseName,
    Types = _dereq_(279),
    coerceType = Types.coerceType,
    isSimpleType = Types.isSimple,
    common = _dereq_(268),
    XSI_TYPE = common.XSI_TYPE,
    XSI_URI = common.DEFAULT_NS_MAP.xsi,
    serializeAsType = common.serializeAsType,
    aliasToName = common.aliasToName;

function parseNodeAttributes(node) {
  var nodeAttrs = node.attributes;

  return reduce(nodeAttrs, function(result, v, k) {
    var name, ns;

    if (!v.local) {
      name = v.prefix;
    } else {
      ns = parseNameNs(v.name, v.prefix);
      name = ns.name;
    }

    result[name] = v.value;
    return result;
  }, {});
}

function normalizeType(node, attr, model) {
  var nameNs = parseNameNs(attr.value);

  var uri = node.ns[nameNs.prefix || ''],
      localName = nameNs.localName,
      pkg = uri && model.getPackage(uri),
      typePrefix;

  if (pkg) {
    typePrefix = pkg.xml && pkg.xml.typePrefix;

    if (typePrefix && localName.indexOf(typePrefix) === 0) {
      localName = localName.slice(typePrefix.length);
    }

    attr.value = pkg.prefix + ':' + localName;
  }
}

/**
 * Normalizes namespaces for a node given an optional default namespace and a
 * number of mappings from uris to default prefixes.
 *
 * @param  {XmlNode} node
 * @param  {Model} model the model containing all registered namespaces
 * @param  {Uri} defaultNsUri
 */
function normalizeNamespaces(node, model, defaultNsUri) {
  var uri, prefix;

  uri = node.uri || defaultNsUri;

  if (uri) {
    var pkg = model.getPackage(uri);

    if (pkg) {
      prefix = pkg.prefix;
    } else {
      prefix = node.prefix;
    }

    node.prefix = prefix;
    node.uri = uri;
  }

  forEach(node.attributes, function(attr) {

    // normalize xsi:type attributes because the
    // assigned type may or may not be namespace prefixed
    if (attr.uri === XSI_URI && attr.local === 'type') {
      normalizeType(node, attr, model);
    }

    normalizeNamespaces(attr, model, null);
  });
}


function error(message) {
  return new Error(message);
}

/**
 * Get the moddle descriptor for a given instance or type.
 *
 * @param  {ModdleElement|Function} element
 *
 * @return {Object} the moddle descriptor
 */
function getModdleDescriptor(element) {
  return element.$descriptor;
}

/**
 * A parse context.
 *
 * @class
 *
 * @param {Object} options
 * @param {ElementHandler} options.rootHandler the root handler for parsing a document
 * @param {boolean} [options.lax=false] whether or not to ignore invalid elements
 */
function Context(options) {

  /**
   * @property {ElementHandler} rootHandler
   */

  /**
   * @property {Boolean} lax
   */

  assign(this, options);

  this.elementsById = {};
  this.references = [];
  this.warnings = [];

  /**
   * Add an unresolved reference.
   *
   * @param {Object} reference
   */
  this.addReference = function(reference) {
    this.references.push(reference);
  };

  /**
   * Add a processed element.
   *
   * @param {ModdleElement} element
   */
  this.addElement = function(element) {

    if (!element) {
      throw error('expected element');
    }

    var elementsById = this.elementsById;

    var descriptor = getModdleDescriptor(element);

    var idProperty = descriptor.idProperty,
        id;

    if (idProperty) {
      id = element.get(idProperty.name);

      if (id) {

        if (elementsById[id]) {
          throw error('duplicate ID <' + id + '>');
        }

        elementsById[id] = element;
      }
    }
  };

  /**
   * Add an import warning.
   *
   * @param {Object} warning
   * @param {String} warning.message
   * @param {Error} [warning.error]
   */
  this.addWarning = function(warning) {
    this.warnings.push(warning);
  };
}

function BaseHandler() {}

BaseHandler.prototype.handleEnd = function() {};
BaseHandler.prototype.handleText = function() {};
BaseHandler.prototype.handleNode = function() {};


/**
 * A simple pass through handler that does nothing except for
 * ignoring all input it receives.
 *
 * This is used to ignore unknown elements and
 * attributes.
 */
function NoopHandler() { }

NoopHandler.prototype = Object.create(BaseHandler.prototype);

NoopHandler.prototype.handleNode = function() {
  return this;
};

function BodyHandler() {}

BodyHandler.prototype = Object.create(BaseHandler.prototype);

BodyHandler.prototype.handleText = function(text) {
  this.body = (this.body || '') + text;
};

function ReferenceHandler(property, context) {
  this.property = property;
  this.context = context;
}

ReferenceHandler.prototype = Object.create(BodyHandler.prototype);

ReferenceHandler.prototype.handleNode = function(node) {

  if (this.element) {
    throw error('expected no sub nodes');
  } else {
    this.element = this.createReference(node);
  }

  return this;
};

ReferenceHandler.prototype.handleEnd = function() {
  this.element.id = this.body;
};

ReferenceHandler.prototype.createReference = function(node) {
  return {
    property: this.property.ns.name,
    id: ''
  };
};

function ValueHandler(propertyDesc, element) {
  this.element = element;
  this.propertyDesc = propertyDesc;
}

ValueHandler.prototype = Object.create(BodyHandler.prototype);

ValueHandler.prototype.handleEnd = function() {

  var value = this.body || '',
      element = this.element,
      propertyDesc = this.propertyDesc;

  value = coerceType(propertyDesc.type, value);

  if (propertyDesc.isMany) {
    element.get(propertyDesc.name).push(value);
  } else {
    element.set(propertyDesc.name, value);
  }
};


function BaseElementHandler() {}

BaseElementHandler.prototype = Object.create(BodyHandler.prototype);

BaseElementHandler.prototype.handleNode = function(node) {
  var parser = this,
      element = this.element;

  if (!element) {
    element = this.element = this.createElement(node);

    this.context.addElement(element);
  } else {
    parser = this.handleChild(node);
  }

  return parser;
};

/**
 * @class XMLReader.ElementHandler
 *
 */
function ElementHandler(model, type, context) {
  this.model = model;
  this.type = model.getType(type);
  this.context = context;
}

ElementHandler.prototype = Object.create(BaseElementHandler.prototype);

ElementHandler.prototype.addReference = function(reference) {
  this.context.addReference(reference);
};

ElementHandler.prototype.handleEnd = function() {

  var value = this.body,
      element = this.element,
      descriptor = getModdleDescriptor(element),
      bodyProperty = descriptor.bodyProperty;

  if (bodyProperty && value !== undefined) {
    value = coerceType(bodyProperty.type, value);
    element.set(bodyProperty.name, value);
  }
};

/**
 * Create an instance of the model from the given node.
 *
 * @param  {Element} node the xml node
 */
ElementHandler.prototype.createElement = function(node) {
  var attributes = parseNodeAttributes(node),
      Type = this.type,
      descriptor = getModdleDescriptor(Type),
      context = this.context,
      instance = new Type({});

  forEach(attributes, function(value, name) {

    var prop = descriptor.propertiesByName[name],
        values;

    if (prop && prop.isReference) {

      if (!prop.isMany) {
        context.addReference({
          element: instance,
          property: prop.ns.name,
          id: value
        });
      } else {
        // IDREFS: parse references as whitespace-separated list
        values = value.split(' ');

        forEach(values, function(v) {
          context.addReference({
            element: instance,
            property: prop.ns.name,
            id: v
          });
        });
      }

    } else {
      if (prop) {
        value = coerceType(prop.type, value);
      }

      instance.set(name, value);
    }
  });

  return instance;
};

ElementHandler.prototype.getPropertyForNode = function(node) {

  var nameNs = parseNameNs(node.local, node.prefix);

  var type = this.type,
      model = this.model,
      descriptor = getModdleDescriptor(type);

  var propertyName = nameNs.name,
      property = descriptor.propertiesByName[propertyName],
      elementTypeName,
      elementType,
      typeAnnotation;

  // search for properties by name first

  if (property) {

    if (serializeAsType(property)) {
      typeAnnotation = node.attributes[XSI_TYPE];

      // xsi type is optional, if it does not exists the
      // default type is assumed
      if (typeAnnotation) {

        elementTypeName = typeAnnotation.value;

        // TODO: extract real name from attribute
        elementType = model.getType(elementTypeName);

        return assign({}, property, { effectiveType: getModdleDescriptor(elementType).name });
      }
    }

    // search for properties by name first
    return property;
  }


  var pkg = model.getPackage(nameNs.prefix);

  if (pkg) {
    elementTypeName = nameNs.prefix + ':' + aliasToName(nameNs.localName, descriptor.$pkg);
    elementType = model.getType(elementTypeName);

    // search for collection members later
    property = find(descriptor.properties, function(p) {
      return !p.isVirtual && !p.isReference && !p.isAttribute && elementType.hasType(p.type);
    });

    if (property) {
      return assign({}, property, { effectiveType: getModdleDescriptor(elementType).name });
    }
  } else {
    // parse unknown element (maybe extension)
    property = find(descriptor.properties, function(p) {
      return !p.isReference && !p.isAttribute && p.type === 'Element';
    });

    if (property) {
      return property;
    }
  }

  throw error('unrecognized element <' + nameNs.name + '>');
};

ElementHandler.prototype.toString = function() {
  return 'ElementDescriptor[' + getModdleDescriptor(this.type).name + ']';
};

ElementHandler.prototype.valueHandler = function(propertyDesc, element) {
  return new ValueHandler(propertyDesc, element);
};

ElementHandler.prototype.referenceHandler = function(propertyDesc) {
  return new ReferenceHandler(propertyDesc, this.context);
};

ElementHandler.prototype.handler = function(type) {
  if (type === 'Element') {
    return new GenericElementHandler(this.model, type, this.context);
  } else {
    return new ElementHandler(this.model, type, this.context);
  }
};

/**
 * Handle the child element parsing
 *
 * @param  {Element} node the xml node
 */
ElementHandler.prototype.handleChild = function(node) {
  var propertyDesc, type, element, childHandler;

  propertyDesc = this.getPropertyForNode(node);
  element = this.element;

  type = propertyDesc.effectiveType || propertyDesc.type;

  if (isSimpleType(type)) {
    return this.valueHandler(propertyDesc, element);
  }

  if (propertyDesc.isReference) {
    childHandler = this.referenceHandler(propertyDesc).handleNode(node);
  } else {
    childHandler = this.handler(type).handleNode(node);
  }

  var newElement = childHandler.element;

  // child handles may decide to skip elements
  // by not returning anything
  if (newElement !== undefined) {

    if (propertyDesc.isMany) {
      element.get(propertyDesc.name).push(newElement);
    } else {
      element.set(propertyDesc.name, newElement);
    }

    if (propertyDesc.isReference) {
      assign(newElement, {
        element: element
      });

      this.context.addReference(newElement);
    } else {
      // establish child -> parent relationship
      newElement.$parent = element;
    }
  }

  return childHandler;
};


function GenericElementHandler(model, type, context) {
  this.model = model;
  this.context = context;
}

GenericElementHandler.prototype = Object.create(BaseElementHandler.prototype);

GenericElementHandler.prototype.createElement = function(node) {

  var name = node.name,
      prefix = node.prefix,
      uri = node.ns[prefix],
      attributes = node.attributes;

  return this.model.createAny(name, uri, attributes);
};

GenericElementHandler.prototype.handleChild = function(node) {

  var handler = new GenericElementHandler(this.model, 'Element', this.context).handleNode(node),
      element = this.element;

  var newElement = handler.element,
      children;

  if (newElement !== undefined) {
    children = element.$children = element.$children || [];
    children.push(newElement);

    // establish child -> parent relationship
    newElement.$parent = element;
  }

  return handler;
};

GenericElementHandler.prototype.handleText = function(text) {
  this.body = this.body || '' + text;
};

GenericElementHandler.prototype.handleEnd = function() {
  if (this.body) {
    this.element.$body = this.body;
  }
};

/**
 * A reader for a meta-model
 *
 * @param {Object} options
 * @param {Model} options.model used to read xml files
 * @param {Boolean} options.lax whether to make parse errors warnings
 */
function XMLReader(options) {

  if (options instanceof Moddle) {
    options = {
      model: options
    };
  }

  assign(this, { lax: false }, options);
}


/**
 * Parse the given XML into a moddle document tree.
 *
 * @param {String} xml
 * @param {ElementHandler|Object} options or rootHandler
 * @param  {Function} done
 */
XMLReader.prototype.fromXML = function(xml, options, done) {

  var rootHandler = options.rootHandler;

  if (options instanceof ElementHandler) {
    // root handler passed via (xml, { rootHandler: ElementHandler }, ...)
    rootHandler = options;
    options = {};
  } else {
    if (typeof options === 'string') {
      // rootHandler passed via (xml, 'someString', ...)
      rootHandler = this.handler(options);
      options = {};
    } else if (typeof rootHandler === 'string') {
      // rootHandler passed via (xml, { rootHandler: 'someString' }, ...)
      rootHandler = this.handler(rootHandler);
    }
  }

  var model = this.model,
      lax = this.lax;

  var context = new Context(assign({}, options, { rootHandler: rootHandler })),
      parser = new SaxParser(true, { xmlns: true, trim: true }),
      stack = new Stack();

  rootHandler.context = context;

  // push root handler
  stack.push(rootHandler);


  function resolveReferences() {

    var elementsById = context.elementsById;
    var references = context.references;

    var i, r;

    for (i = 0; (r = references[i]); i++) {
      var element = r.element;
      var reference = elementsById[r.id];
      var property = getModdleDescriptor(element).propertiesByName[r.property];

      if (!reference) {
        context.addWarning({
          message: 'unresolved reference <' + r.id + '>',
          element: r.element,
          property: r.property,
          value: r.id
        });
      }

      if (property.isMany) {
        var collection = element.get(property.name),
            idx = collection.indexOf(r);

        // we replace an existing place holder (idx != -1) or
        // append to the collection instead
        if (idx === -1) {
          idx = collection.length;
        }

        if (!reference) {
          // remove unresolvable reference
          collection.splice(idx, 1);
        } else {
          // add or update reference in collection
          collection[idx] = reference;
        }
      } else {
        element.set(property.name, reference);
      }
    }
  }

  function handleClose(tagName) {
    stack.pop().handleEnd();
  }

  function handleOpen(node) {
    var handler = stack.peek();

    normalizeNamespaces(node, model);

    try {
      stack.push(handler.handleNode(node));
    } catch (e) {

      var line = this.line,
          column = this.column;

      var message =
        'unparsable content <' + node.name + '> detected\n\t' +
          'line: ' + line + '\n\t' +
          'column: ' + column + '\n\t' +
          'nested error: ' + e.message;

      if (lax) {
        context.addWarning({
          message: message,
          error: e
        });

        console.warn('could not parse node');
        console.warn(e);

        stack.push(new NoopHandler());
      } else {
        console.error('could not parse document');
        console.error(e);

        throw error(message);
      }
    }
  }

  function handleText(text) {
    stack.peek().handleText(text);
  }

  parser.onopentag = handleOpen;
  parser.oncdata = parser.ontext = handleText;
  parser.onclosetag = handleClose;
  parser.onend = resolveReferences;

  // deferred parse XML to make loading really ascnchronous
  // this ensures the execution environment (node or browser)
  // is kept responsive and that certain optimization strategies
  // can kick in
  defer(function() {
    var error;

    try {
      parser.write(xml).close();
    } catch (e) {
      error = e;
    }

    done(error, error ? undefined : rootHandler.element, context);
  });
};

XMLReader.prototype.handler = function(name) {
  return new ElementHandler(this.model, name);
};

module.exports = XMLReader;
module.exports.ElementHandler = ElementHandler;
},{"135":135,"136":136,"139":139,"144":144,"250":250,"268":268,"271":271,"276":276,"279":279,"283":283,"319":319}],270:[function(_dereq_,module,exports){
'use strict';

var map = _dereq_(138),
    forEach = _dereq_(136),
    isString = _dereq_(247),
    filter = _dereq_(134),
    assign = _dereq_(250);

var Types = _dereq_(279),
    parseNameNs = _dereq_(276).parseName,
    common = _dereq_(268),
    nameToAlias = common.nameToAlias,
    serializeAsType = common.serializeAsType,
    serializeAsProperty = common.serializeAsProperty;

var XML_PREAMBLE = '<?xml version="1.0" encoding="UTF-8"?>\n',
    ESCAPE_CHARS = /(<|>|'|"|&|\n\r|\n)/g,
    DEFAULT_NS_MAP = common.DEFAULT_NS_MAP,
    XSI_TYPE = common.XSI_TYPE;


function inherits(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
}

function nsName(ns) {
  if (isString(ns)) {
    return ns;
  } else {
    return (ns.prefix ? ns.prefix + ':' : '') + ns.localName;
  }
}

function getNsAttrs(namespaces) {

  function isUsed(ns) {
    return namespaces.used[ns.uri];
  }

  function toAttr(ns) {
    var name = 'xmlns' + (ns.prefix ? ':' + ns.prefix : '');
    return { name: name, value: ns.uri };
  }

  var allNs = [].concat(namespaces.wellknown, namespaces.custom);

  return map(filter(allNs, isUsed), toAttr);
}

function getElementNs(ns, descriptor) {
  if (descriptor.isGeneric) {
    return descriptor.name;
  } else {
    return assign({ localName: nameToAlias(descriptor.ns.localName, descriptor.$pkg) }, ns);
  }
}

function getPropertyNs(ns, descriptor) {
  return assign({ localName: descriptor.ns.localName }, ns);
}

function getSerializableProperties(element) {
  var descriptor = element.$descriptor;

  return filter(descriptor.properties, function(p) {
    var name = p.name;

    if (p.isVirtual) {
      return false;
    }

    // do not serialize defaults
    if (!element.hasOwnProperty(name)) {
      return false;
    }

    var value = element[name];

    // do not serialize default equals
    if (value === p.default) {
      return false;
    }

    // do not serialize null properties
    if (value === null) {
      return false;
    }

    return p.isMany ? value.length : true;
  });
}

var ESCAPE_MAP = {
  '\n': '10',
  '\n\r': '10',
  '"': '34',
  '\'': '39',
  '<': '60',
  '>': '62',
  '&': '38'
};

/**
 * Escape a string attribute to not contain any bad values (line breaks, '"', ...)
 *
 * @param {String} str the string to escape
 * @return {String} the escaped string
 */
function escapeAttr(str) {

  // ensure we are handling strings here
  str = isString(str) ? str : '' + str;

  return str.replace(ESCAPE_CHARS, function(str) {
    return '&#' + ESCAPE_MAP[str] + ';';
  });
}

function filterAttributes(props) {
  return filter(props, function(p) { return p.isAttr; });
}

function filterContained(props) {
  return filter(props, function(p) { return !p.isAttr; });
}


function ReferenceSerializer(parent, ns) {
  this.ns = ns;
}

ReferenceSerializer.prototype.build = function(element) {
  this.element = element;
  return this;
};

ReferenceSerializer.prototype.serializeTo = function(writer) {
  writer
    .appendIndent()
    .append('<' + nsName(this.ns) + '>' + this.element.id + '</' + nsName(this.ns) + '>')
    .appendNewLine();
};

function BodySerializer() {}

BodySerializer.prototype.serializeValue = BodySerializer.prototype.serializeTo = function(writer) {
  var escape = this.escape;

  if (escape) {
    writer.append('<![CDATA[');
  }

  writer.append(this.value);

  if (escape) {
    writer.append(']]>');
  }
};

BodySerializer.prototype.build = function(prop, value) {
  this.value = value;

  if (prop.type === 'String' && value.search(ESCAPE_CHARS) !== -1) {
    this.escape = true;
  }

  return this;
};

function ValueSerializer(ns) {
  this.ns = ns;
}

inherits(ValueSerializer, BodySerializer);

ValueSerializer.prototype.serializeTo = function(writer) {

  writer
    .appendIndent()
    .append('<' + nsName(this.ns) + '>');

  this.serializeValue(writer);

  writer
    .append('</' + nsName(this.ns) + '>')
    .appendNewLine();
};

function ElementSerializer(parent, ns) {
  this.body = [];
  this.attrs = [];

  this.parent = parent;
  this.ns = ns;
}

ElementSerializer.prototype.build = function(element) {
  this.element = element;

  var otherAttrs = this.parseNsAttributes(element);

  if (!this.ns) {
    this.ns = this.nsTagName(element.$descriptor);
  }

  if (element.$descriptor.isGeneric) {
    this.parseGeneric(element);
  } else {
    var properties = getSerializableProperties(element);

    this.parseAttributes(filterAttributes(properties));
    this.parseContainments(filterContained(properties));

    this.parseGenericAttributes(element, otherAttrs);
  }

  return this;
};

ElementSerializer.prototype.nsTagName = function(descriptor) {
  var effectiveNs = this.logNamespaceUsed(descriptor.ns);
  return getElementNs(effectiveNs, descriptor);
};

ElementSerializer.prototype.nsPropertyTagName = function(descriptor) {
  var effectiveNs = this.logNamespaceUsed(descriptor.ns);
  return getPropertyNs(effectiveNs, descriptor);
};

ElementSerializer.prototype.isLocalNs = function(ns) {
  return ns.uri === this.ns.uri;
};

/**
 * Get the actual ns attribute name for the given element.
 *
 * @param {Object} element
 * @param {Boolean} [inherited=false]
 *
 * @return {Object} nsName
 */
ElementSerializer.prototype.nsAttributeName = function(element) {

  var ns;

  if (isString(element)) {
    ns = parseNameNs(element);
  } else {
    ns = element.ns;
  }

  // return just local name for inherited attributes
  if (element.inherited) {
    return { localName: ns.localName };
  }

  // parse + log effective ns
  var effectiveNs = this.logNamespaceUsed(ns);

  // strip prefix if same namespace like parent
  if (this.isLocalNs(effectiveNs)) {
    return { localName: ns.localName };
  } else {
    return assign({ localName: ns.localName }, effectiveNs);
  }
};

ElementSerializer.prototype.parseGeneric = function(element) {

  var self = this,
      body = this.body,
      attrs = this.attrs;

  forEach(element, function(val, key) {

    if (key === '$body') {
      body.push(new BodySerializer().build({ type: 'String' }, val));
    } else
    if (key === '$children') {
      forEach(val, function(child) {
        body.push(new ElementSerializer(self).build(child));
      });
    } else
    if (key.indexOf('$') !== 0) {
      attrs.push({ name: key, value: escapeAttr(val) });
    }
  });
};

/**
 * Parse namespaces and return a list of left over generic attributes
 *
 * @param  {Object} element
 * @return {Array<Object>}
 */
ElementSerializer.prototype.parseNsAttributes = function(element) {
  var self = this;

  var genericAttrs = element.$attrs;

  var model = element.$model;

  var attributes = [];

  // parse namespace attributes first
  // and log them. push non namespace attributes to a list
  // and process them later
  forEach(genericAttrs, function(value, name) {
    var nameNs = parseNameNs(name);

    var ns;

    // parse xmlns:foo="http://foo.bar"
    if (nameNs.prefix === 'xmlns') {
      ns = { prefix: nameNs.localName, uri: value };
    }

    // parse xmlns="http://foo.bar"
    if (!nameNs.prefix && nameNs.localName === 'xmlns') {
      ns = { uri: value };
    }

    if (ns) {
      if (model.getPackage(value)) {
        // register well known namespace
        self.logNamespace(ns, true);
      } else {
        // log custom namespace directly as used
        self.logNamespaceUsed(ns);
      }
    } else {
      attributes.push({ name: name, value: value });
    }
  });

  return attributes;
};

ElementSerializer.prototype.parseGenericAttributes = function(element, attributes) {

  var self = this;

  forEach(attributes, function(attr) {

    // do not serialize xsi:type attribute
    // it is set manually based on the actual implementation type
    if (attr.name === XSI_TYPE) {
      return;
    }

    try {
      self.addAttribute(self.nsAttributeName(attr.name), attr.value);
    } catch (e) {
      console.warn(
        'missing namespace information for ',
        attr.name, '=', attr.value, 'on', element,
        e);
    }
  });
};

ElementSerializer.prototype.parseContainments = function(properties) {

  var self = this,
      body = this.body,
      element = this.element;

  forEach(properties, function(p) {
    var value = element.get(p.name),
        isReference = p.isReference,
        isMany = p.isMany;

    var ns = self.nsPropertyTagName(p);

    if (!isMany) {
      value = [ value ];
    }

    if (p.isBody) {
      body.push(new BodySerializer().build(p, value[0]));
    } else
    if (Types.isSimple(p.type)) {
      forEach(value, function(v) {
        body.push(new ValueSerializer(ns).build(p, v));
      });
    } else
    if (isReference) {
      forEach(value, function(v) {
        body.push(new ReferenceSerializer(self, ns).build(v));
      });
    } else {
      // allow serialization via type
      // rather than element name
      var asType = serializeAsType(p),
          asProperty = serializeAsProperty(p);

      forEach(value, function(v) {
        var serializer;

        if (asType) {
          serializer = new TypeSerializer(self, ns);
        } else
        if (asProperty) {
          serializer = new ElementSerializer(self, ns);
        } else {
          serializer = new ElementSerializer(self);
        }

        body.push(serializer.build(v));
      });
    }
  });
};

ElementSerializer.prototype.getNamespaces = function() {

  var namespaces = this.namespaces,
      parent = this.parent;

  if (!namespaces) {
    namespaces = this.namespaces = parent ? parent.getNamespaces() : {
      prefixMap: {},
      uriMap: {},
      used: {},
      wellknown: [],
      custom: []
    };
  }

  return namespaces;
};

ElementSerializer.prototype.logNamespace = function(ns, wellknown) {
  var namespaces = this.getNamespaces();

  var nsUri = ns.uri;

  var existing = namespaces.uriMap[nsUri];

  if (!existing) {
    namespaces.uriMap[nsUri] = ns;

    if (wellknown) {
      namespaces.wellknown.push(ns);
    } else {
      namespaces.custom.push(ns);
    }
  }

  namespaces.prefixMap[ns.prefix] = nsUri;

  return ns;
};

ElementSerializer.prototype.logNamespaceUsed = function(ns) {
  var element = this.element,
      model = element.$model,
      namespaces = this.getNamespaces();

  // ns may be
  //
  //   * prefix only
  //   * prefix:uri

  var prefix = ns.prefix;

  // graceful handle anonymous (non-ns) elements, cf. #23
  if (typeof prefix === 'undefined') {
    return {};
  }

  var wellknownUri = DEFAULT_NS_MAP[prefix] || model && (model.getPackage(prefix) || {}).uri;

  var uri = ns.uri || namespaces.prefixMap[prefix] || wellknownUri;

  if (!uri) {
    throw new Error('no namespace uri given for prefix <' + ns.prefix + '>');
  }

  ns = namespaces.uriMap[uri];

  if (!ns) {
    ns = this.logNamespace({ prefix: prefix, uri: uri }, wellknownUri);
  }

  if (!namespaces.used[ns.uri]) {
    namespaces.used[ns.uri] = ns;
  }

  return ns;
};

ElementSerializer.prototype.parseAttributes = function(properties) {
  var self = this,
      element = this.element;

  forEach(properties, function(p) {

    var value = element.get(p.name);

    if (p.isReference) {

      if (!p.isMany) {
        value = value.id;
      }
      else {
        var values = [];
        forEach(value, function(v) {
          values.push(v.id);
        });
        // IDREFS is a whitespace-separated list of references.
        value = values.join(' ');
      }

    }

    self.addAttribute(self.nsAttributeName(p), value);
  });
};

ElementSerializer.prototype.addAttribute = function(name, value) {
  var attrs = this.attrs;

  if (isString(value)) {
    value = escapeAttr(value);
  }

  attrs.push({ name: name, value: value });
};

ElementSerializer.prototype.serializeAttributes = function(writer) {
  var attrs = this.attrs,
      root = !this.parent;

  if (root) {
    attrs = getNsAttrs(this.namespaces).concat(attrs);
  }

  forEach(attrs, function(a) {
    writer
      .append(' ')
      .append(nsName(a.name)).append('="').append(a.value).append('"');
  });
};

ElementSerializer.prototype.serializeTo = function(writer) {
  var firstBody = this.body[0],
      indent = firstBody && firstBody.constructor !== BodySerializer;

  writer
    .appendIndent()
    .append('<' + nsName(this.ns));

  this.serializeAttributes(writer);

  writer.append(firstBody ? '>' : ' />');

  if (firstBody) {

    if (indent) {
      writer
        .appendNewLine()
        .indent();
    }

    forEach(this.body, function(b) {
      b.serializeTo(writer);
    });

    if (indent) {
      writer
        .unindent()
        .appendIndent();
    }

    writer.append('</' + nsName(this.ns) + '>');
  }

  writer.appendNewLine();
};

/**
 * A serializer for types that handles serialization of data types
 */
function TypeSerializer(parent, ns) {
  ElementSerializer.call(this, parent, ns);
}

inherits(TypeSerializer, ElementSerializer);

TypeSerializer.prototype.build = function(element) {
  var descriptor = element.$descriptor;

  this.element = element;

  this.typeNs = this.nsTagName(descriptor);

  // add xsi:type attribute to represent the elements
  // actual type

  var typeNs = this.typeNs,
      pkg = element.$model.getPackage(typeNs.uri),
      typePrefix = (pkg.xml && pkg.xml.typePrefix) || '';

  this.addAttribute(this.nsAttributeName(XSI_TYPE),
    (typeNs.prefix ? typeNs.prefix + ':' : '') +
    typePrefix + descriptor.ns.localName);

  // do the usual stuff
  return ElementSerializer.prototype.build.call(this, element);
};

TypeSerializer.prototype.isLocalNs = function(ns) {
  return ns.uri === this.typeNs.uri;
};

function SavingWriter() {
  this.value = '';

  this.write = function(str) {
    this.value += str;
  };
}

function FormatingWriter(out, format) {

  var indent = [''];

  this.append = function(str) {
    out.write(str);

    return this;
  };

  this.appendNewLine = function() {
    if (format) {
      out.write('\n');
    }

    return this;
  };

  this.appendIndent = function() {
    if (format) {
      out.write(indent.join('  '));
    }

    return this;
  };

  this.indent = function() {
    indent.push('');
    return this;
  };

  this.unindent = function() {
    indent.pop();
    return this;
  };
}

/**
 * A writer for meta-model backed document trees
 *
 * @param {Object} options output options to pass into the writer
 */
function XMLWriter(options) {

  options = assign({ format: false, preamble: true }, options || {});

  function toXML(tree, writer) {
    var internalWriter = writer || new SavingWriter();
    var formatingWriter = new FormatingWriter(internalWriter, options.format);

    if (options.preamble) {
      formatingWriter.append(XML_PREAMBLE);
    }

    new ElementSerializer().build(tree).serializeTo(formatingWriter);

    if (!writer) {
      return internalWriter.value;
    }
  }

  return {
    toXML: toXML
  };
}

module.exports = XMLWriter;

},{"134":134,"136":136,"138":138,"247":247,"250":250,"268":268,"276":276,"279":279}],271:[function(_dereq_,module,exports){
module.exports = _dereq_(275);
},{"275":275}],272:[function(_dereq_,module,exports){
'use strict';

function Base() { }

Base.prototype.get = function(name) {
  return this.$model.properties.get(this, name);
};

Base.prototype.set = function(name, value) {
  this.$model.properties.set(this, name, value);
};


module.exports = Base;
},{}],273:[function(_dereq_,module,exports){
'use strict';

var pick = _dereq_(256),
    assign = _dereq_(250),
    forEach = _dereq_(136);

var parseNameNs = _dereq_(276).parseName;


function DescriptorBuilder(nameNs) {
  this.ns = nameNs;
  this.name = nameNs.name;
  this.allTypes = [];
  this.allTypesByName = {};
  this.properties = [];
  this.propertiesByName = {};
}

module.exports = DescriptorBuilder;


DescriptorBuilder.prototype.build = function() {
  return pick(this, [
    'ns',
    'name',
    'allTypes',
    'allTypesByName',
    'properties',
    'propertiesByName',
    'bodyProperty',
    'idProperty'
  ]);
};

/**
 * Add property at given index.
 *
 * @param {Object} p
 * @param {Number} [idx]
 * @param {Boolean} [validate=true]
 */
DescriptorBuilder.prototype.addProperty = function(p, idx, validate) {

  if (typeof idx === 'boolean') {
    validate = idx;
    idx = undefined;
  }

  this.addNamedProperty(p, validate !== false);

  var properties = this.properties;

  if (idx !== undefined) {
    properties.splice(idx, 0, p);
  } else {
    properties.push(p);
  }
};


DescriptorBuilder.prototype.replaceProperty = function(oldProperty, newProperty, replace) {
  var oldNameNs = oldProperty.ns;

  var props = this.properties,
      propertiesByName = this.propertiesByName,
      rename = oldProperty.name !== newProperty.name;

  if (oldProperty.isId) {
    if (!newProperty.isId) {
      throw new Error(
        'property <' + newProperty.ns.name + '> must be id property ' +
        'to refine <' + oldProperty.ns.name + '>');
    }

    this.setIdProperty(newProperty, false);
  }

  if (oldProperty.isBody) {

    if (!newProperty.isBody) {
      throw new Error(
        'property <' + newProperty.ns.name + '> must be body property ' +
        'to refine <' + oldProperty.ns.name + '>');
    }

    // TODO: Check compatibility
    this.setBodyProperty(newProperty, false);
  }

  // validate existence and get location of old property
  var idx = props.indexOf(oldProperty);
  if (idx === -1) {
    throw new Error('property <' + oldNameNs.name + '> not found in property list');
  }

  // remove old property
  props.splice(idx, 1);

  // replacing the named property is intentional
  //
  //  * validate only if this is a "rename" operation
  //  * add at specific index unless we "replace"
  //
  this.addProperty(newProperty, replace ? undefined : idx, rename);

  // make new property available under old name
  propertiesByName[oldNameNs.name] = propertiesByName[oldNameNs.localName] = newProperty;
};


DescriptorBuilder.prototype.redefineProperty = function(p, targetPropertyName, replace) {

  var nsPrefix = p.ns.prefix;
  var parts = targetPropertyName.split('#');

  var name = parseNameNs(parts[0], nsPrefix);
  var attrName = parseNameNs(parts[1], name.prefix).name;

  var redefinedProperty = this.propertiesByName[attrName];
  if (!redefinedProperty) {
    throw new Error('refined property <' + attrName + '> not found');
  } else {
    this.replaceProperty(redefinedProperty, p, replace);
  }

  delete p.redefines;
};

DescriptorBuilder.prototype.addNamedProperty = function(p, validate) {
  var ns = p.ns,
      propsByName = this.propertiesByName;

  if (validate) {
    this.assertNotDefined(p, ns.name);
    this.assertNotDefined(p, ns.localName);
  }

  propsByName[ns.name] = propsByName[ns.localName] = p;
};

DescriptorBuilder.prototype.removeNamedProperty = function(p) {
  var ns = p.ns,
      propsByName = this.propertiesByName;

  delete propsByName[ns.name];
  delete propsByName[ns.localName];
};

DescriptorBuilder.prototype.setBodyProperty = function(p, validate) {

  if (validate && this.bodyProperty) {
    throw new Error(
      'body property defined multiple times ' +
      '(<' + this.bodyProperty.ns.name + '>, <' + p.ns.name + '>)');
  }

  this.bodyProperty = p;
};

DescriptorBuilder.prototype.setIdProperty = function(p, validate) {

  if (validate && this.idProperty) {
    throw new Error(
      'id property defined multiple times ' +
      '(<' + this.idProperty.ns.name + '>, <' + p.ns.name + '>)');
  }

  this.idProperty = p;
};

DescriptorBuilder.prototype.assertNotDefined = function(p, name) {
  var propertyName = p.name,
      definedProperty = this.propertiesByName[propertyName];

  if (definedProperty) {
    throw new Error(
      'property <' + propertyName + '> already defined; ' +
      'override of <' + definedProperty.definedBy.ns.name + '#' + definedProperty.ns.name + '> by ' +
      '<' + p.definedBy.ns.name + '#' + p.ns.name + '> not allowed without redefines');
  }
};

DescriptorBuilder.prototype.hasProperty = function(name) {
  return this.propertiesByName[name];
};

DescriptorBuilder.prototype.addTrait = function(t, inherited) {

  var typesByName = this.allTypesByName,
      types = this.allTypes;

  var typeName = t.name;

  if (typeName in typesByName) {
    return;
  }

  forEach(t.properties, function(p) {

    // clone property to allow extensions
    p = assign({}, p, {
      name: p.ns.localName,
      inherited: inherited
    });

    Object.defineProperty(p, 'definedBy', {
      value: t
    });

    var replaces = p.replaces,
        redefines = p.redefines;

    // add replace/redefine support
    if (replaces || redefines) {
      this.redefineProperty(p, replaces || redefines, replaces);
    } else {
      if (p.isBody) {
        this.setBodyProperty(p);
      }
      if (p.isId) {
        this.setIdProperty(p);
      }
      this.addProperty(p);
    }
  }, this);

  types.push(t);
  typesByName[typeName] = t;
};

},{"136":136,"250":250,"256":256,"276":276}],274:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_(136);

var Base = _dereq_(272);


function Factory(model, properties) {
  this.model = model;
  this.properties = properties;
}

module.exports = Factory;


Factory.prototype.createType = function(descriptor) {

  var model = this.model;

  var props = this.properties,
      prototype = Object.create(Base.prototype);

  // initialize default values
  forEach(descriptor.properties, function(p) {
    if (!p.isMany && p.default !== undefined) {
      prototype[p.name] = p.default;
    }
  });

  props.defineModel(prototype, model);
  props.defineDescriptor(prototype, descriptor);

  var name = descriptor.ns.name;

  /**
   * The new type constructor
   */
  function ModdleElement(attrs) {
    props.define(this, '$type', { value: name, enumerable: true });
    props.define(this, '$attrs', { value: {} });
    props.define(this, '$parent', { writable: true });

    forEach(attrs, function(val, key) {
      this.set(key, val);
    }, this);
  }

  ModdleElement.prototype = prototype;

  ModdleElement.hasType = prototype.$instanceOf = this.model.hasType;

  // static links
  props.defineModel(ModdleElement, model);
  props.defineDescriptor(ModdleElement, descriptor);

  return ModdleElement;
};
},{"136":136,"272":272}],275:[function(_dereq_,module,exports){
'use strict';

var isString = _dereq_(247),
    isObject = _dereq_(245),
    forEach = _dereq_(136);


var Factory = _dereq_(274),
    Registry = _dereq_(278),
    Properties = _dereq_(277);

var parseNameNs = _dereq_(276).parseName;


//// Moddle implementation /////////////////////////////////////////////////

/**
 * @class Moddle
 *
 * A model that can be used to create elements of a specific type.
 *
 * @example
 *
 * var Moddle = require('moddle');
 *
 * var pkg = {
 *   name: 'mypackage',
 *   prefix: 'my',
 *   types: [
 *     { name: 'Root' }
 *   ]
 * };
 *
 * var moddle = new Moddle([pkg]);
 *
 * @param {Array<Package>} packages the packages to contain
 */
function Moddle(packages) {

  this.properties = new Properties(this);

  this.factory = new Factory(this, this.properties);
  this.registry = new Registry(packages, this.properties);

  this.typeCache = {};
}

module.exports = Moddle;


/**
 * Create an instance of the specified type.
 *
 * @method Moddle#create
 *
 * @example
 *
 * var foo = moddle.create('my:Foo');
 * var bar = moddle.create('my:Bar', { id: 'BAR_1' });
 *
 * @param  {String|Object} descriptor the type descriptor or name know to the model
 * @param  {Object} attrs   a number of attributes to initialize the model instance with
 * @return {Object}         model instance
 */
Moddle.prototype.create = function(descriptor, attrs) {
  var Type = this.getType(descriptor);

  if (!Type) {
    throw new Error('unknown type <' + descriptor + '>');
  }

  return new Type(attrs);
};


/**
 * Returns the type representing a given descriptor
 *
 * @method Moddle#getType
 *
 * @example
 *
 * var Foo = moddle.getType('my:Foo');
 * var foo = new Foo({ 'id' : 'FOO_1' });
 *
 * @param  {String|Object} descriptor the type descriptor or name know to the model
 * @return {Object}         the type representing the descriptor
 */
Moddle.prototype.getType = function(descriptor) {

  var cache = this.typeCache;

  var name = isString(descriptor) ? descriptor : descriptor.ns.name;

  var type = cache[name];

  if (!type) {
    descriptor = this.registry.getEffectiveDescriptor(name);
    type = cache[name] = this.factory.createType(descriptor);
  }

  return type;
};


/**
 * Creates an any-element type to be used within model instances.
 *
 * This can be used to create custom elements that lie outside the meta-model.
 * The created element contains all the meta-data required to serialize it
 * as part of meta-model elements.
 *
 * @method Moddle#createAny
 *
 * @example
 *
 * var foo = moddle.createAny('vendor:Foo', 'http://vendor', {
 *   value: 'bar'
 * });
 *
 * var container = moddle.create('my:Container', 'http://my', {
 *   any: [ foo ]
 * });
 *
 * // go ahead and serialize the stuff
 *
 *
 * @param  {String} name  the name of the element
 * @param  {String} nsUri the namespace uri of the element
 * @param  {Object} [properties] a map of properties to initialize the instance with
 * @return {Object} the any type instance
 */
Moddle.prototype.createAny = function(name, nsUri, properties) {

  var nameNs = parseNameNs(name);

  var element = {
    $type: name,
    $instanceOf: function(type) {
      return type === this.$type;
    }
  };

  var descriptor = {
    name: name,
    isGeneric: true,
    ns: {
      prefix: nameNs.prefix,
      localName: nameNs.localName,
      uri: nsUri
    }
  };

  this.properties.defineDescriptor(element, descriptor);
  this.properties.defineModel(element, this);
  this.properties.define(element, '$parent', { enumerable: false, writable: true });

  forEach(properties, function(a, key) {
    if (isObject(a) && a.value !== undefined) {
      element[a.name] = a.value;
    } else {
      element[key] = a;
    }
  });

  return element;
};

/**
 * Returns a registered package by uri or prefix
 *
 * @return {Object} the package
 */
Moddle.prototype.getPackage = function(uriOrPrefix) {
  return this.registry.getPackage(uriOrPrefix);
};

/**
 * Returns a snapshot of all known packages
 *
 * @return {Object} the package
 */
Moddle.prototype.getPackages = function() {
  return this.registry.getPackages();
};

/**
 * Returns the descriptor for an element
 */
Moddle.prototype.getElementDescriptor = function(element) {
  return element.$descriptor;
};

/**
 * Returns true if the given descriptor or instance
 * represents the given type.
 *
 * May be applied to this, if element is omitted.
 */
Moddle.prototype.hasType = function(element, type) {
  if (type === undefined) {
    type = element;
    element = this;
  }

  var descriptor = element.$model.getElementDescriptor(element);

  return (type in descriptor.allTypesByName);
};

/**
 * Returns the descriptor of an elements named property
 */
Moddle.prototype.getPropertyDescriptor = function(element, property) {
  return this.getElementDescriptor(element).propertiesByName[property];
};

/**
 * Returns a mapped type's descriptor
 */
Moddle.prototype.getTypeDescriptor = function(type) {
  return this.registry.typeMap[type];
};

},{"136":136,"245":245,"247":247,"274":274,"276":276,"277":277,"278":278}],276:[function(_dereq_,module,exports){
'use strict';

/**
 * Parses a namespaced attribute name of the form (ns:)localName to an object,
 * given a default prefix to assume in case no explicit namespace is given.
 *
 * @param {String} name
 * @param {String} [defaultPrefix] the default prefix to take, if none is present.
 *
 * @return {Object} the parsed name
 */
module.exports.parseName = function(name, defaultPrefix) {
  var parts = name.split(/:/),
      localName, prefix;

  // no prefix (i.e. only local name)
  if (parts.length === 1) {
    localName = name;
    prefix = defaultPrefix;
  } else
  // prefix + local name
  if (parts.length === 2) {
    localName = parts[1];
    prefix = parts[0];
  } else {
    throw new Error('expected <prefix:localName> or <localName>, got ' + name);
  }

  name = (prefix ? prefix + ':' : '') + localName;

  return {
    name: name,
    prefix: prefix,
    localName: localName
  };
};
},{}],277:[function(_dereq_,module,exports){
'use strict';


/**
 * A utility that gets and sets properties of model elements.
 *
 * @param {Model} model
 */
function Properties(model) {
  this.model = model;
}

module.exports = Properties;


/**
 * Sets a named property on the target element.
 * If the value is undefined, the property gets deleted.
 *
 * @param {Object} target
 * @param {String} name
 * @param {Object} value
 */
Properties.prototype.set = function(target, name, value) {

  var property = this.model.getPropertyDescriptor(target, name);

  var propertyName = property && property.name;

  if (isUndefined(value)) {
    // unset the property, if the specified value is undefined;
    // delete from $attrs (for extensions) or the target itself
    if (property) {
      delete target[propertyName];
    } else {
      delete target.$attrs[name];
    }
  } else {
    // set the property, defining well defined properties on the fly
    // or simply updating them in target.$attrs (for extensions)
    if (property) {
      if (propertyName in target) {
        target[propertyName] = value;
      } else {
        defineProperty(target, property, value);
      }
    } else {
      target.$attrs[name] = value;
    }
  }
};

/**
 * Returns the named property of the given element
 *
 * @param  {Object} target
 * @param  {String} name
 *
 * @return {Object}
 */
Properties.prototype.get = function(target, name) {

  var property = this.model.getPropertyDescriptor(target, name);

  if (!property) {
    return target.$attrs[name];
  }

  var propertyName = property.name;

  // check if access to collection property and lazily initialize it
  if (!target[propertyName] && property.isMany) {
    defineProperty(target, property, []);
  }

  return target[propertyName];
};


/**
 * Define a property on the target element
 *
 * @param  {Object} target
 * @param  {String} name
 * @param  {Object} options
 */
Properties.prototype.define = function(target, name, options) {
  Object.defineProperty(target, name, options);
};


/**
 * Define the descriptor for an element
 */
Properties.prototype.defineDescriptor = function(target, descriptor) {
  this.define(target, '$descriptor', { value: descriptor });
};

/**
 * Define the model for an element
 */
Properties.prototype.defineModel = function(target, model) {
  this.define(target, '$model', { value: model });
};


function isUndefined(val) {
  return typeof val === 'undefined';
}

function defineProperty(target, property, value) {
  Object.defineProperty(target, property.name, {
    enumerable: !property.isReference,
    writable: true,
    value: value,
    configurable: true
  });
}
},{}],278:[function(_dereq_,module,exports){
'use strict';

var assign = _dereq_(250),
    forEach = _dereq_(136);

var Types = _dereq_(279),
    DescriptorBuilder = _dereq_(273);

var parseNameNs = _dereq_(276).parseName,
    isBuiltInType = Types.isBuiltIn;


function Registry(packages, properties) {
  this.packageMap = {};
  this.typeMap = {};

  this.packages = [];

  this.properties = properties;

  forEach(packages, this.registerPackage, this);
}

module.exports = Registry;


Registry.prototype.getPackage = function(uriOrPrefix) {
  return this.packageMap[uriOrPrefix];
};

Registry.prototype.getPackages = function() {
  return this.packages;
};


Registry.prototype.registerPackage = function(pkg) {

  // copy package
  pkg = assign({}, pkg);

  var pkgMap = this.packageMap;

  ensureAvailable(pkgMap, pkg, 'prefix');
  ensureAvailable(pkgMap, pkg, 'uri');

  // register types
  forEach(pkg.types, function(descriptor) {
    this.registerType(descriptor, pkg);
  }, this);

  pkgMap[pkg.uri] = pkgMap[pkg.prefix] = pkg;
  this.packages.push(pkg);
};


/**
 * Register a type from a specific package with us
 */
Registry.prototype.registerType = function(type, pkg) {

  type = assign({}, type, {
    superClass: (type.superClass || []).slice(),
    extends: (type.extends || []).slice(),
    properties: (type.properties || []).slice(),
    meta: assign(({}, type.meta || {}))
  });

  var ns = parseNameNs(type.name, pkg.prefix),
      name = ns.name,
      propertiesByName = {};

  // parse properties
  forEach(type.properties, function(p) {

    // namespace property names
    var propertyNs = parseNameNs(p.name, ns.prefix),
        propertyName = propertyNs.name;

    // namespace property types
    if (!isBuiltInType(p.type)) {
      p.type = parseNameNs(p.type, propertyNs.prefix).name;
    }

    assign(p, {
      ns: propertyNs,
      name: propertyName
    });

    propertiesByName[propertyName] = p;
  });

  // update ns + name
  assign(type, {
    ns: ns,
    name: name,
    propertiesByName: propertiesByName
  });

  forEach(type.extends, function(extendsName) {
    var extended = this.typeMap[extendsName];

    extended.traits = extended.traits || [];
    extended.traits.push(name);
  }, this);

  // link to package
  this.definePackage(type, pkg);

  // register
  this.typeMap[name] = type;
};


/**
 * Traverse the type hierarchy from bottom to top,
 * calling iterator with (type, inherited) for all elements in
 * the inheritance chain.
 *
 * @param {Object} nsName
 * @param {Function} iterator
 * @param {Boolean} [trait=false]
 */
Registry.prototype.mapTypes = function(nsName, iterator, trait) {

  var type = isBuiltInType(nsName.name) ? { name: nsName.name } : this.typeMap[nsName.name];

  var self = this;

  /**
   * Traverse the selected trait.
   *
   * @param {String} cls
   */
  function traverseTrait(cls) {
    return traverseSuper(cls, true);
  }

  /**
   * Traverse the selected super type or trait
   *
   * @param {String} cls
   * @param {Boolean} [trait=false]
   */
  function traverseSuper(cls, trait) {
    var parentNs = parseNameNs(cls, isBuiltInType(cls) ? '' : nsName.prefix);
    self.mapTypes(parentNs, iterator, trait);
  }

  if (!type) {
    throw new Error('unknown type <' + nsName.name + '>');
  }

  forEach(type.superClass, trait ? traverseTrait : traverseSuper);

  // call iterator with (type, inherited=!trait)
  iterator(type, !trait);

  forEach(type.traits, traverseTrait);
};


/**
 * Returns the effective descriptor for a type.
 *
 * @param  {String} type the namespaced name (ns:localName) of the type
 *
 * @return {Descriptor} the resulting effective descriptor
 */
Registry.prototype.getEffectiveDescriptor = function(name) {

  var nsName = parseNameNs(name);

  var builder = new DescriptorBuilder(nsName);

  this.mapTypes(nsName, function(type, inherited) {
    builder.addTrait(type, inherited);
  });

  var descriptor = builder.build();

  // define package link
  this.definePackage(descriptor, descriptor.allTypes[descriptor.allTypes.length - 1].$pkg);

  return descriptor;
};


Registry.prototype.definePackage = function(target, pkg) {
  this.properties.define(target, '$pkg', { value: pkg });
};



///////// helpers ////////////////////////////

function ensureAvailable(packageMap, pkg, identifierKey) {

  var value = pkg[identifierKey];

  if (value in packageMap) {
    throw new Error('package with ' + identifierKey + ' <' + value + '> already defined');
  }
}

},{"136":136,"250":250,"273":273,"276":276,"279":279}],279:[function(_dereq_,module,exports){
'use strict';

/**
 * Built-in moddle types
 */
var BUILTINS = {
  String: true,
  Boolean: true,
  Integer: true,
  Real: true,
  Element: true
};

/**
 * Converters for built in types from string representations
 */
var TYPE_CONVERTERS = {
  String: function(s) { return s; },
  Boolean: function(s) { return s === 'true'; },
  Integer: function(s) { return parseInt(s, 10); },
  Real: function(s) { return parseFloat(s, 10); }
};

/**
 * Convert a type to its real representation
 */
module.exports.coerceType = function(type, value) {

  var converter = TYPE_CONVERTERS[type];

  if (converter) {
    return converter(value);
  } else {
    return value;
  }
};

/**
 * Return whether the given type is built-in
 */
module.exports.isBuiltIn = function(type) {
  return !!BUILTINS[type];
};

/**
 * Return whether the given type is simple
 */
module.exports.isSimple = function(type) {
  return !!TYPE_CONVERTERS[type];
};
},{}],280:[function(_dereq_,module,exports){
module.exports = _dereq_(282);

module.exports.Collection = _dereq_(281);
},{"281":281,"282":282}],281:[function(_dereq_,module,exports){
'use strict';

/**
 * An empty collection stub. Use {@link RefsCollection.extend} to extend a
 * collection with ref semantics.
 *
 * @class RefsCollection
 */

/**
 * Extends a collection with {@link Refs} aware methods
 *
 * @memberof RefsCollection
 * @static
 *
 * @param  {Array<Object>} collection
 * @param  {Refs} refs instance
 * @param  {Object} property represented by the collection
 * @param  {Object} target object the collection is attached to
 *
 * @return {RefsCollection<Object>} the extended array
 */
function extend(collection, refs, property, target) {

  var inverseProperty = property.inverse;

  /**
   * Removes the given element from the array and returns it.
   *
   * @method RefsCollection#remove
   *
   * @param {Object} element the element to remove
   */
  Object.defineProperty(collection, 'remove', {
    value: function(element) {
      var idx = this.indexOf(element);
      if (idx !== -1) {
        this.splice(idx, 1);

        // unset inverse
        refs.unset(element, inverseProperty, target);
      }

      return element;
    }
  });

  /**
   * Returns true if the collection contains the given element
   *
   * @method RefsCollection#contains
   *
   * @param {Object} element the element to check for
   */
  Object.defineProperty(collection, 'contains', {
    value: function(element) {
      return this.indexOf(element) !== -1;
    }
  });

  /**
   * Adds an element to the array, unless it exists already (set semantics).
   *
   * @method RefsCollection#add
   *
   * @param {Object} element the element to add
   */
  Object.defineProperty(collection, 'add', {
    value: function(element) {

      if (!this.contains(element)) {
        this.push(element);

        // set inverse
        refs.set(element, inverseProperty, target);
      }
    }
  });

  // a simple marker, identifying this element
  // as being a refs collection
  Object.defineProperty(collection, '__refs_collection', {
    value: true
  });

  return collection;
}


function isExtended(collection) {
  return collection.__refs_collection === true;
}

module.exports.extend = extend;

module.exports.isExtended = isExtended;
},{}],282:[function(_dereq_,module,exports){
'use strict';

var Collection = _dereq_(281);

function hasOwnProperty(e, property) {
  return Object.prototype.hasOwnProperty.call(e, property.name || property);
}

function defineCollectionProperty(ref, property, target) {
  Object.defineProperty(target, property.name, {
    enumerable: property.enumerable,
    value: Collection.extend(target[property.name] || [], ref, property, target)
  });
}


function defineProperty(ref, property, target) {

  var inverseProperty = property.inverse;

  var _value = target[property.name];

  Object.defineProperty(target, property.name, {
    enumerable: property.enumerable,

    get: function() {
      return _value;
    },

    set: function(value) {

      // return if we already performed all changes
      if (value === _value) {
        return;
      }

      var old = _value;

      // temporary set null
      _value = null;

      if (old) {
        ref.unset(old, inverseProperty, target);
      }

      // set new value
      _value = value;

      // set inverse value
      ref.set(_value, inverseProperty, target);
    }
  });

}

/**
 * Creates a new references object defining two inversly related
 * attribute descriptors a and b.
 *
 * <p>
 *   When bound to an object using {@link Refs#bind} the references
 *   get activated and ensure that add and remove operations are applied
 *   reversely, too.
 * </p>
 *
 * <p>
 *   For attributes represented as collections {@link Refs} provides the
 *   {@link RefsCollection#add}, {@link RefsCollection#remove} and {@link RefsCollection#contains} extensions
 *   that must be used to properly hook into the inverse change mechanism.
 * </p>
 *
 * @class Refs
 *
 * @classdesc A bi-directional reference between two attributes.
 *
 * @param {Refs.AttributeDescriptor} a property descriptor
 * @param {Refs.AttributeDescriptor} b property descriptor
 *
 * @example
 *
 * var refs = Refs({ name: 'wheels', collection: true, enumerable: true }, { name: 'car' });
 *
 * var car = { name: 'toyota' };
 * var wheels = [{ pos: 'front-left' }, { pos: 'front-right' }];
 *
 * refs.bind(car, 'wheels');
 *
 * car.wheels // []
 * car.wheels.add(wheels[0]);
 * car.wheels.add(wheels[1]);
 *
 * car.wheels // [{ pos: 'front-left' }, { pos: 'front-right' }]
 *
 * wheels[0].car // { name: 'toyota' };
 * car.wheels.remove(wheels[0]);
 *
 * wheels[0].car // undefined
 */
function Refs(a, b) {

  if (!(this instanceof Refs)) {
    return new Refs(a, b);
  }

  // link
  a.inverse = b;
  b.inverse = a;

  this.props = {};
  this.props[a.name] = a;
  this.props[b.name] = b;
}

/**
 * Binds one side of a bi-directional reference to a
 * target object.
 *
 * @memberOf Refs
 *
 * @param  {Object} target
 * @param  {String} property
 */
Refs.prototype.bind = function(target, property) {
  if (typeof property === 'string') {
    if (!this.props[property]) {
      throw new Error('no property <' + property + '> in ref');
    }
    property = this.props[property];
  }

  if (property.collection) {
    defineCollectionProperty(this, property, target);
  } else {
    defineProperty(this, property, target);
  }
};

Refs.prototype.ensureRefsCollection = function(target, property) {

  var collection = target[property.name];

  if (!Collection.isExtended(collection)) {
    defineCollectionProperty(this, property, target);
  }

  return collection;
};

Refs.prototype.ensureBound = function(target, property) {
  if (!hasOwnProperty(target, property)) {
    this.bind(target, property);
  }
};

Refs.prototype.unset = function(target, property, value) {

  if (target) {
    this.ensureBound(target, property);

    if (property.collection) {
      this.ensureRefsCollection(target, property).remove(value);
    } else {
      target[property.name] = undefined;
    }
  }
};

Refs.prototype.set = function(target, property, value) {

  if (target) {
    this.ensureBound(target, property);

    if (property.collection) {
      this.ensureRefsCollection(target, property).add(value);
    } else {
      target[property.name] = value;
    }
  }
};

module.exports = Refs;


/**
 * An attribute descriptor to be used specify an attribute in a {@link Refs} instance
 *
 * @typedef {Object} Refs.AttributeDescriptor
 * @property {String} name
 * @property {boolean} [collection=false]
 * @property {boolean} [enumerable=false]
 */
},{"281":281}],283:[function(_dereq_,module,exports){
(function (Buffer){
// wrapper for non-node envs
;(function (sax) {

sax.parser = function (strict, opt) { return new SAXParser(strict, opt) }
sax.SAXParser = SAXParser
sax.SAXStream = SAXStream
sax.createStream = createStream

// When we pass the MAX_BUFFER_LENGTH position, start checking for buffer overruns.
// When we check, schedule the next check for MAX_BUFFER_LENGTH - (max(buffer lengths)),
// since that's the earliest that a buffer overrun could occur.  This way, checks are
// as rare as required, but as often as necessary to ensure never crossing this bound.
// Furthermore, buffers are only tested at most once per write(), so passing a very
// large string into write() might have undesirable effects, but this is manageable by
// the caller, so it is assumed to be safe.  Thus, a call to write() may, in the extreme
// edge case, result in creating at most one complete copy of the string passed in.
// Set to Infinity to have unlimited buffers.
sax.MAX_BUFFER_LENGTH = 64 * 1024

var buffers = [
  "comment", "sgmlDecl", "textNode", "tagName", "doctype",
  "procInstName", "procInstBody", "entity", "attribName",
  "attribValue", "cdata", "script"
]

sax.EVENTS = // for discoverability.
  [ "text"
  , "processinginstruction"
  , "sgmldeclaration"
  , "doctype"
  , "comment"
  , "attribute"
  , "opentag"
  , "closetag"
  , "opencdata"
  , "cdata"
  , "closecdata"
  , "error"
  , "end"
  , "ready"
  , "script"
  , "opennamespace"
  , "closenamespace"
  ]

function SAXParser (strict, opt) {
  if (!(this instanceof SAXParser)) return new SAXParser(strict, opt)

  var parser = this
  clearBuffers(parser)
  parser.q = parser.c = ""
  parser.bufferCheckPosition = sax.MAX_BUFFER_LENGTH
  parser.opt = opt || {}
  parser.opt.lowercase = parser.opt.lowercase || parser.opt.lowercasetags
  parser.looseCase = parser.opt.lowercase ? "toLowerCase" : "toUpperCase"
  parser.tags = []
  parser.closed = parser.closedRoot = parser.sawRoot = false
  parser.tag = parser.error = null
  parser.strict = !!strict
  parser.noscript = !!(strict || parser.opt.noscript)
  parser.state = S.BEGIN
  parser.ENTITIES = Object.create(sax.ENTITIES)
  parser.attribList = []

  // namespaces form a prototype chain.
  // it always points at the current tag,
  // which protos to its parent tag.
  if (parser.opt.xmlns) parser.ns = Object.create(rootNS)

  // mostly just for error reporting
  parser.trackPosition = parser.opt.position !== false
  if (parser.trackPosition) {
    parser.position = parser.line = parser.column = 0
  }
  emit(parser, "onready")
}

if (!Object.create) Object.create = function (o) {
  function f () { this.__proto__ = o }
  f.prototype = o
  return new f
}

if (!Object.getPrototypeOf) Object.getPrototypeOf = function (o) {
  return o.__proto__
}

if (!Object.keys) Object.keys = function (o) {
  var a = []
  for (var i in o) if (o.hasOwnProperty(i)) a.push(i)
  return a
}

function checkBufferLength (parser) {
  var maxAllowed = Math.max(sax.MAX_BUFFER_LENGTH, 10)
    , maxActual = 0
  for (var i = 0, l = buffers.length; i < l; i ++) {
    var len = parser[buffers[i]].length
    if (len > maxAllowed) {
      // Text/cdata nodes can get big, and since they're buffered,
      // we can get here under normal conditions.
      // Avoid issues by emitting the text node now,
      // so at least it won't get any bigger.
      switch (buffers[i]) {
        case "textNode":
          closeText(parser)
        break

        case "cdata":
          emitNode(parser, "oncdata", parser.cdata)
          parser.cdata = ""
        break

        case "script":
          emitNode(parser, "onscript", parser.script)
          parser.script = ""
        break

        default:
          error(parser, "Max buffer length exceeded: "+buffers[i])
      }
    }
    maxActual = Math.max(maxActual, len)
  }
  // schedule the next check for the earliest possible buffer overrun.
  parser.bufferCheckPosition = (sax.MAX_BUFFER_LENGTH - maxActual)
                             + parser.position
}

function clearBuffers (parser) {
  for (var i = 0, l = buffers.length; i < l; i ++) {
    parser[buffers[i]] = ""
  }
}

function flushBuffers (parser) {
  closeText(parser)
  if (parser.cdata !== "") {
    emitNode(parser, "oncdata", parser.cdata)
    parser.cdata = ""
  }
  if (parser.script !== "") {
    emitNode(parser, "onscript", parser.script)
    parser.script = ""
  }
}

SAXParser.prototype =
  { end: function () { end(this) }
  , write: write
  , resume: function () { this.error = null; return this }
  , close: function () { return this.write(null) }
  , flush: function () { flushBuffers(this) }
  }

try {
  var Stream = _dereq_("stream").Stream
} catch (ex) {
  var Stream = function () {}
}


var streamWraps = sax.EVENTS.filter(function (ev) {
  return ev !== "error" && ev !== "end"
})

function createStream (strict, opt) {
  return new SAXStream(strict, opt)
}

function SAXStream (strict, opt) {
  if (!(this instanceof SAXStream)) return new SAXStream(strict, opt)

  Stream.apply(this)

  this._parser = new SAXParser(strict, opt)
  this.writable = true
  this.readable = true


  var me = this

  this._parser.onend = function () {
    me.emit("end")
  }

  this._parser.onerror = function (er) {
    me.emit("error", er)

    // if didn't throw, then means error was handled.
    // go ahead and clear error, so we can write again.
    me._parser.error = null
  }

  this._decoder = null;

  streamWraps.forEach(function (ev) {
    Object.defineProperty(me, "on" + ev, {
      get: function () { return me._parser["on" + ev] },
      set: function (h) {
        if (!h) {
          me.removeAllListeners(ev)
          return me._parser["on"+ev] = h
        }
        me.on(ev, h)
      },
      enumerable: true,
      configurable: false
    })
  })
}

SAXStream.prototype = Object.create(Stream.prototype,
  { constructor: { value: SAXStream } })

SAXStream.prototype.write = function (data) {
  if (typeof Buffer === 'function' &&
      typeof Buffer.isBuffer === 'function' &&
      Buffer.isBuffer(data)) {
    if (!this._decoder) {
      var SD = _dereq_('string_decoder').StringDecoder
      this._decoder = new SD('utf8')
    }
    data = this._decoder.write(data);
  }

  this._parser.write(data.toString())
  this.emit("data", data)
  return true
}

SAXStream.prototype.end = function (chunk) {
  if (chunk && chunk.length) this.write(chunk)
  this._parser.end()
  return true
}

SAXStream.prototype.on = function (ev, handler) {
  var me = this
  if (!me._parser["on"+ev] && streamWraps.indexOf(ev) !== -1) {
    me._parser["on"+ev] = function () {
      var args = arguments.length === 1 ? [arguments[0]]
               : Array.apply(null, arguments)
      args.splice(0, 0, ev)
      me.emit.apply(me, args)
    }
  }

  return Stream.prototype.on.call(me, ev, handler)
}



// character classes and tokens
var whitespace = "\r\n\t "
  // this really needs to be replaced with character classes.
  // XML allows all manner of ridiculous numbers and digits.
  , number = "0124356789"
  , letter = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
  // (Letter | "_" | ":")
  , quote = "'\""
  , entity = number+letter+"#"
  , attribEnd = whitespace + ">"
  , CDATA = "[CDATA["
  , DOCTYPE = "DOCTYPE"
  , XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace"
  , XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/"
  , rootNS = { xml: XML_NAMESPACE, xmlns: XMLNS_NAMESPACE }

// turn all the string character sets into character class objects.
whitespace = charClass(whitespace)
number = charClass(number)
letter = charClass(letter)

// http://www.w3.org/TR/REC-xml/#NT-NameStartChar
// This implementation works on strings, a single character at a time
// as such, it cannot ever support astral-plane characters (10000-EFFFF)
// without a significant breaking change to either this  parser, or the
// JavaScript language.  Implementation of an emoji-capable xml parser
// is left as an exercise for the reader.
var nameStart = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/

var nameBody = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040\.\d-]/

quote = charClass(quote)
entity = charClass(entity)
attribEnd = charClass(attribEnd)

function charClass (str) {
  return str.split("").reduce(function (s, c) {
    s[c] = true
    return s
  }, {})
}

function isRegExp (c) {
  return Object.prototype.toString.call(c) === '[object RegExp]'
}

function is (charclass, c) {
  return isRegExp(charclass) ? !!c.match(charclass) : charclass[c]
}

function not (charclass, c) {
  return !is(charclass, c)
}

var S = 0
sax.STATE =
{ BEGIN                     : S++
, TEXT                      : S++ // general stuff
, TEXT_ENTITY               : S++ // &amp and such.
, OPEN_WAKA                 : S++ // <
, SGML_DECL                 : S++ // <!BLARG
, SGML_DECL_QUOTED          : S++ // <!BLARG foo "bar
, DOCTYPE                   : S++ // <!DOCTYPE
, DOCTYPE_QUOTED            : S++ // <!DOCTYPE "//blah
, DOCTYPE_DTD               : S++ // <!DOCTYPE "//blah" [ ...
, DOCTYPE_DTD_QUOTED        : S++ // <!DOCTYPE "//blah" [ "foo
, COMMENT_STARTING          : S++ // <!-
, COMMENT                   : S++ // <!--
, COMMENT_ENDING            : S++ // <!-- blah -
, COMMENT_ENDED             : S++ // <!-- blah --
, CDATA                     : S++ // <![CDATA[ something
, CDATA_ENDING              : S++ // ]
, CDATA_ENDING_2            : S++ // ]]
, PROC_INST                 : S++ // <?hi
, PROC_INST_BODY            : S++ // <?hi there
, PROC_INST_ENDING          : S++ // <?hi "there" ?
, OPEN_TAG                  : S++ // <strong
, OPEN_TAG_SLASH            : S++ // <strong /
, ATTRIB                    : S++ // <a
, ATTRIB_NAME               : S++ // <a foo
, ATTRIB_NAME_SAW_WHITE     : S++ // <a foo _
, ATTRIB_VALUE              : S++ // <a foo=
, ATTRIB_VALUE_QUOTED       : S++ // <a foo="bar
, ATTRIB_VALUE_CLOSED       : S++ // <a foo="bar"
, ATTRIB_VALUE_UNQUOTED     : S++ // <a foo=bar
, ATTRIB_VALUE_ENTITY_Q     : S++ // <foo bar="&quot;"
, ATTRIB_VALUE_ENTITY_U     : S++ // <foo bar=&quot;
, CLOSE_TAG                 : S++ // </a
, CLOSE_TAG_SAW_WHITE       : S++ // </a   >
, SCRIPT                    : S++ // <script> ...
, SCRIPT_ENDING             : S++ // <script> ... <
}

sax.ENTITIES =
{ "amp" : "&"
, "gt" : ">"
, "lt" : "<"
, "quot" : "\""
, "apos" : "'"
, "AElig" : 198
, "Aacute" : 193
, "Acirc" : 194
, "Agrave" : 192
, "Aring" : 197
, "Atilde" : 195
, "Auml" : 196
, "Ccedil" : 199
, "ETH" : 208
, "Eacute" : 201
, "Ecirc" : 202
, "Egrave" : 200
, "Euml" : 203
, "Iacute" : 205
, "Icirc" : 206
, "Igrave" : 204
, "Iuml" : 207
, "Ntilde" : 209
, "Oacute" : 211
, "Ocirc" : 212
, "Ograve" : 210
, "Oslash" : 216
, "Otilde" : 213
, "Ouml" : 214
, "THORN" : 222
, "Uacute" : 218
, "Ucirc" : 219
, "Ugrave" : 217
, "Uuml" : 220
, "Yacute" : 221
, "aacute" : 225
, "acirc" : 226
, "aelig" : 230
, "agrave" : 224
, "aring" : 229
, "atilde" : 227
, "auml" : 228
, "ccedil" : 231
, "eacute" : 233
, "ecirc" : 234
, "egrave" : 232
, "eth" : 240
, "euml" : 235
, "iacute" : 237
, "icirc" : 238
, "igrave" : 236
, "iuml" : 239
, "ntilde" : 241
, "oacute" : 243
, "ocirc" : 244
, "ograve" : 242
, "oslash" : 248
, "otilde" : 245
, "ouml" : 246
, "szlig" : 223
, "thorn" : 254
, "uacute" : 250
, "ucirc" : 251
, "ugrave" : 249
, "uuml" : 252
, "yacute" : 253
, "yuml" : 255
, "copy" : 169
, "reg" : 174
, "nbsp" : 160
, "iexcl" : 161
, "cent" : 162
, "pound" : 163
, "curren" : 164
, "yen" : 165
, "brvbar" : 166
, "sect" : 167
, "uml" : 168
, "ordf" : 170
, "laquo" : 171
, "not" : 172
, "shy" : 173
, "macr" : 175
, "deg" : 176
, "plusmn" : 177
, "sup1" : 185
, "sup2" : 178
, "sup3" : 179
, "acute" : 180
, "micro" : 181
, "para" : 182
, "middot" : 183
, "cedil" : 184
, "ordm" : 186
, "raquo" : 187
, "frac14" : 188
, "frac12" : 189
, "frac34" : 190
, "iquest" : 191
, "times" : 215
, "divide" : 247
, "OElig" : 338
, "oelig" : 339
, "Scaron" : 352
, "scaron" : 353
, "Yuml" : 376
, "fnof" : 402
, "circ" : 710
, "tilde" : 732
, "Alpha" : 913
, "Beta" : 914
, "Gamma" : 915
, "Delta" : 916
, "Epsilon" : 917
, "Zeta" : 918
, "Eta" : 919
, "Theta" : 920
, "Iota" : 921
, "Kappa" : 922
, "Lambda" : 923
, "Mu" : 924
, "Nu" : 925
, "Xi" : 926
, "Omicron" : 927
, "Pi" : 928
, "Rho" : 929
, "Sigma" : 931
, "Tau" : 932
, "Upsilon" : 933
, "Phi" : 934
, "Chi" : 935
, "Psi" : 936
, "Omega" : 937
, "alpha" : 945
, "beta" : 946
, "gamma" : 947
, "delta" : 948
, "epsilon" : 949
, "zeta" : 950
, "eta" : 951
, "theta" : 952
, "iota" : 953
, "kappa" : 954
, "lambda" : 955
, "mu" : 956
, "nu" : 957
, "xi" : 958
, "omicron" : 959
, "pi" : 960
, "rho" : 961
, "sigmaf" : 962
, "sigma" : 963
, "tau" : 964
, "upsilon" : 965
, "phi" : 966
, "chi" : 967
, "psi" : 968
, "omega" : 969
, "thetasym" : 977
, "upsih" : 978
, "piv" : 982
, "ensp" : 8194
, "emsp" : 8195
, "thinsp" : 8201
, "zwnj" : 8204
, "zwj" : 8205
, "lrm" : 8206
, "rlm" : 8207
, "ndash" : 8211
, "mdash" : 8212
, "lsquo" : 8216
, "rsquo" : 8217
, "sbquo" : 8218
, "ldquo" : 8220
, "rdquo" : 8221
, "bdquo" : 8222
, "dagger" : 8224
, "Dagger" : 8225
, "bull" : 8226
, "hellip" : 8230
, "permil" : 8240
, "prime" : 8242
, "Prime" : 8243
, "lsaquo" : 8249
, "rsaquo" : 8250
, "oline" : 8254
, "frasl" : 8260
, "euro" : 8364
, "image" : 8465
, "weierp" : 8472
, "real" : 8476
, "trade" : 8482
, "alefsym" : 8501
, "larr" : 8592
, "uarr" : 8593
, "rarr" : 8594
, "darr" : 8595
, "harr" : 8596
, "crarr" : 8629
, "lArr" : 8656
, "uArr" : 8657
, "rArr" : 8658
, "dArr" : 8659
, "hArr" : 8660
, "forall" : 8704
, "part" : 8706
, "exist" : 8707
, "empty" : 8709
, "nabla" : 8711
, "isin" : 8712
, "notin" : 8713
, "ni" : 8715
, "prod" : 8719
, "sum" : 8721
, "minus" : 8722
, "lowast" : 8727
, "radic" : 8730
, "prop" : 8733
, "infin" : 8734
, "ang" : 8736
, "and" : 8743
, "or" : 8744
, "cap" : 8745
, "cup" : 8746
, "int" : 8747
, "there4" : 8756
, "sim" : 8764
, "cong" : 8773
, "asymp" : 8776
, "ne" : 8800
, "equiv" : 8801
, "le" : 8804
, "ge" : 8805
, "sub" : 8834
, "sup" : 8835
, "nsub" : 8836
, "sube" : 8838
, "supe" : 8839
, "oplus" : 8853
, "otimes" : 8855
, "perp" : 8869
, "sdot" : 8901
, "lceil" : 8968
, "rceil" : 8969
, "lfloor" : 8970
, "rfloor" : 8971
, "lang" : 9001
, "rang" : 9002
, "loz" : 9674
, "spades" : 9824
, "clubs" : 9827
, "hearts" : 9829
, "diams" : 9830
}

Object.keys(sax.ENTITIES).forEach(function (key) {
    var e = sax.ENTITIES[key]
    var s = typeof e === 'number' ? String.fromCharCode(e) : e
    sax.ENTITIES[key] = s
})

for (var S in sax.STATE) sax.STATE[sax.STATE[S]] = S

// shorthand
S = sax.STATE

function emit (parser, event, data) {
  parser[event] && parser[event](data)
}

function emitNode (parser, nodeType, data) {
  if (parser.textNode) closeText(parser)
  emit(parser, nodeType, data)
}

function closeText (parser) {
  parser.textNode = textopts(parser.opt, parser.textNode)
  if (parser.textNode) emit(parser, "ontext", parser.textNode)
  parser.textNode = ""
}

function textopts (opt, text) {
  if (opt.trim) text = text.trim()
  if (opt.normalize) text = text.replace(/\s+/g, " ")
  return text
}

function error (parser, er) {
  closeText(parser)
  if (parser.trackPosition) {
    er += "\nLine: "+parser.line+
          "\nColumn: "+parser.column+
          "\nChar: "+parser.c
  }
  er = new Error(er)
  parser.error = er
  emit(parser, "onerror", er)
  return parser
}

function end (parser) {
  if (!parser.closedRoot) strictFail(parser, "Unclosed root tag")
  if ((parser.state !== S.BEGIN) && (parser.state !== S.TEXT)) error(parser, "Unexpected end")
  closeText(parser)
  parser.c = ""
  parser.closed = true
  emit(parser, "onend")
  SAXParser.call(parser, parser.strict, parser.opt)
  return parser
}

function strictFail (parser, message) {
  if (typeof parser !== 'object' || !(parser instanceof SAXParser))
    throw new Error('bad call to strictFail');
  if (parser.strict) error(parser, message)
}

function newTag (parser) {
  if (!parser.strict) parser.tagName = parser.tagName[parser.looseCase]()
  var parent = parser.tags[parser.tags.length - 1] || parser
    , tag = parser.tag = { name : parser.tagName, attributes : {} }

  // will be overridden if tag contails an xmlns="foo" or xmlns:foo="bar"
  if (parser.opt.xmlns) tag.ns = parent.ns
  parser.attribList.length = 0
}

function qname (name, attribute) {
  var i = name.indexOf(":")
    , qualName = i < 0 ? [ "", name ] : name.split(":")
    , prefix = qualName[0]
    , local = qualName[1]

  // <x "xmlns"="http://foo">
  if (attribute && name === "xmlns") {
    prefix = "xmlns"
    local = ""
  }

  return { prefix: prefix, local: local }
}

function attrib (parser) {
  if (!parser.strict) parser.attribName = parser.attribName[parser.looseCase]()

  if (parser.attribList.indexOf(parser.attribName) !== -1 ||
      parser.tag.attributes.hasOwnProperty(parser.attribName)) {
    return parser.attribName = parser.attribValue = ""
  }

  if (parser.opt.xmlns) {
    var qn = qname(parser.attribName, true)
      , prefix = qn.prefix
      , local = qn.local

    if (prefix === "xmlns") {
      // namespace binding attribute; push the binding into scope
      if (local === "xml" && parser.attribValue !== XML_NAMESPACE) {
        strictFail( parser
                  , "xml: prefix must be bound to " + XML_NAMESPACE + "\n"
                  + "Actual: " + parser.attribValue )
      } else if (local === "xmlns" && parser.attribValue !== XMLNS_NAMESPACE) {
        strictFail( parser
                  , "xmlns: prefix must be bound to " + XMLNS_NAMESPACE + "\n"
                  + "Actual: " + parser.attribValue )
      } else {
        var tag = parser.tag
          , parent = parser.tags[parser.tags.length - 1] || parser
        if (tag.ns === parent.ns) {
          tag.ns = Object.create(parent.ns)
        }
        tag.ns[local] = parser.attribValue
      }
    }

    // defer onattribute events until all attributes have been seen
    // so any new bindings can take effect; preserve attribute order
    // so deferred events can be emitted in document order
    parser.attribList.push([parser.attribName, parser.attribValue])
  } else {
    // in non-xmlns mode, we can emit the event right away
    parser.tag.attributes[parser.attribName] = parser.attribValue
    emitNode( parser
            , "onattribute"
            , { name: parser.attribName
              , value: parser.attribValue } )
  }

  parser.attribName = parser.attribValue = ""
}

function openTag (parser, selfClosing) {
  if (parser.opt.xmlns) {
    // emit namespace binding events
    var tag = parser.tag

    // add namespace info to tag
    var qn = qname(parser.tagName)
    tag.prefix = qn.prefix
    tag.local = qn.local
    tag.uri = tag.ns[qn.prefix] || ""

    if (tag.prefix && !tag.uri) {
      strictFail(parser, "Unbound namespace prefix: "
                       + JSON.stringify(parser.tagName))
      tag.uri = qn.prefix
    }

    var parent = parser.tags[parser.tags.length - 1] || parser
    if (tag.ns && parent.ns !== tag.ns) {
      Object.keys(tag.ns).forEach(function (p) {
        emitNode( parser
                , "onopennamespace"
                , { prefix: p , uri: tag.ns[p] } )
      })
    }

    // handle deferred onattribute events
    // Note: do not apply default ns to attributes:
    //   http://www.w3.org/TR/REC-xml-names/#defaulting
    for (var i = 0, l = parser.attribList.length; i < l; i ++) {
      var nv = parser.attribList[i]
      var name = nv[0]
        , value = nv[1]
        , qualName = qname(name, true)
        , prefix = qualName.prefix
        , local = qualName.local
        , uri = prefix == "" ? "" : (tag.ns[prefix] || "")
        , a = { name: name
              , value: value
              , prefix: prefix
              , local: local
              , uri: uri
              }

      // if there's any attributes with an undefined namespace,
      // then fail on them now.
      if (prefix && prefix != "xmlns" && !uri) {
        strictFail(parser, "Unbound namespace prefix: "
                         + JSON.stringify(prefix))
        a.uri = prefix
      }
      parser.tag.attributes[name] = a
      emitNode(parser, "onattribute", a)
    }
    parser.attribList.length = 0
  }

  parser.tag.isSelfClosing = !!selfClosing

  // process the tag
  parser.sawRoot = true
  parser.tags.push(parser.tag)
  emitNode(parser, "onopentag", parser.tag)
  if (!selfClosing) {
    // special case for <script> in non-strict mode.
    if (!parser.noscript && parser.tagName.toLowerCase() === "script") {
      parser.state = S.SCRIPT
    } else {
      parser.state = S.TEXT
    }
    parser.tag = null
    parser.tagName = ""
  }
  parser.attribName = parser.attribValue = ""
  parser.attribList.length = 0
}

function closeTag (parser) {
  if (!parser.tagName) {
    strictFail(parser, "Weird empty close tag.")
    parser.textNode += "</>"
    parser.state = S.TEXT
    return
  }

  if (parser.script) {
    if (parser.tagName !== "script") {
      parser.script += "</" + parser.tagName + ">"
      parser.tagName = ""
      parser.state = S.SCRIPT
      return
    }
    emitNode(parser, "onscript", parser.script)
    parser.script = ""
  }

  // first make sure that the closing tag actually exists.
  // <a><b></c></b></a> will close everything, otherwise.
  var t = parser.tags.length
  var tagName = parser.tagName
  if (!parser.strict) tagName = tagName[parser.looseCase]()
  var closeTo = tagName
  while (t --) {
    var close = parser.tags[t]
    if (close.name !== closeTo) {
      // fail the first time in strict mode
      strictFail(parser, "Unexpected close tag")
    } else break
  }

  // didn't find it.  we already failed for strict, so just abort.
  if (t < 0) {
    strictFail(parser, "Unmatched closing tag: "+parser.tagName)
    parser.textNode += "</" + parser.tagName + ">"
    parser.state = S.TEXT
    return
  }
  parser.tagName = tagName
  var s = parser.tags.length
  while (s --> t) {
    var tag = parser.tag = parser.tags.pop()
    parser.tagName = parser.tag.name
    emitNode(parser, "onclosetag", parser.tagName)

    var x = {}
    for (var i in tag.ns) x[i] = tag.ns[i]

    var parent = parser.tags[parser.tags.length - 1] || parser
    if (parser.opt.xmlns && tag.ns !== parent.ns) {
      // remove namespace bindings introduced by tag
      Object.keys(tag.ns).forEach(function (p) {
        var n = tag.ns[p]
        emitNode(parser, "onclosenamespace", { prefix: p, uri: n })
      })
    }
  }
  if (t === 0) parser.closedRoot = true
  parser.tagName = parser.attribValue = parser.attribName = ""
  parser.attribList.length = 0
  parser.state = S.TEXT
}

function parseEntity (parser) {
  var entity = parser.entity
    , entityLC = entity.toLowerCase()
    , num
    , numStr = ""
  if (parser.ENTITIES[entity])
    return parser.ENTITIES[entity]
  if (parser.ENTITIES[entityLC])
    return parser.ENTITIES[entityLC]
  entity = entityLC
  if (entity.charAt(0) === "#") {
    if (entity.charAt(1) === "x") {
      entity = entity.slice(2)
      num = parseInt(entity, 16)
      numStr = num.toString(16)
    } else {
      entity = entity.slice(1)
      num = parseInt(entity, 10)
      numStr = num.toString(10)
    }
  }
  entity = entity.replace(/^0+/, "")
  if (numStr.toLowerCase() !== entity) {
    strictFail(parser, "Invalid character entity")
    return "&"+parser.entity + ";"
  }

  return String.fromCodePoint(num)
}

function write (chunk) {
  var parser = this
  if (this.error) throw this.error
  if (parser.closed) return error(parser,
    "Cannot write after close. Assign an onready handler.")
  if (chunk === null) return end(parser)
  var i = 0, c = ""
  while (parser.c = c = chunk.charAt(i++)) {
    if (parser.trackPosition) {
      parser.position ++
      if (c === "\n") {
        parser.line ++
        parser.column = 0
      } else parser.column ++
    }
    switch (parser.state) {

      case S.BEGIN:
        if (c === "<") {
          parser.state = S.OPEN_WAKA
          parser.startTagPosition = parser.position
        } else if (not(whitespace,c)) {
          // have to process this as a text node.
          // weird, but happens.
          strictFail(parser, "Non-whitespace before first tag.")
          parser.textNode = c
          parser.state = S.TEXT
        }
      continue

      case S.TEXT:
        if (parser.sawRoot && !parser.closedRoot) {
          var starti = i-1
          while (c && c!=="<" && c!=="&") {
            c = chunk.charAt(i++)
            if (c && parser.trackPosition) {
              parser.position ++
              if (c === "\n") {
                parser.line ++
                parser.column = 0
              } else parser.column ++
            }
          }
          parser.textNode += chunk.substring(starti, i-1)
        }
        if (c === "<") {
          parser.state = S.OPEN_WAKA
          parser.startTagPosition = parser.position
        } else {
          if (not(whitespace, c) && (!parser.sawRoot || parser.closedRoot))
            strictFail(parser, "Text data outside of root node.")
          if (c === "&") parser.state = S.TEXT_ENTITY
          else parser.textNode += c
        }
      continue

      case S.SCRIPT:
        // only non-strict
        if (c === "<") {
          parser.state = S.SCRIPT_ENDING
        } else parser.script += c
      continue

      case S.SCRIPT_ENDING:
        if (c === "/") {
          parser.state = S.CLOSE_TAG
        } else {
          parser.script += "<" + c
          parser.state = S.SCRIPT
        }
      continue

      case S.OPEN_WAKA:
        // either a /, ?, !, or text is coming next.
        if (c === "!") {
          parser.state = S.SGML_DECL
          parser.sgmlDecl = ""
        } else if (is(whitespace, c)) {
          // wait for it...
        } else if (is(nameStart,c)) {
          parser.state = S.OPEN_TAG
          parser.tagName = c
        } else if (c === "/") {
          parser.state = S.CLOSE_TAG
          parser.tagName = ""
        } else if (c === "?") {
          parser.state = S.PROC_INST
          parser.procInstName = parser.procInstBody = ""
        } else {
          strictFail(parser, "Unencoded <")
          // if there was some whitespace, then add that in.
          if (parser.startTagPosition + 1 < parser.position) {
            var pad = parser.position - parser.startTagPosition
            c = new Array(pad).join(" ") + c
          }
          parser.textNode += "<" + c
          parser.state = S.TEXT
        }
      continue

      case S.SGML_DECL:
        if ((parser.sgmlDecl+c).toUpperCase() === CDATA) {
          emitNode(parser, "onopencdata")
          parser.state = S.CDATA
          parser.sgmlDecl = ""
          parser.cdata = ""
        } else if (parser.sgmlDecl+c === "--") {
          parser.state = S.COMMENT
          parser.comment = ""
          parser.sgmlDecl = ""
        } else if ((parser.sgmlDecl+c).toUpperCase() === DOCTYPE) {
          parser.state = S.DOCTYPE
          if (parser.doctype || parser.sawRoot) strictFail(parser,
            "Inappropriately located doctype declaration")
          parser.doctype = ""
          parser.sgmlDecl = ""
        } else if (c === ">") {
          emitNode(parser, "onsgmldeclaration", parser.sgmlDecl)
          parser.sgmlDecl = ""
          parser.state = S.TEXT
        } else if (is(quote, c)) {
          parser.state = S.SGML_DECL_QUOTED
          parser.sgmlDecl += c
        } else parser.sgmlDecl += c
      continue

      case S.SGML_DECL_QUOTED:
        if (c === parser.q) {
          parser.state = S.SGML_DECL
          parser.q = ""
        }
        parser.sgmlDecl += c
      continue

      case S.DOCTYPE:
        if (c === ">") {
          parser.state = S.TEXT
          emitNode(parser, "ondoctype", parser.doctype)
          parser.doctype = true // just remember that we saw it.
        } else {
          parser.doctype += c
          if (c === "[") parser.state = S.DOCTYPE_DTD
          else if (is(quote, c)) {
            parser.state = S.DOCTYPE_QUOTED
            parser.q = c
          }
        }
      continue

      case S.DOCTYPE_QUOTED:
        parser.doctype += c
        if (c === parser.q) {
          parser.q = ""
          parser.state = S.DOCTYPE
        }
      continue

      case S.DOCTYPE_DTD:
        parser.doctype += c
        if (c === "]") parser.state = S.DOCTYPE
        else if (is(quote,c)) {
          parser.state = S.DOCTYPE_DTD_QUOTED
          parser.q = c
        }
      continue

      case S.DOCTYPE_DTD_QUOTED:
        parser.doctype += c
        if (c === parser.q) {
          parser.state = S.DOCTYPE_DTD
          parser.q = ""
        }
      continue

      case S.COMMENT:
        if (c === "-") parser.state = S.COMMENT_ENDING
        else parser.comment += c
      continue

      case S.COMMENT_ENDING:
        if (c === "-") {
          parser.state = S.COMMENT_ENDED
          parser.comment = textopts(parser.opt, parser.comment)
          if (parser.comment) emitNode(parser, "oncomment", parser.comment)
          parser.comment = ""
        } else {
          parser.comment += "-" + c
          parser.state = S.COMMENT
        }
      continue

      case S.COMMENT_ENDED:
        if (c !== ">") {
          strictFail(parser, "Malformed comment")
          // allow <!-- blah -- bloo --> in non-strict mode,
          // which is a comment of " blah -- bloo "
          parser.comment += "--" + c
          parser.state = S.COMMENT
        } else parser.state = S.TEXT
      continue

      case S.CDATA:
        if (c === "]") parser.state = S.CDATA_ENDING
        else parser.cdata += c
      continue

      case S.CDATA_ENDING:
        if (c === "]") parser.state = S.CDATA_ENDING_2
        else {
          parser.cdata += "]" + c
          parser.state = S.CDATA
        }
      continue

      case S.CDATA_ENDING_2:
        if (c === ">") {
          if (parser.cdata) emitNode(parser, "oncdata", parser.cdata)
          emitNode(parser, "onclosecdata")
          parser.cdata = ""
          parser.state = S.TEXT
        } else if (c === "]") {
          parser.cdata += "]"
        } else {
          parser.cdata += "]]" + c
          parser.state = S.CDATA
        }
      continue

      case S.PROC_INST:
        if (c === "?") parser.state = S.PROC_INST_ENDING
        else if (is(whitespace, c)) parser.state = S.PROC_INST_BODY
        else parser.procInstName += c
      continue

      case S.PROC_INST_BODY:
        if (!parser.procInstBody && is(whitespace, c)) continue
        else if (c === "?") parser.state = S.PROC_INST_ENDING
        else parser.procInstBody += c
      continue

      case S.PROC_INST_ENDING:
        if (c === ">") {
          emitNode(parser, "onprocessinginstruction", {
            name : parser.procInstName,
            body : parser.procInstBody
          })
          parser.procInstName = parser.procInstBody = ""
          parser.state = S.TEXT
        } else {
          parser.procInstBody += "?" + c
          parser.state = S.PROC_INST_BODY
        }
      continue

      case S.OPEN_TAG:
        if (is(nameBody, c)) parser.tagName += c
        else {
          newTag(parser)
          if (c === ">") openTag(parser)
          else if (c === "/") parser.state = S.OPEN_TAG_SLASH
          else {
            if (not(whitespace, c)) strictFail(
              parser, "Invalid character in tag name")
            parser.state = S.ATTRIB
          }
        }
      continue

      case S.OPEN_TAG_SLASH:
        if (c === ">") {
          openTag(parser, true)
          closeTag(parser)
        } else {
          strictFail(parser, "Forward-slash in opening tag not followed by >")
          parser.state = S.ATTRIB
        }
      continue

      case S.ATTRIB:
        // haven't read the attribute name yet.
        if (is(whitespace, c)) continue
        else if (c === ">") openTag(parser)
        else if (c === "/") parser.state = S.OPEN_TAG_SLASH
        else if (is(nameStart, c)) {
          parser.attribName = c
          parser.attribValue = ""
          parser.state = S.ATTRIB_NAME
        } else strictFail(parser, "Invalid attribute name")
      continue

      case S.ATTRIB_NAME:
        if (c === "=") parser.state = S.ATTRIB_VALUE
        else if (c === ">") {
          strictFail(parser, "Attribute without value")
          parser.attribValue = parser.attribName
          attrib(parser)
          openTag(parser)
        }
        else if (is(whitespace, c)) parser.state = S.ATTRIB_NAME_SAW_WHITE
        else if (is(nameBody, c)) parser.attribName += c
        else strictFail(parser, "Invalid attribute name")
      continue

      case S.ATTRIB_NAME_SAW_WHITE:
        if (c === "=") parser.state = S.ATTRIB_VALUE
        else if (is(whitespace, c)) continue
        else {
          strictFail(parser, "Attribute without value")
          parser.tag.attributes[parser.attribName] = ""
          parser.attribValue = ""
          emitNode(parser, "onattribute",
                   { name : parser.attribName, value : "" })
          parser.attribName = ""
          if (c === ">") openTag(parser)
          else if (is(nameStart, c)) {
            parser.attribName = c
            parser.state = S.ATTRIB_NAME
          } else {
            strictFail(parser, "Invalid attribute name")
            parser.state = S.ATTRIB
          }
        }
      continue

      case S.ATTRIB_VALUE:
        if (is(whitespace, c)) continue
        else if (is(quote, c)) {
          parser.q = c
          parser.state = S.ATTRIB_VALUE_QUOTED
        } else {
          strictFail(parser, "Unquoted attribute value")
          parser.state = S.ATTRIB_VALUE_UNQUOTED
          parser.attribValue = c
        }
      continue

      case S.ATTRIB_VALUE_QUOTED:
        if (c !== parser.q) {
          if (c === "&") parser.state = S.ATTRIB_VALUE_ENTITY_Q
          else parser.attribValue += c
          continue
        }
        attrib(parser)
        parser.q = ""
        parser.state = S.ATTRIB_VALUE_CLOSED
      continue

      case S.ATTRIB_VALUE_CLOSED:
        if (is(whitespace, c)) {
          parser.state = S.ATTRIB
        } else if (c === ">") openTag(parser)
        else if (c === "/") parser.state = S.OPEN_TAG_SLASH
        else if (is(nameStart, c)) {
          strictFail(parser, "No whitespace between attributes")
          parser.attribName = c
          parser.attribValue = ""
          parser.state = S.ATTRIB_NAME
        } else strictFail(parser, "Invalid attribute name")
      continue

      case S.ATTRIB_VALUE_UNQUOTED:
        if (not(attribEnd,c)) {
          if (c === "&") parser.state = S.ATTRIB_VALUE_ENTITY_U
          else parser.attribValue += c
          continue
        }
        attrib(parser)
        if (c === ">") openTag(parser)
        else parser.state = S.ATTRIB
      continue

      case S.CLOSE_TAG:
        if (!parser.tagName) {
          if (is(whitespace, c)) continue
          else if (not(nameStart, c)) {
            if (parser.script) {
              parser.script += "</" + c
              parser.state = S.SCRIPT
            } else {
              strictFail(parser, "Invalid tagname in closing tag.")
            }
          } else parser.tagName = c
        }
        else if (c === ">") closeTag(parser)
        else if (is(nameBody, c)) parser.tagName += c
        else if (parser.script) {
          parser.script += "</" + parser.tagName
          parser.tagName = ""
          parser.state = S.SCRIPT
        } else {
          if (not(whitespace, c)) strictFail(parser,
            "Invalid tagname in closing tag")
          parser.state = S.CLOSE_TAG_SAW_WHITE
        }
      continue

      case S.CLOSE_TAG_SAW_WHITE:
        if (is(whitespace, c)) continue
        if (c === ">") closeTag(parser)
        else strictFail(parser, "Invalid characters in closing tag")
      continue

      case S.TEXT_ENTITY:
      case S.ATTRIB_VALUE_ENTITY_Q:
      case S.ATTRIB_VALUE_ENTITY_U:
        switch(parser.state) {
          case S.TEXT_ENTITY:
            var returnState = S.TEXT, buffer = "textNode"
          break

          case S.ATTRIB_VALUE_ENTITY_Q:
            var returnState = S.ATTRIB_VALUE_QUOTED, buffer = "attribValue"
          break

          case S.ATTRIB_VALUE_ENTITY_U:
            var returnState = S.ATTRIB_VALUE_UNQUOTED, buffer = "attribValue"
          break
        }
        if (c === ";") {
          parser[buffer] += parseEntity(parser)
          parser.entity = ""
          parser.state = returnState
        }
        else if (is(entity, c)) parser.entity += c
        else {
          strictFail(parser, "Invalid character entity")
          parser[buffer] += "&" + parser.entity + c
          parser.entity = ""
          parser.state = returnState
        }
      continue

      default:
        throw new Error(parser, "Unknown state: " + parser.state)
    }
  } // while
  // cdata blocks can get very big under normal conditions. emit and move on.
  // if (parser.state === S.CDATA && parser.cdata) {
  //   emitNode(parser, "oncdata", parser.cdata)
  //   parser.cdata = ""
  // }
  if (parser.position >= parser.bufferCheckPosition) checkBufferLength(parser)
  return parser
}

/*! http://mths.be/fromcodepoint v0.1.0 by @mathias */
if (!String.fromCodePoint) {
        (function() {
                var stringFromCharCode = String.fromCharCode;
                var floor = Math.floor;
                var fromCodePoint = function() {
                        var MAX_SIZE = 0x4000;
                        var codeUnits = [];
                        var highSurrogate;
                        var lowSurrogate;
                        var index = -1;
                        var length = arguments.length;
                        if (!length) {
                                return '';
                        }
                        var result = '';
                        while (++index < length) {
                                var codePoint = Number(arguments[index]);
                                if (
                                        !isFinite(codePoint) || // `NaN`, `+Infinity`, or `-Infinity`
                                        codePoint < 0 || // not a valid Unicode code point
                                        codePoint > 0x10FFFF || // not a valid Unicode code point
                                        floor(codePoint) != codePoint // not an integer
                                ) {
                                        throw RangeError('Invalid code point: ' + codePoint);
                                }
                                if (codePoint <= 0xFFFF) { // BMP code point
                                        codeUnits.push(codePoint);
                                } else { // Astral code point; split in surrogate halves
                                        // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
                                        codePoint -= 0x10000;
                                        highSurrogate = (codePoint >> 10) + 0xD800;
                                        lowSurrogate = (codePoint % 0x400) + 0xDC00;
                                        codeUnits.push(highSurrogate, lowSurrogate);
                                }
                                if (index + 1 == length || codeUnits.length > MAX_SIZE) {
                                        result += stringFromCharCode.apply(null, codeUnits);
                                        codeUnits.length = 0;
                                }
                        }
                        return result;
                };
                if (Object.defineProperty) {
                        Object.defineProperty(String, 'fromCodePoint', {
                                'value': fromCodePoint,
                                'configurable': true,
                                'writable': true
                        });
                } else {
                        String.fromCodePoint = fromCodePoint;
                }
        }());
}

})(typeof exports === "undefined" ? sax = {} : exports);

}).call(this,undefined)

},{"undefined":undefined}],284:[function(_dereq_,module,exports){
module.exports = _dereq_(285);

},{"285":285}],285:[function(_dereq_,module,exports){
'use strict';

var di = _dereq_(115);


/**
 * Bootstrap an injector from a list of modules, instantiating a number of default components
 *
 * @ignore
 * @param {Array<didi.Module>} bootstrapModules
 *
 * @return {didi.Injector} a injector to use to access the components
 */
function bootstrap(bootstrapModules) {

  var modules = [],
      components = [];

  function hasModule(m) {
    return modules.indexOf(m) >= 0;
  }

  function addModule(m) {
    modules.push(m);
  }

  function visit(m) {
    if (hasModule(m)) {
      return;
    }

    (m.__depends__ || []).forEach(visit);

    if (hasModule(m)) {
      return;
    }

    addModule(m);
    (m.__init__ || []).forEach(function(c) {
      components.push(c);
    });
  }

  bootstrapModules.forEach(visit);

  var injector = new di.Injector(modules);

  components.forEach(function(c) {

    try {
      // eagerly resolve component (fn or string)
      injector[typeof c === 'string' ? 'get' : 'invoke'](c);
    } catch (e) {
      console.error('Failed to instantiate component');
      console.error(e.stack);

      throw e;
    }
  });

  return injector;
}

/**
 * Creates an injector from passed options.
 *
 * @ignore
 * @param  {Object} options
 * @return {didi.Injector}
 */
function createInjector(options) {

  options = options || {};

  var configModule = {
    'config': ['value', options]
  };

  var coreModule = _dereq_(290);

  var modules = [ configModule, coreModule ].concat(options.modules || []);

  return bootstrap(modules);
}


/**
 * The main table-js entry point that bootstraps the table with the given
 * configuration.
 *
 * To register extensions with the table, pass them as Array<didi.Module> to the constructor.
 *
 * @class tjs.Table
 * @memberOf tjs
 * @constructor
 *
 * @param {Object} options
 * @param {Array<didi.Module>} [options.modules] external modules to instantiate with the table
 * @param {didi.Injector} [injector] an (optional) injector to bootstrap the table with
 */
function Table(options, injector) {

  // create injector unless explicitly specified
  this.injector = injector = injector || createInjector(options);

  // API

  /**
   * Resolves a table service
   *
   * @method Table#get
   *
   * @param {String} name the name of the table service to be retrieved
   * @param {Object} [locals] a number of locals to use to resolve certain dependencies
   */
  this.get = injector.get;

  /**
   * Executes a function into which table services are injected
   *
   * @method Table#invoke
   *
   * @param {Function|Object[]} fn the function to resolve
   * @param {Object} locals a number of locals to use to resolve certain dependencies
   */
  this.invoke = injector.invoke;

  // init

  // indicate via event


  /**
   * An event indicating that all plug-ins are loaded.
   *
   * Use this event to fire other events to interested plug-ins
   *
   * @memberOf Table
   *
   * @event table.init
   *
   * @example
   *
   * eventBus.on('table.init', function() {
   *   eventBus.fire('my-custom-event', { foo: 'BAR' });
   * });
   *
   * @type {Object}
   */
  this.get('eventBus').fire('table.init');
}

module.exports = Table;


/**
 * Destroys the table. This results in removing the attachment from the container.
 *
 * @method  Table#destroy
 */
Table.prototype.destroy = function() {
  this.get('eventBus').fire('table.destroy');

  // so we can reset the services directly used from diagram-js
  this.get('eventBus').fire('diagram.destroy');
};

/**
 * Clears the table. Should be used to reset the state of any stateful services.
 *
 * @method  Table#clear
 */
Table.prototype.clear = function() {
  this.get('eventBus').fire('table.clear');

  // so we can reset the services directly used from diagram-js
  this.get('eventBus').fire('diagram.clear');
};

},{"115":115,"290":290}],286:[function(_dereq_,module,exports){
'use strict';

var Model = _dereq_(308);


/**
 * A factory for diagram-js shapes
 */
function ElementFactory() {
  this._uid = 12;
}

module.exports = ElementFactory;


ElementFactory.prototype.createTable = function(attrs) {
  return document.createElement('table');
  //return this.create('table', attrs);
};

ElementFactory.prototype.createRow = function(attrs) {
  return this.create('row', attrs);
};

ElementFactory.prototype.createColumn = function(attrs) {
  return this.create('column', attrs);
};

/**
 * Create a model element with the given type and
 * a number of pre-set attributes.
 *
 * @param  {String} type
 * @param  {Object} attrs
 * @return {djs.model.Base} the newly created model instance
 */
ElementFactory.prototype.create = function(type, attrs) {

  attrs = attrs || {};

  if (!attrs.id) {
    attrs.id = type + '_' + (this._uid++);
  }

  return Model.create(type, attrs);
};

},{"308":308}],287:[function(_dereq_,module,exports){
'use strict';

var ELEMENT_ID = 'data-element-id';


/**
 * @class
 *
 * A registry that keeps track of all shapes in the diagram.
 */
function ElementRegistry() {
  this._elements = {};
}

module.exports = ElementRegistry;

/**
 * Register a pair of (element, gfx, (secondaryGfx)).
 *
 * @param {djs.model.Base} element
 * @param {Snap<SVGElement>} gfx
 * @param {Snap<SVGElement>} [secondaryGfx] optional other element to register, too
 */
ElementRegistry.prototype.add = function(element, gfx, secondaryGfx) {

  var id = element.id;

  this._validateId(id);

  // associate dom node with element
  gfx.setAttribute(ELEMENT_ID, id);

  if (secondaryGfx) {
    secondaryGfx.setAttribute(ELEMENT_ID, id);
  }

  this._elements[id] = { element: element, gfx: gfx, secondaryGfx: secondaryGfx };
};

/**
 * Removes an element from the registry.
 *
 * @param {djs.model.Base} element
 */
ElementRegistry.prototype.remove = function(element) {
  var elements = this._elements,
      id = element.id || element,
      container = id && elements[id];

  if (container) {

    // unset element id on gfx
    container.gfx.setAttribute(ELEMENT_ID, null);

    if (container.secondaryGfx) {
      container.secondaryGfx.setAttribute(ELEMENT_ID, null);
    }

    delete elements[id];
  }
};

/**
 * Update the id of an element
 *
 * @param {djs.model.Base} element
 * @param {String} newId
 */
ElementRegistry.prototype.updateId = function(element, newId) {

  this._validateId(newId);

  if (typeof element === 'string') {
    element = this.get(element);
  }

  var gfx = this.getGraphics(element),
      secondaryGfx = this.getGraphics(element, true);

  this.remove(element);

  element.id = newId;

  this.add(element, gfx, secondaryGfx);
};

/**
 * Return the model element for a given id or graphics.
 *
 * @example
 *
 * elementRegistry.get('SomeElementId_1');
 * elementRegistry.get(gfx);
 *
 *
 * @param {String|SVGElement} filter for selecting the element
 *
 * @return {djs.model.Base}
 */
ElementRegistry.prototype.get = function(filter) {
  var id;

  if (typeof filter === 'string') {
    id = filter;
  } else {
    // get by graphics
    id = filter && filter.getAttribute(ELEMENT_ID);
  }

  var container = this._elements[id];
  return container && container.element;
};

/**
 * Return all elements that match a given filter function.
 *
 * @param {Function} fn
 *
 * @return {Array<djs.model.Base>}
 */
ElementRegistry.prototype.filter = function(fn) {

  var filtered = [];

  this.forEach(function(element, gfx) {
    if (fn(element, gfx)) {
      filtered.push(element);
    }
  });

  return filtered;
};

/**
 * Iterate over all diagram elements.
 *
 * @param {Function} fn
 */
ElementRegistry.prototype.forEach = function(fn) {

  var map = this._elements;

  Object.keys(map).forEach(function(id) {
    var container = map[id],
        element = container.element,
        gfx = container.gfx;

    return fn(element, gfx);
  });
};

/**
 * Return the graphical representation of an element or its id.
 *
 * @example
 * elementRegistry.getGraphics('SomeElementId_1');
 * elementRegistry.getGraphics(rootElement); // <g ...>
 *
 * elementRegistry.getGraphics(rootElement, true); // <svg ...>
 *
 *
 * @param {String|djs.model.Base} filter
 * @param {Boolean} [secondary=false] whether to return the secondary connected element
 *
 * @return {SVGElement}
 */
ElementRegistry.prototype.getGraphics = function(filter, secondary) {
  var id = filter.id || filter;

  var container = this._elements[id];
  return container && (secondary ? container.secondaryGfx : container.gfx);
};

/**
 * Return all rendered model elements.
 *
 * @return {Array<djs.model.Base>}
 */
ElementRegistry.prototype.getAll = function() {
  return this.filter(function(e) { return e; });
};

/**
 * Validate the suitability of the given id and signals a problem
 * with an exception.
 *
 * @param {String} id
 *
 * @throws {Error} if id is empty or already assigned
 */
ElementRegistry.prototype._validateId = function(id) {
  if (!id) {
    throw new Error('element must have an id');
  }

  if (this._elements[id]) {
    throw new Error('element with id ' + id + ' already added');
  }
};

},{}],288:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_(136);

/**
 * A factory that creates graphical elements
 *
 * @param {Renderer} renderer
 */
function GraphicsFactory(elementRegistry, renderer) {
  this._renderer = renderer;
  this._elementRegistry = elementRegistry;
}

GraphicsFactory.$inject = [ 'elementRegistry', 'renderer' ];

module.exports = GraphicsFactory;

GraphicsFactory.prototype.create = function(type, element, parent) {
  var newElement;

  switch (type) {

  case 'row':
    newElement = document.createElement('tr');
    break;

  case 'cell':
    
    // cells consist of a td element with a nested span which contains the content
    newElement = document.createElement(element.row.useTH ? 'th' : 'td');

    var contentContainer = document.createElement('span');
    
    newElement.appendChild(contentContainer);
    break;
  }

  if (newElement && type === 'row') {

    if (element.next) {
      parent.insertBefore(newElement, this._elementRegistry.getGraphics(element.next));
    } else {
      parent.appendChild(newElement);
    }

  } else if (type === 'cell') {

    var neighboringCell = this._elementRegistry.filter(function(el) {
      return el.row === element.row && el.column === element.column.next;
    })[0];

    if (neighboringCell) {
      parent.insertBefore(newElement, this._elementRegistry.getGraphics(neighboringCell));
    } else {
      parent.appendChild(newElement);
    }

  }
  return newElement || document.createElement('div');
};

GraphicsFactory.prototype.moveRow = function(source, target, above) {
  var gfxSource = this._elementRegistry.getGraphics(source);
  var gfxTarget;

  if (above) {
    gfxTarget = this._elementRegistry.getGraphics(target);
    gfxTarget.parentNode.insertBefore(gfxSource, gfxTarget);
  } else {

    if (source.next) {
      gfxTarget = this._elementRegistry.getGraphics(source.next);
      gfxTarget.parentNode.insertBefore(gfxSource, gfxTarget);
    } else {
      gfxSource.parentNode.appendChild(gfxSource);
    }

  }
};

GraphicsFactory.prototype.moveColumn = function(source, target, left) {
  var self = this;

  // find all cells which belong to the source and add them at their new place
  this._elementRegistry.forEach(function(element, gfx) {
    if (element._type === 'cell' && element.column === source) {

      // find the cell exactly right of them
      self._elementRegistry.forEach(function(targetElement, targetGfx) {
        if (targetElement._type === 'cell' && targetElement.row === element.row) {
          if (left && targetElement.column === target) {
            targetGfx.parentNode.insertBefore(gfx, targetGfx);
          } else if (!left && targetElement.column === source.next) {
            targetGfx.parentNode.insertBefore(gfx, targetGfx);
          }
        }
      });
    }
  });
};

// redraw complete table
GraphicsFactory.prototype.redraw = function() {
  var self = this;
  this._elementRegistry.forEach(function(element) {
    if (element._type === 'row') {
      self.update('row', element, self._elementRegistry.getGraphics(element));
    }
  });
};


GraphicsFactory.prototype.update = function(type, element, gfx) {

  // do not update root element
  if (!element.parent) {
    return;
  }

  var self = this;

  // redraw
  if (type === 'row') {

    this._renderer.drawRow(gfx, element);

    // also redraw all cells in this row
    forEach(this._elementRegistry.filter(function(el) {
      return el.row === element;
    }), function(cell) {
      self.update('cell', cell, self._elementRegistry.getGraphics(cell));
    });

  } else if (type === 'column') {

    this._renderer.drawColumn(gfx, element);

    // also redraw all cells in this column
    forEach(this._elementRegistry.filter(function(el) {
      return el.column === element;
    }), function(cell) {
      self.update('cell', cell, self._elementRegistry.getGraphics(cell));
    });

  } else if (type === 'cell') {
    this._renderer.drawCell(gfx, element);
  } else {
    throw new Error('unknown type: ' + type);
  }
};

GraphicsFactory.prototype.remove = function(element) {
  var gfx = this._elementRegistry.getGraphics(element);

  // remove
  gfx.parentNode && gfx.parentNode.removeChild(gfx);
};

},{"136":136}],289:[function(_dereq_,module,exports){
'use strict';

var isNumber = _dereq_(244),
    assign = _dereq_(250),
    forEach = _dereq_(136),
    every = _dereq_(133);

function ensurePx(number) {
  return isNumber(number) ? number + 'px' : number;
}

/**
 * Creates a HTML container element for a table element with
 * the given configuration
 *
 * @param  {Object} options
 * @return {HTMLElement} the container element
 */
function createContainer(options) {

  options = assign({}, { width: '100%', height: '100%' }, options);

  var container = options.container || document.body;

  // create a <div> around the table element with the respective size
  // this way we can always get the correct container size
  var parent = document.createElement('div');
  parent.setAttribute('class', 'tjs-container');

  container.appendChild(parent);

  return parent;
}

var REQUIRED_MODEL_ATTRS = {
  row: [ 'next', 'previous' ],
  column: [ 'next', 'previous' ],
  cell: [ 'row', 'column' ]
};

var LOW_PRIORITY = 250;

/**
 * The main drawing sheet.
 *
 * @class
 * @constructor
 *
 * @emits Sheet#sheet.init
 *
 * @param {Object} config
 * @param {EventBus} eventBus
 * @param {GraphicsFactory} graphicsFactory
 * @param {ElementRegistry} elementRegistry
 */
function Sheet(config, eventBus, elementRegistry, graphicsFactory) {
  this._eventBus = eventBus;
  this._elementRegistry = elementRegistry;
  this._graphicsFactory = graphicsFactory;
  this._config = config;

  this._init(config || {});
}

Sheet.$inject = [ 'config.sheet', 'eventBus', 'elementRegistry', 'graphicsFactory' ];

module.exports = Sheet;


Sheet.prototype._init = function(config) {

  // Creates a <table> element that is wrapped into a <div>.
  // This way we are always able to correctly figure out the size of the table element
  // by querying the parent node.
  //
  // <div class="tjs-container" style="width: {desired-width}, height: {desired-height}">
  //   <table width="100%" height="100%">
  //    ...
  //   </table>
  // </div>

  // html container
  var eventBus = this._eventBus,
      container = createContainer(config),
      self = this;

  this._container = container;

  this._rootNode = document.createElement('table');

  assign(this._rootNode.style, {
    width: ensurePx(config.width),
    height: ensurePx(config.height)
  });

  container.appendChild(this._rootNode);

  this._head = document.createElement('thead');
  this._body = document.createElement('tbody');
  this._foot = document.createElement('tfoot');

  this._rootNode.appendChild(this._head);
  this._rootNode.appendChild(this._body);
  this._rootNode.appendChild(this._foot);

  this._lastColumn = null;
  this._lastRow = {
    head: null,
    body: null,
    foot: null
  };

  eventBus.on('table.init', function(event) {

    /**
     * An event indicating that the table is ready to be used.
     *
     * @memberOf Sheet
     *
     * @event sheet.init
     *
     * @type {Object}
     * @property {DOMElement} sheet the created table element
     * @property {Snap<SVGGroup>} viewport the direct parent of diagram elements and shapes
     */

    eventBus.fire('sheet.init', { sheet: self._rootNode });

    eventBus.fire('sheet.resized');
  });

  // This event expects that another party hooks up earlier and provides
  // the new width to be used.
  eventBus.on('sheet.resized', LOW_PRIORITY, function(evt) {
    var context = evt.context;

    if (!context) {
      return;
    }

    self.setWidth(context.newWidth);
  });

  eventBus.on('table.destroy', LOW_PRIORITY, this._destroy, this);


  eventBus.on('table.clear', LOW_PRIORITY, function() {

    /**
     * An event indicating that the sheet is going to be cleared.
     * Services can now hook in with this event and reset their states.
     *
     * @memberOf Sheet
     *
     * @event sheet.clear
     */
    eventBus.fire('sheet.clear');

    this._clear();

    /**
     * An event indicating that the sheet has been cleared.
     * Interested services can now hook in with this event and instantiate their states.
     *
     * @memberOf Sheet
     *
     * @event sheet.cleared
     *
     * @type {Object}
     * @property {DOMElement} sheet the created table element
     */
    eventBus.fire('sheet.cleared', { sheet: self._rootNode });

    eventBus.fire('sheet.resized');
  }, this);
};

Sheet.prototype._destroy = function() {
  var eventBus = this._eventBus;

  var container = this._container,
      rootNode = this._rootNode,
      parent;

  eventBus.fire('sheet.destroy', { sheet: rootNode });

  parent = container.parentNode;

  if (parent) {
    parent.removeChild(container);
  }

  delete this._container;
  delete this._rootNode;
};

Sheet.prototype._clear = function() {
  var elementRegistry = this._elementRegistry;

  var self = this,
      allElements = elementRegistry.getAll();

  // remove all elements
  allElements.forEach(function(element) {
    if (element.element && element.element.id === 'decisionTable') {
      self.setRootElement(null, true);
    } else {
      self._removeElement(element, element.type);
    }
  });

  this._lastColumn = null;
  this._lastRow = {
    head: null,
    body: null,
    foot: null
  };
};

Sheet.prototype.getLastColumn = function() {
  return this._lastColumn;
};

Sheet.prototype.setLastColumn = function(element) {
  this._lastColumn = element;
};

Sheet.prototype.getLastRow = function(type) {
  return this._lastRow[type];
};

Sheet.prototype.setLastRow = function(element, type) {
  this._lastRow[type] = element;
};

Sheet.prototype.setSibling = function(first, second) {
  if (first) {
    first.next = second;
  }

  if (second) {
    second.previous = first;
  }
};

Sheet.prototype.addSiblings = function(type, element) {
  var tmp, subType;

  if (type === 'row') {
    subType = element.isHead ? 'head' : element.isFoot ? 'foot' : 'body';
  }

  if (!element.previous && !element.next) {
    if (type === 'column') {

      // add column to end of table per default
      element.next = null;

      this.setSibling(this.getLastColumn(), element);

      this.setLastColumn(element);
    } else if (type === 'row') {

      // add row to end of table per default
      element.next = null;

      this.setSibling(this.getLastRow(subType), element);

      this.setLastRow(element, subType);
    }
  } else if (element.previous && !element.next) {
    tmp = element.previous.next;

    this.setSibling(element.previous, element);
    this.setSibling(element, tmp);

    if (!tmp) {
      if (type === 'row') {
        this.setLastRow(element, subType);
      } else if (type === 'column') {
        this.setLastColumn(element, subType);
      }
    }
  } else if (!element.previous && element.next) {
    tmp = element.next.previous;

    this.setSibling(tmp, element);
    this.setSibling(element, element.next);
  } else if (element.previous && element.next) {
    if (element.previous.next !== element.next) {
      throw new Error('cannot set both previous and next when adding new element <' + type + '>');
    } else {
      this.setSibling(element.previous, element);
      this.setSibling(element, element.next);
    }
  }
};

Sheet.prototype.removeSiblings = function(type, element) {
  var subType;

  if (type === 'row') {
    subType = element.isHead ? 'head' : element.isFoot ? 'foot' : 'body';
  }

  if (type === 'column') {
    if (this.getLastColumn() === element) {
      this.setLastColumn(element.previous);
    }
  } else if (type === 'row') {
    if (this.getLastRow(subType) === element) {
      this.setLastRow(element.previous, subType);
    }
  }

  if (element.previous) {
    element.previous.next = element.next;
  }

  if (element.next) {
    element.next.previous = element.previous;
  }

  delete element.previous;
  delete element.next;
};

/**
 * Returns the html element that encloses the
 * drawing canvas.
 *
 * @return {DOMNode}
 */
Sheet.prototype.getContainer = function() {
  return this._container;
};


/**
 * Returns the table body element of the table.
 *
 * @return {DOMNode}
 */
Sheet.prototype.getBody = function() {
  return this._body;
};

/**
 * Moves a row above or below another row
 *
 */
Sheet.prototype.moveRow = function(source, target, above) {
  var eventBus = this._eventBus,
      graphicsFactory = this._graphicsFactory;

  if (source === target) {
    return;
  }

  eventBus.fire('row.move', {
    source: source,
    target: target,
    above: above
  });

  // update the last row if necessary
  if (this.getLastRow('body') === source) {
    this.setLastRow(source.previous, 'body');
  }

  // re-wire the prev/next relations for the source
  if (source.previous) {
    source.previous.next = source.next;
  }

  if (source.next) {
    source.next.previous = source.previous;
  }

  // re-wire the prev/next relations for the target
  if (above) {
    if (target.previous) {

      // (previous --> source --> target)
      target.previous.next = source;
      source.previous = target.previous;

      source.next = target;
      target.previous = source;
    } else {

      // (null --> source --> target)
      source.previous = null;

      source.next = target;
      target.previous = source;
    }
  } else {
    if (target.next) {

      // (target --> source --> next)
      target.next.previous = source;
      source.next = target.next;

      source.previous = target;
      target.next = source;
    } else {

      // (target --> source --> null)
      source.next = null;

      source.previous = target;
      target.next = source;

      this.setLastRow(source, 'body');
    }
  }

  graphicsFactory.moveRow(source, target, above);

  eventBus.fire('row.moved', {
    source: source,
    target: target,
    above: above
  });

};

/**
 * Moves a column left or right another column
 *
 */
Sheet.prototype.moveColumn = function(source, target, left) {
  var eventBus = this._eventBus,
      graphicsFactory = this._graphicsFactory;

  if (source === target) {
    return;
  }

  eventBus.fire('column.move', {
    source: source,
    target: target,
    left: left
  });

  // update the last row if necessary
  if (this.getLastColumn() === source) {
    this.setLastColumn(source.previous);
  }

  // re-wire the prev/next relations for the source
  if (source.previous) {
    source.previous.next = source.next;
  }

  if (source.next) {
    source.next.previous = source.previous;
  }

  // re-wire the prev/next relations for the target
  if (left) {

    if (target.previous) {

      // (previous --> source --> target)
      target.previous.next = source;
      source.previous = target.previous;

      source.next = target;
      target.previous = source;
    } else {

      // (null --> source --> target)
      source.previous = null;

      source.next = target;
      target.previous = source;
    }

  } else {

    if (target.next) {

      // (target --> source --> next)
      target.next.previous = source;
      source.next = target.next;

      source.previous = target;
      target.next = source;
    } else {

      // (target --> source --> null)
      source.next = null;

      source.previous = target;
      target.next = source;

      this.setLastColumn(source);
    }

  }

  graphicsFactory.moveColumn(source, target, left);

  eventBus.fire('column.moved', {
    source: source,
    target: target,
    left: left
  });

};


///////////// add functionality ///////////////////////////////

Sheet.prototype._ensureValid = function(type, element) {
  var elementRegistry = this._elementRegistry;

  if (!element.id) {
    throw new Error('element must have an id');
  }

  if (elementRegistry.get(element.id)) {
    throw new Error('element with id ' + element.id + ' already exists');
  }

  var requiredAttrs = REQUIRED_MODEL_ATTRS[type];

  var valid = every(requiredAttrs, function(attr) {
    return typeof element[attr] !== 'undefined';
  });

  if (!valid) {
    throw new Error('must supply { ' + requiredAttrs.join(', ') + ' } with ' + type);
  }
};

/**
 * Adds an element to the sheet.
 *
 * This wires the parent <-> child relationship between the element and
 * a explicitly specified parent or an implicit root element.
 *
 * During add it emits the events
 *
 *  * <{type}.add> (element, parent)
 *  * <{type}.added> (element, gfx)
 *
 * Extensions may hook into these events to perform their magic.
 *
 * @param {String} type
 * @param {Object|djs.model.Base} element
 * @param {Object|djs.model.Base} [parent]
 *
 * @return {Object|djs.model.Base} the added element
 */
Sheet.prototype._addElement = function(type, element, parent) {
  var eventBus = this._eventBus,
      graphicsFactory = this._graphicsFactory;

  element._type = type;

  this._ensureValid(type, element);

  eventBus.fire(type + '.add', element);

  // create graphics
  element.parent = parent || this._rootNode;

  var gfx = graphicsFactory.create(type, element, element.parent);

  this._elementRegistry.add(element, gfx);

  // update its visual
  graphicsFactory.update(type, element, gfx);

  eventBus.fire(type + '.added', { element: element, gfx: gfx });

  return element;
};

Sheet.prototype.addRow = function(row) {
  var eventBus = this._eventBus,
      elementRegistry = this._elementRegistry;

  var self = this,
      columns;

  this.addSiblings('row', row);

  var r = this._addElement('row', row, row.isHead ? this._head : row.isFoot ? this._foot : this._body);

  eventBus.fire('cells.add', r);

  // create new cells
  columns = elementRegistry.filter(function(el) {
    return el._type === 'column';
  });

  forEach(columns.sort(function(a, b) {
    var c = a;
    while ((c = c.next)) {
      if (c === b) {
        return -1;
      }
    }
    return 1;
  }), function(el) {
    self._addCell({ row: r, column: el, id: 'cell_'+el.id+'_'+r.id });
  });

  eventBus.fire('cells.added', r);

  return r;
};

Sheet.prototype.addColumn = function(column) {
  var eventBus = this._eventBus,
      elementRegistry = this._elementRegistry;

  var self = this,
      rows;

  this.addSiblings('column', column);

  var c = this._addElement('column', column);

  eventBus.fire('cells.add', c);

  rows = elementRegistry.filter(function(el) {
    return el._type === 'row';
  });

  // create new cells
  forEach(rows, function(el) {
    self._addCell({ row: el, column: c, id: 'cell_' + c.id + '_' + el.id });
  });

  eventBus.fire('cells.added', c);

  return c;
};

Sheet.prototype._addCell = function(cell) {
  var elementRegistry = this._elementRegistry;

  var row = elementRegistry.getGraphics(cell.row.id);

  return this._addElement('cell', cell, row);
};

Sheet.prototype.setCellContent = function(config) {
  var elementRegistry = this._elementRegistry,
      graphicsFactory = this._graphicsFactory;

  if (typeof config.column === 'object') {
    config.column = config.column.id;
  }
  if (typeof config.row === 'object') {
    config.row = config.row.id;
  }

  elementRegistry.get('cell_' + config.column + '_' + config.row).content = config.content;

  graphicsFactory.update(
    'cell',
    elementRegistry.get('cell_' + config.column + '_' + config.row),
    elementRegistry.getGraphics('cell_' + config.column + '_' + config.row)
  );
};

Sheet.prototype.getCellContent = function(config) {
  var elementRegistry = this._elementRegistry;

  return elementRegistry.get('cell_' + config.column + '_' + config.row).content;
};


/**
 * Internal remove element
 */
Sheet.prototype._removeElement = function(element, type) {

  var elementRegistry = this._elementRegistry,
      graphicsFactory = this._graphicsFactory,
      eventBus = this._eventBus;

  element = elementRegistry.get(element.id || element);

  if (!element) {

    // element was removed already
    return;
  }

  eventBus.fire(type + '.remove', { element: element });

  graphicsFactory.remove(element);

  element.parent = null;

  elementRegistry.remove(element);

  eventBus.fire(type + '.removed', { element: element });

  return element;
};

Sheet.prototype.removeRow = function(element) {
  var eventBus = this._eventBus;

  this.removeSiblings('row', element);

  var el = this._removeElement(element, 'row');

  // remove cells
  eventBus.fire('cells.remove', el);

  var self = this;

  forEach(this._elementRegistry.filter(function(el) {
    return el.row === element;
  }), function(el) {
    self._removeElement(el.id, 'cell');
  });

  eventBus.fire('cells.removed', el);

  return el;
};

Sheet.prototype.removeColumn = function(element) {
  var eventBus = this._eventBus;

  this.removeSiblings('column', element);

  var el = this._removeElement(element, 'column');

  // remove cells
  eventBus.fire('cells.remove', el);

  var self = this;
  
  forEach(this._elementRegistry.filter(function(el) {
    return el.column === element;
  }), function(el) {
    self._removeElement(el.id, 'cell');
  });

  eventBus.fire('cells.removed', el);

  return el;
};

Sheet.prototype.getRootElement = function() {
  return this._rootNode;
};

Sheet.prototype.setRootElement = function(element, override) {

  if (element) {
    this._ensureValid('root', element);
  }

  var currentRoot = this._rootNode,
      elementRegistry = this._elementRegistry,
      eventBus = this._eventBus;

  if (currentRoot) {
    if (!override) {
      throw new Error('rootNode already set, need to specify override');
    }

    // simulate element remove event sequence
    eventBus.fire('root.remove', { element: currentRoot });
    eventBus.fire('root.removed', { element: currentRoot });

    elementRegistry.remove(currentRoot);
  }

  if (element) {
    var gfx = this.getDefaultLayer();

    // resemble element add event sequence
    eventBus.fire('root.add', { element: element });

    elementRegistry.add(element, gfx, this._svg);

    eventBus.fire('root.added', { element: element, gfx: gfx });
  }

  this._rootNode = element;

  return element;
};

Sheet.prototype.setWidth = function(newWidth) {
  var container = this.getContainer();

  if (!newWidth) {
    return;
  }

  if (typeof newWidth === 'number') {
    newWidth = newWidth + 'px';
  }

  container.style.width = newWidth;
};

Sheet.prototype.resized = function() {
  var eventBus = this._eventBus;

  eventBus.fire('sheet.resized');
};

},{"133":133,"136":136,"244":244,"250":250}],290:[function(_dereq_,module,exports){
module.exports = {
  __depends__: [ _dereq_(292) ],
  __init__: [ 'sheet' ],
  sheet: [ 'type', _dereq_(289) ],
  elementRegistry: [ 'type', _dereq_(287) ],
  elementFactory: ['type', _dereq_(286)],
  graphicsFactory: [ 'type', _dereq_(288) ],
  eventBus: [ 'type', _dereq_(312) ]
};

},{"286":286,"287":287,"288":288,"289":289,"292":292,"312":312}],291:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_(136);

function colDistance(from, to) {
  var i = 0,
      current = from.column;
  while (current && current !== to.column) {
    current = current.next;
    i++;
  }
  return !current ? -1 : i;
}

function rowDistance(from, to) {
  var i = 0,
      current = from.row;
  while (current && current !== to.row) {
    current = current.next;
    i++;
  }
  return !current ? -1 : i;
}

/**
 * The default renderer used for rows, columns and cells.
 *
 */
function Renderer(elementRegistry, eventBus) {
  this._elementRegistry = elementRegistry;
  this._eventBus = eventBus;
}

Renderer.$inject = [ 'elementRegistry', 'eventBus' ];

module.exports = Renderer;

Renderer.prototype.drawRow = function drawRow(gfx, data) {
  this._eventBus.fire('row.render', {
    gfx: gfx,
    data: data
  });

  return gfx;
};

Renderer.prototype.drawColumn = function drawColumn(gfx, data) {
  this._eventBus.fire('column.render', {
    gfx: gfx,
    data: data
  });

  return gfx;
};

Renderer.prototype.drawCell = function drawCell(gfx, data) {
  if (data.colspan) {
    gfx.setAttribute('colspan', data.colspan);
  }
  if (data.rowspan) {
    gfx.setAttribute('rowspan', data.rowspan);
  }

  gfx.setAttribute('style', '');

  // traverse backwards to find colspanned elements which might overlap us
  var cells = this._elementRegistry.filter(function(element) {
    return element._type === 'cell' && element.row === data.row;
  });

  forEach(cells, function(cell) {
    var d = colDistance(cell, data);

    if (cell.colspan && d > 0 && d < cell.colspan) {
      gfx.setAttribute('style', 'display: none;');
    }
  });

  // traverse backwards to find rowspanned elements which might overlap us
  cells = this._elementRegistry.filter(function(element) {
    return element._type === 'cell' && element.column === data.column;
  });

  forEach(cells, function(cell) {
    var d = rowDistance(cell, data);
    
    if (cell.rowspan && d > 0 && d < cell.rowspan) {
      gfx.setAttribute('style', 'display: none;');
    }
  });

  if (data.content) {
    if (typeof data.content === 'string' && !data.content.tagName) {
      gfx.childNodes[0].textContent = data.content;
    } else if (data.content.tagName) {
      gfx.childNodes[0].appendChild(data.content);
    }
  } else {
    gfx.childNodes[0].textContent = '';
  }

  this._eventBus.fire('cell.render', {
    gfx: gfx,
    data: data
  });

  return gfx;
};

},{"136":136}],292:[function(_dereq_,module,exports){
module.exports = {
  renderer: [ 'type', _dereq_(291) ]
};

},{"291":291}],293:[function(_dereq_,module,exports){
module.exports = "<div>\r\n  <label></label>\r\n  <input tabindex=\"0\" />\r\n  <span class=\"cb-caret\"></span>\r\n</div>\r\n";

},{}],294:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264),
    domClasses = _dereq_(261),
    assign = _dereq_(250),
    forEach = _dereq_(136);

var comboBoxTemplate = _dereq_(293);

/**
 * Offers the ability to create a combobox which is a combination of an
 *
 * <ul>
 *   <li>input</li>
 *   <li>dropdown</li>
 *   <li>typeahead</li>
 * </ul>
 *
 * @param {Object}   config
 * @param {String}   config.label
 *                            Text of the label which will be placed before the input field
 * @param {String[]} config.classNames
 *                            Array of Strings each identifying a class name of the comboBox container
 * @param {String[]} config.options
 *                            Array of Strings each specifying one option for the dropdown and typeahead feature
 * @param {String[]} config.dropdownClassNames
 *                            Array of Strings each identifying a class name of the dropdown container
 */
function ComboBox(config) {

  var self = this;
  var template = domify(comboBoxTemplate);

  var label = config.label,
      classNames = config.classNames,
      options = config.options,
      dropdownClassNames = config.dropdownClassNames;

  this._dropdown = document.createElement('ul');
  this._template = template;
  this._dropdownOpen = false;
  this._disabled = false;

  this._listeners = {};

  // assign classes to the combobox template
  forEach(classNames, function(className) {
    domClasses(template).add(className);
  });

  // assign classes to the dropdown node
  forEach(dropdownClassNames, function(className) {
    domClasses(self._dropdown).add(className);
  });

  // create options
  forEach(options, function(option) {
    var node = document.createElement('li');
    node.setAttribute('tabindex', '1');
    node.textContent = option;
    self._dropdown.appendChild(node);
  });

  // set the label of the combobox
  if (label) {
    template.querySelector('label').textContent = label + ':';
  }


  // --- event listeners ---

  // toggles the dropdown on click on the caret symbol
  template.querySelector('span').addEventListener('click', function(evt) {
    self._toggleDropdown(options);
    evt.stopPropagation();
  });

  // closes the dropdown when it is open and the user clicks somewhere
  document.body.addEventListener('click', function(evt) {
    self._closeDropdown();
  });

  // updates the value of the input field when the user
  //   a. clicks on an option in the dropdown
  //   b. focuses an option in the dropdown via keyboard
  var update = function(evt) {
    var value = evt.target.textContent;

    if (options.indexOf(value) !== -1) {
      self.setValue(evt.target.textContent);
    }
  };

  this._dropdown.addEventListener('click', function(evt) {
    update(evt);

    // stop event propagation to prevent closing potential complex cells
    evt.stopPropagation();

    // still close the dropdown
    self._closeDropdown();
  });
  
  this._dropdown.addEventListener('focus', update, true);

  // keyboard behavior for dropdown and input field
  if (!config.disableKeyboard) {
    var keyboardFunction = function(evt) {
      var code = evt.which || evt.keyCode;

      // ESC
      if (code === 27) {
        self._closeDropdown();
      } else

      // ENTER
      if (code === 13) {
        self._toggleDropdown(options);
      } else

      // TAB, DOWN
      if (code === 9 || code === 40) {
        evt.preventDefault();
        self._focusNext(code === 9 && evt.shiftKey);
      } else

      // UP
      if (code === 38) {
        evt.preventDefault();
        self._focusNext(true);
      }

    };
    this._dropdown.addEventListener('keydown', keyboardFunction);
    this._template.querySelector('input').addEventListener('keydown', keyboardFunction);
  }

  // when typing, show only options that match the typed text
  this._template.querySelector('input').addEventListener('input', function(evt) {
    var filteredList = options.filter(function(option) {
      return option.toLowerCase().indexOf(self._template.querySelector('input').value.toLowerCase()) !== -1;
    });
    self._openDropdown(filteredList);

    self._fireEvent('valueChanged', {
      newValue: self._template.querySelector('input').value
    });

  });

  return this;
}

/**
 * Focuses the next field in the dropdown. Opens the dropdown if it is closed.
 *
 * @param {boolean} reverse Focus previous field instead of next field
 */
ComboBox.prototype._focusNext = function(reverse) {

  if (!this._isDropdownOpen()) {
    this._openDropdown();
    return;
  }

  var element = document.activeElement;
  var focus;

  // get the element which should have focus
  if (element === this._template.querySelector('input')) {
    focus = this._dropdown[reverse ? 'lastChild' : 'firstChild'];
  } else if (element.parentNode === this._dropdown) {
    focus = element[reverse ? 'previousSibling' : 'nextSibling'];
  }

  // if the element is not displayed (due to text input),
  // select next visible element instead
  while (focus && focus.style.display === 'none') {
    focus = focus[reverse ? 'previousSibling' : 'nextSibling'];
  }

  // if no element can be selected (search reached end of list), focus input field
  if (!focus) {
    focus = this._template.querySelector('input');
  }
  focus.focus();
};

ComboBox.prototype._toggleDropdown = function(options) {
  if (this._isDropdownOpen()) {
    this._closeDropdown();
  } else {
    this._openDropdown(options);
  }
};

ComboBox.prototype._openedDropdown = null;

ComboBox.prototype._isDropdownOpen = function() {
  return this._dropdownOpen;
};

ComboBox.prototype._closeDropdown = function() {
  if (this._isDropdownOpen()) {
    this._dropdownOpen = false;
    ComboBox.prototype._openedDropdown = null;
    domClasses(this._template).remove('expanded');
    this._dropdown.parentNode.removeChild(this._dropdown);
  }
};

/**
 *  Opens the dropdown menu for the input field.
 *
 *  @param {String[]} options Array of options which should be displayed in the dropdown
 *        If an option was specified in the constructor, but is not included in this list,
 *        it will be hidden via CSS. If the options array is empty, the dropdown is closed.
 */
ComboBox.prototype._openDropdown = function(options) {

  if (ComboBox.prototype._openedDropdown) {
    ComboBox.prototype._openedDropdown._closeDropdown();
  }

  // close dropdown if options array is empty or the comboBox is disabled
  if (options && options.length === 0 || this._disabled) {
    this._closeDropdown();
    return;
  }

  // update the display of options depending on options array
  forEach(this._dropdown.childNodes, function(child) {
    if (!options || options.indexOf(child.textContent) !== -1) {
      child.style.display = 'block';
    } else {
      child.style.display = 'none';
    }
  });

  // position the dropdown in relation to the position of the input element
  var input = this._template.querySelector('input');
  var e = input;
  var offset = { x:0,y:0 };
  while (e)
  {
    offset.x += e.offsetLeft;
    offset.y += e.offsetTop;
    e = e.offsetParent;
  }

  assign(this._dropdown.style, {
    'display': 'block',
    'position': 'fixed',
    'top': (offset.y + input.clientHeight)+'px',
    'left': offset.x+'px',
    'width': input.clientWidth+'px',
    'z-index': 9001
  });
  document.body.appendChild(this._dropdown);

  ComboBox.prototype._openedDropdown = this;
  this._dropdownOpen = true;

  domClasses(this._template).add('expanded');

};

ComboBox.prototype._fireEvent = function(evt, payload) {
  forEach(this._listeners[evt], function(listener) {
    listener(payload);
  });
};

ComboBox.prototype.setValue = function(newValue) {
  this._fireEvent('valueChanged', {
    oldValue: this._template.querySelector('input').value,
    newValue: newValue
  });
  this._template.querySelector('input').value = newValue;
};

ComboBox.prototype.getValue = function() {
  return this._template.querySelector('input').value;
};

ComboBox.prototype.getNode = function() {
  return this._template;
};

ComboBox.prototype.addEventListener = function(event, fct) {
  this._listeners[event] = this._listeners[event] || [];
  this._listeners[event].push(fct);
};

ComboBox.prototype.disable = function() {
  this._disabled = true;
  this._template.querySelector('input').setAttribute('disabled', 'true');
};

ComboBox.prototype.enable = function() {
  this._disabled = false;
  this._template.querySelector('input').setAttribute('disabled', 'false');
};


module.exports = ComboBox;

},{"136":136,"250":250,"261":261,"264":264,"293":293}],295:[function(_dereq_,module,exports){
'use strict';

var assign = _dereq_(250),
    domClasses = _dereq_(261),
    domRemove = _dereq_(267);


/**
 *  A ComplexCell is a table cell that renders a template on click
 *  This can be used for cells containing complex data that can not be edited inline
 *
 *  In order to define a cell as complex, the cell must have a special property complex defining
 *  the configuration of the cell such as template or position:
 *
 *  Complex Property:
 *     - template: {DOMNode}
 *              HTML template of the complex content
 *     - className: {String | String[]} (optional, defaults to 'complex-cell')
 *              Defines the classNames which are set on the container of the complex cell
 *     - offset: {Object} (option, defaults to {x: 0, y: 0})
 *              Defines the offset of the template from the top left corner of the cell
 *
 *  Additional properties can be added to the complex object to retrieve them in events.
 *
 * Example:
 * cell.complex = {
 *      className: 'dmn-clauseexpression-setter',
 *      template: domify('<div>Hello World</div>'),
 *      type: 'mapping',
 *      offset: { x: 0, y: 10 }
 * };
 */
function ComplexCell(eventBus, elementRegistry, sheet) {

  this._eventBus = eventBus;
  this._elementRegistry = elementRegistry;
  this._sheet = sheet;

  this.setupListeners();
}


ComplexCell.prototype.setupListeners = function() {
  var eventBus = this._eventBus,
      elementRegistry = this._elementRegistry;

  var self = this;

  // click on body closes open complex cells
  document.body.addEventListener('click', function(event) {
    if (!event.preventDialogClose) {
      self.close();
    }
  });

  document.body.addEventListener('keydown', function(event) {
    if (!event.preventDialogClose && event.keyCode === 27) {
      self.close();
    }
  });

  // also close the dialog on a hashchange, e.g. for single page applications that go to another page
  window.addEventListener('hashchange', function(event) {
    self.close();
  });

  eventBus.on([ 'table.scroll', 'table.destroy', 'popupmenu.open' ], this.close, this);

  // click on elements close potentially open complex cells
  // and open a complex cell at the position of the cell
  eventBus.on('element.click', function(event) {
    var gfx, gfxDimensions, element;

    this.close();

    // set flag on original event to prevent closing the opened dialog
    // this only applies if the event has an original event (so it was generated
    // from a browser event that travels the dom tree)
    if (event.originalEvent) {
      event.originalEvent.preventDialogClose = true;
    }

    if (event.element && event.element.complex) {
      element = event.element;

      // calculate position based on the position of the cell
      gfx = elementRegistry.getGraphics(element);

      gfxDimensions = gfx.getBoundingClientRect();

      element.complex.position = {
        x: gfxDimensions.left,
        y: gfxDimensions.top
      };

      this.open(element.complex);
    }
  }, this);
};

ComplexCell.prototype.close = function() {
  if (this._current) {
    this._eventBus.fire('complexCell.close', this._current);

    domRemove(this._current.container);
    this._current = null;
  }
};

ComplexCell.prototype.isOpen = function() {
  return !!this._current;
};

/**
 * Creates a container that holds the template
 */
ComplexCell.prototype._createContainer = function(className, position) {
  var container = document.createElement('div');

  assign(container.style, {
    position: 'fixed',
    left: position.x + 'px',
    top: position.y  + 'px',
    width: 'auto',
    height: 'auto',
    'z-index': 9000
  });

  // stop propagation of click events on the container to avoid closing the template
  container.addEventListener('click', function(event) {
    event.stopPropagation();
  });

  if (typeof className === 'string') {
    domClasses(container).add(className);
  } else {
    for (var i = 0; i < className.length; i++) {
      domClasses(container).add(className[i]);
    }
  }

  return container;
};

ComplexCell.prototype.open = function(config) {
  var eventBus = this._eventBus,
      sheet = this._sheet;

  var className = config.className || 'complex-cell',
      template = config.template;

  // make sure, only one complex cell dialog is open at a time
  if (this.isOpen()) {
    this.close();
  }

  // apply the optional offset configuration to the calculated position
  var position = {
    x: config.position.x + (config.offset && config.offset.x || 0),
    y: config.position.y + (config.offset && config.offset.y || 0)
  };

  var parent = sheet.getContainer(),

      // create the template container
      container = this._createContainer(className, position);

  // attach the template container to the document body
  this._attachContainer(container, parent);

  // attach the template node to the container
  this._attachContent(template, container);

  // save the currently open complex cell
  this._current = {
    container: container,
    config: config
  };

  eventBus.fire('complexCell.open', this._current);

  return this;
};

/**
 * Attaches the container to the DOM.
 *
 * @param {Object} container
 * @param {Object} parent
 */
ComplexCell.prototype._attachContainer = function(container, parent) {
  // Attach to DOM
  parent.appendChild(container);
};

/**
 * Attaches the content to the container.
 *
 * @param {Object} container
 * @param {Object} parent
 */
ComplexCell.prototype._attachContent = function(content, container) {
  container.appendChild(content);
};

ComplexCell.$inject = [ 'eventBus', 'elementRegistry', 'sheet' ];

module.exports = ComplexCell;

},{"250":250,"261":261,"267":267}],296:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  __init__: [ 'complexCell' ],
  complexCell: [ 'type', _dereq_(295) ]
};

},{"295":295}],297:[function(_dereq_,module,exports){
'use strict';

var domClasses = _dereq_(261);
/**
 *  The controls module adds a container to the top-right corner of the table which holds
 *  some control elements
 */
function Controls(eventBus) {

  this._eventBus = eventBus;
  this.controlsContainer;

  var self = this;

  eventBus.on([ 'sheet.init', 'sheet.cleared' ], function(evt) {

    // remove existing control
    var container = evt.sheet.parentNode;

    var existingControl = container.querySelector('.tjs-controls');
    if (existingControl) {
      container.removeChild(existingControl);
    }

    var domNode = document.createElement('div');
    domClasses(domNode).add('tjs-controls');

    self.controlsContainer = domNode;
    container.appendChild(domNode);

    eventBus.fire('controls.init', {
      node: domNode,
      controls: self
    });

  });

}

Controls.prototype.addControl = function(label, fct) {
  this._eventBus.fire('controls.add', {
    label: label
  });

  var newNode = document.createElement('button');
  newNode.textContent = label;

  newNode.addEventListener('click', fct);

  this.controlsContainer.appendChild(newNode);

  this._eventBus.fire('controls.added', {
    label: label,
    node: newNode
  });

  return newNode;
};


Controls.$inject = [ 'eventBus' ];

module.exports = Controls;

},{"261":261}],298:[function(_dereq_,module,exports){
'use strict';

module.exports = {
  __init__: [ 'controls' ],
  controls: [ 'type', _dereq_(297) ]
};

},{"297":297}],299:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_(136),
    domDelegate = _dereq_(263);


var isPrimaryButton = _dereq_(317).isPrimaryButton;

/**
 * A plugin that provides interaction events for table elements.
 *
 * It emits the following events:
 *
 *   * element.hover
 *   * element.out
 *   * element.click
 *   * element.dblclick
 *   * element.mousedown
 *   * element.focus
 *   * element.blur
 *
 * Each event is a tuple { element, gfx, originalEvent }.
 *
 * Canceling the event via Event#preventDefault() prevents the original DOM operation.
 *
 * @param {EventBus} eventBus
 */
function InteractionEvents(eventBus, elementRegistry) {

  function fire(type, event) {
    var target = event.delegateTarget || event.target,
        gfx = target,
        element = elementRegistry.get(gfx),
        returnValue;

    if (!gfx || !element) {
      return;
    }

    returnValue = eventBus.fire(type, { element: element, gfx: gfx, originalEvent: event });

    if (returnValue === false) {
      event.stopPropagation();
      event.preventDefault();
    }
  }

  var handlers = {};

  function mouseHandler(type) {

    var fn = handlers[type];

    if (!fn) {
      fn = handlers[type] = function(event) {
        // only indicate left mouse button interactions and contextmenu
        if (isPrimaryButton(event) || type === 'element.contextmenu') {
          fire(type, event);
        }
      };
    }

    return fn;
  }

  var bindings = {
    mouseover: 'element.hover',
    mouseout: 'element.out',
    click: 'element.click',
    dblclick: 'element.dblclick',
    mousedown: 'element.mousedown',
    mousemove: 'element.mousemove',
    mouseup: 'element.mouseup',
    focus: 'element.focus',
    blur: 'element.blur',
    input: 'element.input',
    contextmenu: 'element.contextmenu'
  };

  var elementSelector = 'td,th';

  ///// event registration

  function isFocusEvent(event) {
    return event === 'focus' || event === 'blur';
  }

  function registerEvent(node, event, localEvent) {
    var handler = mouseHandler(localEvent);
    handler.$delegate = domDelegate.bind(node, elementSelector, event, handler, isFocusEvent(event));
  }

  function unregisterEvent(node, event, localEvent) {
    domDelegate.unbind(node, event, mouseHandler(localEvent).$delegate, isFocusEvent(event));
  }

  function registerEvents(node) {
    forEach(bindings, function(val, key) {
      registerEvent(node, key, val);
    });
  }

  function unregisterEvents(node) {
    forEach(bindings, function(val, key) {
      unregisterEvent(node, key, val);
    });
  }

  function scrollHandler(node) {

    var fn = handlers.scroll;

    if (!fn) {
      fn = handlers.scroll = function(event) {
        if (event.target.contains(node)) {
          eventBus.fire('table.scroll', { gfx: event.target, originalEvent: event });
        }
      };
    }

    return fn;
  }

  function registerScrollEvent(node) {
    document.addEventListener('scroll', scrollHandler(node), true);
  }

  function unregisterScrollEvent(node) {
    document.removeEventListener('scroll', scrollHandler(node), true);
  }

  eventBus.on('sheet.destroy', function(event) {
    unregisterEvents(event.sheet);
    unregisterScrollEvent(event.sheet);
  });

  eventBus.on('sheet.init', function(event) {
    registerEvents(event.sheet);
    registerScrollEvent(event.sheet);
  });


  // API

  this.fire = fire;

  this.mouseHandler = mouseHandler;

  this.registerEvent = registerEvent;
  this.unregisterEvent = unregisterEvent;
}


InteractionEvents.$inject = [ 'eventBus', 'elementRegistry' ];

module.exports = InteractionEvents;


/**
 * An event indicating that the mouse hovered over an element
 *
 * @event element.hover
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {element} gfx
 * @property {Event} originalEvent
 */

/**
 * An event indicating that the mouse has left an element
 *
 * @event element.out
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {element} gfx
 * @property {Event} originalEvent
 */

/**
 * An event indicating that the mouse has clicked an element
 *
 * @event element.click
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {element} gfx
 * @property {Event} originalEvent
 */

/**
 * An event indicating that the mouse has double clicked an element
 *
 * @event element.dblclick
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {element} gfx
 * @property {Event} originalEvent
 */

/**
 * An event indicating that the mouse has gone down on an element.
 *
 * @event element.mousedown
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {element} gfx
 * @property {Event} originalEvent
 */

/**
 * An event indicating that the mouse has gone up on an element.
 *
 * @event element.mouseup
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {element} gfx
 * @property {Event} originalEvent
 */

/**
 * An event indicating that the element has gained focus.
 *
 * @event element.focus
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {element} gfx
 * @property {Event} originalEvent
 */

/**
 * An event indicating that the element has lost focus
 *
 * @event element.blur
 *
 * @type {Object}
 * @property {djs.model.Base} element
 * @property {element} gfx
 * @property {Event} originalEvent
 */

},{"136":136,"263":263,"317":317}],300:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'interactionEvents' ],
  interactionEvents: [ 'type', _dereq_(299) ]
};

},{"299":299}],301:[function(_dereq_,module,exports){
'use strict';

var debounce = _dereq_(143);

var VERY_LOW_PRIORITY = 150;

function LineNumbers(eventBus, sheet) {

  this._sheet = sheet;
  this._utilityColumn = null;

  var self = this;

  eventBus.on('utilityColumn.added', function(event) {
    var column = event.column;

    this._utilityColumn = column;

    this.updateLineNumbers();
  }, this);

  eventBus.on([ 'cells.added', 'row.removed', 'row.moved' ], debounce(self.updateLineNumbers.bind(self), 100, {
    'leading': true,
    'trailing': true
  }));

  eventBus.on([ 'sheet.clear', 'sheet.destroy' ], VERY_LOW_PRIORITY, function() {
    this._utilityColumn = null;
  }, this);
}


LineNumbers.$inject = [ 'eventBus', 'sheet' ];

module.exports = LineNumbers;

LineNumbers.prototype.updateLineNumbers = function() {

  if (!this._utilityColumn || !this._sheet.getLastRow('body')) {
    // only render line numbers if utility column has been added
    return;
  }

  // find the first row
  var currentRow = this._sheet.getLastRow('body');
  while (currentRow.previous) {
    currentRow = currentRow.previous;
  }

  // update the row number for all rows
  var i = 1;
  while (currentRow) {
    this._sheet.setCellContent({
      row: currentRow,
      column: this._utilityColumn,
      content: i
    });
    i++;
    currentRow = currentRow.next;
  }
};

},{"143":143}],302:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'lineNumbers' ],
  __depends__: [
    _dereq_(307)
  ],
  lineNumbers: [ 'type', _dereq_(301) ]
};

},{"301":301,"307":307}],303:[function(_dereq_,module,exports){
'use strict';

var domify = _dereq_(264);

/**
 * Adds a header to the table containing the table name
 *
 * @param {EventBus} eventBus
 */
function TableName(eventBus, sheet, tableName) {

  this.tableName = tableName;

  this.node = domify('<header><h3 class="tjs-table-name">'+this.tableName+'</h3></header>');

  var self = this;

  eventBus.on([ 'sheet.init', 'sheet.cleared' ], function(event) {
    sheet.getContainer().insertBefore(self.node, sheet.getRootElement());
    eventBus.fire('tableName.init', { node: self.node.querySelector('h3') });
  });

  eventBus.on('sheet.destroy', function(event) {
    sheet.getContainer().removeChild(self.node);
    eventBus.fire('tableName.destroy', { node: self.node.querySelector('h3') });
  });
}

TableName.$inject = [ 'eventBus', 'sheet', 'config.tableName' ];

module.exports = TableName;

TableName.prototype.setName = function(newName) {
  this.tableName = newName;
  this.node.querySelector('h3').textContent = newName;
};

TableName.prototype.getName = function() {
  return this.tableName;
};

TableName.prototype.getNode = function() {
  return this.node.querySelector('h3');
};

},{"264":264}],304:[function(_dereq_,module,exports){
'use strict';

/**
 * Adds a dedicated column to the table dedicated to hold controls and meta information
 *
 * @param {EventBus} eventBus
 */
function UtilityColumn(eventBus, sheet) {

  // add the row control row
  this.column = null;

  eventBus.on([ 'sheet.init', 'sheet.cleared' ], function(event) {

    eventBus.fire('utilityColumn.add', event);

    this.column = sheet.addColumn({
      id: 'utilityColumn'
    });

    eventBus.fire('utilityColumn.added', { column: this.column });
  }, this);

  eventBus.on([ 'sheet.clear', 'sheet.destroy' ], function(event) {

    eventBus.fire('utilityColumn.destroy', { column: this.column });

    sheet.removeColumn({
      id: 'utilityColumn'
    });

    eventBus.fire('utilityColumn.destroyed', { column: this.column });

    this.column = null;
  }, this);
}

UtilityColumn.$inject = [ 'eventBus', 'sheet' ];

module.exports = UtilityColumn;


UtilityColumn.prototype.getColumn = function() {
  return this.column;
};

},{}],305:[function(_dereq_,module,exports){
'use strict';

var domClasses = _dereq_(261);

function UtilityColumnRenderer(eventBus, utilityColumn) {

  eventBus.on('cell.render', function(event) {
    if (event.data.column === utilityColumn.getColumn() && !event.data.row.isFoot) {
      event.gfx.childNodes[0].textContent = event.data.content;
      domClasses(event.gfx).add(event.data.row.isHead ? 'hit' : 'number');

      event.gfx.style.width = '45px';
    }
  });
}

UtilityColumnRenderer.$inject = [
  'eventBus',
  'utilityColumn'
];

module.exports = UtilityColumnRenderer;

},{"261":261}],306:[function(_dereq_,module,exports){
'use strict';

var inherits = _dereq_(126);

var RuleProvider = _dereq_(313);

/**
 * LineNumber specific modeling rule
 */
function UtilityColumnRules(eventBus, utilityColumn) {
  RuleProvider.call(this, eventBus);

  this._utilityColumn = utilityColumn;
}

inherits(UtilityColumnRules, RuleProvider);

UtilityColumnRules.$inject = [ 'eventBus', 'utilityColumn' ];

module.exports = UtilityColumnRules;

UtilityColumnRules.prototype.init = function() {
  var self = this;
  this.addRule('cell.edit', function(context) {
    if (context.column === self._utilityColumn.getColumn()) {
      return false;
    }
  });

};

},{"126":126,"313":313}],307:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'utilityColumn', 'utilityColumnRules', 'utilityColumnRenderer' ],
  __depends__: [
    _dereq_(311),
    _dereq_(315)
  ],
  utilityColumn: [ 'type', _dereq_(304) ],
  utilityColumnRules: [ 'type', _dereq_(306) ],
  utilityColumnRenderer: [ 'type', _dereq_(305) ]
};

},{"304":304,"305":305,"306":306,"311":311,"315":315}],308:[function(_dereq_,module,exports){
'use strict';

var assign = _dereq_(250),
    inherits = _dereq_(126);

function Base() {
  Object.defineProperty(this, 'businessObject', {
    writable: true
  });
}

function Table() {
  Base.call(this);
}

inherits(Table, Base);

function Row() {
  Base.call(this);
}

inherits(Row, Base);

function Column() {
  Base.call(this);
}

inherits(Column, Base);


var types = {
  table: Table,
  row: Row,
  column: Column
};

/**
 * Creates a new model element of the specified type
 *
 * @method create
 *
 * @example
 *
 * var shape1 = Model.create('shape', { x: 10, y: 10, width: 100, height: 100 });
 * var shape2 = Model.create('shape', { x: 210, y: 210, width: 100, height: 100 });
 *
 * var connection = Model.create('connection', { waypoints: [ { x: 110, y: 55 }, {x: 210, y: 55 } ] });
 *
 * @param  {String} type lower-cased model name
 * @param  {Object} attrs attributes to initialize the new model instance with
 *
 * @return {Base} the new model instance
 */
module.exports.create = function(type, attrs) {
  var Type = types[type];
  if (!Type) {
    throw new Error('unknown type: <' + type + '>');
  }
  return assign(new Type(), attrs);
};


module.exports.Table = Table;
module.exports.Row = Row;
module.exports.Column = Column;

},{"126":126,"250":250}],309:[function(_dereq_,module,exports){
'use strict';

var forEach = _dereq_(136),
    isFunction = _dereq_(242),
    isArray = _dereq_(241),
    isNumber = _dereq_(244);


var DEFAULT_PRIORITY = 1000;


function isObject(element) {
  return typeof element === 'object';
}

/**
 * A utility that can be used to plug-in into the command execution for
 * extension and/or validation.
 *
 * @param {EventBus} eventBus
 *
 * @example
 *
 * var inherits = require('inherits');
 *
 * var CommandInterceptor = require('diagram-js/lib/command/CommandInterceptor');
 *
 * function CommandLogger(eventBus) {
 *   CommandInterceptor.call(this, eventBus);
 *
 *   this.preExecute(function(event) {
 *     console.log('command pre-execute', event);
 *   });
 * }
 *
 * inherits(CommandLogger, CommandInterceptor);
 *
 */
function CommandInterceptor(eventBus) {
  this._eventBus = eventBus;
}

CommandInterceptor.$inject = [ 'eventBus' ];

module.exports = CommandInterceptor;

function unwrapEvent(fn, that) {
  return function(event) {
    return fn.call(that || null, event.context, event.command, event);
  };
}

/**
 * Register an interceptor for a command execution
 *
 * @param {String|Array<String>} [events] list of commands to register on
 * @param {String} [hook] command hook, i.e. preExecute, executed to listen on
 * @param {Number} [priority] the priority on which to hook into the execution
 * @param {Function} handlerFn interceptor to be invoked with (event)
 * @param {Boolean} unwrap if true, unwrap the event and pass (context, command, event) to the
 *                          listener instead
 * @param {Object} [that] Pass context (`this`) to the handler function
 */
CommandInterceptor.prototype.on = function(events, hook, priority, handlerFn, unwrap, that) {

  if (isFunction(hook) || isNumber(hook)) {
    that = unwrap;
    unwrap = handlerFn;
    handlerFn = priority;
    priority = hook;
    hook = null;
  }

  if (isFunction(priority)) {
    that = unwrap;
    unwrap = handlerFn;
    handlerFn = priority;
    priority = DEFAULT_PRIORITY;
  }

  if (isObject(unwrap)) {
    that = unwrap;
    unwrap = false;
  }

  if (!isFunction(handlerFn)) {
    throw new Error('handlerFn must be a function');
  }

  if (!isArray(events)) {
    events = [ events ];
  }

  var eventBus = this._eventBus;

  forEach(events, function(event) {
    // concat commandStack(.event)?(.hook)?
    var fullEvent = [ 'commandStack', event, hook ].filter(function(e) { return e; }).join('.');

    eventBus.on(fullEvent, priority, unwrap ? unwrapEvent(handlerFn, that) : handlerFn, that);
  });
};


var hooks = [
  'canExecute',
  'preExecute',
  'preExecuted',
  'execute',
  'executed',
  'postExecute',
  'postExecuted',
  'revert',
  'reverted'
];

/*
 * Install hook shortcuts
 *
 * This will generate the CommandInterceptor#(preExecute|...|reverted) methods
 * which will in term forward to CommandInterceptor#on.
 */
forEach(hooks, function(hook) {

  /**
   * {canExecute|preExecute|preExecuted|execute|executed|postExecute|postExecuted|revert|reverted}
   *
   * A named hook for plugging into the command execution
   *
   * @param {String|Array<String>} [events] list of commands to register on
   * @param {Number} [priority] the priority on which to hook into the execution
   * @param {Function} handlerFn interceptor to be invoked with (event)
   * @param {Boolean} [unwrap=false] if true, unwrap the event and pass (context, command, event) to the
   *                          listener instead
   * @param {Object} [that] Pass context (`this`) to the handler function
   */
  CommandInterceptor.prototype[hook] = function(events, priority, handlerFn, unwrap, that) {

    if (isFunction(events) || isNumber(events)) {
      that = unwrap;
      unwrap = handlerFn;
      handlerFn = priority;
      priority = events;
      events = null;
    }

    this.on(events, hook, priority, handlerFn, unwrap, that);
  };
});

},{"136":136,"241":241,"242":242,"244":244}],310:[function(_dereq_,module,exports){
'use strict';

var unique = _dereq_(130),
    isArray = _dereq_(241),
    assign = _dereq_(250);

var InternalEvent = _dereq_(312).Event;


/**
 * A service that offers un- and redoable execution of commands.
 *
 * The command stack is responsible for executing modeling actions
 * in a un- and redoable manner. To do this it delegates the actual
 * command execution to {@link CommandHandler}s.
 *
 * Command handlers provide {@link CommandHandler#execute(ctx)} and
 * {@link CommandHandler#revert(ctx)} methods to un- and redo a command
 * identified by a command context.
 *
 *
 * ## Life-Cycle events
 *
 * In the process the command stack fires a number of life-cycle events
 * that other components to participate in the command execution.
 *
 *    * preExecute
 *    * preExecuted
 *    * execute
 *    * executed
 *    * postExecute
 *    * postExecuted
 *    * revert
 *    * reverted
 *
 * A special event is used for validating, whether a command can be
 * performed prior to its execution.
 *
 *    * canExecute
 *
 * Each of the events is fired as `commandStack.{eventName}` and
 * `commandStack.{commandName}.{eventName}`, respectively. This gives
 * components fine grained control on where to hook into.
 *
 * The event object fired transports `command`, the name of the
 * command and `context`, the command context.
 *
 *
 * ## Creating Command Handlers
 *
 * Command handlers should provide the {@link CommandHandler#execute(ctx)}
 * and {@link CommandHandler#revert(ctx)} methods to implement
 * redoing and undoing of a command. They must ensure undo is performed
 * properly in order not to break the undo chain.
 *
 * Command handlers may execute other modeling operations (and thus
 * commands) in their `preExecute` and `postExecute` phases. The command
 * stack will properly group all commands together into a logical unit
 * that may be re- and undone atomically.
 *
 * Command handlers must not execute other commands from within their
 * core implementation (`execute`, `revert`).
 *
 *
 * ## Change Tracking
 *
 * During the execution of the CommandStack it will keep track of all
 * elements that have been touched during the command's execution.
 *
 * At the end of the CommandStack execution it will notify interested
 * components via an 'elements.changed' event with all the dirty
 * elements.
 *
 * The event can be picked up by components that are interested in the fact
 * that elements have been changed. One use case for this is updating
 * their graphical representation after moving / resizing or deletion.
 *
 *
 * @param {EventBus} eventBus
 * @param {Injector} injector
 */
function CommandStack(eventBus, injector) {

  /**
   * A map of all registered command handlers.
   *
   * @type {Object}
   */
  this._handlerMap = {};

  /**
   * A stack containing all re/undoable actions on the diagram
   *
   * @type {Array<Object>}
   */
  this._stack = [];

  /**
   * The current index on the stack
   *
   * @type {Number}
   */
  this._stackIdx = -1;

  /**
   * Current active commandStack execution
   *
   * @type {Object}
   */
  this._currentExecution = {
    actions: [],
    dirty: []
  };


  this._injector = injector;
  this._eventBus = eventBus;

  this._uid = 1;

  eventBus.on([ 'diagram.destroy', 'diagram.clear' ], this.clear, this);
}

CommandStack.$inject = [ 'eventBus', 'injector' ];

module.exports = CommandStack;


/**
 * Execute a command
 *
 * @param {String} command the command to execute
 * @param {Object} context the environment to execute the command in
 */
CommandStack.prototype.execute = function(command, context) {
  if (!command) {
    throw new Error('command required');
  }

  var action = { command: command, context: context };

  this._pushAction(action);
  this._internalExecute(action);
  this._popAction(action);
};


/**
 * Ask whether a given command can be executed.
 *
 * Implementors may hook into the mechanism on two ways:
 *
 *   * in event listeners:
 *
 *     Users may prevent the execution via an event listener.
 *     It must prevent the default action for `commandStack.(<command>.)canExecute` events.
 *
 *   * in command handlers:
 *
 *     If the method {@link CommandHandler#canExecute} is implemented in a handler
 *     it will be called to figure out whether the execution is allowed.
 *
 * @param  {String} command the command to execute
 * @param  {Object} context the environment to execute the command in
 *
 * @return {Boolean} true if the command can be executed
 */
CommandStack.prototype.canExecute = function(command, context) {

  var action = { command: command, context: context };

  var handler = this._getHandler(command);

  var result = this._fire(command, 'canExecute', action);

  // handler#canExecute will only be called if no listener
  // decided on a result already
  if (result === undefined) {
    if (!handler) {
      return false;
    }

    if (handler.canExecute) {
      result = handler.canExecute(context);
    }
  }

  return result;
};


/**
 * Clear the command stack, erasing all undo / redo history
 */
CommandStack.prototype.clear = function() {
  this._stack.length = 0;
  this._stackIdx = -1;

  this._fire('changed');
};


/**
 * Undo last command(s)
 */
CommandStack.prototype.undo = function() {
  var action = this._getUndoAction(),
      next;

  if (action) {
    this._pushAction(action);

    while (action) {
      this._internalUndo(action);
      next = this._getUndoAction();

      if (!next || next.id !== action.id) {
        break;
      }

      action = next;
    }

    this._popAction();
  }
};


/**
 * Redo last command(s)
 */
CommandStack.prototype.redo = function() {
  var action = this._getRedoAction(),
      next;

  if (action) {
    this._pushAction(action);

    while (action) {
      this._internalExecute(action, true);
      next = this._getRedoAction();

      if (!next || next.id !== action.id) {
        break;
      }

      action = next;
    }

    this._popAction();
  }
};


/**
 * Register a handler instance with the command stack
 *
 * @param {String} command
 * @param {CommandHandler} handler
 */
CommandStack.prototype.register = function(command, handler) {
  this._setHandler(command, handler);
};


/**
 * Register a handler type with the command stack
 * by instantiating it and injecting its dependencies.
 *
 * @param {String} command
 * @param {Function} a constructor for a {@link CommandHandler}
 */
CommandStack.prototype.registerHandler = function(command, handlerCls) {

  if (!command || !handlerCls) {
    throw new Error('command and handlerCls must be defined');
  }

  var handler = this._injector.instantiate(handlerCls);
  this.register(command, handler);
};

CommandStack.prototype.canUndo = function() {
  return !!this._getUndoAction();
};

CommandStack.prototype.canRedo = function() {
  return !!this._getRedoAction();
};

////// stack access  //////////////////////////////////////

CommandStack.prototype._getRedoAction = function() {
  return this._stack[this._stackIdx + 1];
};


CommandStack.prototype._getUndoAction = function() {
  return this._stack[this._stackIdx];
};


////// internal functionality /////////////////////////////

CommandStack.prototype._internalUndo = function(action) {
  var self = this;

  var command = action.command,
      context = action.context;

  var handler = this._getHandler(command);

  // guard against illegal nested command stack invocations
  this._atomicDo(function() {
    self._fire(command, 'revert', action);

    if (handler.revert) {
      self._markDirty(handler.revert(context));
    }

    self._revertedAction(action);

    self._fire(command, 'reverted', action);
  });
};


CommandStack.prototype._fire = function(command, qualifier, event) {
  if (arguments.length < 3) {
    event = qualifier;
    qualifier = null;
  }

  var names = qualifier ? [ command + '.' + qualifier, qualifier ] : [ command ],
      i, name, result;

  event = assign(new InternalEvent(), event);

  for (i = 0; (name = names[i]); i++) {
    result = this._eventBus.fire('commandStack.' + name, event);

    if (event.cancelBubble) {
      break;
    }
  }

  return result;
};

CommandStack.prototype._createId = function() {
  return this._uid++;
};

CommandStack.prototype._atomicDo = function(fn) {

  var execution = this._currentExecution;

  execution.atomic = true;

  try {
    fn();
  } finally {
    execution.atomic = false;
  }
};

CommandStack.prototype._internalExecute = function(action, redo) {
  var self = this;

  var command = action.command,
      context = action.context;

  var handler = this._getHandler(command);

  if (!handler) {
    throw new Error('no command handler registered for <' + command + '>');
  }

  this._pushAction(action);

  if (!redo) {
    this._fire(command, 'preExecute', action);

    if (handler.preExecute) {
      handler.preExecute(context);
    }

    this._fire(command, 'preExecuted', action);
  }

  // guard against illegal nested command stack invocations
  this._atomicDo(function() {

    self._fire(command, 'execute', action);

    if (handler.execute) {
      // actual execute + mark return results as dirty
      self._markDirty(handler.execute(context));
    }

    // log to stack
    self._executedAction(action, redo);

    self._fire(command, 'executed', action);
  });

  if (!redo) {
    this._fire(command, 'postExecute', action);

    if (handler.postExecute) {
      handler.postExecute(context);
    }

    this._fire(command, 'postExecuted', action);
  }

  this._popAction(action);
};


CommandStack.prototype._pushAction = function(action) {

  var execution = this._currentExecution,
      actions = execution.actions;

  var baseAction = actions[0];

  if (execution.atomic) {
    throw new Error('illegal invocation in <execute> or <revert> phase (action: ' + action.command + ')');
  }

  if (!action.id) {
    action.id = (baseAction && baseAction.id) || this._createId();
  }

  actions.push(action);
};


CommandStack.prototype._popAction = function() {
  var execution = this._currentExecution,
      actions = execution.actions,
      dirty = execution.dirty;

  actions.pop();

  if (!actions.length) {
    this._eventBus.fire('elements.changed', { elements: unique(dirty) });

    dirty.length = 0;

    this._fire('changed');
  }
};


CommandStack.prototype._markDirty = function(elements) {
  var execution = this._currentExecution;

  if (!elements) {
    return;
  }

  elements = isArray(elements) ? elements : [ elements ];

  execution.dirty = execution.dirty.concat(elements);
};


CommandStack.prototype._executedAction = function(action, redo) {
  var stackIdx = ++this._stackIdx;

  if (!redo) {
    this._stack.splice(stackIdx, this._stack.length, action);
  }
};


CommandStack.prototype._revertedAction = function(action) {
  this._stackIdx--;
};


CommandStack.prototype._getHandler = function(command) {
  return this._handlerMap[command];
};

CommandStack.prototype._setHandler = function(command, handler) {
  if (!command || !handler) {
    throw new Error('command and handler required');
  }

  if (this._handlerMap[command]) {
    throw new Error('overriding handler for command <' + command + '>');
  }

  this._handlerMap[command] = handler;
};

},{"130":130,"241":241,"250":250,"312":312}],311:[function(_dereq_,module,exports){
module.exports = {
  commandStack: [ 'type', _dereq_(310) ]
};

},{"310":310}],312:[function(_dereq_,module,exports){
'use strict';

var isFunction = _dereq_(242),
    isArray = _dereq_(241),
    isNumber = _dereq_(244),
    bind = _dereq_(142),
    assign = _dereq_(250);

var FN_REF = '__fn';

var DEFAULT_PRIORITY = 1000;

var slice = Array.prototype.slice;

/**
 * A general purpose event bus.
 *
 * This component is used to communicate across a diagram instance.
 * Other parts of a diagram can use it to listen to and broadcast events.
 *
 *
 * ## Registering for Events
 *
 * The event bus provides the {@link EventBus#on} and {@link EventBus#once}
 * methods to register for events. {@link EventBus#off} can be used to
 * remove event registrations. Listeners receive an instance of {@link Event}
 * as the first argument. It allows them to hook into the event execution.
 *
 * ```javascript
 *
 * // listen for event
 * eventBus.on('foo', function(event) {
 *
 *   // access event type
 *   event.type; // 'foo'
 *
 *   // stop propagation to other listeners
 *   event.stopPropagation();
 *
 *   // prevent event default
 *   event.preventDefault();
 * });
 *
 * // listen for event with custom payload
 * eventBus.on('bar', function(event, payload) {
 *   console.log(payload);
 * });
 *
 * // listen for event returning value
 * eventBus.on('foobar', function(event) {
 *
 *   // stop event propagation + prevent default
 *   return false;
 *
 *   // stop event propagation + return custom result
 *   return {
 *     complex: 'listening result'
 *   };
 * });
 *
 *
 * // listen with custom priority (default=1000, higher is better)
 * eventBus.on('priorityfoo', 1500, function(event) {
 *   console.log('invoked first!');
 * });
 *
 *
 * // listen for event and pass the context (`this`)
 * eventBus.on('foobar', function(event) {
 *   this.foo();
 * }, this);
 * ```
 *
 *
 * ## Emitting Events
 *
 * Events can be emitted via the event bus using {@link EventBus#fire}.
 *
 * ```javascript
 *
 * // false indicates that the default action
 * // was prevented by listeners
 * if (eventBus.fire('foo') === false) {
 *   console.log('default has been prevented!');
 * };
 *
 *
 * // custom args + return value listener
 * eventBus.on('sum', function(event, a, b) {
 *   return a + b;
 * });
 *
 * // you can pass custom arguments + retrieve result values.
 * var sum = eventBus.fire('sum', 1, 2);
 * console.log(sum); // 3
 * ```
 */
function EventBus() {
  this._listeners = {};

  // cleanup on destroy on lowest priority to allow
  // message passing until the bitter end
  this.on('diagram.destroy', 1, this._destroy, this);
}

module.exports = EventBus;


/**
 * Register an event listener for events with the given name.
 *
 * The callback will be invoked with `event, ...additionalArguments`
 * that have been passed to {@link EventBus#fire}.
 *
 * Returning false from a listener will prevent the events default action
 * (if any is specified). To stop an event from being processed further in
 * other listeners execute {@link Event#stopPropagation}.
 *
 * Returning anything but `undefined` from a listener will stop the listener propagation.
 *
 * @param {String|Array<String>} events
 * @param {Number} [priority=1000] the priority in which this listener is called, larger is higher
 * @param {Function} callback
 * @param {Object} [that] Pass context (`this`) to the callback
 */
EventBus.prototype.on = function(events, priority, callback, that) {

  events = isArray(events) ? events : [ events ];

  if (isFunction(priority)) {
    that = callback;
    callback = priority;
    priority = DEFAULT_PRIORITY;
  }

  if (!isNumber(priority)) {
    throw new Error('priority must be a number');
  }

  var actualCallback = callback;

  if (that) {
    actualCallback = bind(callback, that);

    // make sure we remember and are able to remove
    // bound callbacks via {@link #off} using the original
    // callback
    actualCallback[FN_REF] = callback[FN_REF] || callback;
  }

  var self = this,
      listener = { priority: priority, callback: actualCallback };

  events.forEach(function(e) {
    self._addListener(e, listener);
  });
};


/**
 * Register an event listener that is executed only once.
 *
 * @param {String} event the event name to register for
 * @param {Function} callback the callback to execute
 * @param {Object} [that] Pass context (`this`) to the callback
 */
EventBus.prototype.once = function(event, priority, callback, that) {
  var self = this;

  if (isFunction(priority)) {
    that = callback;
    callback = priority;
    priority = DEFAULT_PRIORITY;
  }

  if (!isNumber(priority)) {
    throw new Error('priority must be a number');
  }

  function wrappedCallback() {
    self.off(event, wrappedCallback);
    return callback.apply(that, arguments);
  }

  // make sure we remember and are able to remove
  // bound callbacks via {@link #off} using the original
  // callback
  wrappedCallback[FN_REF] = callback;

  this.on(event, priority, wrappedCallback);
};


/**
 * Removes event listeners by event and callback.
 *
 * If no callback is given, all listeners for a given event name are being removed.
 *
 * @param {String} event
 * @param {Function} [callback]
 */
EventBus.prototype.off = function(event, callback) {
  var listeners = this._getListeners(event),
      listener,
      listenerCallback,
      idx;

  if (callback) {

    // move through listeners from back to front
    // and remove matching listeners
    for (idx = listeners.length - 1; (listener = listeners[idx]); idx--) {
      listenerCallback = listener.callback;

      if (listenerCallback === callback || listenerCallback[FN_REF] === callback) {
        listeners.splice(idx, 1);
      }
    }
  } else {
    // clear listeners
    listeners.length = 0;
  }
};


/**
 * Fires a named event.
 *
 * @example
 *
 * // fire event by name
 * events.fire('foo');
 *
 * // fire event object with nested type
 * var event = { type: 'foo' };
 * events.fire(event);
 *
 * // fire event with explicit type
 * var event = { x: 10, y: 20 };
 * events.fire('element.moved', event);
 *
 * // pass additional arguments to the event
 * events.on('foo', function(event, bar) {
 *   alert(bar);
 * });
 *
 * events.fire({ type: 'foo' }, 'I am bar!');
 *
 * @param {String} [name] the optional event name
 * @param {Object} [event] the event object
 * @param {...Object} additional arguments to be passed to the callback functions
 *
 * @return {Boolean} the events return value, if specified or false if the
 *                   default action was prevented by listeners
 */
EventBus.prototype.fire = function(type, data) {

  var event,
      listeners,
      returnValue,
      args;

  args = slice.call(arguments);

  if (typeof type === 'object') {
    event = type;
    type = event.type;
  }

  if (!type) {
    throw new Error('no event type specified');
  }

  listeners = this._listeners[type];

  if (!listeners) {
    return;
  }

  // we make sure we fire instances of our home made
  // events here. We wrap them only once, though
  if (data instanceof Event) {
    // we are fine, we alread have an event
    event = data;
  } else {
    event = new Event();
    event.init(data);
  }

  // ensure we pass the event as the first parameter
  args[0] = event;

  // original event type (in case we delegate)
  var originalType = event.type;

  // update event type before delegation
  if (type !== originalType) {
    event.type = type;
  }

  try {
    returnValue = this._invokeListeners(event, args, listeners);
  } finally {
    // reset event type after delegation
    if (type !== originalType) {
      event.type = originalType;
    }
  }

  // set the return value to false if the event default
  // got prevented and no other return value exists
  if (returnValue === undefined && event.defaultPrevented) {
    returnValue = false;
  }

  return returnValue;
};


EventBus.prototype.handleError = function(error) {
  return this.fire('error', { error: error }) === false;
};


EventBus.prototype._destroy = function() {
  this._listeners = {};
};

EventBus.prototype._invokeListeners = function(event, args, listeners) {

  var idx,
      listener,
      returnValue;

  for (idx = 0; (listener = listeners[idx]); idx++) {

    // handle stopped propagation
    if (event.cancelBubble) {
      break;
    }

    returnValue = this._invokeListener(event, args, listener);
  }

  return returnValue;
};

EventBus.prototype._invokeListener = function(event, args, listener) {

  var returnValue;

  try {
    // returning false prevents the default action
    returnValue = invokeFunction(listener.callback, args);

    // stop propagation on return value
    if (returnValue !== undefined) {
      event.returnValue = returnValue;
      event.stopPropagation();
    }

    // prevent default on return false
    if (returnValue === false) {
      event.preventDefault();
    }
  } catch (e) {
    if (!this.handleError(e)) {
      console.error('unhandled error in event listener');
      console.error(e.stack);

      throw e;
    }
  }

  return returnValue;
};

/*
 * Add new listener with a certain priority to the list
 * of listeners (for the given event).
 *
 * The semantics of listener registration / listener execution are
 * first register, first serve: New listeners will always be inserted
 * after existing listeners with the same priority.
 *
 * Example: Inserting two listeners with priority 1000 and 1300
 *
 *    * before: [ 1500, 1500, 1000, 1000 ]
 *    * after: [ 1500, 1500, (new=1300), 1000, 1000, (new=1000) ]
 *
 * @param {String} event
 * @param {Object} listener { priority, callback }
 */
EventBus.prototype._addListener = function(event, newListener) {

  var listeners = this._getListeners(event),
      existingListener,
      idx;

  // ensure we order listeners by priority from
  // 0 (high) to n > 0 (low)
  for (idx = 0; (existingListener = listeners[idx]); idx++) {
    if (existingListener.priority < newListener.priority) {

      // prepend newListener at before existingListener
      listeners.splice(idx, 0, newListener);
      return;
    }
  }

  listeners.push(newListener);
};


EventBus.prototype._getListeners = function(name) {
  var listeners = this._listeners[name];

  if (!listeners) {
    this._listeners[name] = listeners = [];
  }

  return listeners;
};


/**
 * A event that is emitted via the event bus.
 */
function Event() { }

module.exports.Event = Event;

Event.prototype.stopPropagation = function() {
  this.cancelBubble = true;
};

Event.prototype.preventDefault = function() {
  this.defaultPrevented = true;
};

Event.prototype.init = function(data) {
  assign(this, data || {});
};


/**
 * Invoke function. Be fast...
 *
 * @param {Function} fn
 * @param {Array<Object>} args
 *
 * @return {Any}
 */
function invokeFunction(fn, args) {
  return fn.apply(null, args);
}

},{"142":142,"241":241,"242":242,"244":244,"250":250}],313:[function(_dereq_,module,exports){

'use strict';

var inherits = _dereq_(126);

var CommandInterceptor = _dereq_(309);

/**
 * A basic provider that may be extended to implement modeling rules.
 *
 * Extensions should implement the init method to actually add their custom
 * modeling checks. Checks may be added via the #addRule(action, fn) method.
 *
 * @param {EventBus} eventBus
 */
function RuleProvider(eventBus) {
  CommandInterceptor.call(this, eventBus);

  this.init();
}

RuleProvider.$inject = [ 'eventBus' ];

inherits(RuleProvider, CommandInterceptor);

module.exports = RuleProvider;


/**
 * Adds a modeling rule for the given action, implemented through
 * a callback function.
 *
 * The function will receive the modeling specific action context
 * to perform its check. It must return `false` to disallow the
 * action from happening or `true` to allow the action.
 *
 * A rule provider may pass over the evaluation to lower priority
 * rules by returning return nothing (or <code>undefined</code>).
 *
 * @example
 *
 * ResizableRules.prototype.init = function() {
 *
 *   \/**
 *    * Return `true`, `false` or nothing to denote
 *    * _allowed_, _not allowed_ and _continue evaluating_.
 *    *\/
 *   this.addRule('shape.resize', function(context) {
 *
 *     var shape = context.shape;
 *
 *     if (!context.newBounds) {
 *       // check general resizability
 *       if (!shape.resizable) {
 *         return false;
 *       }
 *
 *       // not returning anything (read: undefined)
 *       // will continue the evaluation of other rules
 *       // (with lower priority)
 *       return;
 *     } else {
 *       // element must have minimum size of 10*10 points
 *       return context.newBounds.width > 10 && context.newBounds.height > 10;
 *     }
 *   });
 * };
 *
 * @param {String|Array<String>} actions the identifier for the modeling action to check
 * @param {Number} [priority] the priority at which this rule is being applied
 * @param {Function} fn the callback function that performs the actual check
 */
RuleProvider.prototype.addRule = function(actions, priority, fn) {

  var self = this;

  if (typeof actions === 'string') {
    actions = [ actions ];
  }

  actions.forEach(function(action) {

    self.canExecute(action, priority, function(context, action, event) {
      return fn(context);
    }, true);
  });
};

/**
 * Implement this method to add new rules during provider initialization.
 */
RuleProvider.prototype.init = function() {};
},{"126":126,"309":309}],314:[function(_dereq_,module,exports){
'use strict';

/**
 * A service that provides rules for certain diagram actions.
 *
 * The default implementation will hook into the {@link CommandStack}
 * to perform the actual rule evaluation. Make sure to provide the
 * `commandStack` service with this module if you plan to use it.
 *
 * Together with this implementation you may use the {@link RuleProvider}
 * to implement your own rule checkers.
 *
 * This module is ment to be easily replaced, thus the tiny foot print.
 *
 * @param {Injector} injector
 */
function Rules(injector) {
  this._commandStack = injector.get('commandStack', false);
}

Rules.$inject = [ 'injector' ];

module.exports = Rules;


/**
 * Returns whether or not a given modeling action can be executed
 * in the specified context.
 *
 * This implementation will respond with allow unless anyone
 * objects.
 *
 * @param {String} action the action to be checked
 * @param {Object} [context] the context to check the action in
 *
 * @return {Boolean} returns true, false or null depending on whether the
 *                   operation is allowed, not allowed or should be ignored.
 */
Rules.prototype.allowed = function(action, context) {
  var allowed = true;

  var commandStack = this._commandStack;

  if (commandStack) {
    allowed = commandStack.canExecute(action, context);
  }

  // map undefined to true, i.e. no rules
  return allowed === undefined ? true : allowed;
};
},{}],315:[function(_dereq_,module,exports){
module.exports = {
  __init__: [ 'rules' ],
  rules: [ 'type', _dereq_(314) ]
};

},{"314":314}],316:[function(_dereq_,module,exports){
'use strict';

function __preventDefault(event) {
  return event && event.preventDefault();
}

function __stopPropagation(event, immediate) {
  if (!event) {
    return;
  }

  if (event.stopPropagation) {
    event.stopPropagation();
  }

  if (immediate && event.stopImmediatePropagation) {
    event.stopImmediatePropagation();
  }
}


function getOriginal(event) {
  return event.originalEvent || event.srcEvent;
}

module.exports.getOriginal = getOriginal;


function stopEvent(event, immediate) {
  stopPropagation(event, immediate);
  preventDefault(event);
}

module.exports.stopEvent = stopEvent;


function preventDefault(event) {
  __preventDefault(event);
  __preventDefault(getOriginal(event));
}

module.exports.preventDefault = preventDefault;


function stopPropagation(event, immediate) {
  __stopPropagation(event, immediate);
  __stopPropagation(getOriginal(event), immediate);
}

module.exports.stopPropagation = stopPropagation;


function toPoint(event) {

  if (event.pointers && event.pointers.length) {
    event = event.pointers[0];
  }

  if (event.touches && event.touches.length) {
    event = event.touches[0];
  }

  return event ? {
    x: event.clientX,
    y: event.clientY
  } : null;
}

module.exports.toPoint = toPoint;

},{}],317:[function(_dereq_,module,exports){
'use strict';

var getOriginalEvent = _dereq_(316).getOriginal;

var isMac = _dereq_(318).isMac;


function isPrimaryButton(event) {
  // button === 0 -> left áka primary mouse button
  return !(getOriginalEvent(event) || event).button;
}

module.exports.isPrimaryButton = isPrimaryButton;

module.exports.isMac = isMac;

module.exports.hasPrimaryModifier = function(event) {
  var originalEvent = getOriginalEvent(event) || event;

  if (!isPrimaryButton(event)) {
    return false;
  }

  // Use alt as primary modifier key for mac OS
  if (isMac()) {
    return originalEvent.metaKey;
  } else {
    return originalEvent.ctrlKey;
  }
};


module.exports.hasSecondaryModifier = function(event) {
  var originalEvent = getOriginalEvent(event) || event;

  return isPrimaryButton(event) && originalEvent.shiftKey;
};

},{"316":316,"318":318}],318:[function(_dereq_,module,exports){
'use strict';

module.exports.isMac = function isMac() {
  return (/mac/i).test(navigator.platform);
};
},{}],319:[function(_dereq_,module,exports){
/**
 * Tiny stack for browser or server
 *
 * @author Jason Mulligan <jason.mulligan@avoidwork.com>
 * @copyright 2014 Jason Mulligan
 * @license BSD-3 <https://raw.github.com/avoidwork/tiny-stack/master/LICENSE>
 * @link http://avoidwork.github.io/tiny-stack
 * @module tiny-stack
 * @version 0.1.0
 */

( function ( global ) {

"use strict";

/**
 * TinyStack
 *
 * @constructor
 */
function TinyStack () {
	this.data = [null];
	this.top  = 0;
}

/**
 * Clears the stack
 *
 * @method clear
 * @memberOf TinyStack
 * @return {Object} {@link TinyStack}
 */
TinyStack.prototype.clear = function clear () {
	this.data = [null];
	this.top  = 0;

	return this;
};

/**
 * Gets the size of the stack
 *
 * @method length
 * @memberOf TinyStack
 * @return {Number} Size of stack
 */
TinyStack.prototype.length = function length () {
	return this.top;
};

/**
 * Gets the item at the top of the stack
 *
 * @method peek
 * @memberOf TinyStack
 * @return {Mixed} Item at the top of the stack
 */
TinyStack.prototype.peek = function peek () {
	return this.data[this.top];
};

/**
 * Gets & removes the item at the top of the stack
 *
 * @method pop
 * @memberOf TinyStack
 * @return {Mixed} Item at the top of the stack
 */
TinyStack.prototype.pop = function pop () {
	if ( this.top > 0 ) {
		this.top--;

		return this.data.pop();
	}
	else {
		return undefined;
	}
};

/**
 * Pushes an item onto the stack
 *
 * @method push
 * @memberOf TinyStack
 * @return {Object} {@link TinyStack}
 */
TinyStack.prototype.push = function push ( arg ) {
	this.data[++this.top] = arg;

	return this;
};

/**
 * TinyStack factory
 *
 * @method factory
 * @return {Object} {@link TinyStack}
 */
function factory () {
	return new TinyStack();
}

// Node, AMD & window supported
if ( typeof exports != "undefined" ) {
	module.exports = factory;
}
else if ( typeof define == "function" ) {
	define( function () {
		return factory;
	} );
}
else {
	global.stack = factory;
}
} )( this );

},{}],320:[function(_dereq_,module,exports){
/**
 * append utility
 */

module.exports = append;

var appendTo = _dereq_(321);

/**
 * Append a node to an element
 *
 * @param  {SVGElement} element
 * @param  {SVGElement} node
 *
 * @return {SVGElement} the element
 */
function append(element, node) {
  appendTo(node, element);
  return element;
}
},{"321":321}],321:[function(_dereq_,module,exports){
/**
 * appendTo utility
 */
module.exports = appendTo;

var ensureImported = _dereq_(330);

/**
 * Append a node to a target element and return the appended node.
 *
 * @param  {SVGElement} element
 * @param  {SVGElement} node
 *
 * @return {SVGElement} the appended node
 */
function appendTo(element, target) {
  target.appendChild(ensureImported(element, target));
  return element;
}
},{"330":330}],322:[function(_dereq_,module,exports){
/**
 * attribute accessor utility
 */

module.exports = attr;


var LENGTH_ATTR = 2;

var CSS_PROPERTIES = {
  'alignment-baseline': 1,
  'baseline-shift': 1,
  'clip': 1,
  'clip-path': 1,
  'clip-rule': 1,
  'color': 1,
  'color-interpolation': 1,
  'color-interpolation-filters': 1,
  'color-profile': 1,
  'color-rendering': 1,
  'cursor': 1,
  'direction': 1,
  'display': 1,
  'dominant-baseline': 1,
  'enable-background': 1,
  'fill': 1,
  'fill-opacity': 1,
  'fill-rule': 1,
  'filter': 1,
  'flood-color': 1,
  'flood-opacity': 1,
  'font': 1,
  'font-family': 1,
  'font-size': LENGTH_ATTR,
  'font-size-adjust': 1,
  'font-stretch': 1,
  'font-style': 1,
  'font-variant': 1,
  'font-weight': 1,
  'glyph-orientation-horizontal': 1,
  'glyph-orientation-vertical': 1,
  'image-rendering': 1,
  'kerning': 1,
  'letter-spacing': 1,
  'lighting-color': 1,
  'marker': 1,
  'marker-end': 1,
  'marker-mid': 1,
  'marker-start': 1,
  'mask': 1,
  'opacity': 1,
  'overflow': 1,
  'pointer-events': 1,
  'shape-rendering': 1,
  'stop-color': 1,
  'stop-opacity': 1,
  'stroke': 1,
  'stroke-dasharray': 1,
  'stroke-dashoffset': 1,
  'stroke-linecap': 1,
  'stroke-linejoin': 1,
  'stroke-miterlimit': 1,
  'stroke-opacity': 1,
  'stroke-width': LENGTH_ATTR,
  'text-anchor': 1,
  'text-decoration': 1,
  'text-rendering': 1,
  'unicode-bidi': 1,
  'visibility': 1,
  'word-spacing': 1,
  'writing-mode': 1
};


function getAttribute(node, name) {
  if (CSS_PROPERTIES[name]) {
    return node.style[name];
  } else {
    return node.getAttributeNS(null, name);
  }
}

function setAttribute(node, name, value) {
  var hyphenated = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

  var type = CSS_PROPERTIES[hyphenated];

  if (type) {
    // append pixel unit, unless present
    if (type === LENGTH_ATTR && typeof value === 'number') {
      value = String(value) + 'px';
    }

    node.style[hyphenated] = value;
  } else {
    node.setAttributeNS(null, name, value);
  }
}

function setAttributes(node, attrs) {

  var names = Object.keys(attrs), i, name;

  for (i = 0, name; (name = names[i]); i++) {
    setAttribute(node, name, attrs[name]);
  }
}

/**
 * Gets or sets raw attributes on a node.
 *
 * @param  {SVGElement} node
 * @param  {Object} [attrs]
 * @param  {String} [name]
 * @param  {String} [value]
 *
 * @return {String}
 */
function attr(node, name, value) {
  if (typeof name === 'string') {
    if (value !== undefined) {
      setAttribute(node, name, value);
    } else {
      return getAttribute(node, name);
    }
  } else {
    setAttributes(node, name);
  }

  return node;
}

},{}],323:[function(_dereq_,module,exports){
/**
 * Clear utility
 */
module.exports = classes;

var index = function(arr, obj) {
  if (arr.indexOf) {
    return arr.indexOf(obj);
  }


  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) {
      return i;
    }
  }

  return -1;
};

var re = /\s+/;

var toString = Object.prototype.toString;

function defined(o) {
  return typeof o !== 'undefined';
}

/**
 * Wrap `el` in a `ClassList`.
 *
 * @param {Element} el
 * @return {ClassList}
 * @api public
 */

function classes(el) {
  return new ClassList(el);
}

function ClassList(el) {
  if (!el || !el.nodeType) {
    throw new Error('A DOM element reference is required');
  }
  this.el = el;
  this.list = el.classList;
}

/**
 * Add class `name` if not already present.
 *
 * @param {String} name
 * @return {ClassList}
 * @api public
 */

ClassList.prototype.add = function(name) {

  // classList
  if (this.list) {
    this.list.add(name);
    return this;
  }

  // fallback
  var arr = this.array();
  var i = index(arr, name);
  if (!~i) {
    arr.push(name);
  }

  if (defined(this.el.className.baseVal)) {
    this.el.className.baseVal = arr.join(' ');
  } else {
    this.el.className = arr.join(' ');
  }

  return this;
};

/**
 * Remove class `name` when present, or
 * pass a regular expression to remove
 * any which match.
 *
 * @param {String|RegExp} name
 * @return {ClassList}
 * @api public
 */

ClassList.prototype.remove = function(name) {
  if ('[object RegExp]' === toString.call(name)) {
    return this.removeMatching(name);
  }

  // classList
  if (this.list) {
    this.list.remove(name);
    return this;
  }

  // fallback
  var arr = this.array();
  var i = index(arr, name);
  if (~i) {
    arr.splice(i, 1);
  }
  this.el.className.baseVal = arr.join(' ');
  return this;
};

/**
 * Remove all classes matching `re`.
 *
 * @param {RegExp} re
 * @return {ClassList}
 * @api private
 */

ClassList.prototype.removeMatching = function(re) {
  var arr = this.array();
  for (var i = 0; i < arr.length; i++) {
    if (re.test(arr[i])) {
      this.remove(arr[i]);
    }
  }
  return this;
};

/**
 * Toggle class `name`, can force state via `force`.
 *
 * For browsers that support classList, but do not support `force` yet,
 * the mistake will be detected and corrected.
 *
 * @param {String} name
 * @param {Boolean} force
 * @return {ClassList}
 * @api public
 */

ClassList.prototype.toggle = function(name, force) {
  // classList
  if (this.list) {
    if (defined(force)) {
      if (force !== this.list.toggle(name, force)) {
        this.list.toggle(name); // toggle again to correct
      }
    } else {
      this.list.toggle(name);
    }
    return this;
  }

  // fallback
  if (defined(force)) {
    if (!force) {
      this.remove(name);
    } else {
      this.add(name);
    }
  } else {
    if (this.has(name)) {
      this.remove(name);
    } else {
      this.add(name);
    }
  }

  return this;
};

/**
 * Return an array of classes.
 *
 * @return {Array}
 * @api public
 */

ClassList.prototype.array = function() {
  var className = this.el.getAttribute('class') || '';
  var str = className.replace(/^\s+|\s+$/g, '');
  var arr = str.split(re);
  if ('' === arr[0]) {
    arr.shift();
  }
  return arr;
};

/**
 * Check if class `name` is present.
 *
 * @param {String} name
 * @return {ClassList}
 * @api public
 */

ClassList.prototype.has =
ClassList.prototype.contains = function(name) {
  return (
    this.list ?
      this.list.contains(name) :
      !! ~index(this.array(), name)
  );
};

},{}],324:[function(_dereq_,module,exports){
/**
 * Clear utility
 */

module.exports = clear;


var remove = _dereq_(328);

/**
 * Removes all children from the given element
 *
 * @param  {DOMElement} element
 * @return {DOMElement} the element (for chaining)
 */
function clear(element) {
  var child;

  while ((child = element.firstChild)) {
    remove(child);
  }

  return element;
}
},{"328":328}],325:[function(_dereq_,module,exports){
/**
 * Create utility for SVG elements
 */

module.exports = create;


var attr = _dereq_(322);
var parse = _dereq_(332);
var ns = _dereq_(331);


/**
 * Create a specific type from name or SVG markup.
 *
 * @param {String} name the name or markup of the element
 * @param {Object} [attrs] attributes to set on the element
 *
 * @returns {SVGElement}
 */
function create(name, attrs) {
  var element;

  if (name.charAt(0) === '<') {
    element = parse(name).firstChild;
    element = document.importNode(element, true);
  } else {
    element = document.createElementNS(ns.svg, name);
  }

  if (attrs) {
    attr(element, attrs);
  }

  return element;
}
},{"322":322,"331":331,"332":332}],326:[function(_dereq_,module,exports){
/**
 * Geometry helpers
 */


var create = _dereq_(325);

// fake node used to instantiate svg geometry elements
var node = create('svg');

function extend(object, props) {
  var i, k, keys = Object.keys(props);

  for (i = 0; (k = keys[i]); i++) {
    object[k] = props[k];
  }

  return object;
}


function createPoint(x, y) {
  var point = node.createSVGPoint();

  switch (arguments.length) {
  case 0:
    return point;
  case 2:
    x = {
      x: x,
      y: y
    };
    break;
  }

  return extend(point, x);
}

function createMatrix(a, b, c, d, e, f) {
  var matrix = node.createSVGMatrix();

  switch (arguments.length) {
  case 0:
    return matrix;
  case 6:
    a = {
      a: a,
      b: b,
      c: c,
      d: d,
      e: e,
      f: f
    };
    break;
  }

  return extend(matrix, a);
}

function createTransform(matrix) {
  if (matrix) {
    return node.createSVGTransformFromMatrix(matrix);
  } else {
    return node.createSVGTransform();
  }
}


module.exports.createTransform = createTransform;
module.exports.createMatrix = createMatrix;
module.exports.createPoint = createPoint;
},{"325":325}],327:[function(_dereq_,module,exports){
/**
 * innerHTML like functionality for SVG elements.
 * based on innerSVG (https://code.google.com/p/innersvg)
 */

module.exports = innerSVG;


var clear = _dereq_(324);
var appendTo = _dereq_(321);
var parse = _dereq_(332);
var serialize = _dereq_(333);


function set(element, svg) {

  var node,
      documentElement = parse(svg).documentElement;

  // clear element contents
  clear(element);

  if (!svg) {
    return;
  }

  // import + append each node
  node = documentElement.firstChild;

  while (node) {
    appendTo(node, element);
    node = node.nextSibling;
  }
}

function get(element) {
  var child = element.firstChild,
      output = [];

  while (child) {
    serialize(child, output);
    child = child.nextSibling;
  }

  return output.join('');
}

function innerSVG(element, svg) {

  if (svg !== undefined) {

    try {
      set(element, svg);
    } catch (e) {
      throw new Error('error parsing SVG: ' + e.message);
    }

    return element;
  } else {
    return get(element);
  }
}
},{"321":321,"324":324,"332":332,"333":333}],328:[function(_dereq_,module,exports){
module.exports = remove;

function remove(element) {
  var parent = element.parentNode;

  if (parent) {
    parent.removeChild(element);
  }

  return element;
}
},{}],329:[function(_dereq_,module,exports){
/**
 * transform accessor utility
 */

module.exports = transform;

function wrapMatrix(transformList, transform) {
  if (transform instanceof SVGMatrix) {
    return transformList.createSVGTransformFromMatrix(transform);
  } else {
    return transform;
  }
}

function setTransforms(transformList, transforms) {
  var i, t;

  transformList.clear();

  for (i = 0; (t = transforms[i]); i++) {
    transformList.appendItem(wrapMatrix(transformList, t));
  }

  transformList.consolidate();
}

function transform(node, transforms) {
  var transformList = node.transform.baseVal;

  if (arguments.length === 1) {
    return transformList.consolidate();
  } else {
    if (transforms.length) {
      setTransforms(transformList, transforms);
    } else {
      transformList.initialize(wrapMatrix(transformList, transforms));
    }
  }
}
},{}],330:[function(_dereq_,module,exports){
module.exports = ensureImported;

function ensureImported(element, target) {

  if (element.ownerDocument !== target.ownerDocument) {
    try {
      // may fail on webkit
      return target.ownerDocument.importNode(element, true);
    } catch (e) {
      // ignore
    }
  }

  return element;
}
},{}],331:[function(_dereq_,module,exports){
var ns = {
  svg: 'http://www.w3.org/2000/svg'
};

module.exports = ns;
},{}],332:[function(_dereq_,module,exports){
/**
 * DOM parsing utility
 */

module.exports = parse;


var ns = _dereq_(331);

var SVG_START = '<svg xmlns="' + ns.svg + '"';

function parse(svg) {

  // ensure we import a valid svg document
  if (svg.substring(0, 4) === '<svg') {
    if (svg.indexOf(ns.svg) === -1) {
      svg = SVG_START + svg.substring(4);
    }
  } else {
    // namespace svg
    svg = SVG_START + '>' + svg + '</svg>';
  }

  return parseDocument(svg);
}

function parseDocument(svg) {

  var parser;

  // parse
  parser = new DOMParser();
  parser.async = false;

  return parser.parseFromString(svg, 'text/xml');
}
},{"331":331}],333:[function(_dereq_,module,exports){
/**
 * Serialization util
 */

module.exports = serialize;


var TEXT_ENTITIES = /([&<>]{1})/g;
var ATTR_ENTITIES = /([\n\r"]{1})/g;

var ENTITY_REPLACEMENT = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '\''
};

function escape(str, pattern) {

  function replaceFn(match, entity) {
    return ENTITY_REPLACEMENT[entity] || entity;
  }

  return str.replace(pattern, replaceFn);
}

function serialize(node, output) {

  var i, len, attrMap, attrNode, childNodes;

  switch (node.nodeType) {
  // TEXT
  case 3:
    // replace special XML characters
    output.push(escape(node.textContent, TEXT_ENTITIES));
    break;

  // ELEMENT
  case 1:
    output.push('<', node.tagName);

    if (node.hasAttributes()) {
      attrMap = node.attributes;
      for (i = 0, len = attrMap.length; i < len; ++i) {
        attrNode = attrMap.item(i);
        output.push(' ', attrNode.name, '="', escape(attrNode.value, ATTR_ENTITIES), '"');
      }
    }

    if (node.hasChildNodes()) {
      output.push('>');
      childNodes = node.childNodes;
      for (i = 0, len = childNodes.length; i < len; ++i) {
        serialize(childNodes.item(i), output);
      }
      output.push('</', node.tagName, '>');
    } else {
      output.push('/>');
    }
    break;

  // COMMENT
  case 8:
    output.push('<!--', escape(node.nodeValue, TEXT_ENTITIES), '-->');
    break;

  // CDATA
  case 4:
    output.push('<![CDATA[', node.nodeValue, ']]>');
    break;

  default:
    throw new Error('unable to handle node ' + node.nodeType);
  }

  return output;
}
},{}]},{},[1])(1)
});
//# sourceMappingURL=dmn-viewer.js.map