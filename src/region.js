// Region
// ------

import _ from 'underscore';
import Backbone from 'backbone';
import MarionetteError from './utils/error';
import extend from './utils/extend';
import monitorViewEvents from './common/monitor-view-events';
import { renderView, destroyView } from './common/view';
import CommonMixin from './mixins/common';
import View from './view';
import DomApi, { setDomApi } from './config/dom';

const classErrorName = 'RegionError';

const ClassOptions = [
  'el',
  'replaceElement'
];

const Region = function(options) {
  this._setOptions(options, ClassOptions);

  this.cid = _.uniqueId(this.cidPrefix);

  if (_.isString(this.el)) {
    this._selector = this.el;
  } else if (this.el) {
    this.setElement(this.el);
  }

  this.initialize.apply(this, arguments);
};

Region.extend = extend;
Region.setDomApi = setDomApi;

// Region Methods
// --------------

_.extend(Region.prototype, CommonMixin, {
  Dom: DomApi,

  cidPrefix: 'mnr',
  replaceElement: false,
  _isReplaced: false,
  _isSwappingView: false,

  // This is a noop method intended to be overridden
  initialize() {},

  _ensureElement() {
    this.getEl();

    if (!this.el) {
      throw new MarionetteError({
        name: classErrorName,
        message: `An "el" must be specified for this region. ${this.cid}`,
        url: 'marionette.region.html#additional-options'
      });
    }
  },

  setElement(el) {
    this.el = el;

    this._ensureElement();

    if (this.currentView) {
      const view = this.currentView;

      if (this._isReplaced) {
        this.Dom.replaceEl(view.el, this.el);
      } else if (!this.Dom.hasEl(this.el, view.el)) {
        this.attachHtml(view);
      }
    }

    return this;
  },

  getEl(el) {
    this.$el = this.Dom.getEl(this.el);
    this.el = this.$el[0];
  },

  // Displays a view instance inside of the region. If necessary handles calling the `render`
  // method for you. Reads content directly from the `el` attribute.
  show(view, options) {
    this._ensureElement();

    view = this._getView(view, options);

    if (view === this.currentView) { return this; }

    this._isSwappingView = !!this.currentView;

    this.triggerMethod('before:show', this, view, options);

    // Assume an attached view is already in the region for pre-existing DOM
    if (!view._isAttached) {
      this.empty(options);
    }

    this._setupChildView(view);

    this.currentView = view;

    renderView(view);

    this._attachView(view, options);

    this.triggerMethod('show', this, view, options);

    this._isSwappingView = false;

    return this;
  },

  _setupChildView(view) {
    monitorViewEvents(view);

    this._proxyChildViewEvents(view);

    view.on('destroy', this._empty, this);
  },

  _proxyChildViewEvents(view) {
    const parentView = this._parentView;

    if (!parentView) { return; }

    parentView._proxyChildViewEvents(view);
  },

  // If the regions parent view is not monitoring its attach/detach events
  _shouldDisableMonitoring() {
    return this._parentView && this._parentView.monitorViewEvents === false;
  },

  _attachView(view, options = {}) {
    const shouldTriggerAttach = !view._isAttached && this.Dom.hasEl(document.documentElement, this.el) && !this._shouldDisableMonitoring();
    const shouldReplaceEl = typeof options.replaceElement === 'undefined' ? !!_.result(this, 'replaceElement') : !!options.replaceElement;

    if (shouldTriggerAttach) {
      view.triggerMethod('before:attach', view);
    }

    if (shouldReplaceEl) {
      this._replaceEl(view);
    } else {
      this.attachHtml(view);
    }

    if (shouldTriggerAttach) {
      view._isAttached = true;
      view.triggerMethod('attach', view);
    }
  },

  _getView(view) {
    if (!view) {
      throw new MarionetteError({
        name: classErrorName,
        message: 'The view passed is undefined and therefore invalid. You must pass a view instance to show.',
        url: 'marionette.region.html#showing-a-view'
      });
    }

    if (view._isDestroyed) {
      throw new MarionetteError({
        name: classErrorName,
        message: `View (cid: "${view.cid}") has already been destroyed and cannot be used.`,
        url: 'marionette.region.html#showing-a-view'
      });
    }

    if (view instanceof Backbone.View) {
      return view;
    }

    const viewOptions = this._getViewOptions(view);

    return new View(viewOptions);
  },

  // This allows for a template or a static string to be
  // used as a template
  _getViewOptions(viewOptions) {
    if (_.isFunction(viewOptions)) {
      return { template: viewOptions };
    }

    if (_.isObject(viewOptions)) {
      return viewOptions;
    }

    const template = function() { return viewOptions; };

    return { template };
  },

  _replaceEl(view) {
    // always restore the el to ensure the regions el is present before replacing
    this._restoreEl();

    view.on('before:destroy', this._restoreEl, this);

    this.Dom.replaceEl(view.el, this.el);

    this._isReplaced = true;
  },

  // Restore the region's element in the DOM.
  _restoreEl() {
    // There is nothing to replace
    if (!this._isReplaced) {
      return;
    }

    const view = this.currentView;

    if (!view) {
      return;
    }

    this._detachView(view);

    this._isReplaced = false;
  },

  // Check to see if the region's el was replaced.
  isReplaced() {
    return !!this._isReplaced;
  },

  // Check to see if a view is being swapped by another
  isSwappingView() {
    return !!this._isSwappingView;
  },

  // Override this method to change how the new view is appended to the `el` that the
  // region is managing
  attachHtml(view) {
    this.Dom.appendContents(this.el, view.el, {_$el: this.$el, _$contents: view.$el});
  },

  // Destroy the current view, if there is one. If there is no current view,
  // it will detach any html inside the region's `el`.
  empty() {
    const view = this.currentView;

    // If there is no view in the region we should only detach current html
    if (!view) {
      this.detachHtml();

      return this;
    }

    this._empty(view, true);
    return this;
  },

  _empty(view, shouldDestroy) {
    view.off('destroy', this._empty, this);
    this.triggerMethod('before:empty', this, view);

    this._restoreEl();

    delete this.currentView;

    if (!view._isDestroyed) {
      if (shouldDestroy) {
        this.removeView(view);
      } else {
        this._detachView(view);
      }
      this._stopChildViewEvents(view);
    }

    this.triggerMethod('empty', this, view);
  },

  _stopChildViewEvents(view) {
    const parentView = this._parentView;

    if (!parentView) { return; }

    this._parentView.stopListening(view);
  },

  // Non-Marionette safe view.destroy
  destroyView(view) {
    if (view._isDestroyed) {
      return view;
    }

    destroyView(view, this._shouldDisableMonitoring());
    return view;
  },

  // Override this method to determine what happens when the view
  // is removed from the region when the view is not being detached
  removeView(view) {
    this.destroyView(view);
  },

  // Empties the Region without destroying the view
  // Returns the detached view
  detachView() {
    const view = this.currentView;

    if (!view) {
      return;
    }

    this._empty(view);

    return view;
  },

  _detachView(view) {
    const shouldTriggerDetach = view._isAttached && !this._shouldDisableMonitoring();
    const shouldRestoreEl = this._isReplaced;
    if (shouldTriggerDetach) {
      view.triggerMethod('before:detach', view);
    }

    if (shouldRestoreEl) {
      this.Dom.replaceEl(this.el, view.el);
    } else {
      this.detachHtml();
    }

    if (shouldTriggerDetach) {
      view._isAttached = false;
      view.triggerMethod('detach', view);
    }
  },

  // Override this method to change how the region detaches current content
  detachHtml() {
    this.Dom.detachContents(this.el, this.$el);
  },

  // Checks whether a view is currently present within the region. Returns `true` if there is
  // and `false` if no view is present.
  hasView() {
    return !!this.currentView;
  },

  _isDestroyed: false,

  isDestroyed() {
    return this._isDestroyed;
  },

  // Destroy the region, remove any child view
  // and remove the region from any associated view
  destroy(options) {
    if (this._isDestroyed) { return this; }

    this.triggerMethod('before:destroy', this, options);
    this._isDestroyed = true;

    this.empty(options);

    if (this._name) {
      this._parentView._removeReferences(this._name);
    }
    delete this._parentView;
    delete this._name;
    delete this.el;

    this.triggerMethod('destroy', this, options);
    this.stopListening();

    return this;
  }
});

export default Region;
